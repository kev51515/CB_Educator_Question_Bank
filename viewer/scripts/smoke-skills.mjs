#!/usr/bin/env node
/**
 * smoke-skills.mjs
 *
 * Integration check for the SAT skill-domain RPCs:
 *   • get_test_result(run_id)        — per-question `domain` + release gate (0121)
 *   • student_test_report(student)   — latest-attempt-per-test domain dedup (0122)
 *   • course_skill_mastery(course)   — class-wide cross-test rollup + scope (0123)
 *
 * Disposable + self-cleaning. Provisions a teacher, an unrelated teacher, two
 * students, a course (both enrolled), and deterministic submitted runs:
 *   - student A: TWO submitted runs of the same test (exercises dedup); latest released
 *   - student B: ONE submitted run, NOT released (exercises the release gate)
 * Then asserts aggregation + authorization, and deletes everything it created.
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
  console.error("smoke-skills: missing env:", missing.join(", "));
  process.exit(2);
}

const SLUG = "dsat-nov-2023";
const TAG = randomBytes(3).toString("hex");
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const userClient = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; console.log(`  FAIL  ${l}`); if (d) console.log(`        ${d}`); };
const step = (l) => console.log(`\n=== ${l} ===`);

async function mkUser(role, name) {
  const email = `skl-${role}-${TAG}-${randomBytes(2).toString("hex")}@gmail.com`;
  const password = "Skl!" + randomBytes(4).toString("hex");
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${role}: ${error.message}`);
  await svc.from("profiles").update({ role, display_name: name }).eq("id", data.user.id);
  return { id: data.user.id, email, password };
}
async function signedIn(u) {
  const c = userClient();
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(`signIn ${u.email}: ${error.message}`);
  return c;
}
async function addRun(userId, t, modById, qs, when, released) {
  const ss = {}, answers = [];
  let score = 0;
  for (const q of qs) {
    const m = modById.get(q.module_id);
    const correct = q.number % 3 !== 0; // deterministic ~67%
    const key = q.correct_answer ?? q.accepted?.[0] ?? "A";
    answers.push({ question_id: q.id, module_position: m.position, chosen: correct ? key : "Z", is_correct: correct, answered_at: when });
    (ss[m.section] ??= { total: 0, correct: 0 }).total++;
    if (correct) { ss[m.section].correct++; score++; }
  }
  const { data: run, error } = await svc.from("test_runs").insert({
    user_id: userId, test_id: t.id, status: "submitted", current_module: 4,
    started_at: when, submitted_at: when, score, total: qs.length, section_scores: ss,
    duration_seconds: 3000, results_released_at: released ? when : null,
  }).select("id").single();
  if (error) throw new Error(`insert run: ${error.message}`);
  for (const a of answers) a.run_id = run.id;
  for (let i = 0; i < answers.length; i += 100) {
    const { error: e } = await svc.from("test_run_answers").insert(answers.slice(i, i + 100));
    if (e) throw new Error(`insert answers: ${e.message}`);
  }
  return run.id;
}
const sumTotals = (domains) => (domains ?? []).reduce((s, d) => s + d.total, 0);

async function main() {
  step("provision");
  const teacher = await mkUser("teacher", "Skl Teacher");
  const other = await mkUser("teacher", "Skl Other");
  const sA = await mkUser("student", "Skl A");
  const sB = await mkUser("student", "Skl B");
  const { data: course } = await svc.from("courses").insert({ name: `Skl ${TAG}`, teacher_id: teacher.id }).select("id").single();
  await svc.from("course_memberships").insert([
    { course_id: course.id, student_id: sA.id },
    { course_id: course.id, student_id: sB.id },
  ]);
  const { data: t } = await svc.from("tests").select("id").eq("slug", SLUG).single();
  const { data: mods } = await svc.from("test_modules").select("id,section,position").eq("test_id", t.id);
  const modById = new Map(mods.map((m) => [m.id, m]));
  const { data: qs } = await svc.from("test_questions").select("id,number,module_id,correct_answer,accepted,type").in("module_id", mods.map((m) => m.id));
  const nQ = qs.length;
  const runs = [];
  runs.push(await addRun(sA.id, t, modById, qs, new Date(Date.now() - 9 * 864e5).toISOString(), false)); // A older
  const aLatest = await addRun(sA.id, t, modById, qs, new Date(Date.now() - 1 * 864e5).toISOString(), true); // A latest, released
  runs.push(aLatest);
  const bRun = await addRun(sB.id, t, modById, qs, new Date().toISOString(), false); // B, not released
  runs.push(bRun);

  const cleanup = async () => {
    for (const r of runs) await svc.from("test_run_answers").delete().eq("run_id", r);
    for (const r of runs) await svc.from("test_runs").delete().eq("id", r);
    await svc.from("course_memberships").delete().eq("course_id", course.id);
    await svc.from("courses").delete().eq("id", course.id);
    for (const u of [teacher, other, sA, sB]) await svc.auth.admin.deleteUser(u.id);
  };

  try {
    // --- get_test_result: domain + release gate ---
    step("get_test_result (0121)");
    const aClient = await signedIn(sA);
    const { data: aRes, error: aErr } = await aClient.rpc("get_test_result", { p_run_id: aLatest });
    if (aErr) bad("student reads own released result", aErr.message);
    else {
      const withDomain = (aRes.questions ?? []).filter((q) => q.domain).length;
      withDomain === nQ
        ? ok("released result carries domain on every question", `${withDomain}/${nQ}`)
        : bad("released result domain coverage", `${withDomain}/${nQ}`);
    }
    const bClient = await signedIn(sB);
    const { error: bErr } = await bClient.rpc("get_test_result", { p_run_id: bRun });
    /results_locked/.test(bErr?.message ?? "")
      ? ok("unreleased result is gated (results_locked)")
      : bad("unreleased result should be locked", bErr?.message ?? "no error");

    // --- student_test_report: latest-attempt dedup (0122) ---
    step("student_test_report (0122)");
    const tClient = await signedIn(teacher);
    const { data: rep, error: repErr } = await tClient.rpc("student_test_report", { p_student_id: sA.id });
    if (repErr) bad("teacher reads student_test_report", repErr.message);
    else {
      (rep.runs ?? []).length === 2
        ? ok("runs array keeps both attempts (trajectory)", `${rep.runs.length}`)
        : bad("runs should be 2", `${(rep.runs ?? []).length}`);
      sumTotals(rep.domains) === nQ
        ? ok("domains deduped to latest attempt", `${sumTotals(rep.domains)} == ${nQ}`)
        : bad("domains should equal one attempt", `${sumTotals(rep.domains)} != ${nQ}`);
    }
    const { error: repAuth } = await aClient.rpc("student_test_report", { p_student_id: sA.id });
    /not_authorized/.test(repAuth?.message ?? "")
      ? ok("student rejected from student_test_report")
      : bad("student should be rejected", repAuth?.message ?? "no error");

    // --- course_skill_mastery: rollup + scope (0123) ---
    step("course_skill_mastery (0123)");
    const { data: cm, error: cmErr } = await tClient.rpc("course_skill_mastery", { p_course_id: course.id });
    if (cmErr) bad("teacher reads course_skill_mastery", cmErr.message);
    else {
      cm.students === 2 ? ok("students counted", `${cm.students}`) : bad("students should be 2", `${cm.students}`);
      cm.tests === 1 ? ok("tests counted", `${cm.tests}`) : bad("tests should be 1", `${cm.tests}`);
      cm.attempts === 2 ? ok("attempts = latest per (student,test)", `${cm.attempts}`) : bad("attempts should be 2", `${cm.attempts}`);
      sumTotals(cm.domains) === nQ * 2
        ? ok("class rollup spans both students' latest runs", `${sumTotals(cm.domains)} == ${nQ * 2}`)
        : bad("class rollup total", `${sumTotals(cm.domains)} != ${nQ * 2}`);
    }
    const { error: cmStudent } = await aClient.rpc("course_skill_mastery", { p_course_id: course.id });
    /not_authorized/.test(cmStudent?.message ?? "")
      ? ok("student rejected from course_skill_mastery")
      : bad("student should be rejected", cmStudent?.message ?? "no error");
    const oClient = await signedIn(other);
    const { error: cmOther } = await oClient.rpc("course_skill_mastery", { p_course_id: course.id });
    /not_authorized/.test(cmOther?.message ?? "")
      ? ok("non-owner teacher rejected from course_skill_mastery")
      : bad("non-owner teacher should be rejected", cmOther?.message ?? "no error");
  } finally {
    step("cleanup");
    await cleanup().catch((e) => console.log("  ..    cleanup error", e.message));
    console.log("  ..    disposable users + course removed");
  }

  console.log(`\n----------------------------------`);
  console.log(`TOTAL: ${pass + fail}  PASS: ${pass}  FAIL: ${fail}`);
  console.log(`==================================`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("smoke-skills crashed:", e?.message ?? e); process.exit(1); });
