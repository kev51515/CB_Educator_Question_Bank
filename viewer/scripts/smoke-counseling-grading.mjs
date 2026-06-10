#!/usr/bin/env node
/**
 * smoke-counseling-grading.mjs
 *
 * Verifies the counseling STAR-GRADING model from migration 0140:
 *   - counseling_grading_settings RLS (counselor manages, student reads,
 *     unrelated teacher blocked)
 *   - submit_counseling_task: on-time vs late punctuality lock, ownership,
 *     non-gradable guard, resubmission gating (allow flag + cap), grade reset
 *   - grade_counseling_task: counselor-only, quality validation, final stars,
 *     not-submitted guard, student-grade notification
 *
 * Disposable + self-cleaning. Mirrors smoke-counseling.mjs.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY;
const miss = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY"].filter((k) => !process.env[k]);
if (miss.length) { console.error("smoke-counseling-grading: missing env:", miss.join(", ")); process.exit(2); }
const TAG = randomBytes(3).toString("hex");
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const userClient = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; console.log(`  FAIL  ${l}`); if (d) console.log(`        ${d}`); };
const step = (l) => console.log(`\n=== ${l} ===`);
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);

async function mkUser(role) {
  const email = `cg-${role}-${TAG}-${randomBytes(2).toString("hex")}@gmail.com`, password = "Cg!" + randomBytes(4).toString("hex");
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${role}: ${error.message}`);
  await svc.from("profiles").update({ role, display_name: `Cg ${role}` }).eq("id", data.user.id);
  return { id: data.user.id, email, password };
}
async function signedIn(u) {
  const c = userClient();
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(`signIn ${u.email}: ${error.message}`);
  return c;
}
// Create a task as the counselor; return its id.
async function mkTask(svcOrClient, base, title, due_date, gradable = true) {
  const { data, error } = await svcOrClient.from("counseling_tasks")
    .insert({ ...base, title, due_date, gradable }).select("id").single();
  if (error) throw new Error(`mkTask ${title}: ${error.message}`);
  return data.id;
}

async function main() {
  step("provision");
  const counselor = await mkUser("teacher");
  const other = await mkUser("teacher");
  const student = await mkUser("student");
  const { data: course } = await svc.from("courses")
    .insert({ name: `Grade ${TAG}`, teacher_id: counselor.id, course_type: "counseling" })
    .select("id").single();
  await svc.from("course_memberships").insert({ course_id: course.id, student_id: student.id });
  const base = { course_id: course.id, student_id: student.id };

  const cleanup = async () => {
    await svc.from("counseling_tasks").delete().eq("course_id", course.id);
    await svc.from("counseling_grading_settings").delete().eq("course_id", course.id);
    await svc.from("notifications").delete().eq("recipient_id", student.id);
    await svc.from("course_memberships").delete().eq("course_id", course.id);
    await svc.from("courses").delete().eq("id", course.id);
    for (const u of [counselor, other, student]) await svc.auth.admin.deleteUser(u.id);
  };

  try {
    const cClient = await signedIn(counselor);
    const oClient = await signedIn(other);
    const sClient = await signedIn(student);

    step("grading settings RLS");
    {
      const { error } = await cClient.from("counseling_grading_settings")
        .insert({ course_id: course.id, on_time_stars: 3, late_stars: 1, quality_max_stars: 2, allow_resubmission: true, max_resubmissions: 2 });
      error ? bad("counselor upserts settings", error.message) : ok("counselor upserts settings");
    }
    {
      const { data } = await sClient.from("counseling_grading_settings").select("on_time_stars").eq("course_id", course.id);
      (data?.length ?? 0) === 1 ? ok("student reads settings", `on_time=${data[0].on_time_stars}`) : bad("student should read settings", `${data?.length}`);
    }
    {
      const { data } = await oClient.from("counseling_grading_settings").select("course_id").eq("course_id", course.id);
      (data?.length ?? 0) === 0 ? ok("unrelated teacher can't read settings") : bad("other should see nothing", `${data?.length}`);
    }

    step("submit_counseling_task — on-time punctuality lock");
    const onTimeTask = await mkTask(svc, base, "On-time essay", isoDate(3));
    {
      const { data, error } = await sClient.rpc("submit_counseling_task", { p_task_id: onTimeTask });
      if (error) bad("student submits on-time task", error.message);
      else {
        data?.submission_on_time === true && data?.punctuality_stars === 3
          ? ok("on-time submission earns 3 punctuality stars")
          : bad("expected on_time=true punctuality=3", JSON.stringify({ on: data?.submission_on_time, p: data?.punctuality_stars }));
      }
    }

    step("submit_counseling_task — late punctuality");
    const lateTask = await mkTask(svc, base, "Late essay", isoDate(-3));
    {
      const { data, error } = await sClient.rpc("submit_counseling_task", { p_task_id: lateTask });
      if (error) bad("student submits late task", error.message);
      else {
        data?.submission_on_time === false && data?.punctuality_stars === 1
          ? ok("late submission earns 1 punctuality star")
          : bad("expected on_time=false punctuality=1", JSON.stringify({ on: data?.submission_on_time, p: data?.punctuality_stars }));
      }
    }

    step("submit guards");
    {
      const { error } = await oClient.rpc("submit_counseling_task", { p_task_id: onTimeTask });
      /not_authorized/.test(error?.message ?? "") ? ok("unrelated teacher can't submit") : bad("other submit should be rejected", error?.message ?? "no error");
    }
    {
      const ngTask = await mkTask(svc, base, "Reminder only", null, false);
      const { error } = await sClient.rpc("submit_counseling_task", { p_task_id: ngTask });
      /task_not_gradable/.test(error?.message ?? "") ? ok("non-gradable task can't be submitted") : bad("expected task_not_gradable", error?.message ?? "no error");
    }

    step("grade_counseling_task");
    {
      // Student cannot grade.
      const { error } = await sClient.rpc("grade_counseling_task", { p_task_id: onTimeTask, p_quality_stars: 2, p_feedback: "nice" });
      /not_authorized/.test(error?.message ?? "") ? ok("student can't grade") : bad("student grade should be rejected", error?.message ?? "no error");
    }
    {
      // Invalid quality (> quality_max_stars=2).
      const { error } = await cClient.rpc("grade_counseling_task", { p_task_id: onTimeTask, p_quality_stars: 5, p_feedback: null });
      /invalid_quality/.test(error?.message ?? "") ? ok("quality above max rejected") : bad("expected invalid_quality", error?.message ?? "no error");
    }
    {
      // Grade before submit → not_submitted.
      const ungraded = await mkTask(svc, base, "Never submitted", isoDate(5));
      const { error } = await cClient.rpc("grade_counseling_task", { p_task_id: ungraded, p_quality_stars: 1, p_feedback: null });
      /not_submitted/.test(error?.message ?? "") ? ok("can't grade an unsubmitted task") : bad("expected not_submitted", error?.message ?? "no error");
    }
    {
      // Valid grade: on-time (3) + quality 2 = 5 stars.
      const { data, error } = await cClient.rpc("grade_counseling_task", { p_task_id: onTimeTask, p_quality_stars: 2, p_feedback: "Excellent draft" });
      if (error) bad("counselor grades on-time task", error.message);
      else data?.stars === 5 && data?.quality_stars === 2 && data?.graded_at
        ? ok("on-time + quality 2 = 5 stars")
        : bad("expected stars=5 quality=2 graded", JSON.stringify({ s: data?.stars, q: data?.quality_stars, g: data?.graded_at }));
    }
    {
      const { data } = await svc.from("notifications").select("title").eq("recipient_id", student.id).eq("kind", "counseling_grade");
      (data ?? []).some((r) => (r.title ?? "").includes("On-time essay"))
        ? ok("grade fired a counseling_grade notification")
        : bad("expected a counseling_grade notification", JSON.stringify(data));
    }

    step("resubmission — keeps punctuality, clears grade, increments count");
    {
      const { data, error } = await sClient.rpc("submit_counseling_task", { p_task_id: onTimeTask });
      if (error) bad("student resubmits graded task", error.message);
      else data?.punctuality_stars === 3 && data?.quality_stars === null && data?.stars === null && data?.graded_at === null && data?.resubmission_count === 1
        ? ok("resubmission keeps punctuality, clears grade, count=1")
        : bad("unexpected resubmission state", JSON.stringify({ p: data?.punctuality_stars, q: data?.quality_stars, s: data?.stars, g: data?.graded_at, n: data?.resubmission_count }));
    }
    {
      // 2nd resubmission OK (cap=2), 3rd should hit the limit.
      await sClient.rpc("submit_counseling_task", { p_task_id: onTimeTask }); // count -> 2
      const { error } = await sClient.rpc("submit_counseling_task", { p_task_id: onTimeTask }); // -> blocked
      /resubmission_limit_reached/.test(error?.message ?? "") ? ok("resubmission cap enforced") : bad("expected resubmission_limit_reached", error?.message ?? "no error");
    }

    step("resubmission disabled");
    {
      await cClient.from("counseling_grading_settings").update({ allow_resubmission: false }).eq("course_id", course.id);
      const { error } = await sClient.rpc("submit_counseling_task", { p_task_id: lateTask }); // lateTask already submitted once
      /resubmission_not_allowed/.test(error?.message ?? "") ? ok("resubmission blocked when disabled") : bad("expected resubmission_not_allowed", error?.message ?? "no error");
    }

    step("defaults without a settings row");
    {
      // Fresh course with NO settings row — RPC should fall back to defaults (on-time=3).
      const { data: c2 } = await svc.from("courses").insert({ name: `GradeDef ${TAG}`, teacher_id: counselor.id, course_type: "counseling" }).select("id").single();
      await svc.from("course_memberships").insert({ course_id: c2.id, student_id: student.id });
      const t2 = await mkTask(svc, { course_id: c2.id, student_id: student.id }, "Default-scheme task", isoDate(2));
      const { data, error } = await sClient.rpc("submit_counseling_task", { p_task_id: t2 });
      error ? bad("submit with default settings", error.message)
        : (data?.punctuality_stars === 3 ? ok("default scheme gives on-time 3 stars") : bad("expected default punctuality=3", `${data?.punctuality_stars}`));
      await svc.from("counseling_tasks").delete().eq("course_id", c2.id);
      await svc.from("course_memberships").delete().eq("course_id", c2.id);
      await svc.from("courses").delete().eq("id", c2.id);
    }
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
main().catch((e) => { console.error("smoke-counseling-grading crashed:", e?.message ?? e); process.exit(1); });
