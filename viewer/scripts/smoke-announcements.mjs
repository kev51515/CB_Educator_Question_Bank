#!/usr/bin/env node
/**
 * smoke-announcements.mjs — Wave 21 / 21B scheduled-publish smoke suite.
 *
 * Validates the contracts shipped by migrations 0054 and 0058:
 *
 *   1. 0054 — course_announcements.publish_at column exists.
 *
 *   2. 0054 — Student-side scheduling: a student SELECT must filter out
 *             rows with publish_at > now() and reveal them after the
 *             timestamp has passed. This mirrors the predicate used by
 *             useStudentAnnouncements / CourseAnnouncementsList.
 *
 *   3. 0058 — fanout_due_announcements() function exists in pg_proc. This
 *             is the cron worker that drains scheduled-but-not-yet-fanned-
 *             out rows.
 *
 *   4. 0058 — pg_cron job 'announcement-fanout-minute' is registered.
 *             Skipped (not failed) if pg_cron is not available on the
 *             target instance — local supabase-cli installs sometimes
 *             omit it, and 0058 explicitly guards on its presence.
 *
 *   5. 0058 — course_announcements.notifications_fanout_at column exists.
 *
 *   6. 0058 — Calling fanout_due_announcements() with a past-due,
 *             un-fanned-out row dispatches notifications and stamps the
 *             tracking column. Provides regression coverage for the
 *             actual worker behavior, not just its existence.
 *
 * Required env vars (validated up front):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
 *
 * Style mirrors smoke-cascade.mjs (timestamped users, best-effort cleanup,
 * `TOTAL: N  PASS: P  FAIL: F` final line consumed by smoke-all.mjs).
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

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
const TAG = `ann-${TS}`;
const PASSWORD = 'SmokeAnn!' + randomBytes(4).toString('hex');

const teacherEmail = `t-${TAG}@example.com`;
const studentEmail = `s-${TAG}@example.com`;
const joinCode = `AN${randomBytes(2).toString('hex').toUpperCase()}`;

const ctx = {
  teacherUserId: null,
  studentUserId: null,
  studentClient: null,
  courseId: null,
  scheduledAnnouncementId: null,
  workerAnnouncementId: null,
};

const results = [];

// ---------- Helpers ----------
async function step(name, fn) {
  const t0 = Date.now();
  process.stdout.write(`\n▶ ${name} ... `);
  try {
    const note = await fn();
    const ms = Date.now() - t0;
    if (note === '__SKIP__') {
      results.push({ step: name, status: 'SKIP', durationMs: ms, note: null });
      console.log(`SKIP (${ms}ms)`);
      return;
    }
    results.push({ step: name, status: 'PASS', durationMs: ms, note: note || null });
    console.log(`PASS (${ms}ms)${note ? ' — ' + note : ''}`);
  } catch (e) {
    const ms = Date.now() - t0;
    const err = e && e.message ? e.message : String(e);
    if (e && e._skip) {
      results.push({ step: name, status: 'SKIP', durationMs: ms, note: err });
      console.log(`SKIP (${ms}ms) — ${err}`);
    } else {
      results.push({ step: name, status: 'FAIL', durationMs: ms, error: err });
      console.log(`FAIL (${ms}ms) — ${err}`);
    }
  }
}

function skip(msg) {
  const e = new Error(msg);
  e._skip = true;
  throw e;
}

// ---------- Bootstrap ----------

async function step1Bootstrap() {
  const { data: t, error: tErr } = await service.auth.admin.createUser({
    email: teacherEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Ann Teacher' },
  });
  if (tErr) throw new Error(`createUser(teacher): ${tErr.message}`);
  ctx.teacherUserId = t.user.id;
  await service.from('profiles').update({ role: 'teacher' }).eq('id', ctx.teacherUserId);

  const { data: s, error: sErr } = await service.auth.admin.createUser({
    email: studentEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Ann Student' },
  });
  if (sErr) throw new Error(`createUser(student): ${sErr.message}`);
  ctx.studentUserId = s.user.id;

  const sess = await signInClient(studentEmail, PASSWORD);
  ctx.studentClient = sess.client;

  return `teacher=${ctx.teacherUserId.slice(0, 8)} student=${ctx.studentUserId.slice(0, 8)}`;
}

async function step2BuildFixture() {
  const { data: course, error: cErr } = await service
    .from('courses')
    .insert({
      teacher_id: ctx.teacherUserId,
      name: `Ann Course ${TS}`,
      description: 'smoke-announcements fixture',
      join_code: joinCode,
    })
    .select()
    .single();
  if (cErr) throw new Error(`insert course: ${cErr.message}`);
  ctx.courseId = course.id;

  // Enroll the student so the RLS student-read policy lets them see
  // announcements at all.
  const { error: mErr } = await service.from('course_memberships').insert({
    course_id: ctx.courseId,
    student_id: ctx.studentUserId,
  });
  if (mErr) throw new Error(`insert membership: ${mErr.message}`);

  return `course=${ctx.courseId.slice(0, 8)}`;
}

// ---------- Scenarios ----------

// 1. 0054 — publish_at column exists.
async function stepPublishAtColumn() {
  const { error } = await service
    .from('course_announcements')
    .select('id, publish_at')
    .eq('course_id', ctx.courseId)
    .limit(1);
  if (error) {
    throw new Error(
      `course_announcements.publish_at SELECT failed (0054 not applied?): ${error.message}`,
    );
  }
  return 'column readable';
}

// 2. 0054 — student-side filter on publish_at.
async function stepStudentSideFilter() {
  // Insert a SCHEDULED-for-the-future announcement.
  const futureISO = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h
  const { data: row, error: insErr } = await service
    .from('course_announcements')
    .insert({
      course_id: ctx.courseId,
      author_id: ctx.teacherUserId,
      title: `Scheduled ${TS}`,
      body: 'scheduled body',
      published: true,
      publish_at: futureISO,
    })
    .select()
    .single();
  if (insErr) throw new Error(`insert scheduled: ${insErr.message}`);
  ctx.scheduledAnnouncementId = row.id;

  try {
    // The student-side query mirrors useStudentAnnouncements: it applies the
    // OR publish_at IS NULL OR publish_at <= now() predicate client-side.
    // We replicate it here exactly so this test verifies the contract the
    // surface actually depends on.
    const nowISO = new Date().toISOString();
    const { data: studentVisible, error: vErr } = await ctx.studentClient
      .from('course_announcements')
      .select('id, publish_at')
      .eq('course_id', ctx.courseId)
      .or(`publish_at.is.null,publish_at.lte.${nowISO}`);
    if (vErr) throw new Error(`student SELECT (future): ${vErr.message}`);
    const found = (studentVisible || []).some((r) => r.id === ctx.scheduledAnnouncementId);
    if (found) {
      throw new Error('scheduled-future announcement leaked to student-side filter');
    }

    // Slide publish_at into the past.
    const pastISO = new Date(Date.now() - 60 * 1000).toISOString();
    const { error: upErr } = await service
      .from('course_announcements')
      .update({ publish_at: pastISO })
      .eq('id', ctx.scheduledAnnouncementId);
    if (upErr) throw new Error(`update publish_at to past: ${upErr.message}`);

    const nowISO2 = new Date().toISOString();
    const { data: studentVisible2, error: v2Err } = await ctx.studentClient
      .from('course_announcements')
      .select('id, publish_at')
      .eq('course_id', ctx.courseId)
      .or(`publish_at.is.null,publish_at.lte.${nowISO2}`);
    if (v2Err) throw new Error(`student SELECT (past): ${v2Err.message}`);
    const found2 = (studentVisible2 || []).some((r) => r.id === ctx.scheduledAnnouncementId);
    if (!found2) {
      throw new Error('past-boundary announcement was not visible to student');
    }

    return 'future hidden, past visible';
  } finally {
    if (ctx.scheduledAnnouncementId) {
      await service
        .from('course_announcements')
        .delete()
        .eq('id', ctx.scheduledAnnouncementId);
      ctx.scheduledAnnouncementId = null;
    }
  }
}

// 3. 0058 — fanout_due_announcements function exists in pg_proc.
async function stepFanoutFunctionExists() {
  // PostgREST can read system catalogs via the `pg_meta` proxy on newer
  // Supabase deployments, but the simplest cross-version probe is to
  // actually call the function via RPC. If the function exists and
  // returns an integer, our contract is satisfied.
  const { data, error } = await service.rpc('fanout_due_announcements');
  if (error) {
    throw new Error(
      `fanout_due_announcements() not callable (0058 not applied?): ${error.message}`,
    );
  }
  if (typeof data !== 'number') {
    throw new Error(`expected integer return, got ${typeof data}: ${JSON.stringify(data)}`);
  }
  return `function returned ${data}`;
}

// 4. 0058 — pg_cron job 'announcement-fanout-minute' registered.
async function stepCronJobRegistered() {
  // cron.job is in the cron schema. PostgREST exposes it only when explicitly
  // added to the API schema list. We probe through a SECURITY DEFINER would
  // be ideal, but to keep this smoke self-contained we accept either a
  // direct read or — if PostgREST blocks the schema — a skip.
  // First try the simplest path: select via service role.
  const { data, error } = await service
    .schema('cron')
    .from('job')
    .select('jobname, schedule, command')
    .eq('jobname', 'announcement-fanout-minute')
    .limit(1);

  if (error) {
    // pg_cron not installed OR cron schema not exposed to PostgREST.
    // Either is acceptable — 0058 itself guards on pg_extension lookup.
    skip(`cron.job not reachable via PostgREST: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(`cron job 'announcement-fanout-minute' not registered`);
  }
  return `job registered: schedule="${data[0].schedule}"`;
}

// 5. 0058 — notifications_fanout_at column exists.
async function stepFanoutColumnExists() {
  const { error } = await service
    .from('course_announcements')
    .select('id, notifications_fanout_at')
    .limit(1);
  if (error) {
    throw new Error(
      `notifications_fanout_at SELECT failed (0058 not applied?): ${error.message}`,
    );
  }
  return 'column readable';
}

// 6. 0058 — worker dispatches + stamps for a past-due un-fanned-out row.
async function stepWorkerDispatches() {
  // Insert directly via service role with publish_at in the past AND
  // notifications_fanout_at = NULL. We sidestep the INSERT trigger's
  // immediate-publish path by giving it a *past* publish_at; the trigger's
  // `IF NEW.publish_at IS NOT NULL AND NEW.publish_at > now()` early-return
  // does NOT fire for a past date, so the trigger itself dispatches and
  // stamps. To exercise the WORKER instead, we have to either (a) insert
  // with publish_at in the future then move it to the past, or (b) NULL
  // out notifications_fanout_at after the trigger has stamped it.
  //
  // Option (a) requires us to bypass the cron interval. Option (b) is
  // cleaner: insert, let trigger stamp it, then NULL it out so the worker
  // finds it pending again.
  const pastISO = new Date(Date.now() - 90 * 1000).toISOString();
  const { data: row, error: insErr } = await service
    .from('course_announcements')
    .insert({
      course_id: ctx.courseId,
      author_id: ctx.teacherUserId,
      title: `Worker ${TS}`,
      body: 'worker body',
      published: true,
      publish_at: pastISO,
    })
    .select()
    .single();
  if (insErr) throw new Error(`insert worker row: ${insErr.message}`);
  ctx.workerAnnouncementId = row.id;

  try {
    // Clear notifications generated by the INSERT trigger so we can count
    // exclusively what the worker dispatches.
    await service
      .from('notifications')
      .delete()
      .eq('recipient_id', ctx.studentUserId)
      .eq('kind', 'announcement');

    // Reset stamping so the worker considers the row pending.
    const { error: clearErr } = await service
      .from('course_announcements')
      .update({ notifications_fanout_at: null })
      .eq('id', ctx.workerAnnouncementId);
    if (clearErr) throw new Error(`clear stamp: ${clearErr.message}`);

    // Call the worker.
    const { data: count, error: rpcErr } = await service.rpc('fanout_due_announcements');
    if (rpcErr) throw new Error(`worker call: ${rpcErr.message}`);
    if (typeof count !== 'number' || count < 1) {
      throw new Error(`worker returned ${count}, expected ≥1`);
    }

    // Confirm the stamp landed.
    const { data: re, error: reErr } = await service
      .from('course_announcements')
      .select('notifications_fanout_at')
      .eq('id', ctx.workerAnnouncementId)
      .single();
    if (reErr) throw new Error(`re-read row: ${reErr.message}`);
    if (!re.notifications_fanout_at) {
      throw new Error('worker did not stamp notifications_fanout_at');
    }

    // Confirm the student received a notification.
    const { data: notif, error: nErr } = await service
      .from('notifications')
      .select('id, kind, link')
      .eq('recipient_id', ctx.studentUserId)
      .eq('kind', 'announcement')
      .order('created_at', { ascending: false })
      .limit(1);
    if (nErr) throw new Error(`notif fetch: ${nErr.message}`);
    if (!notif || notif.length === 0) {
      throw new Error('worker did not dispatch student notification');
    }
    return `worker dispatched ${count} row(s); student notified`;
  } finally {
    if (ctx.workerAnnouncementId) {
      await service
        .from('course_announcements')
        .delete()
        .eq('id', ctx.workerAnnouncementId);
      ctx.workerAnnouncementId = null;
    }
    await service
      .from('notifications')
      .delete()
      .eq('recipient_id', ctx.studentUserId);
  }
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

  if (ctx.studentUserId) {
    await tryDel('student notifications', async () => {
      await service
        .from('notifications')
        .delete()
        .eq('recipient_id', ctx.studentUserId);
    });
  }

  if (ctx.courseId) {
    await tryDel(`course ${ctx.courseId}`, async () => {
      await service
        .from('course_announcements')
        .delete()
        .eq('course_id', ctx.courseId);
      await service
        .from('course_memberships')
        .delete()
        .eq('course_id', ctx.courseId);
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
      if (error && !/not found|User not found/i.test(error.message || '')) throw error;
    });
  }
}

// ---------- Main ----------
(async () => {
  console.log(`smoke-announcements starting`);
  console.log(`  URL: ${SUPABASE_URL}`);
  console.log(`  tag: ${TAG}`);
  console.log(`  node: ${process.version}`);

  await step('1. Bootstrap teacher + student', step1Bootstrap);
  await step('2. Build course + membership fixture', step2BuildFixture);
  await step('3. 0054 — course_announcements.publish_at column exists', stepPublishAtColumn);
  await step('4. 0054 — student-side filter: future hidden, past visible', stepStudentSideFilter);
  await step('5. 0058 — fanout_due_announcements() callable', stepFanoutFunctionExists);
  await step('6. 0058 — pg_cron job announcement-fanout-minute registered', stepCronJobRegistered);
  await step('7. 0058 — notifications_fanout_at column exists', stepFanoutColumnExists);
  await step('8. 0058 — worker dispatches and stamps for past-due rows', stepWorkerDispatches);

  await cleanup();

  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skipN = results.filter((r) => r.status === 'SKIP').length;

  console.log('\n========== SMOKE_RESULT ==========');
  for (const r of results) {
    console.log(
      `[${r.status.padEnd(4)}] ${r.step}  (${r.durationMs}ms)` +
        (r.error ? `\n         err: ${r.error}` : '') +
        (r.note ? `\n         ${r.note}` : '')
    );
  }
  console.log('----------------------------------');
  // Match the format smoke-all parses. SKIP rows are counted in TOTAL but
  // do not fail the suite.
  console.log(`TOTAL: ${results.length}  PASS: ${pass}  FAIL: ${fail}${skipN ? `  SKIP: ${skipN}` : ''}`);
  console.log('==================================');

  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
