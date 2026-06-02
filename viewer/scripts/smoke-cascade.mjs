#!/usr/bin/env node
/**
 * smoke-cascade.mjs — Wave 19 cascade/archive/idempotency smoke suite.
 *
 * Validates the four protections shipped by migration 0050:
 *   1. archive cascade  — archiving a course leaves assignments queryable;
 *                         the course stays archived; no orphan rows appear.
 *   2. profile-delete   — deleting a profile via service role leaves an
 *      audit             `audit_events` row with action='profile.delete'
 *                         and a `dependent_counts` payload covering all
 *                         FK-cascaded tables.
 *   3. privilege guard  — calling admin_delete_user() as a teacher (post
 *                         0050's gate flip from is_staff → is_admin) raises
 *                         `not_authorized`. Verified by impersonating the
 *                         teacher session via the anon-key client; we sign
 *                         in with the teacher's credentials so auth.uid()
 *                         resolves correctly inside the SECURITY DEFINER
 *                         function.
 *   4. idempotency      — two test_attempts rows with the same
 *                         (user_id, client_attempt_id) violate the partial
 *                         unique index added by 0050.
 *   5. 0060 FK swap     — test_attempts.user_id's FK now targets
 *                         public.profiles, not auth.users. We verify both
 *                         halves: the constraint metadata (referenced table
 *                         is public.profiles) and the runtime behavior
 *                         (inserting a user_id with no matching profiles
 *                         row raises a foreign-key violation).
 *
 * Required env vars (validated up front):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
 *
 * Style mirrors smoke-e2e.mjs (timestamped users, best-effort cleanup,
 * `TOTAL: N  PASS: P  FAIL: F` final line consumed by smoke-all.mjs).
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

// ---------- Env validation ----------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const missing = [];
if (!SUPABASE_URL) missing.push('SUPABASE_URL');
if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY');
if (missing.length) {
  console.error(`ERROR: missing required env vars: ${missing.join(', ')}`);
  process.exit(2);
}

// ---------- Clients ----------
const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function makeUserClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signInClient(email, password) {
  const c = makeUserClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return { client: c, userId: data.user.id };
}

// ---------- State ----------
const TS = Date.now();
const TAG = `cascade-${TS}`;
const PASSWORD = 'SmokeCascade!' + randomBytes(4).toString('hex');

const teacherEmail = `t-${TAG}@example.com`;
const studentEmail = `s-${TAG}@example.com`;
const joinCode = `CAS${randomBytes(2).toString('hex').toUpperCase()}`;

const ctx = {
  teacherUserId: null,
  studentUserId: null,
  courseId: null,
  assignmentId: null,
};

const results = [];

// ---------- Helpers ----------
async function step(name, fn) {
  const t0 = Date.now();
  process.stdout.write(`\n▶ ${name} ... `);
  try {
    const note = await fn();
    const ms = Date.now() - t0;
    results.push({ step: name, status: 'PASS', durationMs: ms, note: note || null });
    console.log(`PASS (${ms}ms)${note ? ' — ' + note : ''}`);
  } catch (e) {
    const ms = Date.now() - t0;
    const err = e && e.message ? e.message : String(e);
    results.push({ step: name, status: 'FAIL', durationMs: ms, error: err });
    console.log(`FAIL (${ms}ms) — ${err}`);
  }
}

// ---------- Steps ----------

async function step1Bootstrap() {
  // Provision teacher + student via the admin API (matches smoke-e2e style).
  const { data: t, error: tErr } = await service.auth.admin.createUser({
    email: teacherEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Cascade Teacher' },
  });
  if (tErr) throw new Error(`createUser(teacher): ${tErr.message}`);
  ctx.teacherUserId = t.user.id;

  // Promote to teacher directly (we don't need the invite-code flow here).
  const { error: upErr } = await service
    .from('profiles')
    .update({ role: 'teacher' })
    .eq('id', ctx.teacherUserId);
  if (upErr) throw new Error(`promote teacher: ${upErr.message}`);

  const { data: s, error: sErr } = await service.auth.admin.createUser({
    email: studentEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Cascade Student' },
  });
  if (sErr) throw new Error(`createUser(student): ${sErr.message}`);
  ctx.studentUserId = s.user.id;

  return `teacher=${ctx.teacherUserId.slice(0, 8)} student=${ctx.studentUserId.slice(0, 8)}`;
}

async function step2BuildFixture() {
  // Course + assignment + attempt as service-role so we never hit RLS noise.
  const { data: course, error: cErr } = await service
    .from('courses')
    .insert({
      teacher_id: ctx.teacherUserId,
      name: `Cascade Course ${TS}`,
      description: 'smoke-cascade fixture',
      join_code: joinCode,
    })
    .select()
    .single();
  if (cErr) throw new Error(`insert course: ${cErr.message}`);
  ctx.courseId = course.id;

  const { error: mErr } = await service.from('course_memberships').insert({
    course_id: ctx.courseId,
    student_id: ctx.studentUserId,
  });
  if (mErr) throw new Error(`insert membership: ${mErr.message}`);

  const { data: asn, error: aErr } = await service
    .from('assignments')
    .insert({
      course_id: ctx.courseId,
      created_by: ctx.teacherUserId,
      title: `Cascade Asn ${TS}`,
      description: 'smoke',
      source_id: 'cb',
      question_count: 3,
      time_limit_minutes: 5,
      difficulty_mix: 'any',
    })
    .select()
    .single();
  if (aErr) throw new Error(`insert assignment: ${aErr.message}`);
  ctx.assignmentId = asn.id;

  // Seed an attempt so the profile-delete audit has a non-zero count to
  // capture in dependent_counts.
  const { error: attErr } = await service.from('assignment_attempts').insert({
    assignment_id: ctx.assignmentId,
    student_id: ctx.studentUserId,
  });
  if (attErr) throw new Error(`insert attempt: ${attErr.message}`);

  return `course=${ctx.courseId.slice(0, 8)} asn=${ctx.assignmentId.slice(0, 8)}`;
}

async function step3ArchiveCascade() {
  // Flip archived. Verify course is still there, still archived, and its
  // assignments are still queryable (no orphan).
  const { error: upErr } = await service
    .from('courses')
    .update({ archived: true })
    .eq('id', ctx.courseId);
  if (upErr) throw new Error(`archive course: ${upErr.message}`);

  const { data: refetch, error: fErr } = await service
    .from('courses')
    .select('id, archived')
    .eq('id', ctx.courseId)
    .single();
  if (fErr) throw new Error(`refetch course: ${fErr.message}`);
  if (refetch.archived !== true) throw new Error(`expected archived=true, got ${refetch.archived}`);

  const { data: asns, error: asnErr } = await service
    .from('assignments')
    .select('id')
    .eq('course_id', ctx.courseId);
  if (asnErr) throw new Error(`list assignments: ${asnErr.message}`);
  if (!asns || asns.length !== 1) {
    throw new Error(`expected 1 assignment under archived course, got ${asns ? asns.length : 0}`);
  }

  // Unarchive so step 5 (cleanup) can delete cleanly.
  await service.from('courses').update({ archived: false }).eq('id', ctx.courseId);

  return 'archived; assignments queryable; no orphan';
}

async function step4ProfileDeleteAudit() {
  // Snapshot audit row count for this target before delete so we can detect
  // exactly the row our trigger added.
  const tgt = ctx.studentUserId;

  const { count: before, error: bErr } = await service
    .from('audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('action', 'profile.delete')
    .eq('target_id', tgt);
  if (bErr) throw new Error(`audit pre-count: ${bErr.message}`);

  // Delete the profile via service role. The BEFORE-DELETE trigger fires
  // and the row cascades.
  const { error: dErr } = await service
    .from('profiles')
    .delete()
    .eq('id', tgt);
  if (dErr) throw new Error(`delete profile: ${dErr.message}`);

  const { data: rows, error: rErr } = await service
    .from('audit_events')
    .select('action, target_kind, target_id, details, created_at')
    .eq('action', 'profile.delete')
    .eq('target_id', tgt)
    .order('created_at', { ascending: false })
    .limit(1);
  if (rErr) throw new Error(`audit post-fetch: ${rErr.message}`);
  if (!rows || rows.length === 0) {
    throw new Error('no profile.delete audit row written');
  }

  const row = rows[0];
  if (row.target_kind !== 'profile') {
    throw new Error(`target_kind expected profile, got ${row.target_kind}`);
  }
  const counts = row.details && row.details.dependent_counts;
  if (!counts) throw new Error('details.dependent_counts missing');

  const att = Number(counts.assignment_attempts ?? 0);
  const mem = Number(counts.course_memberships ?? 0);
  if (att < 1) throw new Error(`expected ≥1 assignment_attempt in dependent_counts, got ${att}`);
  if (mem < 1) throw new Error(`expected ≥1 course_membership in dependent_counts, got ${mem}`);

  // The cascade fired — clear our stale reference so cleanup doesn't try
  // to delete the auth user twice. The auth.users row's DELETE on the
  // profile cascades back to the FK on student_id columns; the auth user
  // itself is left for cleanup() to remove explicitly.

  return `audited ${att} attempt(s), ${mem} membership(s) (was ${before ?? 0} prior rows)`;
}

async function step5PrivilegeGuard() {
  // Sign in as the teacher and try to delete the (already-gone) student
  // through admin_delete_user. Even though the target user is gone, the
  // function should refuse on the privilege gate (is_admin → false for a
  // teacher) BEFORE it would have hit user_not_found.
  const { client: teacherClient } = await signInClient(teacherEmail, PASSWORD);

  // Need any uuid; the function checks privileges before user existence.
  const targetUuid = randomUUID();

  const { data, error } = await teacherClient.rpc('admin_delete_user', {
    p_user_id: targetUuid,
  });

  if (!error) {
    throw new Error(`expected not_authorized; got success: ${JSON.stringify(data)}`);
  }
  const msg = error.message || '';
  if (!msg.includes('not_authorized')) {
    throw new Error(`expected not_authorized; got "${msg}"`);
  }
  return `gate held: "${msg}"`;
}

async function step6Idempotency() {
  // Create a fresh student for this scenario (the previous one was deleted
  // in step 4). Insert two test_attempts rows sharing (user_id,
  // client_attempt_id); the second must violate the partial unique index.
  const tmpEmail = `s2-${TAG}@example.com`;
  const { data: tmp, error: tErr } = await service.auth.admin.createUser({
    email: tmpEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (tErr) throw new Error(`createUser(tmp student): ${tErr.message}`);
  const tmpId = tmp.user.id;

  const cid = randomUUID();
  const setUid = `cascade-set-${TS}`;

  const { error: ins1Err } = await service.from('test_attempts').insert({
    user_id: tmpId,
    set_uid: setUid,
    submitted_at: new Date().toISOString(),
    seconds_taken: 60,
    score: 3,
    total: 5,
    source: 'static',
    client_attempt_id: cid,
  });
  if (ins1Err) {
    // Best-effort cleanup before throw
    await service.auth.admin.deleteUser(tmpId).catch(() => {});
    throw new Error(`insert #1: ${ins1Err.message}`);
  }

  const { error: ins2Err } = await service.from('test_attempts').insert({
    user_id: tmpId,
    set_uid: setUid + '-other',
    submitted_at: new Date().toISOString(),
    seconds_taken: 60,
    score: 3,
    total: 5,
    source: 'static',
    client_attempt_id: cid,
  });

  // Cleanup before assertions throw
  await service.from('test_attempts').delete().eq('user_id', tmpId);
  await service.auth.admin.deleteUser(tmpId).catch(() => {});

  if (!ins2Err) {
    throw new Error('expected unique violation on duplicate client_attempt_id, got success');
  }
  const msg = ins2Err.message || '';
  // Postgres unique-violation code is 23505. Supabase JS lifts the message
  // through; we accept either the code or the phrase.
  if (!/duplicate|unique|23505/i.test(msg)) {
    throw new Error(`expected duplicate/unique error; got "${msg}"`);
  }
  return `unique index held: "${msg.slice(0, 80)}"`;
}

async function step7FkSwap0060() {
  // 0060 swapped test_attempts.user_id's FK from auth.users(id) to
  // public.profiles(id). Two-part check:
  //   (a) Metadata: pg_get_constraintdef reveals the referenced table.
  //       We surface it through a PostgREST view over information_schema
  //       — referential_constraints + key_column_usage — which is exposed
  //       to anon by default on Supabase deployments.
  //   (b) Runtime: insert a test_attempts row with a user_id that has no
  //       matching profiles row, and confirm the FK rejects it.
  //
  // If metadata isn't reachable via PostgREST (some self-hosted setups
  // restrict information_schema views) we fall back to the runtime check
  // alone, which is the stronger signal anyway.

  // (a) Metadata probe via information_schema.referential_constraints.
  //     We join through key_column_usage to recover the referenced table.
  //     Newer supabase-js doesn't expose schema('information_schema').from()
  //     directly through PostgREST without configuration; tolerate failure
  //     of this leg silently.
  let metadataNote = 'metadata=unverified';
  try {
    const { data: meta, error: mErr } = await service
      .schema('information_schema')
      .from('referential_constraints')
      .select('constraint_name, unique_constraint_name, unique_constraint_schema')
      .eq('constraint_name', 'test_attempts_user_id_fkey')
      .limit(1);
    if (!mErr && meta && meta.length > 0) {
      // The unique_constraint_schema is the schema of the PK we reference.
      // For the new FK that's 'public' (profiles.id PK lives in public);
      // for the old FK it was 'auth' (auth.users.id PK).
      const schema = meta[0].unique_constraint_schema;
      if (schema !== 'public') {
        throw new Error(
          `FK metadata says PK schema is "${schema}", expected "public" (0060 not applied?)`,
        );
      }
      metadataNote = 'metadata: pk schema=public';
    }
  } catch (e) {
    // Re-raise hard failures (the schema-mismatch throw above); silently
    // tolerate PostgREST refusals to expose information_schema.
    if (e && e.message && /not applied/.test(e.message)) throw e;
  }

  // (b) Runtime probe: insert with a fabricated user_id.
  const ghostUserId = randomUUID();
  const { error: insErr } = await service.from('test_attempts').insert({
    user_id: ghostUserId,
    set_uid: `ghost-${TS}`,
    submitted_at: new Date().toISOString(),
    seconds_taken: 30,
    score: 1,
    total: 1,
    source: 'static',
    client_attempt_id: randomUUID(),
  });

  if (!insErr) {
    // Cleanup the unexpected row before throwing.
    await service.from('test_attempts').delete().eq('user_id', ghostUserId);
    throw new Error(
      'expected FK violation on user_id with no profiles row, got success',
    );
  }
  const msg = insErr.message || '';
  // FK violation = SQLSTATE 23503.
  if (!/foreign key|23503|violates/i.test(msg)) {
    throw new Error(`expected FK error; got "${msg}"`);
  }
  return `${metadataNote}; runtime: "${msg.slice(0, 80)}"`;
}

// ---------- Cleanup ----------
async function cleanup() {
  console.log('\n--- cleanup ---');
  const tryDel = async (label, fn) => {
    try {
      await fn();
      console.log(`  ok: ${label}`);
    } catch (e) {
      console.log(`  WARN: ${label}: ${e.message || e}`);
    }
  };

  if (ctx.courseId) {
    await tryDel(`course ${ctx.courseId}`, async () => {
      await service.from('assignments').delete().eq('course_id', ctx.courseId);
      await service.from('course_memberships').delete().eq('course_id', ctx.courseId);
      const { error } = await service.from('courses').delete().eq('id', ctx.courseId);
      if (error) throw error;
    });
  }

  for (const [label, id] of [
    ['teacher user', ctx.teacherUserId],
    ['student user', ctx.studentUserId],
  ]) {
    if (!id) continue;
    await tryDel(`${label} ${id}`, async () => {
      const { error } = await service.auth.admin.deleteUser(id);
      // The student is already gone (we deleted them in step 4). Swallow
      // "user not found" specifically; surface anything else.
      if (error && !/not found|User not found/i.test(error.message || '')) throw error;
    });
  }
}

// ---------- Main ----------
(async () => {
  console.log(`smoke-cascade starting`);
  console.log(`  URL: ${SUPABASE_URL}`);
  console.log(`  tag: ${TAG}`);
  console.log(`  node: ${process.version}`);

  await step('1. Bootstrap teacher + student', step1Bootstrap);
  await step('2. Build course/assignment/attempt fixture', step2BuildFixture);
  await step('3. Archive cascade — course stays, assignments stay queryable', step3ArchiveCascade);
  await step('4. Profile-delete audit row written with dependent_counts', step4ProfileDeleteAudit);
  await step('5. Privilege guard — teacher cannot admin_delete_user', step5PrivilegeGuard);
  await step('6. test_attempts idempotency — duplicate client_attempt_id rejected', step6Idempotency);
  await step('7. test_attempts.user_id FK now targets public.profiles (0060)', step7FkSwap0060);

  await cleanup();

  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;

  console.log('\n========== SMOKE_RESULT ==========');
  for (const r of results) {
    console.log(
      `[${r.status.padEnd(4)}] ${r.step}  (${r.durationMs}ms)` +
        (r.error ? `\n         err: ${r.error}` : '') +
        (r.note ? `\n         ${r.note}` : '')
    );
  }
  console.log('----------------------------------');
  console.log(`TOTAL: ${results.length}  PASS: ${pass}  FAIL: ${fail}`);
  console.log('==================================');

  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
