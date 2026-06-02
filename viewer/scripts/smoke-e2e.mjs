#!/usr/bin/env node
/**
 * Smoke E2E for CB_Educator_Question_Bank LMS against Supabase Cloud.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
 *
 * Exercises critical flows end-to-end via the Supabase JS client.
 * Re-runnable: all generated users/classes/codes are timestamped to avoid
 * collisions. Test data is best-effort cleaned up at the end.
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

// ---------- State ----------
const TS = Date.now();
const TAG = `smoke-${TS}`;
const PASSWORD = 'SmokeTest!' + randomBytes(4).toString('hex');

const adminEmail = `admin-${TAG}@example.com`;
const teacherEmail = `teacher-${TAG}@example.com`;
const studentEmail = `student-${TAG}@example.com`;
const studentTwoEmail = `student2-${TAG}@example.com`;
const inviteCode = `inv-${TS}`.toLowerCase();
const classJoinCode = `JOIN${randomBytes(2).toString('hex').toUpperCase()}`;

const ctx = {
  adminUserId: null,
  teacherUserId: null,
  studentUserId: null,
  studentTwoUserId: null,
  anonUserId: null,
  classId: null,
  assignmentId: null,
  attemptId: null,
  inviteCode,
  classJoinCode,
};

const results = [];

// ---------- Helpers ----------
function fmt(o) {
  try {
    if (o instanceof Error) return o.message;
    if (typeof o === 'string') return o;
    return JSON.stringify(o, null, 2);
  } catch {
    return String(o);
  }
}

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
    const err = e && e.message ? e.message : fmt(e);
    if (e && e._skip) {
      results.push({ step: name, status: 'SKIP', durationMs: ms, error: err });
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

async function findExistingAdminId() {
  const { data, error } = await service
    .from('profiles')
    .select('id,email,role')
    .eq('role', 'admin')
    .limit(1);
  if (error) throw new Error(`profiles lookup: ${error.message}`);
  return data && data[0] ? data[0].id : null;
}

async function signInClient(email, password) {
  const c = makeUserClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return { client: c, userId: data.user.id, session: data.session };
}

// ---------- Steps ----------

async function step1BootstrapAdmin() {
  // Create the admin auth user (confirmed)
  const { data, error } = await service.auth.admin.createUser({
    email: adminEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Smoke Admin' },
  });
  if (error) throw new Error(`createUser(admin): ${error.message}`);
  ctx.adminUserId = data.user.id;

  // Try bootstrap_first_admin
  const { error: bootErr } = await service.rpc('bootstrap_first_admin', {
    p_user_id: ctx.adminUserId,
  });

  if (bootErr) {
    const msg = bootErr.message || '';
    if (msg.includes('admin_already_exists')) {
      // Fallback: promote our user directly via service role
      const { error: upErr } = await service
        .from('profiles')
        .update({ role: 'admin' })
        .eq('id', ctx.adminUserId);
      if (upErr) throw new Error(`fallback admin promote: ${upErr.message}`);
      return `admin existed; promoted ${adminEmail} via service-role update`;
    }
    throw new Error(`bootstrap_first_admin: ${msg}`);
  }
  return `bootstrapped ${adminEmail} as admin`;
}

async function step2MintInviteCode() {
  const { client } = await signInClient(adminEmail, PASSWORD);
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const { data, error } = await client.rpc('mint_teacher_invite', {
    p_code: inviteCode,
    p_note: `smoke test ${TS}`,
    p_expires_at: expiresAt,
    p_max_uses: 5,
  });
  if (error) throw new Error(`mint_teacher_invite: ${error.message}`);
  if (!data || data.code !== inviteCode) {
    throw new Error(`unexpected response: ${fmt(data)}`);
  }
  return `code=${inviteCode}, max_uses=5`;
}

async function step3TeacherSignupAndRedeem() {
  // NOTE: Supabase Cloud's anon auth.signUp endpoint rejects "example.com"
  // addresses as invalid and rate-limits aggressively. We provision through
  // the admin API (still equivalent to "the user signed up & was confirmed").
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email: teacherEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Smoke Teacher' },
  });
  if (createErr) throw new Error(`createUser(teacher): ${createErr.message}`);
  ctx.teacherUserId = created.user.id;

  // Sign in fresh to get an authenticated session
  const { client: teacherClient } = await signInClient(teacherEmail, PASSWORD);

  // Redeem the invite code
  const { data: redeemed, error: redeemErr } = await teacherClient.rpc(
    'redeem_teacher_invite',
    { p_code: inviteCode }
  );
  if (redeemErr) throw new Error(`redeem_teacher_invite: ${redeemErr.message}`);
  if (!redeemed || redeemed.role !== 'teacher') {
    throw new Error(`expected role=teacher, got ${fmt(redeemed)}`);
  }

  // Re-fetch profile to verify
  const { data: prof, error: profErr } = await teacherClient
    .from('profiles')
    .select('id,role')
    .eq('id', ctx.teacherUserId)
    .single();
  if (profErr) throw new Error(`profile re-fetch: ${profErr.message}`);
  if (prof.role !== 'teacher') {
    throw new Error(`profile role mismatch: ${prof.role}`);
  }
  return `teacher ${teacherEmail} elevated`;
}

async function step4TeacherCreatesClass() {
  const { client: teacherClient } = await signInClient(teacherEmail, PASSWORD);
  const { data, error } = await teacherClient
    .from('courses')
    .insert({
      teacher_id: ctx.teacherUserId,
      name: `Smoke Class ${TS}`,
      description: 'created by smoke-e2e script',
      join_code: classJoinCode,
    })
    .select()
    .single();
  if (error) {
    // Workaround: insert via service role so downstream steps still execute,
    // but record the real defect.
    const { data: bypass, error: svcErr } = await service
      .from('courses')
      .insert({
        teacher_id: ctx.teacherUserId,
        name: `Smoke Class ${TS}`,
        description: 'created by smoke-e2e script (service-role fallback)',
        join_code: classJoinCode,
      })
      .select()
      .single();
    if (svcErr) {
      throw new Error(`insert class: ${error.message} (service-role fallback also failed: ${svcErr.message})`);
    }
    ctx.classId = bypass.id;
    throw new Error(
      `insert class via teacher session failed: ${error.message} — bypassed via service role (class_id=${bypass.id}) so downstream steps continue`
    );
  }
  if (!data || !data.id) throw new Error(`no class returned`);
  ctx.classId = data.id;
  return `class_id=${data.id}, join_code=${data.join_code}`;
}

async function step5StudentSignup() {
  // Provision via admin API (see note in step 3 about anon signUp + example.com).
  const { data, error } = await service.auth.admin.createUser({
    email: studentEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Smoke Student' },
  });
  if (error) throw new Error(`createUser(student): ${error.message}`);
  ctx.studentUserId = data.user.id;

  // Sign in and verify profile role
  const { client: studentClient } = await signInClient(studentEmail, PASSWORD);
  const { data: prof, error: profErr } = await studentClient
    .from('profiles')
    .select('id,role')
    .eq('id', ctx.studentUserId)
    .single();
  if (profErr) throw new Error(`student profile: ${profErr.message}`);
  if (prof.role !== 'student') {
    throw new Error(`expected role=student, got ${prof.role}`);
  }
  return `student ${studentEmail} created`;
}

async function step6StudentJoinsViaCode() {
  const { client: studentClient } = await signInClient(studentEmail, PASSWORD);
  const { data, error } = await studentClient.rpc('join_course_by_code', {
    p_code: classJoinCode,
  });
  if (error) throw new Error(`join_course_by_code: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`empty join response`);
  // Verify membership row visible
  const { data: mems, error: memErr } = await studentClient
    .from('course_memberships')
    .select('id,course_id,student_id')
    .eq('course_id', ctx.classId)
    .eq('student_id', ctx.studentUserId);
  if (memErr) throw new Error(`membership read: ${memErr.message}`);
  if (!mems || mems.length !== 1) {
    throw new Error(`expected 1 membership row, got ${mems ? mems.length : 0}`);
  }
  return `joined class via ${classJoinCode}`;
}

async function step7TeacherCreatesAssignment() {
  const { client: teacherClient } = await signInClient(teacherEmail, PASSWORD);
  const { data, error } = await teacherClient
    .from('assignments')
    .insert({
      course_id: ctx.classId,
      created_by: ctx.teacherUserId,
      title: `Smoke Assignment ${TS}`,
      description: 'smoke',
      source_id: 'cb',
      question_count: 5,
      time_limit_minutes: 10,
      difficulty_mix: 'any',
    })
    .select()
    .single();
  if (error) throw new Error(`insert assignment: ${error.message}`);
  if (!data || !data.id) throw new Error(`no assignment returned`);
  ctx.assignmentId = data.id;
  return `assignment_id=${data.id}`;
}

async function step8StudentStartsAttempt() {
  const { client: studentClient } = await signInClient(studentEmail, PASSWORD);
  const { data, error } = await studentClient
    .from('assignment_attempts')
    .insert({
      assignment_id: ctx.assignmentId,
      student_id: ctx.studentUserId,
    })
    .select()
    .single();
  if (error) throw new Error(`insert attempt: ${error.message}`);
  ctx.attemptId = data.id;
  return `attempt_id=${data.id}`;
}

async function step9StudentSubmitsAttempt() {
  const { client: studentClient } = await signInClient(studentEmail, PASSWORD);
  const submission = {
    submitted_at: new Date().toISOString(),
    score_percent: 80,
    correct_count: 4,
    total_questions: 5,
    duration_seconds: 300,
    answers: { q1: 'A', q2: 'B', q3: 'C', q4: 'D', q5: 'A' },
    result_detail: {
      byDomain: [],
      bySkill: [],
      byDifficulty: [],
      totalQuestions: 5,
      correctCount: 4,
      scorePercent: 80,
      durationSeconds: 300,
    },
  };
  const { data, error } = await studentClient
    .from('assignment_attempts')
    .update(submission)
    .eq('id', ctx.attemptId)
    .select()
    .single();
  if (error) throw new Error(`update attempt: ${error.message}`);
  if (!data.submitted_at || Number(data.score_percent) !== 80) {
    throw new Error(`submission did not persist as expected: ${fmt(data)}`);
  }
  return `score=${data.score_percent}, submitted_at set`;
}

async function step10TeacherViewsAttempts() {
  const { client: teacherClient } = await signInClient(teacherEmail, PASSWORD);
  const { data, error } = await teacherClient
    .from('assignment_attempts')
    .select('id,student_id,score_percent,submitted_at')
    .eq('assignment_id', ctx.assignmentId);
  if (error) throw new Error(`read attempts: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`teacher cannot see any attempts (RLS issue?)`);
  }
  const ours = data.find((r) => r.id === ctx.attemptId);
  if (!ours) throw new Error(`teacher cannot see the submitted attempt`);
  return `teacher sees ${data.length} attempt(s)`;
}

async function step11QuickStartAnonymous() {
  const c = makeUserClient();
  const { data, error } = await c.auth.signInAnonymously();
  if (error) {
    const m = error.message || '';
    if (m.includes('anonymous_provider_disabled') || m.toLowerCase().includes('anonymous')) {
      skip(`anonymous auth disabled in dashboard: ${m}`);
    }
    throw new Error(`signInAnonymously: ${m}`);
  }
  ctx.anonUserId = data.user.id;
  const { data: qsData, error: qsErr } = await c.rpc('quick_start_with_code', {
    p_code: classJoinCode,
    p_name: 'Anonymous Smoke',
    p_email: `anon-${TAG}@example.com`,
  });
  if (qsErr) throw new Error(`quick_start_with_code: ${qsErr.message}`);
  if (!qsData || qsData.length === 0) throw new Error(`empty quick_start response`);
  const { data: mems, error: memErr } = await c
    .from('course_memberships')
    .select('id')
    .eq('course_id', ctx.classId)
    .eq('student_id', ctx.anonUserId);
  if (memErr) throw new Error(`anon membership read: ${memErr.message}`);
  if (!mems || mems.length !== 1) throw new Error(`anon enrollment not visible`);
  return `anon user ${ctx.anonUserId} enrolled`;
}

async function step12RlsSpotChecks() {
  // Truly anonymous (no auth) client
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const findings = [];

  const checks = [
    { table: 'profiles' },
    { table: 'courses' },
    { table: 'assignment_attempts' },
    { table: 'assignments' },
    { table: 'course_memberships' },
    { table: 'teacher_invite_codes' },
    { table: 'teacher_invite_redemptions' },
  ];

  for (const ck of checks) {
    const { data, error } = await anon.from(ck.table).select('*').limit(5);
    if (error) {
      // We accept "permission denied" / 401-ish errors as good (locked down)
      findings.push(`${ck.table}: error="${error.message}"`);
      continue;
    }
    if (data && data.length > 0) {
      throw new Error(
        `${ck.table} leaked ${data.length} rows to unauthenticated caller`
      );
    }
    findings.push(`${ck.table}: 0 rows (ok)`);
  }
  return findings.join(' | ');
}

async function step13RevokeAndReuseFails() {
  // Admin revokes
  const { client: adminClient } = await signInClient(adminEmail, PASSWORD);
  const { error: revErr } = await adminClient.rpc('revoke_teacher_invite', {
    p_code: inviteCode,
  });
  if (revErr) throw new Error(`revoke_teacher_invite: ${revErr.message}`);

  // New student via admin API (avoid anon signUp restrictions).
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email: studentTwoEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Smoke Student Two' },
  });
  if (createErr) throw new Error(`createUser(student2): ${createErr.message}`);
  ctx.studentTwoUserId = created.user.id;

  const { client: s2 } = await signInClient(studentTwoEmail, PASSWORD);
  const { data: redeemed, error: redeemErr } = await s2.rpc(
    'redeem_teacher_invite',
    { p_code: inviteCode }
  );
  if (!redeemErr) {
    throw new Error(
      `expected invalid_invite_code, but redemption succeeded: ${fmt(redeemed)}`
    );
  }
  const m = redeemErr.message || '';
  if (!m.includes('invalid_invite_code')) {
    throw new Error(`unexpected error (wanted invalid_invite_code): ${m}`);
  }
  return `revoked + reuse blocked as expected`;
}

async function step14AdminListsAll() {
  // Service-role bypass RLS — just confirm data exists
  const { data: courses, error: cErr } = await service.from('courses').select('id');
  if (cErr) throw new Error(`service-role courses: ${cErr.message}`);
  const { data: users, error: uErr } = await service.from('profiles').select('id,role');
  if (uErr) throw new Error(`service-role profiles: ${uErr.message}`);
  return `courses=${courses.length}, profiles=${users.length}`;
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

  // Delete the invite code redemptions / code (best effort)
  await tryDel('redemptions', async () => {
    await service.from('teacher_invite_redemptions').delete().eq('code', inviteCode);
  });
  await tryDel('invite code', async () => {
    await service.from('teacher_invite_codes').delete().eq('code', inviteCode);
  });

  // Delete class first (teacher_id has ON DELETE RESTRICT, so the teacher
  // can't be deleted until the class is gone).
  if (ctx.classId) {
    await tryDel(`class ${ctx.classId}`, async () => {
      await service.from('assignments').delete().eq('course_id', ctx.classId);
      await service.from('course_memberships').delete().eq('course_id', ctx.classId);
      const { error } = await service.from('courses').delete().eq('id', ctx.classId);
      if (error) throw error;
    });
  }

  // Then delete users (cascades remove profiles, memberships, attempts via FK).
  for (const [label, id] of [
    ['admin user', ctx.adminUserId],
    ['teacher user', ctx.teacherUserId],
    ['student user', ctx.studentUserId],
    ['student2 user', ctx.studentTwoUserId],
    ['anon user', ctx.anonUserId],
  ]) {
    if (!id) continue;
    await tryDel(`${label} ${id}`, async () => {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) throw error;
    });
  }
}

// ---------- Main ----------
(async () => {
  console.log(`smoke-e2e starting`);
  console.log(`  URL: ${SUPABASE_URL}`);
  console.log(`  tag: ${TAG}`);
  console.log(`  node: ${process.version}`);

  await step('1. Bootstrap admin', step1BootstrapAdmin);
  await step('2. Mint teacher invite code', step2MintInviteCode);
  await step('3. Teacher signup + redeem invite', step3TeacherSignupAndRedeem);
  await step('4. Teacher creates class', step4TeacherCreatesClass);
  await step('5. Student signup', step5StudentSignup);
  await step('6. Student joins class via code', step6StudentJoinsViaCode);
  await step('7. Teacher creates assignment', step7TeacherCreatesAssignment);
  await step('8. Student starts attempt', step8StudentStartsAttempt);
  await step('9. Student submits attempt', step9StudentSubmitsAttempt);
  await step('10. Teacher views attempts', step10TeacherViewsAttempts);
  await step('11. Quick-start anonymous', step11QuickStartAnonymous);
  await step('12. RLS spot-checks (anon)', step12RlsSpotChecks);
  await step('13. Revoke + reuse blocked', step13RevokeAndReuseFails);
  await step('14. Admin lists all via service role', step14AdminListsAll);

  await cleanup();

  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skipCt = results.filter((r) => r.status === 'SKIP').length;

  console.log('\n========== SMOKE_RESULT ==========');
  for (const r of results) {
    console.log(
      `[${r.status.padEnd(4)}] ${r.step}  (${r.durationMs}ms)` +
        (r.error ? `\n         err: ${r.error}` : '') +
        (r.note ? `\n         ${r.note}` : '')
    );
  }
  console.log('----------------------------------');
  console.log(`TOTAL: ${results.length}  PASS: ${pass}  FAIL: ${fail}  SKIP: ${skipCt}`);
  console.log('==================================');

  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
