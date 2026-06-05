#!/usr/bin/env node
/**
 * clickthrough-two-students.mjs
 *
 * Full real-world dry-run of the invite → claim → take-test pipeline for TWO
 * students, against Supabase Cloud. One-off verification harness (consumes
 * disposable accounts), not a recurring smoke.
 *
 * Flow:
 *   1. service-role bootstraps an ADMIN teacher (admin needed for the 0104
 *      proctor RPCs) + a course.
 *   2. Teacher signs in and INVITES 2 students via admin_create_student — this
 *      mints a managed seat + a one-time login code per student.
 *   3. Each student CLAIMS their seat through the real anon→claim_student_seat
 *      path (sets their own email + password), then signs in.
 *   4. Each student takes dsat-nov-2023 end-to-end: start_test, then for every
 *      module get_test_module → answer EVERY question → submit_test_module,
 *      asserting question delivery, timers, advancement, and finish.
 *        - Student A answers from the real answer key (expect ~full score).
 *        - Student B answers "A"/"1" everywhere (expect a lower score) — this
 *          proves the scoring engine actually discriminates.
 *   5. Admin releases results; each student reads get_test_result and we assert
 *      score + per-question your_answer/correct_answer/is_correct.
 *   6. Cleanup all disposable accounts + course.
 *
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY (root .env).
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const missing = [];
if (!URL) missing.push("SUPABASE_URL");
if (!ANON) missing.push("SUPABASE_ANON_KEY");
if (!SERVICE) missing.push("SUPABASE_SERVICE_KEY");
if (missing.length) {
  console.error("ERROR: missing env:", missing.join(", "));
  process.exit(2);
}

const SLUG = "dsat-nov-2023";
const TS = Date.now();
const TAG = `two-${TS}`;
const PW = "Clickthrough!" + randomBytes(4).toString("hex");
const teacherEmail = `t-${TAG}@gmail.com`;

const service = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
function userClient() {
  return createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------- Logging ----------
const findings = [];
let pass = 0, fail = 0;
function ok(label, extra = "") {
  pass++;
  console.log(`  PASS  ${label}${extra ? "  " + extra : ""}`);
}
function bad(label, detail) {
  fail++;
  findings.push({ label, detail });
  console.log(`  FAIL  ${label}`);
  if (detail) console.log(`        ${detail}`);
}
function step(label) { console.log(`\n=== ${label} ===`); }
function info(label, detail = "") { console.log(`  ..    ${label}${detail ? "  " + detail : ""}`); }

const createdUsers = []; // ids to delete on cleanup
let courseId = null;

// ---------- Answer key ----------
// Map test_questions.id -> {type, correct, accepted}
async function loadAnswerKey() {
  const { data: test, error: tErr } = await service
    .from("tests").select("id").eq("slug", SLUG).single();
  if (tErr) throw new Error(`load test: ${tErr.message}`);
  const { data: mods, error: mErr } = await service
    .from("test_modules").select("id").eq("test_id", test.id);
  if (mErr) throw new Error(`load modules: ${mErr.message}`);
  const modIds = mods.map((m) => m.id);
  const { data: qs, error: qErr } = await service
    .from("test_questions")
    .select("id,type,correct_answer,accepted")
    .in("module_id", modIds);
  if (qErr) throw new Error(`load questions: ${qErr.message}`);
  const key = new Map();
  for (const q of qs) {
    key.set(q.id, { type: q.type, correct: q.correct_answer, accepted: q.accepted });
  }
  return key;
}

// ---------- Take the test ----------
function correctAnswerFor(q, key) {
  const entry = key.get(q.id);
  if (!entry) return q.type === "grid" ? "1" : "A";
  // correct_answer is the canonical answer; for grid it's the numeric string.
  if (entry.correct != null && entry.correct !== "") return String(entry.correct);
  if (Array.isArray(entry.accepted) && entry.accepted.length) return String(entry.accepted[0]);
  return q.type === "grid" ? "1" : "A";
}
function naiveAnswerFor(q) {
  return q.type === "grid" ? "1" : "A";
}

async function takeTest(client, label, mode, key) {
  step(`${label}: take ${SLUG} (${mode === "correct" ? "answer key" : "naive A/1"})`);
  const start = await client.rpc("start_test", { p_slug: SLUG });
  if (start.error) { bad(`${label} start_test`, start.error.message); return null; }
  const s = start.data;
  if (s.status !== "in_progress" || s.current_module !== 1 || s.answered !== 0) {
    bad(`${label} start_test fresh shape`,
      `status=${s.status} current_module=${s.current_module} answered=${s.answered}`);
  } else {
    ok(`${label} start_test fresh (${s.modules.length} modules)`);
  }
  const runId = s.run_id;
  const mods = [...s.modules].sort((a, b) => a.position - b.position);

  let totalAnswered = 0;
  let lastSubmit = null;
  for (const m of mods) {
    const gm = await client.rpc("get_test_module", { p_run_id: runId, p_position: m.position });
    if (gm.error) { bad(`${label} get_test_module(${m.position})`, gm.error.message); return null; }
    const mod = gm.data;
    if (!Array.isArray(mod.questions)) {
      bad(`${label} module ${m.position} questions[]`, JSON.stringify(mod)); return null;
    }
    if (mod.questions.length !== m.question_count) {
      bad(`${label} module ${m.position} count`,
        `meta=${m.question_count} payload=${mod.questions.length}`);
    } else {
      ok(`${label} module ${m.position} (${m.label}) delivered ${mod.questions.length} Q`);
    }
    if (typeof mod.seconds_remaining !== "number" || mod.seconds_remaining <= 0) {
      bad(`${label} module ${m.position} timer`, `seconds_remaining=${mod.seconds_remaining}`);
    }
    // Answer EVERY question.
    const answers = {};
    for (const q of mod.questions) {
      answers[q.id] = mode === "correct" ? correctAnswerFor(q, key) : naiveAnswerFor(q);
    }
    totalAnswered += Object.keys(answers).length;
    const sub = await client.rpc("submit_test_module", {
      p_run_id: runId, p_position: m.position, p_answers: answers, p_eliminated: {},
    });
    if (sub.error) { bad(`${label} submit_test_module(${m.position})`, sub.error.message); return null; }
    lastSubmit = sub.data;
    if (sub.data?.timed_out) bad(`${label} module ${m.position} timed_out`, "walked fast, should not time out");
    const isLast = m.position === mods.length;
    if (!isLast) {
      if (sub.data?.finished !== false || sub.data?.next_module !== m.position + 1) {
        bad(`${label} module ${m.position} advance`,
          `finished=${sub.data?.finished} next=${sub.data?.next_module}`);
      } else {
        ok(`${label} module ${m.position} → module ${sub.data.next_module}`);
      }
    } else {
      if (sub.data?.finished !== true || typeof sub.data?.score !== "number") {
        bad(`${label} final submit`, JSON.stringify(sub.data));
      } else {
        ok(`${label} FINISHED: ${sub.data.score}/${sub.data.total}`);
      }
    }
  }
  if (totalAnswered !== 98) {
    bad(`${label} answered all questions`, `answered ${totalAnswered}, expected 98`);
  } else {
    ok(`${label} answered all 98 questions`);
  }
  return { runId, submit: lastSubmit };
}

// ---------- Release + read result ----------
async function releaseAndRead(adminClient, studentClient, label, runId, expectScore, expectTotal) {
  // Student locked before release.
  const locked = await studentClient.rpc("get_test_result", { p_run_id: runId });
  if (locked.error?.message?.includes("results_locked")) {
    ok(`${label} result locked before release`);
  } else {
    bad(`${label} result should be locked before release`,
      locked.error ? locked.error.message : "no error — payload leaked");
  }
  const rel = await adminClient.rpc("release_test_results", { p_run_id: runId, p_released: true });
  if (rel.error) { bad(`${label} release_test_results`, rel.error.message); return; }
  ok(`${label} admin released results`);
  const res = await studentClient.rpc("get_test_result", { p_run_id: runId });
  if (res.error) { bad(`${label} student read after release`, res.error.message); return; }
  if (res.data.score !== expectScore || res.data.total !== expectTotal) {
    bad(`${label} result score matches submit`,
      `submit=${expectScore}/${expectTotal} result=${res.data.score}/${res.data.total}`);
  } else {
    ok(`${label} result confirms ${res.data.score}/${res.data.total}`);
  }
  const qs = res.data.questions;
  if (!Array.isArray(qs) || qs.length !== 98) {
    bad(`${label} result has 98 questions[]`, `got ${Array.isArray(qs) ? qs.length : typeof qs}`);
  } else {
    const sample = qs[0];
    for (const f of ["your_answer", "correct_answer", "is_correct"]) {
      if (!(f in sample)) bad(`${label} result question has '${f}'`, `keys: ${Object.keys(sample).join(",")}`);
    }
    const correctCount = qs.filter((q) => q.is_correct).length;
    info(`${label} graded correct`, `${correctCount}/98 (engine score=${res.data.score})`);
  }
}

// ---------- Main ----------
async function main() {
  console.log(`Two-student clickthrough vs ${URL}`);
  console.log(`tag=${TAG} slug=${SLUG}\n`);

  const key = await loadAnswerKey();
  info("answer key loaded", `${key.size} questions`);

  step("Bootstrap admin teacher + course");
  const { data: tCreated, error: tErr } = await service.auth.admin.createUser({
    email: teacherEmail, password: PW, email_confirm: true,
    user_metadata: { display_name: "Test Teacher" },
  });
  if (tErr) throw new Error(`createUser(teacher): ${tErr.message}`);
  const teacherId = tCreated.user.id;
  createdUsers.push(teacherId);
  await service.from("profiles").update({ role: "admin" }).eq("id", teacherId);
  info("admin teacher", `${teacherEmail} id=${teacherId.slice(0, 8)}`);

  const { data: course, error: cErr } = await service
    .from("courses")
    .insert({ teacher_id: teacherId, name: `Two-Student Clickthrough ${TS}` })
    .select("id, short_code")
    .single();
  if (cErr) throw new Error(`create course: ${cErr.message}`);
  courseId = course.id;
  info("course", `${courseId.slice(0, 8)} short=${course.short_code}`);

  // Link the test into the course as a module item (realistic setup the runner
  // relies on for course-scoped proctor RPCs — see migration 0090).
  const { data: modRow, error: modErr } = await service
    .from("course_modules")
    .insert({ course_id: courseId, name: "Practice Tests", position: 1 })
    .select("id").single();
  if (modErr) throw new Error(`create module: ${modErr.message}`);
  const { error: miErr } = await service.from("module_items").insert({
    module_id: modRow.id, item_type: "link", title: "DSAT Nov 2023",
    url: `/test/${SLUG}`, position: 1,
  });
  if (miErr) throw new Error(`create module_item: ${miErr.message}`);
  info("module_item", `/test/${SLUG} linked`);

  step("Teacher invites 2 students (admin_create_student)");
  const teacherClient = userClient();
  const tSignin = await teacherClient.auth.signInWithPassword({ email: teacherEmail, password: PW });
  if (tSignin.error) throw new Error(`teacher signin: ${tSignin.error.message}`);

  const seats = [];
  for (const name of ["Alice", "Ben"]) {
    const { data, error } = await teacherClient.rpc("admin_create_student", {
      p_course_id: courseId, p_display_name: name,
      p_password: "temp-" + randomBytes(3).toString("hex"),
    });
    if (error) throw new Error(`admin_create_student(${name}): ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    seats.push({ name, seatId: row.student_id, code: row.login_code });
    createdUsers.push(row.student_id);
    if (!/^[A-HJ-NP-Z2-9]{6}-\d{2,}$/.test(row.login_code)) {
      bad(`invite ${name}: login code format`, row.login_code);
    } else {
      ok(`invited ${name}`, `code=${row.login_code} seat=${row.student_id.slice(0, 8)}`);
    }
  }

  // Each student claims their seat and takes the test.
  const adminClient = teacherClient; // admin === teacher here
  const plan = [
    { ...seats[0], email: `s-alice-${TAG}@gmail.com`, pw: "Alice!" + randomBytes(3).toString("hex"), mode: "correct" },
    { ...seats[1], email: `s-ben-${TAG}@gmail.com`, pw: "Ben!" + randomBytes(3).toString("hex"), mode: "naive" },
  ];

  const outcomes = [];
  for (const p of plan) {
    step(`${p.name}: claim seat ${p.code}`);
    const anon = userClient();
    const anonRes = await anon.auth.signInAnonymously();
    if (anonRes.error) { bad(`${p.name} anon signin`, anonRes.error.message); continue; }
    createdUsers.push(anonRes.data.user.id);
    const claim = await anon.rpc("claim_student_seat", {
      p_code: p.code, p_email: p.email, p_password: p.pw,
    });
    if (claim.error) { bad(`${p.name} claim_student_seat`, claim.error.message); continue; }
    const row = Array.isArray(claim.data) ? claim.data[0] : claim.data;
    if (row?.status !== "claimed") {
      bad(`${p.name} first claim → claimed`, JSON.stringify(row)); continue;
    }
    ok(`${p.name} claimed seat`, `email=${row.login_email}`);

    const studentClient = userClient();
    const si = await studentClient.auth.signInWithPassword({ email: p.email, password: p.pw });
    if (si.error) { bad(`${p.name} signin after claim`, si.error.message); continue; }
    // Name must be teacher-owned (preserved through claim).
    const { data: prof } = await service.from("profiles")
      .select("display_name").eq("id", p.seatId).single();
    if (prof?.display_name !== p.name) {
      bad(`${p.name} display_name preserved`, `got ${prof?.display_name}`);
    } else {
      ok(`${p.name} display_name preserved through claim`);
    }

    const taken = await takeTest(studentClient, p.name, p.mode, key);
    if (taken?.submit?.finished) {
      outcomes.push({ ...p, studentClient, runId: taken.runId,
        score: taken.submit.score, total: taken.submit.total });
    }
  }

  // Release + verify results for each.
  step("Release results + verify");
  for (const o of outcomes) {
    await releaseAndRead(adminClient, o.studentClient, o.name, o.runId, o.score, o.total);
  }

  // Cross-check: correct-key student scored strictly higher than naive student.
  if (outcomes.length === 2) {
    const [a, b] = outcomes;
    if (a.score > b.score) {
      ok("scoring engine discriminates", `${a.name}=${a.score} > ${b.name}=${b.score}`);
    } else {
      bad("scoring engine discriminates",
        `expected ${a.name} > ${b.name}, got ${a.score} vs ${b.score}`);
    }
    if (a.score === a.total) {
      ok(`${a.name} (answer key) scored full marks`, `${a.score}/${a.total}`);
    } else {
      info(`${a.name} (answer key) score`, `${a.score}/${a.total} — investigate any misses`);
    }
  }

  await cleanup();
  finish();
}

async function cleanup() {
  step("Cleanup");
  if (courseId) await service.from("courses").delete().eq("id", courseId);
  let n = 0;
  for (const id of [...new Set(createdUsers)]) {
    try { await service.auth.admin.deleteUser(id); n++; } catch { /* best effort */ }
  }
  info("removed", `${n} users + course`);
}

function finish() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${pass} pass / ${fail} fail`);
  if (findings.length) {
    console.log("\nDefects:");
    findings.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.label}`);
      if (f.detail) console.log(`     ${f.detail}`);
    });
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("FATAL:", err);
  try { await cleanup(); } catch { /* ignore */ }
  process.exit(2);
});
