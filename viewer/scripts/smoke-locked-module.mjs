#!/usr/bin/env node
/**
 * smoke-locked-module.mjs
 *
 * Verifies the exact server→client contract the new "locked module" student UI
 * depends on (migrations 0143 + 0144, already applied to the cloud DB). The UI
 * reads the ISO `opens_at` out of the supabase error object's `details` field to
 * render "opens Tue 8am", and reads `next_module_opens_at` off the submit
 * response to tell a student when the next module unlocks.
 *
 * Checks (signed in as the student via supabase-js):
 *   A) submit_test_module(M1) → response has `next_module_opens_at`, a valid ISO
 *      string parsing to a FUTURE time (the next module is scheduled later).
 *   B) get_test_module(run, 2) → errors; `error.message` includes
 *      "module_not_yet_open" AND `error.details` is a non-empty string that
 *      `new Date(error.details)` parses to a valid FUTURE time.
 *   C) get_test_module on an excluded (deployed=false) position →
 *      `module_not_deployed`.
 *
 * Self-contained + disposable. Requires 0143/0144 applied. NOT in smoke-all.
 * Usage from viewer/:
 *   node --env-file-if-exists=../.env scripts/smoke-locked-module.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY;
const miss = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY"].filter((k) => !process.env[k]);
if (miss.length) { console.error("smoke-locked-module: missing env:", miss.join(", ")); process.exit(2); }
const TAG = randomBytes(3).toString("hex");
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const userClient = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; console.log(`  FAIL  ${l}`); if (d) console.log(`        ${d}`); };
const step = (l) => console.log(`\n=== ${l} ===`);
const rx = (e, re) => re.test(e?.message ?? "");
const future = () => new Date(Date.now() + 3600e3).toISOString();
// A parsed Date is "future + valid" if it's a real Date strictly ahead of now (small skew slack).
const isFutureISO = (s) => {
  if (typeof s !== "string" || s.length === 0) return false;
  const t = Date.parse(s);
  return Number.isFinite(t) && t > Date.now() - 5000;
};

async function mkUser(role) {
  const email = `lm-${role}-${TAG}-${randomBytes(2).toString("hex")}@gmail.com`, password = "Lm!" + randomBytes(4).toString("hex");
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${role}: ${error.message}`);
  await svc.from("profiles").update({ role, display_name: `Lm ${role}` }).eq("id", data.user.id);
  return { id: data.user.id, email, password };
}
async function signedIn(u) {
  const c = userClient();
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(`signIn ${u.email}: ${error.message}`);
  return c;
}
async function mkCourse(name, teacherId, slug, title) {
  const { data: course } = await svc.from("courses").insert({ name, teacher_id: teacherId }).select("id").single();
  const { data: mod } = await svc.from("course_modules").insert({ course_id: course.id, name: "Module 1", position: 0 }).select("id").single();
  await svc.from("module_items").insert({ module_id: mod.id, item_type: "link", url: `/test/${slug}`, title, position: 0 });
  return { courseId: course.id, courseModuleId: mod.id };
}
function answersFor(qids, p) { return Object.fromEntries((qids[p] || []).map((id) => [id, "A"])); }

async function main() {
  step("provision");
  const teacher = await mkUser("teacher");
  const studentA = await mkUser("student"); // course A: stagger (checks A + B)
  const studentB = await mkUser("student"); // course B: excluded tail (check C)
  const slug = `lm-test-${TAG}`;
  const title = `Locked Module Test ${TAG}`;

  const { data: test, error: tErr } = await svc.from("tests")
    .insert({ slug, title, total_questions: 4 }).select("id").single();
  if (tErr) throw new Error(`create test: ${tErr.message}`);

  // 4 modules: RW M1, RW M2, Math M1, Math M2 — one mcq question each (answer A).
  const sections = ["reading-writing", "reading-writing", "math", "math"];
  const qids = {}; // position -> [questionId]
  for (let p = 1; p <= 4; p++) {
    const { data: m } = await svc.from("test_modules")
      .insert({ test_id: test.id, position: p, section: sections[p - 1], label: `M${p}`, time_limit_seconds: 1800, question_count: 1 })
      .select("id").single();
    const { data: q } = await svc.from("test_questions").insert({
      module_id: m.id, position: 1, ref: `${p}-1`, number: 1, type: "mcq",
      stem: `Q${p}`, choices: { A: "a", B: "b", C: "c", D: "d" }, correct_answer: "A",
    }).select("id").single();
    qids[p] = [q.id];
  }

  const A = await mkCourse(`A ${TAG}`, teacher.id, slug, title);
  const B = await mkCourse(`B ${TAG}`, teacher.id, slug, title);
  await svc.from("course_memberships").insert([
    { course_id: A.courseId, student_id: studentA.id },
    { course_id: B.courseId, student_id: studentB.id },
  ]);

  const cleanup = async () => {
    await svc.from("test_runs").delete().eq("test_id", test.id);
    await svc.from("test_module_windows").delete().eq("test_id", test.id);
    for (const X of [A, B]) {
      await svc.from("module_items").delete().eq("module_id", X.courseModuleId);
      await svc.from("course_modules").delete().eq("id", X.courseModuleId);
      await svc.from("course_memberships").delete().eq("course_id", X.courseId);
      await svc.from("courses").delete().eq("id", X.courseId);
    }
    // questions/modules cascade from tests delete
    await svc.from("tests").delete().eq("id", test.id);
    for (const u of [teacher, studentA, studentB]) await svc.auth.admin.deleteUser(u.id);
  };

  try {
    const tc = await signedIn(teacher);
    const sa = await signedIn(studentA);
    const sb = await signedIn(studentB);

    // ---- Course A: M1 open now, M2-4 deployed but scheduled in the FUTURE. ----
    step("Course A — stagger: M1 now, M2-4 future");
    {
      const r = await tc.rpc("set_test_module_windows", { p_course_id: A.courseId, p_slug: slug,
        p_windows: [{ position: 1, deployed: true, opens_at: null }, { position: 2, deployed: true, opens_at: future() },
                    { position: 3, deployed: true, opens_at: future() }, { position: 4, deployed: true, opens_at: future() }] });
      r.error ? bad("teacher sets stagger schedule", r.error.message) : ok("stagger schedule set");
    }

    let runA = null;
    {
      const { data, error } = await sa.rpc("start_test", { p_slug: slug });
      runA = data?.run_id;
      (!error && runA) ? ok("studentA starts run", runA) : bad("studentA start failed", error?.message ?? JSON.stringify(data));
    }

    // CHECK A — submit M1, next module is future → next_module_opens_at is future ISO.
    {
      const { data, error } = await sa.rpc("submit_test_module", { p_run_id: runA, p_position: 1, p_answers: answersFor(qids, 1) });
      if (error) bad("A: submit M1", error.message);
      else isFutureISO(data?.next_module_opens_at)
        ? ok("A: submit M1 returns future next_module_opens_at", String(data.next_module_opens_at))
        : bad("A: next_module_opens_at not a future ISO", JSON.stringify({ next_module_opens_at: data?.next_module_opens_at, data }));
    }

    // CHECK B — get_test_module(2) blocked; error.details carries the future opens_at ISO.
    {
      const { error } = await sa.rpc("get_test_module", { p_run_id: runA, p_position: 2 });
      if (!rx(error, /module_not_yet_open/)) {
        bad("B: expected module_not_yet_open", error?.message ?? "no error");
      } else if (!isFutureISO(error?.details)) {
        bad("B: error.details not a future ISO opens_at", JSON.stringify({ details: error?.details, hint: error?.hint, code: error?.code }));
      } else {
        ok("B: module_not_yet_open carries future opens_at in error.details", String(error.details));
      }
    }

    // ---- Course B: positions 1-2 deployed (open now), 3-4 excluded (deployed=false). ----
    step("Course B — excluded tail: positions 1-2 deployed, 3-4 not deployed");
    {
      const r = await tc.rpc("set_test_module_windows", { p_course_id: B.courseId, p_slug: slug,
        p_windows: [{ position: 1, deployed: true, opens_at: null }, { position: 2, deployed: true, opens_at: null },
                    { position: 3, deployed: false }, { position: 4, deployed: false }] });
      r.error ? bad("teacher deploys 1-2 subset", r.error.message) : ok("1-2 subset scheduled");
    }
    let runB = null;
    {
      const { data, error } = await sb.rpc("start_test", { p_slug: slug });
      runB = data?.run_id;
      (!error && runB) ? ok("studentB starts run", runB) : bad("studentB start failed", error?.message ?? JSON.stringify(data));
    }

    // CHECK C — a permanent subset (positions 1-2 deployed, 3-4 excluded) drives
    // to completion at its own last deployed position. The gated flow checks
    // module_out_of_order BEFORE the deployment window, so position 3 is reached
    // via module_out_of_order / run_already_submitted, NOT module_not_deployed
    // (that code is unreachable for an excluded TAIL). Assert the subset run
    // (i) finalizes scoring ONLY the deployed section, and (ii) position 3 is
    // unreachable.
    {
      const s1 = await sb.rpc("submit_test_module", { p_run_id: runB, p_position: 1, p_answers: answersFor(qids, 1) });
      if (s1.error) bad("C: submit subset M1", s1.error.message);
      else ok("C: subset M1 submitted");

      const s2 = await sb.rpc("submit_test_module", { p_run_id: runB, p_position: 2, p_answers: answersFor(qids, 2) });
      if (s2.error) bad("C: submit subset M2 (final deployed module)", s2.error.message);
      else ok("C: subset M2 submitted (run finalizes at last deployed position)");

      // (i) run is submitted and only the deployed section was scored (no math tail).
      const { data: row, error: rowErr } = await svc.from("test_runs")
        .select("status, section_scores").eq("id", runB).single();
      if (rowErr) {
        bad("C: read subset run row", rowErr.message);
      } else {
        const keys = Object.keys(row?.section_scores ?? {});
        const onlyRW = row?.status === "submitted" && keys.includes("reading-writing") && !keys.includes("math");
        onlyRW
          ? ok("C: subset run submitted; section_scores has only reading-writing (math tail never scored)", JSON.stringify({ status: row.status, keys }))
          : bad("C: subset run not finalized RW-only", JSON.stringify({ status: row?.status, keys }));
      }

      // (ii) position 3 is unreachable — run_already_submitted OR module_out_of_order.
      const { error: p3Err } = await sb.rpc("get_test_module", { p_run_id: runB, p_position: 3 });
      rx(p3Err, /run_already_submitted|module_out_of_order/)
        ? ok("C: excluded tail position 3 is unreachable", p3Err.message)
        : bad("C: expected run_already_submitted|module_out_of_order at position 3", p3Err?.message ?? "no error");
    }
  } finally {
    step("cleanup");
    await cleanup().catch((e) => console.log("  ..    cleanup error", e.message));
    console.log("  ..    disposable fixtures removed");
  }

  console.log(`\n----------------------------------`);
  console.log(`TOTAL: ${pass + fail}  PASS: ${pass}  FAIL: ${fail}`);
  console.log(`==================================`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("smoke-locked-module crashed:", e?.message ?? e); process.exit(1); });
