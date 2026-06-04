#!/usr/bin/env node
/**
 * clickthrough-register-and-test.mjs
 *
 * MISSION-CRITICAL pre-launch verification. Unlike clickthrough-practice-test.mjs
 * (which provisions via the admin API and answers "A" / eliminates "B" on every
 * question), this:
 *
 *   1. REGISTERS a brand-new student through the real self-service flow —
 *      anonymous session + `quick_start_with_code(<SAT class code>, name, email)`.
 *      Asserts they land enrolled in SAT and can see the published module + test.
 *   2. TAKES the test module-by-module choosing a DISTINCT answer and a DISTINCT
 *      set of eliminations PER QUESTION (so a bug that mixes up which choice /
 *      elimination belongs to which question is caught).
 *   3. Verifies every answer + every elimination round-trips EXACTLY:
 *        a) on resume via get_test_module.saved_answers / saved_eliminations
 *        b) in the released get_test_result payload (your_answer + eliminated)
 *
 * A disposable teacher (owning a throwaway course that also links the test) is
 * used only to release results — the real SAT teacher is never touched. All
 * disposable accounts (incl. the SAT-registered student) are cleaned up.
 *
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
for (const [k, v] of Object.entries({ SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_KEY: SERVICE })) {
  if (!v) { console.error("missing env:", k); process.exit(2); }
}

const SLUG = "dsat-nov-2023";
const CLASS_CODE = "Y8M3KP"; // SAT short_code
const TS = Date.now();
const PW = "Clk!" + randomBytes(4).toString("hex");
const studentName = "Launch Test Student";
const studentEmail = `launch-stu-${TS}@gmail.com`;
const teacherEmail = `launch-tch-${TS}@gmail.com`;
const LETTERS = ["A", "B", "C", "D"];

const service = createClient(URL, SERVICE, { auth: { persistSession: false } });
const newClient = () => createClient(URL, ANON, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const findings = [];
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; findings.push({ l, d }); console.log(`  FAIL  ${l}${d ? "\n        " + d : ""}`); };
const step = (l) => console.log(`\n=== ${l} ===`);
const info = (l, x = "") => console.log(`  ..    ${l}${x ? "  " + x : ""}`);

const sameSet = (a, b) => {
  const A = [...(a || [])].map(String).sort();
  const B = [...(b || [])].map(String).sort();
  return JSON.stringify(A) === JSON.stringify(B);
};

/** Distinct, deterministic choice + eliminations per global question index. */
function planFor(q, i) {
  if (q.type === "grid") {
    return { answer: String((i % 9) + 1), eliminated: [] };
  }
  const answer = LETTERS[i % 4];
  const others = LETTERS.filter((l) => l !== answer);
  const elimCount = i % 3; // 0, 1 or 2 — varies per question, never the chosen answer
  return { answer, eliminated: others.slice(0, elimCount) };
}

const cleanup = { studentId: null, teacherId: null, courseId: null };

async function main() {
  console.log(`Register+take vs ${URL}\nclass=${CLASS_CODE} slug=${SLUG}`);

  // ---------------------------------------------------------------- PHASE 1
  step("PHASE 1 — Register a new student via the SAT class code");
  const student = newClient();
  const anon = await student.auth.signInAnonymously();
  if (anon.error) { bad("signInAnonymously", anon.error.message); return; }
  cleanup.studentId = anon.data.user.id;
  info("anon uid", cleanup.studentId);

  const reg = await student.rpc("quick_start_with_code", {
    p_code: CLASS_CODE, p_name: studentName, p_email: studentEmail,
  });
  if (reg.error) { bad("quick_start_with_code (registration)", reg.error.message); return; }
  const regRow = Array.isArray(reg.data) ? reg.data[0] : reg.data;
  if (regRow?.class_name === "SAT") ok("registered into SAT", `teacher=${regRow.teacher_display_name}`);
  else bad("registration enrolled into SAT", `got class_name=${regRow?.class_name}`);

  // profile stamped + membership exists
  const prof = await service.from("profiles").select("display_name,email").eq("id", cleanup.studentId).single();
  if (prof.data?.display_name === studentName && (prof.data?.email || "").toLowerCase() === studentEmail.toLowerCase())
    ok("profile stamped with name + email");
  else bad("profile stamped", JSON.stringify(prof.data));

  const sat = await service.from("courses").select("id").eq("short_code", CLASS_CODE).single();
  const mem = await service.from("course_memberships").select("id").eq("course_id", sat.data.id).eq("student_id", cleanup.studentId).maybeSingle();
  if (mem.data) ok("enrolled in SAT (course_memberships row present)");
  else bad("enrollment row present", "no membership found");

  // ---------------------------------------------------------------- PHASE 2
  step("PHASE 2 — Student can see the published module + test");
  const view = await student.from("course_modules")
    .select("name, published, module_items(item_type, title, url, published)")
    .eq("course_id", sat.data.id).eq("published", true);
  if (view.error) { bad("student reads SAT modules", view.error.message); }
  else {
    const items = view.data.flatMap((m) => (m.module_items || []).filter((i) => i.published));
    const testItem = items.find((i) => i.item_type === "link" && (i.url || "").includes(`/test/${SLUG}`));
    if (testItem) ok("test is visible in a published module", `"${testItem.title}"`);
    else bad("test visible to student", `published items: ${JSON.stringify(items.map((i) => i.title))}`);
  }

  // ---------------------------------------------------------------- PHASE 3
  step("PHASE 3 — Take the test (distinct answer + eliminations per question)");
  const start = await student.rpc("start_test", { p_slug: SLUG });
  if (start.error) { bad("start_test", start.error.message); return; }
  const runId = start.data.run_id;
  info("run", runId);
  if (start.data.current_module === 1 && start.data.answered === 0) ok("fresh run at module 1, answered=0");
  else bad("fresh run shape", `current_module=${start.data.current_module} answered=${start.data.answered}`);

  // expected[qid] = { answer, eliminated, ref, type }
  const expected = new Map();
  const expectedByRef = new Map();
  let gIdx = 0;
  const modules = [...start.data.modules].sort((a, b) => a.position - b.position);

  for (const mod of modules) {
    step(`Module ${mod.position} (${mod.section ?? mod.label ?? "?"})`);
    const g1 = await student.rpc("get_test_module", { p_run_id: runId, p_position: mod.position });
    if (g1.error || !Array.isArray(g1.data?.questions)) { bad(`get_test_module(${mod.position})`, g1.error?.message); return; }
    const questions = g1.data.questions;
    ok(`module ${mod.position}: ${questions.length} questions, ${g1.data.seconds_remaining}s`);

    const answers = {}, elims = {};
    for (const q of questions) {
      const plan = planFor(q, gIdx++);
      answers[q.id] = plan.answer;
      if (plan.eliminated.length) elims[q.id] = plan.eliminated;
      expected.set(q.id, { ...plan, ref: q.ref, type: q.type });
      if (q.ref != null) expectedByRef.set(String(q.ref), { ...plan, id: q.id, type: q.type });
    }

    // save draft with ALL answers + eliminations
    const sv = await student.rpc("save_test_progress", { p_run_id: runId, p_position: mod.position, p_answers: answers, p_eliminated: elims });
    if (sv.error) bad(`save_test_progress(${mod.position})`, sv.error.message);
    else ok(`saved ${sv.data?.saved ?? "?"} drafts`);

    // resume → verify EXACT per-question round-trip
    const g2 = await student.rpc("get_test_module", { p_run_id: runId, p_position: mod.position });
    if (g2.error) { bad(`resume get_test_module(${mod.position})`, g2.error.message); }
    else {
      const sa = g2.data.saved_answers || {};
      const se = g2.data.saved_eliminations || {};
      let aBad = 0, eBad = 0; const aBadEx = [], eBadEx = [];
      for (const q of questions) {
        if (sa[q.id] !== answers[q.id]) { aBad++; if (aBadEx.length < 3) aBadEx.push(`${q.ref}: want ${answers[q.id]} got ${sa[q.id]}`); }
        if (!sameSet(se[q.id], elims[q.id] || [])) { eBad++; if (eBadEx.length < 3) eBadEx.push(`${q.ref}: want ${JSON.stringify(elims[q.id] || [])} got ${JSON.stringify(se[q.id] || [])}`); }
      }
      if (aBad === 0) ok(`resume: all ${questions.length} answers round-trip exactly`);
      else bad(`resume answers round-trip (${aBad} wrong)`, aBadEx.join(" | "));
      if (eBad === 0) ok(`resume: all eliminations round-trip exactly`);
      else bad(`resume eliminations round-trip (${eBad} wrong)`, eBadEx.join(" | "));
    }

    // submit with the SAME answers + eliminations
    const su = await student.rpc("submit_test_module", { p_run_id: runId, p_position: mod.position, p_answers: answers, p_eliminated: elims });
    if (su.error) { bad(`submit_test_module(${mod.position})`, su.error.message); return; }
    const last = mod.position === modules.length;
    if (!last && su.data?.next_module === mod.position + 1) ok(`submitted, advances to module ${su.data.next_module}`);
    else if (last && su.data?.finished === true) ok(`final submit: score ${su.data.score}/${su.data.total}`);
    else bad(`submit advance/finish (module ${mod.position})`, JSON.stringify(su.data));
  }

  // ---------------------------------------------------------------- PHASE 4
  step("PHASE 4 — Released results reflect every choice + elimination");
  // disposable teacher + course linking the test (to release without touching SAT's owner)
  const tch = await service.auth.admin.createUser({ email: teacherEmail, password: PW, email_confirm: true, user_metadata: { display_name: "Launch Proctor" } });
  cleanup.teacherId = tch.data.user.id;
  await service.from("profiles").update({ role: "teacher" }).eq("id", cleanup.teacherId);
  const crs = await service.from("courses").insert({ name: `Launch-${TS}`, teacher_id: cleanup.teacherId }).select("id").single();
  cleanup.courseId = crs.data.id;
  const mdl = await service.from("course_modules").insert({ course_id: cleanup.courseId, name: "T", position: 1, published: true }).select("id").single();
  await service.from("module_items").insert({ module_id: mdl.data.id, item_type: "link", title: "T", url: `/test/${SLUG}`, position: 1, published: true });

  const staff = newClient();
  await staff.auth.signInWithPassword({ email: teacherEmail, password: PW });

  // student locked before release
  const locked = await student.rpc("get_test_result", { p_run_id: runId });
  if (locked.error?.message?.includes("results_locked")) ok("student blocked before release (results_locked)");
  else bad("student should be results_locked before release", locked.error?.message || "no error");

  const rel = await staff.rpc("release_test_results", { p_run_id: runId, p_released: true });
  if (rel.error) { bad("release_test_results (teacher)", rel.error.message); }
  else ok("teacher released results");

  const res = await student.rpc("get_test_result", { p_run_id: runId });
  if (res.error) { bad("student get_test_result after release", res.error.message); }
  else {
    const qs = res.data?.questions || [];
    info("result questions", String(qs.length));
    if (qs.length !== expected.size) bad("result has all questions", `expected ${expected.size} got ${qs.length}`);
    let ansBad = 0, elimBad = 0; const ansEx = [], elimEx = [];
    for (const rq of qs) {
      const exp = expected.get(rq.id) || expected.get(rq.question_id) || expectedByRef.get(String(rq.ref));
      if (!exp) { ansBad++; if (ansEx.length < 3) ansEx.push(`no expected match for result q ${rq.ref ?? rq.id}`); continue; }
      const yourAns = rq.your_answer ?? rq.answer ?? rq.selected;
      if (String(yourAns) !== String(exp.answer)) { ansBad++; if (ansEx.length < 5) ansEx.push(`${exp.ref ?? rq.ref}: want ${exp.answer} got ${yourAns}`); }
      const want = exp.eliminated || [];
      if (!sameSet(rq.eliminated, want)) { elimBad++; if (elimEx.length < 5) elimEx.push(`${exp.ref ?? rq.ref}: want ${JSON.stringify(want)} got ${JSON.stringify(rq.eliminated)}`); }
    }
    if (ansBad === 0) ok(`every selected choice reflected in result (${qs.length})`);
    else bad(`selected choices reflected (${ansBad} wrong)`, ansEx.join(" | "));
    if (elimBad === 0) ok(`every elimination reflected in result (${qs.length})`);
    else bad(`eliminations reflected (${elimBad} wrong)`, elimEx.join(" | "));
    // sanity: the sample's keys, for the report
    if (qs[0]) info("result-question keys", Object.keys(qs[0]).join(","));
  }
}

main()
  .catch((e) => bad("FATAL", e.message))
  .finally(async () => {
    step("Cleanup");
    try {
      if (cleanup.courseId) await service.from("courses").delete().eq("id", cleanup.courseId);
    } catch { /* best effort */ }
    for (const id of [cleanup.studentId, cleanup.teacherId].filter(Boolean)) {
      try { await service.auth.admin.deleteUser(id); } catch { /* best effort */ }
    }
    info("removed disposable student/teacher/course (SAT roster restored)");
    console.log(`\n${"=".repeat(60)}\nResults: ${pass} pass / ${fail} fail`);
    if (findings.length) { console.log("\nDefects:"); findings.forEach((f, i) => console.log(`  ${i + 1}. ${f.l}${f.d ? "\n     " + f.d : ""}`)); }
    process.exit(fail > 0 ? 1 : 0);
  });
