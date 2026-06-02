#!/usr/bin/env node
/**
 * smoke-grading.mjs — Wave 21 / 21B grading-persistence smoke suite.
 *
 * Validates the contracts shipped by migrations 0056, 0057 and 0059:
 *
 *   1. 0056 column existence   — assignment_attempts now carries
 *                                feedback_text / score_override / graded_at /
 *                                grader_id. A bare SELECT must succeed (no
 *                                `column does not exist`).
 *
 *   2. 0056 teacher UPDATE     — the "attempts: teacher of class grades"
 *      policy                    policy allows a teacher to write the four
 *                                grading columns on an attempt belonging to
 *                                their own course, and SILENTLY filters
 *                                (RLS-no-rows) UPDATEs against attempts on a
 *                                course they don't teach.
 *
 *   3. 0056 audit trigger      — UPDATEing any of the four grading columns
 *                                inserts a row into audit_events with
 *                                action='assignment_grade' and
 *                                target_kind='assignment_attempt'.
 *
 *   4. 0056 CHECK constraint   — score_override is bounded to [0, 100]. -10
 *                                and 150 both raise; 87.5 succeeds.
 *
 *   5. 0057 best-attempts view — assignment_best_attempts picks the highest
 *                                EFFECTIVE score (COALESCE(score_override,
 *                                score_percent)), not the raw score_percent,
 *                                and surfaces an effective_score column.
 *
 *   6. 0057 effective view     — assignment_attempts_effective exposes
 *                                effective_score per row, matching
 *                                COALESCE(score_override, score_percent).
 *
 *   7. 0059 grade notification — flipping graded_at from NULL → non-null on
 *                                an attempt inserts a notifications row for
 *                                the student (kind='assignment_grade', link
 *                                pointing at the assignment).
 *
 *   8. 0059 anti-spam guard    — when OLD.feedback_text is already non-null,
 *                                re-writing feedback_text does NOT produce a
 *                                second notification (the null→non-null
 *                                transition guard short-circuits).
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
const TAG = `grading-${TS}`;
const PASSWORD = 'SmokeGrading!' + randomBytes(4).toString('hex');

const teacherEmail = `t-${TAG}@example.com`;
const otherTeacherEmail = `t2-${TAG}@example.com`;
const studentEmail = `s-${TAG}@example.com`;
const joinCode = `GR${randomBytes(2).toString('hex').toUpperCase()}`;
const otherJoinCode = `GX${randomBytes(2).toString('hex').toUpperCase()}`;

const ctx = {
  teacherUserId: null,
  teacherClient: null,
  otherTeacherUserId: null,
  otherTeacherClient: null,
  studentUserId: null,
  courseId: null,
  otherCourseId: null,
  assignmentId: null,
  otherAssignmentId: null,
  attemptId: null,
  otherAttemptId: null,
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

// Reset attempt to "ungraded" so each scenario starts from the same baseline.
async function resetAttempt(attemptId) {
  const { error } = await service
    .from('assignment_attempts')
    .update({
      feedback_text: null,
      score_override: null,
      graded_at: null,
      grader_id: null,
    })
    .eq('id', attemptId);
  if (error) throw new Error(`reset attempt ${attemptId}: ${error.message}`);
}

// Clear any notifications for the student that we may have caused.
async function clearStudentNotifications() {
  if (!ctx.studentUserId) return;
  await service
    .from('notifications')
    .delete()
    .eq('recipient_id', ctx.studentUserId);
}

// ---------- Bootstrap ----------

async function step1Bootstrap() {
  const { data: t, error: tErr } = await service.auth.admin.createUser({
    email: teacherEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Grading Teacher' },
  });
  if (tErr) throw new Error(`createUser(teacher): ${tErr.message}`);
  ctx.teacherUserId = t.user.id;
  await service.from('profiles').update({ role: 'teacher' }).eq('id', ctx.teacherUserId);

  const { data: t2, error: t2Err } = await service.auth.admin.createUser({
    email: otherTeacherEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Other Teacher' },
  });
  if (t2Err) throw new Error(`createUser(other teacher): ${t2Err.message}`);
  ctx.otherTeacherUserId = t2.user.id;
  await service
    .from('profiles')
    .update({ role: 'teacher' })
    .eq('id', ctx.otherTeacherUserId);

  const { data: s, error: sErr } = await service.auth.admin.createUser({
    email: studentEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Grading Student' },
  });
  if (sErr) throw new Error(`createUser(student): ${sErr.message}`);
  ctx.studentUserId = s.user.id;

  // Sign in both teachers up front so RLS-policy scenarios have a live JWT.
  const tSession = await signInClient(teacherEmail, PASSWORD);
  ctx.teacherClient = tSession.client;
  const t2Session = await signInClient(otherTeacherEmail, PASSWORD);
  ctx.otherTeacherClient = t2Session.client;

  return `teacher=${ctx.teacherUserId.slice(0, 8)} other=${ctx.otherTeacherUserId.slice(0, 8)} student=${ctx.studentUserId.slice(0, 8)}`;
}

async function step2BuildFixture() {
  // Course owned by teacher.
  const { data: course, error: cErr } = await service
    .from('courses')
    .insert({
      teacher_id: ctx.teacherUserId,
      name: `Grading Course ${TS}`,
      description: 'smoke-grading fixture',
      join_code: joinCode,
    })
    .select()
    .single();
  if (cErr) throw new Error(`insert course: ${cErr.message}`);
  ctx.courseId = course.id;

  // Course owned by the OTHER teacher (the "not mine" course for RLS check).
  const { data: otherCourse, error: oErr } = await service
    .from('courses')
    .insert({
      teacher_id: ctx.otherTeacherUserId,
      name: `Other Course ${TS}`,
      description: 'rls control',
      join_code: otherJoinCode,
    })
    .select()
    .single();
  if (oErr) throw new Error(`insert other course: ${oErr.message}`);
  ctx.otherCourseId = otherCourse.id;

  // Student is in our teacher's course only.
  const { error: mErr } = await service.from('course_memberships').insert({
    course_id: ctx.courseId,
    student_id: ctx.studentUserId,
  });
  if (mErr) throw new Error(`insert membership: ${mErr.message}`);

  // Assignment under teacher's course.
  const { data: asn, error: aErr } = await service
    .from('assignments')
    .insert({
      course_id: ctx.courseId,
      created_by: ctx.teacherUserId,
      title: `Grading Asn ${TS}`,
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

  // Assignment under the OTHER teacher's course.
  const { data: otherAsn, error: oaErr } = await service
    .from('assignments')
    .insert({
      course_id: ctx.otherCourseId,
      created_by: ctx.otherTeacherUserId,
      title: `Other Asn ${TS}`,
      description: 'smoke control',
      source_id: 'cb',
      question_count: 3,
      time_limit_minutes: 5,
      difficulty_mix: 'any',
    })
    .select()
    .single();
  if (oaErr) throw new Error(`insert other assignment: ${oaErr.message}`);
  ctx.otherAssignmentId = otherAsn.id;

  // Attempt under teacher's course (the one we'll grade).
  const { data: att, error: attErr } = await service
    .from('assignment_attempts')
    .insert({
      assignment_id: ctx.assignmentId,
      student_id: ctx.studentUserId,
      submitted_at: new Date().toISOString(),
      score_percent: 70,
    })
    .select()
    .single();
  if (attErr) throw new Error(`insert attempt: ${attErr.message}`);
  ctx.attemptId = att.id;

  // Attempt under the OTHER course — we need a student to own it; reuse
  // ours (course_memberships isn't enforced at the attempt FK level — only
  // assignment_id + student_id).
  const { data: otherAtt, error: otherAttErr } = await service
    .from('assignment_attempts')
    .insert({
      assignment_id: ctx.otherAssignmentId,
      student_id: ctx.studentUserId,
      submitted_at: new Date().toISOString(),
      score_percent: 60,
    })
    .select()
    .single();
  if (otherAttErr) throw new Error(`insert other attempt: ${otherAttErr.message}`);
  ctx.otherAttemptId = otherAtt.id;

  return `attempt=${ctx.attemptId.slice(0, 8)} otherAttempt=${ctx.otherAttemptId.slice(0, 8)}`;
}

// ---------- Scenarios ----------

// 1. Migration 0056 — column existence.
async function stepColumnExistence() {
  const { data, error } = await service
    .from('assignment_attempts')
    .select('id, feedback_text, score_override, graded_at, grader_id')
    .eq('id', ctx.attemptId)
    .single();
  if (error) {
    throw new Error(
      `column SELECT failed (0056 may not be applied): ${error.message}`,
    );
  }
  if (!data) throw new Error('attempt row vanished');
  // Don't assert specific values — we want the SELECT itself to succeed.
  return 'feedback_text/score_override/graded_at/grader_id readable';
}

// 2. Migration 0056 — teacher UPDATE policy (allow own + silently filter other).
async function stepTeacherUpdatePolicy() {
  try {
    // 2a. Teacher updates THEIR OWN attempt → should succeed and affect 1 row.
    const { data: ownUpd, error: ownErr } = await ctx.teacherClient
      .from('assignment_attempts')
      .update({ feedback_text: 'Nice work!' })
      .eq('id', ctx.attemptId)
      .select();
    if (ownErr) throw new Error(`teacher UPDATE own: ${ownErr.message}`);
    if (!ownUpd || ownUpd.length !== 1) {
      throw new Error(
        `teacher UPDATE own affected ${ownUpd ? ownUpd.length : 0} rows, expected 1`,
      );
    }

    // 2b. Teacher updates an attempt on a course they DON'T teach.
    // RLS returns no rows (no error). We assert .data.length === 0.
    const { data: foreignUpd, error: foreignErr } = await ctx.teacherClient
      .from('assignment_attempts')
      .update({ feedback_text: 'i should not be able to write this' })
      .eq('id', ctx.otherAttemptId)
      .select();
    if (foreignErr) {
      // Some Postgres versions surface this as an error rather than a 0-row
      // result. Either is acceptable provided the write didn't land.
      // Fall through to the service-side re-read to confirm.
    } else if (foreignUpd && foreignUpd.length !== 0) {
      throw new Error(
        `teacher UPDATE foreign returned ${foreignUpd.length} rows, expected 0 (RLS leak?)`,
      );
    }

    // Re-read via service role to confirm the foreign attempt's feedback_text
    // was NOT clobbered.
    const { data: check, error: checkErr } = await service
      .from('assignment_attempts')
      .select('feedback_text')
      .eq('id', ctx.otherAttemptId)
      .single();
    if (checkErr) throw new Error(`re-read foreign: ${checkErr.message}`);
    if (check.feedback_text === 'i should not be able to write this') {
      throw new Error('RLS leak: foreign attempt feedback_text was written');
    }

    return 'own=1 row, foreign=blocked';
  } finally {
    await resetAttempt(ctx.attemptId);
    await clearStudentNotifications();
  }
}

// 3. Migration 0056 — audit trigger fires on grading-column UPDATE.
async function stepAuditTrigger() {
  try {
    const { count: before, error: bErr } = await service
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'assignment_grade')
      .eq('target_id', ctx.attemptId);
    if (bErr) throw new Error(`audit pre-count: ${bErr.message}`);

    // Drive the trigger via service-role UPDATE (RLS bypass — we're testing
    // the AFTER UPDATE trigger, not the policy, and a service-role UPDATE
    // still fires triggers).
    const { error: upErr } = await service
      .from('assignment_attempts')
      .update({
        feedback_text: 'audited write',
        graded_at: new Date().toISOString(),
        grader_id: ctx.teacherUserId,
      })
      .eq('id', ctx.attemptId);
    if (upErr) throw new Error(`grading UPDATE: ${upErr.message}`);

    const { data: rows, error: rErr } = await service
      .from('audit_events')
      .select('action, target_kind, target_id, details')
      .eq('action', 'assignment_grade')
      .eq('target_id', ctx.attemptId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (rErr) throw new Error(`audit post-fetch: ${rErr.message}`);
    if (!rows || rows.length === 0) {
      throw new Error('no assignment_grade audit row written');
    }
    const row = rows[0];
    if (row.target_kind !== 'assignment_attempt') {
      throw new Error(`target_kind expected assignment_attempt, got ${row.target_kind}`);
    }
    if (!row.details || row.details.feedback_changed !== true) {
      throw new Error('details.feedback_changed expected true');
    }
    return `audit row written (was ${before ?? 0})`;
  } finally {
    await resetAttempt(ctx.attemptId);
    await clearStudentNotifications();
  }
}

// 4. Migration 0056 — score_override CHECK [0, 100].
async function stepScoreOverrideCheck() {
  try {
    // Negative — expect CHECK violation.
    const { error: negErr } = await service
      .from('assignment_attempts')
      .update({ score_override: -10 })
      .eq('id', ctx.attemptId);
    if (!negErr) throw new Error('expected CHECK violation on -10, got success');
    if (!/check|23514|violates/i.test(negErr.message || '')) {
      throw new Error(`expected CHECK error on -10; got "${negErr.message}"`);
    }

    // Over 100 — expect CHECK violation.
    const { error: bigErr } = await service
      .from('assignment_attempts')
      .update({ score_override: 150 })
      .eq('id', ctx.attemptId);
    if (!bigErr) throw new Error('expected CHECK violation on 150, got success');
    if (!/check|23514|violates/i.test(bigErr.message || '')) {
      throw new Error(`expected CHECK error on 150; got "${bigErr.message}"`);
    }

    // 87.5 — must succeed.
    const { error: okErr } = await service
      .from('assignment_attempts')
      .update({ score_override: 87.5 })
      .eq('id', ctx.attemptId);
    if (okErr) throw new Error(`expected success on 87.5; got "${okErr.message}"`);

    return 'CHECK bounds enforced (-10 ✗, 150 ✗, 87.5 ✓)';
  } finally {
    await resetAttempt(ctx.attemptId);
    await clearStudentNotifications();
  }
}

// 5. Migration 0057 — assignment_best_attempts picks effective-score winner.
async function stepBestAttemptsByEffective() {
  // We need TWO attempts for the same (assignment_id, student_id). The
  // bootstrap already inserted ctx.attemptId with score_percent=70. Add a
  // second one with score_percent=80 (higher raw), then override the first
  // to 85 — the effective-score winner should be ctx.attemptId (85 > 80).
  const { data: second, error: insErr } = await service
    .from('assignment_attempts')
    .insert({
      assignment_id: ctx.assignmentId,
      student_id: ctx.studentUserId,
      submitted_at: new Date(Date.now() - 60_000).toISOString(),
      score_percent: 80,
    })
    .select()
    .single();
  if (insErr) throw new Error(`insert second attempt: ${insErr.message}`);
  const secondId = second.id;

  try {
    const { error: ovErr } = await service
      .from('assignment_attempts')
      .update({ score_override: 85, score_percent: 70 })
      .eq('id', ctx.attemptId);
    if (ovErr) throw new Error(`set override: ${ovErr.message}`);

    const { data: rows, error: vErr } = await service
      .from('assignment_best_attempts')
      .select('attempt_id, score_percent, effective_score')
      .eq('assignment_id', ctx.assignmentId)
      .eq('student_id', ctx.studentUserId);
    if (vErr) throw new Error(`view SELECT: ${vErr.message}`);
    if (!rows || rows.length !== 1) {
      throw new Error(`expected 1 best-attempt row, got ${rows ? rows.length : 0}`);
    }
    const row = rows[0];
    if (row.attempt_id !== ctx.attemptId) {
      throw new Error(
        `best attempt should be the override winner (${ctx.attemptId.slice(0, 8)}), got ${String(row.attempt_id).slice(0, 8)}`,
      );
    }
    if (Number(row.effective_score) !== 85) {
      throw new Error(`effective_score expected 85, got ${row.effective_score}`);
    }
    return `winner has effective_score=${row.effective_score} (raw=${row.score_percent})`;
  } finally {
    await service.from('assignment_attempts').delete().eq('id', secondId);
    await resetAttempt(ctx.attemptId);
    await clearStudentNotifications();
  }
}

// 6. Migration 0057 — assignment_attempts_effective surfaces effective_score.
async function stepEffectiveAttemptsView() {
  try {
    const { error: upErr } = await service
      .from('assignment_attempts')
      .update({ score_override: 91, score_percent: 64 })
      .eq('id', ctx.attemptId);
    if (upErr) throw new Error(`set override: ${upErr.message}`);

    const { data: rows, error } = await service
      .from('assignment_attempts_effective')
      .select('id, score_percent, score_override, effective_score')
      .eq('id', ctx.attemptId)
      .limit(1);
    if (error) throw new Error(`view SELECT: ${error.message}`);
    if (!rows || rows.length === 0) {
      throw new Error('attempt missing from assignment_attempts_effective');
    }
    const r = rows[0];
    if (Number(r.effective_score) !== 91) {
      throw new Error(`effective_score expected 91, got ${r.effective_score}`);
    }
    return `effective_score=${r.effective_score} matches COALESCE(override=${r.score_override}, raw=${r.score_percent})`;
  } finally {
    await resetAttempt(ctx.attemptId);
    await clearStudentNotifications();
  }
}

// 7. Migration 0059 — flipping graded_at fires a notification to the student.
async function stepGradeNotificationTrigger() {
  try {
    await clearStudentNotifications();

    const { count: before, error: bErr } = await service
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', ctx.studentUserId)
      .eq('kind', 'assignment_grade');
    if (bErr) throw new Error(`notif pre-count: ${bErr.message}`);

    const { error: upErr } = await service
      .from('assignment_attempts')
      .update({ graded_at: new Date().toISOString(), grader_id: ctx.teacherUserId })
      .eq('id', ctx.attemptId);
    if (upErr) throw new Error(`mark graded: ${upErr.message}`);

    const { data: rows, error: nErr } = await service
      .from('notifications')
      .select('recipient_id, kind, title, link, created_at')
      .eq('recipient_id', ctx.studentUserId)
      .eq('kind', 'assignment_grade')
      .order('created_at', { ascending: false })
      .limit(1);
    if (nErr) throw new Error(`notif post-fetch: ${nErr.message}`);
    if (!rows || rows.length === 0) {
      throw new Error('no assignment_grade notification was inserted');
    }
    const n = rows[0];
    if (n.recipient_id !== ctx.studentUserId) {
      throw new Error(`recipient mismatch (got ${n.recipient_id})`);
    }
    const expectedFragment = `/assignments/${ctx.assignmentId}`;
    if (!n.link || !n.link.includes(expectedFragment)) {
      throw new Error(`link missing /assignments/<id>; got "${n.link}"`);
    }
    return `notif sent (was ${before ?? 0}) link=${n.link}`;
  } finally {
    await resetAttempt(ctx.attemptId);
    await clearStudentNotifications();
  }
}

// 8. Migration 0059 — null→non-null guard short-circuits feedback-rewrite spam.
async function stepAntiSpamGuard() {
  try {
    await clearStudentNotifications();

    // Step A: NULL → 'first' — should fire one notification (feedback_added).
    const { error: aErr } = await service
      .from('assignment_attempts')
      .update({ feedback_text: 'first pass' })
      .eq('id', ctx.attemptId);
    if (aErr) throw new Error(`set feedback (first): ${aErr.message}`);

    const { count: afterFirst, error: c1Err } = await service
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', ctx.studentUserId)
      .eq('kind', 'assignment_grade');
    if (c1Err) throw new Error(`notif count after first: ${c1Err.message}`);
    if ((afterFirst ?? 0) < 1) {
      throw new Error(`expected ≥1 notification after first feedback, got ${afterFirst ?? 0}`);
    }

    // Step B: 'first' → 'edited' — both old AND new are non-null.
    // The 0059 guard `OLD.feedback_text IS NULL AND NEW.feedback_text IS NOT NULL`
    // short-circuits, so no new notification should fire. (And no other
    // transition fires either — graded_at unchanged, score_override unchanged.)
    const { error: bErr } = await service
      .from('assignment_attempts')
      .update({ feedback_text: 'edited' })
      .eq('id', ctx.attemptId);
    if (bErr) throw new Error(`set feedback (edited): ${bErr.message}`);

    const { count: afterSecond, error: c2Err } = await service
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', ctx.studentUserId)
      .eq('kind', 'assignment_grade');
    if (c2Err) throw new Error(`notif count after edit: ${c2Err.message}`);
    if ((afterSecond ?? 0) !== (afterFirst ?? 0)) {
      throw new Error(
        `guard leaked: notif count jumped from ${afterFirst} to ${afterSecond} on a non-null → non-null edit`,
      );
    }
    return `first=${afterFirst ?? 0}, after edit=${afterSecond ?? 0} (guard held)`;
  } finally {
    await resetAttempt(ctx.attemptId);
    await clearStudentNotifications();
  }
}

// 9. End-to-end teacher-grades-attempt → student-notification flow.
//
// Scenarios 7/8 above test the 0059 trigger in isolation against a fixture
// attempt. This scenario walks the higher-level workflow as the product
// actually performs it: a freshly-inserted ungraded attempt is graded by the
// owning teacher via the same UPDATE shape AssignmentRunner / the grading
// surface uses (feedback_text + score_override + graded_at + grader_id in
// one write), and we verify exactly one assignment_grade notification lands
// on the student. We then issue a feedback-only re-write and verify no
// second notification fires (anti-spam guard at the workflow level, not
// just at the unit-trigger level).
//
// Overlap with scenarios 9 + 10 is intentional — those exercise the trigger;
// this one exercises the full grading-write shape.
async function stepEndToEndGradingNotification() {
  // Build a fresh attempt so we control the NULL → non-null transition for
  // all four grading columns at once (mirrors how the teacher grading UI
  // writes them as a single PATCH).
  const { data: freshAttempt, error: insErr } = await service
    .from('assignment_attempts')
    .insert({
      assignment_id: ctx.assignmentId,
      student_id: ctx.studentUserId,
      submitted_at: new Date().toISOString(),
      score_percent: 72,
    })
    .select()
    .single();
  if (insErr) throw new Error(`insert fresh attempt: ${insErr.message}`);
  const freshAttemptId = freshAttempt.id;

  try {
    await clearStudentNotifications();

    const { count: before, error: bErr } = await service
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', ctx.studentUserId)
      .eq('kind', 'assignment_grade');
    if (bErr) throw new Error(`notif pre-count: ${bErr.message}`);
    if ((before ?? 0) !== 0) {
      throw new Error(`expected 0 notifs at start, got ${before}`);
    }

    // Teacher grades the attempt — single combined UPDATE matching the
    // shape the grading UI submits (feedback + override + graded_at +
    // grader_id all set at once via the RLS-allowed teacher policy).
    const gradedAt = new Date().toISOString();
    const { data: updRows, error: updErr } = await ctx.teacherClient
      .from('assignment_attempts')
      .update({
        feedback_text: 'Solid effort — review Q2 and Q3.',
        score_override: 88,
        graded_at: gradedAt,
        grader_id: ctx.teacherUserId,
      })
      .eq('id', freshAttemptId)
      .select();
    if (updErr) throw new Error(`teacher grade UPDATE: ${updErr.message}`);
    if (!updRows || updRows.length !== 1) {
      throw new Error(
        `teacher grade UPDATE affected ${updRows ? updRows.length : 0} rows, expected 1`,
      );
    }

    // Exactly ONE assignment_grade notification should now exist for the
    // student, pointing at this assignment.
    const { data: notifs, error: nErr } = await service
      .from('notifications')
      .select('recipient_id, kind, title, link, created_at')
      .eq('recipient_id', ctx.studentUserId)
      .eq('kind', 'assignment_grade');
    if (nErr) throw new Error(`notif post-fetch: ${nErr.message}`);
    if (!notifs || notifs.length !== 1) {
      throw new Error(
        `expected exactly 1 assignment_grade notif, got ${notifs?.length ?? 0}`,
      );
    }
    const n = notifs[0];
    if (n.recipient_id !== ctx.studentUserId) {
      throw new Error(`recipient mismatch (got ${n.recipient_id})`);
    }
    const expectedFragment = `/assignments/${ctx.assignmentId}`;
    if (!n.link || !n.link.includes(expectedFragment)) {
      throw new Error(`link missing /assignments/<id>; got "${n.link}"`);
    }
    // (notifications has no `payload` column — see 0059; the recipient + kind
    // + link checks above are the load-bearing 0059 contract assertions.)

    // Anti-spam: feedback-only re-write (both old AND new feedback_text
    // are non-null). The 0059 guard should short-circuit — no new notif.
    const { error: editErr } = await ctx.teacherClient
      .from('assignment_attempts')
      .update({ feedback_text: 'Solid effort — review Q2, Q3, and Q5.' })
      .eq('id', freshAttemptId);
    if (editErr) throw new Error(`teacher feedback edit: ${editErr.message}`);

    const { count: afterEdit, error: c2Err } = await service
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', ctx.studentUserId)
      .eq('kind', 'assignment_grade');
    if (c2Err) throw new Error(`notif count after edit: ${c2Err.message}`);
    if ((afterEdit ?? 0) !== 1) {
      throw new Error(
        `anti-spam leak: notif count went 1 → ${afterEdit ?? 0} on a feedback-only edit`,
      );
    }

    return `1 notif on grade, still 1 after feedback edit (anti-spam held)`;
  } finally {
    await service.from('assignment_attempts').delete().eq('id', freshAttemptId);
    await clearStudentNotifications();
    await resetAttempt(ctx.attemptId);
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

  // assignment_attempts cascade from assignments → courses, but we still
  // explicitly clear so audit_events doesn't pile up nonsense between runs.
  if (ctx.assignmentId) {
    await tryDel(`attempts for asn ${ctx.assignmentId}`, async () => {
      await service
        .from('assignment_attempts')
        .delete()
        .eq('assignment_id', ctx.assignmentId);
    });
  }
  if (ctx.otherAssignmentId) {
    await tryDel(`attempts for other asn ${ctx.otherAssignmentId}`, async () => {
      await service
        .from('assignment_attempts')
        .delete()
        .eq('assignment_id', ctx.otherAssignmentId);
    });
  }

  for (const cid of [ctx.courseId, ctx.otherCourseId]) {
    if (!cid) continue;
    await tryDel(`course ${cid}`, async () => {
      await service.from('assignments').delete().eq('course_id', cid);
      await service.from('course_memberships').delete().eq('course_id', cid);
      const { error } = await service.from('courses').delete().eq('id', cid);
      if (error) throw error;
    });
  }

  for (const [label, id] of [
    ['teacher user', ctx.teacherUserId],
    ['other teacher user', ctx.otherTeacherUserId],
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
  console.log(`smoke-grading starting`);
  console.log(`  URL: ${SUPABASE_URL}`);
  console.log(`  tag: ${TAG}`);
  console.log(`  node: ${process.version}`);

  await step('1. Bootstrap teacher + other teacher + student', step1Bootstrap);
  await step('2. Build course/assignment/attempt fixture', step2BuildFixture);
  await step('3. 0056 — grading columns exist on assignment_attempts', stepColumnExistence);
  await step('4. 0056 — teacher UPDATE policy: own ok, foreign blocked', stepTeacherUpdatePolicy);
  await step('5. 0056 — audit trigger writes assignment_grade row', stepAuditTrigger);
  await step('6. 0056 — score_override CHECK [0,100] enforced', stepScoreOverrideCheck);
  await step('7. 0057 — assignment_best_attempts picks effective-score winner', stepBestAttemptsByEffective);
  await step('8. 0057 — assignment_attempts_effective surfaces effective_score', stepEffectiveAttemptsView);
  await step('9. 0059 — graded_at flip fires student notification', stepGradeNotificationTrigger);
  await step('10. 0059 — null→non-null guard prevents feedback-edit spam', stepAntiSpamGuard);
  await step('11. E2E — teacher grades attempt → student notification + anti-spam', stepEndToEndGradingNotification);

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
