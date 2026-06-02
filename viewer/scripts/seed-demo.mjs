#!/usr/bin/env node
/**
 * Demo data seeder for CB_Educator_Question_Bank LMS (Supabase Cloud).
 *
 * Required env vars:
 *   SUPABASE_URL          - https://<project-ref>.supabase.co
 *   SUPABASE_ANON_KEY     - (kept for parity; not strictly used here)
 *   SUPABASE_SERVICE_KEY  - service-role key (used for admin.createUser, etc.)
 *
 * Flags / env:
 *   --quiet         Suppress per-step progress logging.
 *   RESET_ONLY=1    Only run the reset/cleanup phase; skip creating fresh demo data.
 *
 * What it does
 * ------------
 *  RESET phase (idempotent; lets re-runs start clean):
 *    1) Delete auth.users whose email matches 'demo-%@example.com'
 *       (cascades to profiles, memberships, attempts).
 *    2) Delete classes whose name starts with 'Demo:'
 *       (cascades to assignments + memberships).
 *    3) Delete teacher_invite_codes whose note starts with 'demo-'
 *       (none expected, but kept for safety/parity).
 *
 *  CREATE phase:
 *    1 teacher  (demo-teacher@example.com / demoteacher123)
 *    3 students (demo-student1..3@example.com / demostudent123)
 *    2 classes  (Demo: SAT Reading Spring 2026 / DEMO-RW01,
 *                Demo: SAT Math Spring 2026   / DEMO-MT01)
 *    3 assignments + a handful of pre-populated attempts so the teacher
 *    dashboard has scores to drill into out-of-the-box.
 *
 * Re-run safety: deterministic 'demo-*' prefixes mean the reset phase
 * always finds and removes the previous run before creating fresh rows.
 *
 * SECURITY: This writes real rows to the connected cloud project. Use it
 * only against a dev / demo project, NEVER against production data.
 */

import { createClient } from '@supabase/supabase-js';

// -----------------------------------------------------------------------------
// Env + flags
// -----------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; // unused but expected
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const QUIET = process.argv.includes('--quiet');
const RESET_ONLY = process.env.RESET_ONLY === '1';

const missing = [];
if (!SUPABASE_URL) missing.push('SUPABASE_URL');
if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY');
if (missing.length) {
  console.error(`ERROR: missing required env vars: ${missing.join(', ')}`);
  process.exit(2);
}

// -----------------------------------------------------------------------------
// Client (service-role; bypasses RLS — that is the whole point of seed scripts)
// -----------------------------------------------------------------------------
const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// -----------------------------------------------------------------------------
// Demo configuration (deterministic — drives both reset matching and create)
// -----------------------------------------------------------------------------
const TEACHER = {
  email: 'demo-teacher@example.com',
  password: 'demoteacher123',
  display_name: 'Demo Teacher',
};

const STUDENTS = [
  {
    key: 'alex',
    email: 'demo-student1@example.com',
    password: 'demostudent123',
    display_name: 'Alex Chen',
  },
  {
    key: 'brianna',
    email: 'demo-student2@example.com',
    password: 'demostudent123',
    display_name: 'Brianna Davis',
  },
  {
    key: 'chris',
    email: 'demo-student3@example.com',
    password: 'demostudent123',
    display_name: 'Chris Patel',
  },
];

const CLASSES = [
  {
    key: 'reading',
    name: 'Demo: SAT Reading Spring 2026',
    description: 'Reading & Writing practice classroom (demo).',
    join_code: 'DEMO-RW01',
    enroll_keys: ['alex', 'brianna', 'chris'], // all three
  },
  {
    key: 'math',
    name: 'Demo: SAT Math Spring 2026',
    description: 'Math practice classroom (demo).',
    join_code: 'DEMO-MT01',
    enroll_keys: ['alex', 'brianna'], // Chris intentionally left to demo joining
  },
];

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const ASSIGNMENTS = [
  {
    key: 'reading-warmup',
    class_key: 'reading',
    title: 'Reading Warm-up',
    description: 'A short warm-up to get started.',
    source_id: 'cb',
    question_count: 5,
    time_limit_minutes: 10,
    difficulty_mix: 'any',
    due_at: new Date(now + 7 * DAY).toISOString(),
  },
  {
    key: 'reading-hard',
    class_key: 'reading',
    title: 'Reading Practice — Hard',
    description: 'Hard-difficulty Reading & Writing set.',
    source_id: 'sat',
    question_count: 10,
    time_limit_minutes: 20,
    difficulty_mix: 'hard',
    due_at: new Date(now + 14 * DAY).toISOString(),
  },
  {
    key: 'math-diagnostic',
    class_key: 'math',
    title: 'Math Diagnostic',
    description: 'Mixed-difficulty diagnostic for the Math classroom.',
    source_id: 'mixed',
    question_count: 15,
    time_limit_minutes: 30,
    difficulty_mix: 'any',
    due_at: new Date(now + 7 * DAY).toISOString(),
  },
];

/**
 * Pre-populated attempts so the teacher has something to drill into.
 *
 *   score_percent here drives all derived fields. We stub out result_detail
 *   with empty arrays (no question snapshot is taken at the DB layer for
 *   the MVP — see docstring on the assignments migration). The review screen
 *   will render an empty per-question list but the score header is correct.
 */
const ATTEMPTS = [
  { student_key: 'alex', assignment_key: 'reading-warmup', score_percent: 80 },
  { student_key: 'brianna', assignment_key: 'reading-warmup', score_percent: 60 },
  // Chris: NOT submitted reading-warmup (so teacher sees a "Not started" row).
  { student_key: 'alex', assignment_key: 'reading-hard', score_percent: 70 },
  // brianna + chris: NOT submitted reading-hard.
  // math-diagnostic: nobody submitted yet.
];

// -----------------------------------------------------------------------------
// Logging helpers
// -----------------------------------------------------------------------------
function log(...args) {
  if (!QUIET) console.log(...args);
}
function step(label) {
  log(`\n▶ ${label}`);
}

// -----------------------------------------------------------------------------
// Generic error-wrapping helpers
// -----------------------------------------------------------------------------
function must(label, { data, error }) {
  if (error) {
    throw new Error(`${label}: ${error.message || error}`);
  }
  return data;
}

async function mustAsync(label, promise) {
  let res;
  try {
    res = await promise;
  } catch (e) {
    throw new Error(`${label}: ${e?.message || e}`);
  }
  if (res && res.error) {
    throw new Error(`${label}: ${res.error.message || res.error}`);
  }
  return res?.data ?? res;
}

// -----------------------------------------------------------------------------
// RESET PHASE
// -----------------------------------------------------------------------------
async function listDemoAuthUsers() {
  // The admin.listUsers API is paginated. We walk pages until we run dry.
  // 'demo-*@example.com' is the deterministic prefix we use everywhere.
  const found = [];
  const PER_PAGE = 200;
  for (let page = 1; page < 100; page++) {
    const { data, error } = await svc.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });
    if (error) throw new Error(`auth.admin.listUsers page=${page}: ${error.message}`);
    const users = data?.users || [];
    for (const u of users) {
      if (u.email && /^demo-.*@example\.com$/i.test(u.email)) {
        found.push(u);
      }
    }
    if (users.length < PER_PAGE) break;
  }
  return found;
}

async function resetPhase() {
  // ORDER MATTERS.
  //
  //   classes.teacher_id      -> profiles(id) ON DELETE RESTRICT
  //   assignments.created_by  -> profiles(id) ON DELETE RESTRICT
  //   profiles.id             -> auth.users(id) ON DELETE CASCADE
  //
  // So if we try to delete a demo teacher's auth.users row while their
  // demo class still exists, the cascade into profiles is blocked by the
  // RESTRICT FK from classes. The reliable order is:
  //   1) delete demo classes  (cascades assignments, attempts, memberships)
  //   2) delete demo auth users (cascades profiles)
  //   3) delete demo teacher invite codes (independent)

  step('Reset: deleting "Demo:" courses (cascades assignments + memberships)');
  const { data: existingClasses } = await svc
    .from('courses')
    .select('id,name')
    .like('name', 'Demo:%');
  if (existingClasses && existingClasses.length) {
    const ids = existingClasses.map((c) => c.id);
    const { error: delErr } = await svc.from('courses').delete().in('id', ids);
    if (delErr) throw new Error(`delete demo courses: ${delErr.message}`);
    log(`  deleted ${ids.length} course(s)`);
  } else {
    log('  none found');
  }

  step('Reset: scanning for prior demo auth users');
  const demoUsers = await listDemoAuthUsers();
  log(`  found ${demoUsers.length} demo auth user(s)`);

  for (const u of demoUsers) {
    const { error } = await svc.auth.admin.deleteUser(u.id);
    if (error) {
      // 'user_not_found' is benign on a retry; everything else escalates.
      if (!/not.?found/i.test(error.message)) {
        throw new Error(`auth.admin.deleteUser(${u.email}): ${error.message}`);
      }
    }
    log(`  deleted auth user ${u.email}`);
  }

  step('Reset: deleting demo teacher invite codes');
  const { data: codes } = await svc
    .from('teacher_invite_codes')
    .select('code')
    .like('note', 'demo-%');
  if (codes && codes.length) {
    const codeIds = codes.map((c) => c.code);
    const { error: delErr } = await svc
      .from('teacher_invite_codes')
      .delete()
      .in('code', codeIds);
    if (delErr) throw new Error(`delete demo invite codes: ${delErr.message}`);
    log(`  deleted ${codeIds.length} invite code(s)`);
  } else {
    log('  none found');
  }
}

// -----------------------------------------------------------------------------
// CREATE PHASE
// -----------------------------------------------------------------------------
async function createAuthUser({ email, password, display_name }) {
  // email_confirm: true bypasses the confirmation-email round-trip so the
  // user is immediately login-ready. The handle_new_auth_user trigger
  // mirrors this row into public.profiles as role='student'.
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name },
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  return data.user;
}

async function ensureProfileFields(userId, fields) {
  // The auth trigger inserts a default profile, but it may not pick up
  // display_name (depending on how the trigger reads metadata). We patch
  // the profile here to guarantee the demo display names land.
  const { error } = await svc.from('profiles').update(fields).eq('id', userId);
  if (error) throw new Error(`profiles update ${userId}: ${error.message}`);
}

async function createPhase() {
  // ---- Teacher ----
  step('Create: demo teacher');
  const teacher = await createAuthUser(TEACHER);
  await ensureProfileFields(teacher.id, {
    display_name: TEACHER.display_name,
    role: 'teacher', // service-role bypass; no invite needed for the seed
  });
  log(`  ${TEACHER.email} (id=${teacher.id})`);

  // ---- Students ----
  step('Create: demo students');
  const studentIdByKey = {};
  for (const s of STUDENTS) {
    const u = await createAuthUser(s);
    await ensureProfileFields(u.id, { display_name: s.display_name });
    studentIdByKey[s.key] = u.id;
    log(`  ${s.email} (${s.display_name})`);
  }

  // ---- Courses ----
  step('Create: courses');
  const classIdByKey = {};
  for (const c of CLASSES) {
    const data = must(
      `insert course ${c.name}`,
      await svc
        .from('courses')
        .insert({
          teacher_id: teacher.id,
          name: c.name,
          description: c.description,
          join_code: c.join_code,
        })
        .select()
        .single(),
    );
    classIdByKey[c.key] = data.id;
    log(`  ${c.name} (join_code=${c.join_code})`);
  }

  // ---- Memberships ----
  step('Create: enrollments');
  for (const c of CLASSES) {
    for (const studentKey of c.enroll_keys) {
      must(
        `enroll ${studentKey} -> ${c.key}`,
        await svc.from('course_memberships').insert({
          course_id: classIdByKey[c.key],
          student_id: studentIdByKey[studentKey],
        }),
      );
    }
    log(`  ${c.name}: ${c.enroll_keys.length} student(s)`);
  }

  // ---- Assignments ----
  step('Create: assignments');
  const assignmentIdByKey = {};
  for (const a of ASSIGNMENTS) {
    const data = must(
      `insert assignment ${a.title}`,
      await svc
        .from('assignments')
        .insert({
          course_id: classIdByKey[a.class_key],
          created_by: teacher.id,
          title: a.title,
          description: a.description,
          source_id: a.source_id,
          question_count: a.question_count,
          time_limit_minutes: a.time_limit_minutes,
          difficulty_mix: a.difficulty_mix,
          due_at: a.due_at,
        })
        .select()
        .single(),
    );
    assignmentIdByKey[a.key] = data.id;
    log(`  ${a.title}  (${a.question_count} q, ${a.time_limit_minutes} min)`);
  }

  // ---- Pre-populated attempts ----
  step('Create: pre-populated attempts (scored)');
  for (const att of ATTEMPTS) {
    const assignment = ASSIGNMENTS.find((a) => a.key === att.assignment_key);
    if (!assignment) {
      throw new Error(`unknown assignment_key in ATTEMPTS: ${att.assignment_key}`);
    }
    const total = assignment.question_count;
    const correct = Math.round((att.score_percent / 100) * total);
    const score = Number(((correct / total) * 100).toFixed(2));

    // Build a plausible answers map: 'demo-q1'..'demo-qN' -> A/B/C/D.
    const answers = {};
    const opts = ['A', 'B', 'C', 'D'];
    for (let i = 1; i <= total; i++) {
      answers[`demo-q${i}`] = opts[i % 4];
    }

    // Stub result_detail — keys mirror the shape the review UI expects.
    // Empty arrays are intentional: we did not snapshot questions for the
    // MVP (see migration 0004 docstring).
    const result_detail = {
      byDomain: [],
      bySkill: [],
      byDifficulty: [],
      questions: [],
      totalQuestions: total,
      correctCount: correct,
      scorePercent: score,
      durationSeconds: 300,
      isDemo: true,
    };

    // Started ~5 minutes before submitted_at to make timing look plausible.
    const submittedAt = new Date(now - 60 * 60 * 1000).toISOString(); // 1h ago
    const startedAt = new Date(now - 60 * 60 * 1000 - 5 * 60 * 1000).toISOString();

    must(
      `insert attempt (${att.student_key} / ${att.assignment_key})`,
      await svc.from('assignment_attempts').insert({
        assignment_id: assignmentIdByKey[att.assignment_key],
        student_id: studentIdByKey[att.student_key],
        started_at: startedAt,
        submitted_at: submittedAt,
        score_percent: score,
        correct_count: correct,
        total_questions: total,
        duration_seconds: 300,
        result_detail,
        answers,
      }),
    );
    log(`  ${att.student_key.padEnd(8)} ${att.assignment_key.padEnd(18)} ${score}%`);
  }

  return { teacher, studentIdByKey, classIdByKey, assignmentIdByKey };
}

// -----------------------------------------------------------------------------
// Summary printer
// -----------------------------------------------------------------------------
function printSummary() {
  const lines = [];
  lines.push('');
  lines.push('== Demo data seeded ==');
  lines.push(`Teacher: ${TEACHER.email} / ${TEACHER.password}`);
  lines.push('Students:');
  lines.push(`  Alex     ${STUDENTS[0].email} / ${STUDENTS[0].password}`);
  lines.push(`  Brianna  ${STUDENTS[1].email} / ${STUDENTS[1].password}`);
  lines.push(`  Chris    ${STUDENTS[2].email} / ${STUDENTS[2].password}  (not yet joined Class 2)`);
  lines.push('');
  lines.push(`Class 1 join code: ${CLASSES[0].join_code}  (${CLASSES[0].name})`);
  lines.push(`Class 2 join code: ${CLASSES[1].join_code}  (${CLASSES[1].name})`);
  lines.push('');
  lines.push('Assignments:');
  lines.push('  Reading Warm-up         Class 1   5 questions    Alex 80%, Brianna 60%, Chris pending');
  lines.push('  Reading Practice — Hard Class 1  10 questions    Alex 70%, Brianna pending, Chris pending');
  lines.push('  Math Diagnostic         Class 2  15 questions    all pending');
  lines.push('');
  lines.push('Try:');
  lines.push(`  - Sign in as ${TEACHER.email} → see both classes and existing scores`);
  lines.push(`  - Sign in as ${STUDENTS[2].email} → use Class 2 join code ${CLASSES[1].join_code} to enroll → take Math Diagnostic`);
  lines.push('');
  console.log(lines.join('\n'));
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  log(`Supabase URL: ${SUPABASE_URL}`);
  log(`Mode: ${RESET_ONLY ? 'RESET ONLY' : 'reset + create'}`);

  await resetPhase();

  if (RESET_ONLY) {
    log('\nRESET_ONLY=1 set — skipping create phase.');
    console.log('Reset complete. Demo rows removed.');
    return;
  }

  await createPhase();
  printSummary();
}

main().catch((err) => {
  console.error(`\n✖ seed-demo failed: ${err?.message || err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
