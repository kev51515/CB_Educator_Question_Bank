#!/usr/bin/env node
/**
 * smoke-admin.mjs
 *
 * Integration check for the admin management/monitoring RPCs:
 *   • admin_user_overview(user)  — per-user activity snapshot (0125, is_admin)
 *   • system_skill_mastery()     — cohort-wide skill rollup (0128, is_admin)
 *   • admin_dashboard_stats()    — overview KPIs (0006/0009)
 *
 * Disposable + self-cleaning: an admin, a non-admin teacher, and a student with
 * one course enrolment + one submitted full-test run (so the overview shows
 * non-zero activity and the cohort rollup has data). Asserts shape + the
 * is_admin authorization gates, then deletes everything it created.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY;
const miss = ["SUPABASE_URL","SUPABASE_ANON_KEY","SUPABASE_SERVICE_KEY"].filter((k)=>!process.env[k]);
if (miss.length) { console.error("smoke-admin: missing env:", miss.join(", ")); process.exit(2); }
const SLUG = "dsat-nov-2023";
const TAG = randomBytes(3).toString("hex");
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const userClient = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; console.log(`  FAIL  ${l}`); if (d) console.log(`        ${d}`); };
const step = (l) => console.log(`\n=== ${l} ===`);

async function mkUser(role) {
  const email = `adm-${role}-${TAG}-${randomBytes(2).toString("hex")}@gmail.com`, password = "Adm!" + randomBytes(4).toString("hex");
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${role}: ${error.message}`);
  await svc.from("profiles").update({ role, display_name: `Adm ${role}` }).eq("id", data.user.id);
  return { id: data.user.id, email, password };
}
async function signedIn(u) {
  const c = userClient();
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(`signIn ${u.email}: ${error.message}`);
  return c;
}

async function main() {
  step("provision");
  const admin = await mkUser("admin");
  const teacher = await mkUser("teacher");
  const student = await mkUser("student");
  const { data: course } = await svc.from("courses").insert({ name: `Adm ${TAG}`, teacher_id: teacher.id }).select("id").single();
  await svc.from("course_memberships").insert({ course_id: course.id, student_id: student.id });
  const { data: t } = await svc.from("tests").select("id").eq("slug", SLUG).single();
  const { data: mods } = await svc.from("test_modules").select("id,section,position").eq("test_id", t.id);
  const modById = new Map(mods.map((m) => [m.id, m]));
  const { data: qs } = await svc.from("test_questions").select("id,number,module_id,correct_answer,accepted,type").in("module_id", mods.map((m) => m.id));
  const when = new Date().toISOString();
  const ss = {}, answers = [];
  let score = 0;
  for (const q of qs) {
    const m = modById.get(q.module_id);
    const correct = q.number % 2 === 0;
    const key = q.correct_answer ?? q.accepted?.[0] ?? "A";
    answers.push({ question_id: q.id, module_position: m.position, chosen: correct ? key : "Z", is_correct: correct, answered_at: when });
    (ss[m.section] ??= { total: 0, correct: 0 }).total++; if (correct) { ss[m.section].correct++; score++; }
  }
  const { data: run } = await svc.from("test_runs").insert({ user_id: student.id, test_id: t.id, status: "submitted", current_module: 4, started_at: when, submitted_at: when, score, total: qs.length, section_scores: ss, duration_seconds: 3000 }).select("id").single();
  for (const a of answers) a.run_id = run.id;
  for (let i = 0; i < answers.length; i += 100) await svc.from("test_run_answers").insert(answers.slice(i, i + 100));

  const cleanup = async () => {
    await svc.from("test_run_answers").delete().eq("run_id", run.id);
    await svc.from("test_runs").delete().eq("id", run.id);
    await svc.from("course_memberships").delete().eq("course_id", course.id);
    await svc.from("courses").delete().eq("id", course.id);
    for (const u of [admin, teacher, student]) await svc.auth.admin.deleteUser(u.id);
  };

  try {
    const aClient = await signedIn(admin);
    const tClient = await signedIn(teacher);

    step("admin_user_overview (0125)");
    const { data: ov, error: ovErr } = await aClient.rpc("admin_user_overview", { p_user_id: student.id });
    if (ovErr) bad("admin reads user overview", ovErr.message);
    else {
      ov.role === "student" ? ok("role correct") : bad("role", ov.role);
      ov.courses_enrolled >= 1 ? ok("courses_enrolled counted", `${ov.courses_enrolled}`) : bad("courses_enrolled", `${ov.courses_enrolled}`);
      ov.test_runs_submitted >= 1 ? ok("test_runs_submitted counted", `${ov.test_runs_submitted}`) : bad("test_runs_submitted", `${ov.test_runs_submitted}`);
      ov.last_active ? ok("last_active present") : bad("last_active missing");
    }
    const { error: ovAuth } = await tClient.rpc("admin_user_overview", { p_user_id: student.id });
    /not_authorized/.test(ovAuth?.message ?? "") ? ok("non-admin rejected from overview") : bad("non-admin should be rejected", ovAuth?.message ?? "no error");
    const { error: ovNF } = await aClient.rpc("admin_user_overview", { p_user_id: "00000000-0000-0000-0000-000000000000" });
    /not_found/.test(ovNF?.message ?? "") ? ok("unknown user → not_found") : bad("expected not_found", ovNF?.message ?? "no error");

    step("system_skill_mastery (0128)");
    const { data: sm, error: smErr } = await aClient.rpc("system_skill_mastery");
    if (smErr) bad("admin reads system mastery", smErr.message);
    else {
      (sm.students ?? 0) >= 1 ? ok("students counted", `${sm.students}`) : bad("students", `${sm.students}`);
      Array.isArray(sm.domains) && sm.domains.length > 0 ? ok("domains aggregated", `${sm.domains.length}`) : bad("domains empty", JSON.stringify(sm.domains));
    }
    const { error: smAuth } = await tClient.rpc("system_skill_mastery");
    /not_authorized/.test(smAuth?.message ?? "") ? ok("non-admin rejected from system mastery") : bad("non-admin should be rejected", smAuth?.message ?? "no error");

    step("admin_dashboard_stats");
    const { data: ds, error: dsErr } = await aClient.rpc("admin_dashboard_stats");
    if (dsErr) bad("admin reads dashboard stats", dsErr.message);
    else (ds && ds.users_by_role) ? ok("dashboard stats shape ok") : bad("dashboard stats shape", JSON.stringify(ds)?.slice(0, 80));
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
main().catch((e) => { console.error("smoke-admin crashed:", e?.message ?? e); process.exit(1); });
