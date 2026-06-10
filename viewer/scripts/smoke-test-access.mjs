#!/usr/bin/env node
/**
 * smoke-test-access.mjs
 *
 * Verifies migration 0141 (full-test access gate + per-test retake policy):
 *   - start_test enrollment gate: an UNENROLLED student is blocked
 *     (not_enrolled); an enrolled student may start; STAFF are exempt.
 *   - retake policy: 'one_attempt' returns the same submitted run on the next
 *     start; 'unlimited' mints a fresh run after submission.
 *   - set_test_retake_policy: staff-only; rejects an invalid policy.
 *
 * Self-contained + disposable: builds its own test + course + module-item link +
 * enrolment, manipulates run status directly (service role) to simulate a
 * submission, and cleans everything up.
 *
 * NOTE: requires migration 0141 to be applied. NOT in smoke-all until merged.
 * Usage: from viewer/  →  node --env-file-if-exists=../.env scripts/smoke-test-access.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY;
const miss = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY"].filter((k) => !process.env[k]);
if (miss.length) { console.error("smoke-test-access: missing env:", miss.join(", ")); process.exit(2); }
const TAG = randomBytes(3).toString("hex");
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const userClient = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; console.log(`  FAIL  ${l}`); if (d) console.log(`        ${d}`); };
const step = (l) => console.log(`\n=== ${l} ===`);

async function mkUser(role) {
  const email = `ta-${role}-${TAG}-${randomBytes(2).toString("hex")}@gmail.com`, password = "Ta!" + randomBytes(4).toString("hex");
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${role}: ${error.message}`);
  await svc.from("profiles").update({ role, display_name: `Ta ${role}` }).eq("id", data.user.id);
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
  const teacher = await mkUser("teacher");   // staff (course owner)
  const otherTeacher = await mkUser("teacher"); // staff, NOT enrolled
  const student = await mkUser("student");   // enrolled
  const outsider = await mkUser("student");  // NOT enrolled
  const slug = `ta-test-${TAG}`;

  const { data: test, error: tErr } = await svc.from("tests")
    .insert({ slug, title: `Access Test ${TAG}`, total_questions: 0 })
    .select("id, retake_policy").single();
  if (tErr) throw new Error(`create test: ${tErr.message}`);

  const { data: course } = await svc.from("courses")
    .insert({ name: `Access Course ${TAG}`, teacher_id: teacher.id }).select("id").single();
  const { data: mod } = await svc.from("course_modules")
    .insert({ course_id: course.id, name: "Module 1", position: 0 }).select("id").single();
  await svc.from("module_items").insert({
    module_id: mod.id, item_type: "link", url: `/test/${slug}`, title: `Access Test ${TAG}`, position: 0,
  });
  await svc.from("course_memberships").insert({ course_id: course.id, student_id: student.id });

  const cleanup = async () => {
    await svc.from("test_runs").delete().eq("test_id", test.id);
    await svc.from("module_items").delete().eq("module_id", mod.id);
    await svc.from("course_modules").delete().eq("id", mod.id);
    await svc.from("course_memberships").delete().eq("course_id", course.id);
    await svc.from("courses").delete().eq("id", course.id);
    await svc.from("tests").delete().eq("id", test.id);
    for (const u of [teacher, otherTeacher, student, outsider]) await svc.auth.admin.deleteUser(u.id);
  };

  try {
    const sClient = await signedIn(student);
    const oClient = await signedIn(outsider);
    const otClient = await signedIn(otherTeacher);

    step("default retake_policy");
    test.retake_policy === "one_attempt" ? ok("new test defaults to one_attempt") : bad("expected one_attempt default", test.retake_policy);

    step("enrollment gate");
    {
      const { error } = await oClient.rpc("start_test", { p_slug: slug });
      /not_enrolled/.test(error?.message ?? "") ? ok("unenrolled student blocked (not_enrolled)") : bad("expected not_enrolled", error?.message ?? "no error");
    }
    let runId = null;
    {
      const { data, error } = await sClient.rpc("start_test", { p_slug: slug });
      if (error) bad("enrolled student can start", error.message);
      else { runId = data?.run_id; runId ? ok("enrolled student starts a run", data.status) : bad("no run_id", JSON.stringify(data)); }
    }
    {
      // Staff exempt: otherTeacher is NOT enrolled but is staff.
      const { data, error } = await otClient.rpc("start_test", { p_slug: slug });
      if (error) bad("staff exempt from enrollment gate", error.message);
      else { data?.run_id ? ok("unenrolled STAFF can start (exempt)") : bad("staff start returned no run", JSON.stringify(data)); }
    }

    step("one_attempt lock");
    {
      // Simulate the student submitting their run.
      await svc.from("test_runs").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", runId);
      const { data } = await sClient.rpc("start_test", { p_slug: slug });
      data?.run_id === runId && data?.status === "submitted"
        ? ok("one_attempt returns the same submitted run")
        : bad("expected same submitted run", JSON.stringify({ got: data?.run_id, want: runId, status: data?.status }));
    }

    step("set_test_retake_policy");
    {
      const { error } = await sClient.rpc("set_test_retake_policy", { p_slug: slug, p_policy: "unlimited" });
      /not_authorized/.test(error?.message ?? "") ? ok("student can't set retake policy") : bad("student set should be rejected", error?.message ?? "no error");
    }
    {
      const c = await signedIn(teacher);
      const bogus = await c.rpc("set_test_retake_policy", { p_slug: slug, p_policy: "bogus" });
      /invalid_policy/.test(bogus.error?.message ?? "") ? ok("invalid policy rejected") : bad("expected invalid_policy", bogus.error?.message ?? "no error");
      const good = await c.rpc("set_test_retake_policy", { p_slug: slug, p_policy: "unlimited" });
      good.error ? bad("teacher sets unlimited", good.error.message) : ok("teacher sets unlimited");
    }

    step("unlimited replay");
    {
      // Student already has a submitted run; with unlimited, start mints a fresh one.
      const { data, error } = await sClient.rpc("start_test", { p_slug: slug });
      if (error) bad("unlimited start", error.message);
      else (data?.run_id && data.run_id !== runId && data.status === "in_progress")
        ? ok("unlimited mints a fresh run after submission", data.run_id)
        : bad("expected a new in_progress run", JSON.stringify({ got: data?.run_id, prev: runId, status: data?.status }));
    }
  } finally {
    step("cleanup");
    await cleanup().catch((e) => console.log("  ..    cleanup error", e.message));
    console.log("  ..    disposable test/course/users removed");
  }

  console.log(`\n----------------------------------`);
  console.log(`TOTAL: ${pass + fail}  PASS: ${pass}  FAIL: ${fail}`);
  console.log(`==================================`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("smoke-test-access crashed:", e?.message ?? e); process.exit(1); });
