#!/usr/bin/env node
/**
 * clickthrough-practice-test.mjs
 *
 * Simulates a real student taking the DSAT-Nov-2023 practice test end-to-end
 * against Supabase Cloud. Intended as a one-off verification harness, not a
 * recurring smoke (it consumes a fresh disposable student per run).
 *
 *   1. Provision: fresh student via service role.
 *   2. Sign in as student.
 *   3. start_test('dsat-nov-2023') — assert shape (modules[], current_module=1,
 *      results_released=false, answered=0).
 *   4. For each module:
 *        - get_test_module(run, pos) — assert questions.length matches meta,
 *          seconds_remaining > 0, choices/figures sane on a spot-checked Q.
 *        - For an interesting prefix:
 *            • save_test_progress with HALF the answers + eliminations
 *            • re-get_test_module and assert saved_answers + saved_eliminations
 *              round-trip exactly (this is the "resume on another device" path).
 *        - submit_test_module with ALL answers ('A' for every MCQ, '1' for grid).
 *          Assert next_module advances, or finished=true on the last position.
 *   5. get_test_result as STUDENT — must raise `results_locked`.
 *   6. release_test_results as STAFF — student read succeeds, payload contains
 *      `eliminated` per question, scoring matches submit_test_module's score.
 *   7. start_test as STUDENT again — must return SAME run_id (one-attempt lock).
 *   8. allow_test_retake as STAFF, start_test again — must return a NEW run_id.
 *
 * Reports every defect with enough context for a follow-up commit.
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
const TAG = `clk-${TS}`;
const PW = "Clickthrough!" + randomBytes(4).toString("hex");
const studentEmail = `s-${TAG}@gmail.com`;
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
const findings = []; // collected defects
let pass = 0, fail = 0;

function ok(label, extra = "") {
  pass++;
  console.log(`  PASS  ${label}${extra ? "  " + extra : ""}`);
}
function bad(label, detail) {
  fail++;
  const entry = { label, detail };
  findings.push(entry);
  console.log(`  FAIL  ${label}`);
  if (detail) console.log(`        ${detail}`);
}
function step(label) {
  console.log(`\n=== ${label} ===`);
}
function info(label, detail = "") {
  console.log(`  ..    ${label}${detail ? "  " + detail : ""}`);
}

// ---------- Provision ----------
async function createUser(email, role) {
  const { data, error } = await service.auth.admin.createUser({
    email, password: PW, email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  const uid = data.user.id;
  // ensure_profile trigger (per project conventions) creates the profile row;
  // upgrade to teacher when needed via service write.
  if (role !== "student") {
    const { error: upErr } = await service
      .from("profiles").update({ role }).eq("id", uid);
    if (upErr) throw new Error(`promote(${email}): ${upErr.message}`);
  }
  return uid;
}

async function signIn(email) {
  const c = userClient();
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return c;
}

// ---------- Step 3: start_test ----------
function assertStartShape(start) {
  if (!start || typeof start !== "object") {
    bad("start_test returns object", `got: ${JSON.stringify(start)}`);
    return false;
  }
  let ok_ = true;
  const required = ["run_id", "status", "current_module", "started_at",
    "results_released", "answered", "test", "modules"];
  for (const k of required) {
    if (!(k in start)) {
      bad(`start_test contains '${k}'`, `keys: ${Object.keys(start).join(",")}`);
      ok_ = false;
    }
  }
  if (start.status !== "in_progress") {
    bad("start_test on fresh student returns in_progress", `status=${start.status}`);
    ok_ = false;
  }
  if (start.current_module !== 1) {
    bad("start_test fresh: current_module=1", `got ${start.current_module}`);
    ok_ = false;
  }
  if (start.results_released !== false) {
    bad("start_test fresh: results_released=false", `got ${start.results_released}`);
    ok_ = false;
  }
  if (start.answered !== 0) {
    bad("start_test fresh: answered=0", `got ${start.answered}`);
    ok_ = false;
  }
  if (!Array.isArray(start.modules) || start.modules.length === 0) {
    bad("start_test modules[] non-empty", `got ${JSON.stringify(start.modules)}`);
    ok_ = false;
  } else {
    // sanity: positions 1..N contiguous, each has time_limit_seconds + question_count
    const positions = start.modules.map((m) => m.position).sort((a, b) => a - b);
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] !== i + 1) {
        bad("modules positions are 1..N contiguous", `got ${positions.join(",")}`);
        ok_ = false;
        break;
      }
    }
    for (const m of start.modules) {
      if (typeof m.time_limit_seconds !== "number" || m.time_limit_seconds <= 0) {
        bad(`module ${m.position} has positive time_limit_seconds`, JSON.stringify(m));
        ok_ = false;
      }
      if (typeof m.question_count !== "number" || m.question_count <= 0) {
        bad(`module ${m.position} has positive question_count`, JSON.stringify(m));
        ok_ = false;
      }
      if (typeof m.section !== "string") {
        bad(`module ${m.position} has section string`, JSON.stringify(m));
        ok_ = false;
      }
    }
  }
  if (ok_) ok("start_test payload shape");
  return ok_;
}

// ---------- Step 4: walk modules ----------
function pickAnswer(q) {
  if (q.type === "mcq") return "A";
  if (q.type === "grid") return "1";
  // unknown type — try "A" and surface as a finding
  bad(`unknown question type '${q.type}' on q ${q.ref}`,
    `runner falls back to "A"; staff should sanity-check this`);
  return "A";
}

async function walkModule(studentClient, runId, modMeta) {
  step(`Module ${modMeta.position} (${modMeta.label})`);

  const { data: m1, error: e1 } = await studentClient.rpc("get_test_module", {
    p_run_id: runId, p_position: modMeta.position,
  });
  if (e1) {
    bad(`get_test_module(${modMeta.position}) initial fetch`, e1.message);
    return null;
  }
  if (!m1 || !Array.isArray(m1.questions)) {
    bad(`get_test_module(${modMeta.position}) returns questions[]`, JSON.stringify(m1));
    return null;
  }
  if (m1.questions.length !== modMeta.question_count) {
    bad(`module ${modMeta.position} question_count matches meta`,
      `meta=${modMeta.question_count}, payload=${m1.questions.length}`);
  } else {
    ok(`module ${modMeta.position} delivers ${m1.questions.length} questions`);
  }
  if (typeof m1.seconds_remaining !== "number" || m1.seconds_remaining <= 0) {
    bad(`module ${modMeta.position} seconds_remaining > 0`,
      `got ${m1.seconds_remaining}`);
  } else {
    ok(`module ${modMeta.position} timer ${m1.seconds_remaining}s remaining`);
  }

  // Spot-check the first MCQ has 4 choices A–D
  const firstMcq = m1.questions.find((q) => q.type === "mcq");
  if (firstMcq) {
    const letters = Object.keys(firstMcq.choices || {}).sort();
    if (letters.join(",") !== "A,B,C,D") {
      bad(`first MCQ in module ${modMeta.position} has choices A–D`,
        `ref=${firstMcq.ref} letters=${letters.join(",")}`);
    } else {
      ok(`first MCQ choices A–D (ref ${firstMcq.ref})`);
    }
    if (!firstMcq.stem || firstMcq.stem.trim() === "") {
      bad(`MCQ ${firstMcq.ref} has non-empty stem`, "stem is empty");
    }
  }

  // Save HALF the answers + eliminations, then refetch to verify resume.
  const halfAnswers = {};
  const halfElims = {};
  m1.questions.slice(0, Math.ceil(m1.questions.length / 2)).forEach((q) => {
    halfAnswers[q.id] = pickAnswer(q);
    if (q.type === "mcq") halfElims[q.id] = ["B"]; // pretend student struck B
  });
  const { data: save, error: eSave } = await studentClient.rpc("save_test_progress", {
    p_run_id: runId, p_position: modMeta.position,
    p_answers: halfAnswers, p_eliminated: halfElims,
  });
  if (eSave) {
    bad(`save_test_progress(${modMeta.position})`, eSave.message);
  } else if (save?.saved !== Object.keys(halfAnswers).length) {
    bad(`save_test_progress 'saved' count`,
      `expected ${Object.keys(halfAnswers).length} got ${save?.saved}`);
  } else {
    ok(`save_test_progress persisted ${save.saved} answers`);
  }

  // Resume — same position, expect saved_answers + saved_eliminations populated.
  const { data: m2, error: e2 } = await studentClient.rpc("get_test_module", {
    p_run_id: runId, p_position: modMeta.position,
  });
  if (e2) {
    bad(`get_test_module(${modMeta.position}) resume fetch`, e2.message);
  } else {
    const sa = m2.saved_answers || {};
    const se = m2.saved_eliminations || {};
    let saMissing = 0, seMissing = 0;
    for (const [qid, ans] of Object.entries(halfAnswers)) {
      if (sa[qid] !== ans) saMissing++;
    }
    for (const [qid, list] of Object.entries(halfElims)) {
      const got = (se[qid] || []).slice().sort();
      const want = list.slice().sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) seMissing++;
    }
    if (saMissing === 0) ok(`saved_answers round-trip (${Object.keys(halfAnswers).length})`);
    else bad(`saved_answers round-trip`,
      `${saMissing}/${Object.keys(halfAnswers).length} did not match`);
    if (seMissing === 0) ok(`saved_eliminations round-trip (${Object.keys(halfElims).length})`);
    else bad(`saved_eliminations round-trip`,
      `${seMissing}/${Object.keys(halfElims).length} did not match`);
    // Timer must not have RESET on a resume — should be <= initial value.
    if (typeof m2.seconds_remaining === "number" && m2.seconds_remaining > m1.seconds_remaining) {
      bad(`module ${modMeta.position} timer reset on resume`,
        `before=${m1.seconds_remaining} after=${m2.seconds_remaining}`);
    } else {
      ok(`module ${modMeta.position} timer monotonic on resume`);
    }
  }

  // Now submit ALL answers (including the previously-unsaved second half).
  const allAnswers = {};
  const allElims = {};
  m1.questions.forEach((q) => {
    allAnswers[q.id] = pickAnswer(q);
    if (q.type === "mcq") allElims[q.id] = ["B"];
  });
  const { data: sub, error: eSub } = await studentClient.rpc("submit_test_module", {
    p_run_id: runId, p_position: modMeta.position,
    p_answers: allAnswers, p_eliminated: allElims,
  });
  if (eSub) {
    bad(`submit_test_module(${modMeta.position})`, eSub.message);
    return null;
  }
  if (sub?.timed_out) {
    bad(`submit_test_module(${modMeta.position}) timed_out`,
      `submission flagged timed_out even though we walked fast`);
  }
  return { initial: m1, resume: m2, submit: sub };
}

// ---------- Step 5+6: results gating ----------
async function verifyResultsGating(studentClient, staffClient, runId, expectedScore, expectedTotal) {
  step("Results gating");

  // Student must hit results_locked.
  const r1 = await studentClient.rpc("get_test_result", { p_run_id: runId });
  if (r1.error?.message?.includes("results_locked")) {
    ok("student get_test_result before release → results_locked");
  } else if (r1.error) {
    bad("student get_test_result before release should be results_locked",
      `got error: ${r1.error.message}`);
  } else {
    bad("student get_test_result before release should be results_locked",
      `no error — payload returned: keys=${Object.keys(r1.data || {}).join(",")}`);
  }

  // Staff can always read.
  const r2 = await staffClient.rpc("get_test_result", { p_run_id: runId });
  if (r2.error) {
    bad("staff get_test_result before release should succeed", r2.error.message);
  } else if (r2.data?.score !== expectedScore || r2.data?.total !== expectedTotal) {
    bad("staff get_test_result score/total match submit",
      `submit:${expectedScore}/${expectedTotal} result:${r2.data?.score}/${r2.data?.total}`);
  } else {
    ok(`staff sees ${r2.data.score}/${r2.data.total} before release`);
  }

  // Release.
  const rel = await staffClient.rpc("release_test_results",
    { p_run_id: runId, p_released: true });
  if (rel.error) bad("release_test_results", rel.error.message);
  else ok(`release_test_results returned ${rel.data}`);

  // Student now reads — including eliminations.
  const r3 = await studentClient.rpc("get_test_result", { p_run_id: runId });
  if (r3.error) {
    bad("student get_test_result AFTER release should succeed", r3.error.message);
    return;
  }
  if (r3.data.score !== expectedScore) {
    bad("student score matches submit", `submit:${expectedScore} result:${r3.data.score}`);
  } else {
    ok(`student sees ${r3.data.score}/${r3.data.total} after release`);
  }
  if (!Array.isArray(r3.data.questions) || r3.data.questions.length === 0) {
    bad("student get_test_result has questions[]", JSON.stringify(r3.data.questions));
  } else {
    const sample = r3.data.questions[0];
    if (!("eliminated" in sample)) {
      bad("get_test_result question contains 'eliminated' field",
        `keys: ${Object.keys(sample).join(",")}`);
    } else {
      const elim = sample.eliminated;
      // We struck "B" on every MCQ. Either an array or null.
      if (sample.type === "mcq" && Array.isArray(elim) && elim.includes("B")) {
        ok("eliminations round-trip into result payload");
      } else if (sample.type === "mcq") {
        bad("eliminations round-trip into result payload",
          `expected to include "B"; got ${JSON.stringify(elim)}`);
      }
    }
    if (!("your_answer" in sample) || !("correct_answer" in sample) || !("is_correct" in sample)) {
      bad("result question has your_answer + correct_answer + is_correct",
        `keys: ${Object.keys(sample).join(",")}`);
    }
  }
}

// ---------- Step 7+8: one-attempt lock + retake ----------
async function verifyOneAttemptLock(studentClient, staffClient, originalRunId) {
  step("One-attempt lock + retake grant");

  const a = await studentClient.rpc("start_test", { p_slug: SLUG });
  if (a.error) {
    bad("start_test after submit (no retake) should return prior run, not error",
      a.error.message);
  } else if (a.data?.run_id !== originalRunId) {
    bad("start_test after submit returns SAME run_id",
      `expected ${originalRunId} got ${a.data?.run_id}`);
  } else if (a.data?.status !== "submitted") {
    bad("start_test after submit reports status=submitted",
      `status=${a.data?.status}`);
  } else if (a.data?.results_released !== true) {
    bad("start_test after release reflects results_released=true",
      `got ${a.data?.results_released}`);
  } else {
    ok("one-attempt lock: same submitted run returned, results_released=true");
  }

  // Need student profile id for allow_test_retake.
  const { data: me, error: meErr } = await studentClient.auth.getUser();
  if (meErr || !me?.user?.id) {
    bad("student auth.getUser inside retake check", meErr?.message || "no user");
    return;
  }
  const grant = await staffClient.rpc("allow_test_retake",
    { p_student_id: me.user.id, p_slug: SLUG });
  if (grant.error) {
    bad("allow_test_retake by staff", grant.error.message);
    return;
  }
  ok("allow_test_retake by staff succeeded");

  const b = await studentClient.rpc("start_test", { p_slug: SLUG });
  if (b.error) {
    bad("start_test after retake grant should mint a new run", b.error.message);
  } else if (b.data?.run_id === originalRunId) {
    bad("start_test after retake grant returns NEW run_id",
      `still ${originalRunId} — grant did not consume`);
  } else if (b.data?.status !== "in_progress" || b.data?.current_module !== 1) {
    bad("retake run starts at module 1 in_progress",
      `status=${b.data?.status} current_module=${b.data?.current_module}`);
  } else {
    ok(`retake minted new run ${b.data.run_id} at module 1`);
  }
}

// ---------- Main ----------
async function main() {
  console.log(`Clickthrough vs ${URL}`);
  console.log(`tag=${TAG} slug=${SLUG}`);

  step("Provision");
  const studentId = await createUser(studentEmail, "student");
  info("student", `${studentEmail} id=${studentId}`);
  // The proctor actor must be an ADMIN: migration 0104 locked the proctor
  // mutation RPCs (release_test_results / allow_test_retake / reset / pause /
  // force-submit / add-time) to admin-only. A plain teacher is now rejected
  // (asserted by the negative check near the end).
  const teacherId = await createUser(teacherEmail, "admin");
  info("admin (proctor)", `${teacherEmail} id=${teacherId}`);

  // Create a course owned by the admin, enroll the student, and add a
  // module_items link to /test/dsat-nov-2023. (Admin bypasses course scope, but
  // we keep the realistic course setup the student runner itself relies on.)
  const { data: courseRow, error: courseErr } = await service
    .from("courses")
    .insert({ name: `Clickthrough-${TAG}`, teacher_id: teacherId })
    .select("id")
    .single();
  if (courseErr) throw new Error(`create course: ${courseErr.message}`);
  const courseId = courseRow.id;
  info("course", courseId);

  const { error: memErr } = await service
    .from("course_memberships")
    .insert({ course_id: courseId, student_id: studentId });
  if (memErr) throw new Error(`enroll student: ${memErr.message}`);

  const { data: modRow, error: modErr } = await service
    .from("course_modules")
    .insert({ course_id: courseId, name: "Practice Tests", position: 1 })
    .select("id")
    .single();
  if (modErr) throw new Error(`create module: ${modErr.message}`);

  const { error: miErr } = await service
    .from("module_items")
    .insert({
      module_id: modRow.id,
      item_type: "link",
      title: "DSAT Nov 2023",
      url: `/test/${SLUG}`,
      position: 1,
    });
  if (miErr) throw new Error(`create module_item: ${miErr.message}`);
  info("module_item", `/test/${SLUG} linked to course ${courseId}`);

  const studentClient = await signIn(studentEmail);
  const staffClient = await signIn(teacherEmail);

  step("start_test");
  const { data: start, error: startErr } = await studentClient.rpc("start_test",
    { p_slug: SLUG });
  if (startErr) {
    bad("start_test on fresh student", startErr.message);
    return finish();
  }
  if (!assertStartShape(start)) return finish();
  const runId = start.run_id;
  info("run", runId);
  info("modules", String(start.modules.length));

  // Walk every module in order
  let lastSubmit = null;
  for (const m of start.modules.sort((a, b) => a.position - b.position)) {
    const result = await walkModule(studentClient, runId, m);
    if (!result) {
      bad(`walkModule(${m.position}) aborted`, "skipping remaining modules");
      break;
    }
    lastSubmit = result.submit;
    if (m.position < start.modules.length) {
      if (lastSubmit?.finished !== false) {
        bad(`module ${m.position} submit reports finished=false`,
          JSON.stringify(lastSubmit));
      } else if (lastSubmit?.next_module !== m.position + 1) {
        bad(`module ${m.position} submit next_module=${m.position + 1}`,
          `got ${lastSubmit?.next_module}`);
      } else {
        ok(`module ${m.position} → advances to module ${lastSubmit.next_module}`);
      }
    } else {
      if (lastSubmit?.finished !== true) {
        bad(`final module submit reports finished=true`, JSON.stringify(lastSubmit));
      } else if (typeof lastSubmit?.score !== "number" ||
                 typeof lastSubmit?.total !== "number") {
        bad("final submit returns score+total", JSON.stringify(lastSubmit));
      } else {
        ok(`final submit: ${lastSubmit.score}/${lastSubmit.total}`);
      }
    }
  }

  if (!lastSubmit?.finished) {
    bad("did not reach final-module submit", "downstream checks skipped");
    return finish();
  }

  await verifyResultsGating(studentClient, staffClient, runId,
    lastSubmit.score, lastSubmit.total);
  await verifyOneAttemptLock(studentClient, staffClient, runId);

  // 0104 lock: a NON-admin teacher must be rejected from a proctor mutation.
  step("Proctor lock (0104) — non-admin teacher rejected");
  const nonAdminEmail = `t-nonadmin-${TAG}@gmail.com`;
  const nonAdminId = await createUser(nonAdminEmail, "teacher");
  const nonAdminClient = await signIn(nonAdminEmail);
  const denied = await nonAdminClient.rpc("release_test_results", {
    p_run_id: runId,
    p_released: true,
  });
  if (denied.error && /not_authorized/.test(denied.error.message)) {
    ok("non-admin teacher → not_authorized on release_test_results");
  } else if (denied.error) {
    bad("non-admin teacher proctor call", `unexpected error: ${denied.error.message}`);
  } else {
    bad("non-admin teacher proctor call", "expected not_authorized but it SUCCEEDED");
  }
  await service.auth.admin.deleteUser(nonAdminId).catch(() => {});

  // Cleanup — delete the disposable accounts (audit will still have the run).
  step("Cleanup");
  await service.auth.admin.deleteUser(studentId).catch(() => {});
  await service.auth.admin.deleteUser(teacherId).catch(() => {});
  info("deleted", `${studentEmail}, ${teacherEmail}`);

  finish();
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

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(2);
});
