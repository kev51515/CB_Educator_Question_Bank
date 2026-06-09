#!/usr/bin/env node
/**
 * smoke-counseling.mjs
 *
 * Verifies the counseling data model + RLS from migration 0134:
 *   counseling_profiles, college_applications, counseling_tasks (counselor
 *   full + student reads own) and counseling_meetings (counselor-private,
 *   no student read). Also checks an unrelated teacher can't read any of it.
 *
 * Disposable + self-cleaning.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY;
const miss = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY"].filter((k) => !process.env[k]);
if (miss.length) { console.error("smoke-counseling: missing env:", miss.join(", ")); process.exit(2); }
const TAG = randomBytes(3).toString("hex");
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const userClient = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; console.log(`  FAIL  ${l}`); if (d) console.log(`        ${d}`); };
const step = (l) => console.log(`\n=== ${l} ===`);

async function mkUser(role) {
  const email = `cn-${role}-${TAG}-${randomBytes(2).toString("hex")}@gmail.com`, password = "Cn!" + randomBytes(4).toString("hex");
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${role}: ${error.message}`);
  await svc.from("profiles").update({ role, display_name: `Cn ${role}` }).eq("id", data.user.id);
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
  const counselor = await mkUser("teacher");
  const other = await mkUser("teacher");
  const student = await mkUser("student");
  const { data: course } = await svc.from("courses")
    .insert({ name: `Counsel ${TAG}`, teacher_id: counselor.id, course_type: "counseling" })
    .select("id").single();
  await svc.from("course_memberships").insert({ course_id: course.id, student_id: student.id });

  const cleanup = async () => {
    for (const t of ["counseling_meetings", "counseling_tasks", "college_applications", "counseling_profiles"]) {
      await svc.from(t).delete().eq("course_id", course.id);
    }
    await svc.from("notifications").delete().eq("recipient_id", student.id);
    await svc.from("course_memberships").delete().eq("course_id", course.id);
    await svc.from("courses").delete().eq("id", course.id);
    for (const u of [counselor, other, student]) await svc.auth.admin.deleteUser(u.id);
  };

  try {
    const cClient = await signedIn(counselor);
    const oClient = await signedIn(other);
    const sClient = await signedIn(student);
    const base = { course_id: course.id, student_id: student.id };

    step("counseling_profiles");
    {
      const { error } = await cClient.from("counseling_profiles").insert({ ...base, grad_year: 2027, gpa: 3.9, intended_major: "CS" });
      error ? bad("counselor creates profile", error.message) : ok("counselor creates profile");
    }
    {
      const { data } = await sClient.from("counseling_profiles").select("grad_year").eq("course_id", course.id);
      (data?.length ?? 0) === 1 ? ok("student reads own profile") : bad("student should read own profile", `${data?.length}`);
    }
    {
      const { data } = await oClient.from("counseling_profiles").select("id").eq("course_id", course.id);
      (data?.length ?? 0) === 0 ? ok("unrelated teacher can't read profile") : bad("other should see nothing", `${data?.length}`);
    }

    step("college_applications");
    {
      const { error } = await cClient.from("college_applications").insert({
        ...base, college_name: "MIT", tier: "reach", plan: "EA",
        documents: [{ label: "Transcript", done: false }, { label: "Essay", done: true }],
      });
      error ? bad("counselor adds college", error.message) : ok("counselor adds college");
    }
    {
      const { data } = await sClient.from("college_applications").select("college_name").eq("course_id", course.id);
      (data?.length ?? 0) === 1 ? ok("student reads own college list") : bad("student should read own list", `${data?.length}`);
    }
    {
      const { error } = await oClient.from("college_applications").insert({ ...base, college_name: "Hax" });
      // RLS WITH CHECK should reject an unrelated teacher's insert.
      error ? ok("unrelated teacher can't add college") : bad("other insert should be rejected");
    }

    step("counseling_tasks");
    let taskId = null;
    {
      const { data, error } = await cClient.from("counseling_tasks").insert({ ...base, title: "Draft essay" }).select("id").single();
      if (error) bad("counselor assigns task", error.message);
      else { taskId = data.id; ok("counselor assigns task"); }
    }
    {
      const { data } = await sClient.from("counseling_tasks").select("title").eq("course_id", course.id);
      (data?.length ?? 0) === 1 ? ok("student reads own tasks") : bad("student should read own tasks", `${data?.length}`);
    }

    step("counseling_meetings (counselor-private)");
    {
      const { error } = await cClient.from("counseling_meetings").insert({ ...base, summary: "Kickoff" });
      error ? bad("counselor logs meeting", error.message) : ok("counselor logs meeting");
    }
    {
      const { data } = await cClient.from("counseling_meetings").select("summary").eq("course_id", course.id);
      (data?.length ?? 0) === 1 ? ok("counselor reads meeting") : bad("counselor should read meeting", `${data?.length}`);
    }
    {
      const { data } = await sClient.from("counseling_meetings").select("id").eq("course_id", course.id);
      (data?.length ?? 0) === 0 ? ok("student CANNOT read meeting notes (private)") : bad("meeting notes should be private", `${data?.length}`);
    }

    step("counseling_caseload RPC (0135)");
    {
      const { data, error } = await cClient.rpc("counseling_caseload", { p_course_id: course.id });
      if (error) bad("counselor reads caseload", error.message);
      else {
        (data?.totals?.students ?? 0) >= 1 ? ok("caseload counts students", `${data.totals.students}`) : bad("students count", JSON.stringify(data?.totals));
        (data?.totals?.applications ?? 0) >= 1 ? ok("caseload counts applications", `${data.totals.applications}`) : bad("applications count", JSON.stringify(data?.totals));
        const row = (data?.students ?? []).find((s) => s.id === student.id);
        row && row.applications_total >= 1 && row.tasks_open >= 1
          ? ok("caseload per-student aggregates present")
          : bad("per-student row aggregates", JSON.stringify(row));
        (data?.totals?.docs_missing ?? 0) >= 1 && (row?.docs_missing ?? 0) >= 1
          ? ok("caseload counts missing documents", `${data.totals.docs_missing}`)
          : bad("docs_missing", `totals=${data?.totals?.docs_missing} row=${row?.docs_missing}`);
      }
    }
    {
      const { error } = await oClient.rpc("counseling_caseload", { p_course_id: course.id });
      /not_authorized/.test(error?.message ?? "") ? ok("unrelated teacher rejected from caseload") : bad("other should be rejected", error?.message ?? "no error");
    }

    step("student self-service (0136)");
    {
      // The counselor's task insert should have fanned out a notification.
      const { data } = await svc.from("notifications").select("id").eq("recipient_id", student.id).eq("kind", "counseling_task");
      (data?.length ?? 0) >= 1 ? ok("task assignment notified the student") : bad("expected a counseling_task notification", `${data?.length}`);
    }
    {
      // Student marks their own task done via the RPC.
      const { error } = await sClient.rpc("complete_counseling_task", { p_task_id: taskId, p_done: true });
      if (error) bad("student completes own task", error.message);
      else {
        const { data } = await svc.from("counseling_tasks").select("status").eq("id", taskId).single();
        data?.status === "done" ? ok("student completed own task (RPC)") : bad("task should be done", data?.status);
      }
    }
    {
      // Unrelated teacher cannot complete the task.
      const { error } = await oClient.rpc("complete_counseling_task", { p_task_id: taskId, p_done: false });
      /not_authorized/.test(error?.message ?? "") ? ok("unrelated teacher can't complete task") : bad("other complete should be rejected", error?.message ?? "no error");
    }
    {
      // Student can CREATE their own profile (delete the counselor's first).
      await svc.from("counseling_profiles").delete().eq("course_id", course.id);
      const { error } = await sClient.from("counseling_profiles").insert({ ...base, grad_year: 2028 });
      error ? bad("student creates own profile", error.message) : ok("student creates own profile");
    }

    step("deadline reminders (0138)");
    {
      const d3 = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
      await cClient.from("college_applications").insert({ ...base, college_name: "Deadline U", status: "considering", deadline: d3 });
      const { error } = await svc.rpc("run_counseling_deadline_reminders");
      if (error) bad("run deadline reminders", error.message);
      else {
        const { data } = await svc.from("notifications").select("title").eq("recipient_id", student.id).eq("kind", "reminder");
        (data ?? []).some((r) => (r.title ?? "").includes("Deadline U"))
          ? ok("deadline reminder notification created")
          : bad("expected a deadline reminder notification", JSON.stringify(data));
      }
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
main().catch((e) => { console.error("smoke-counseling crashed:", e?.message ?? e); process.exit(1); });
