#!/usr/bin/env node
/**
 * smoke-test-windows.mjs
 *
 * Verifies migrations 0143 + 0144 — teacher-controlled partial/scheduled module
 * deployment. The integrity spine is the headline: a student can NEVER end up
 * with two runs of the same test ("taking the same test twice").
 *
 * Scenarios (each isolated by its own course, since windows are per-course):
 *   Course A / studentA (4-module STAGGER):
 *     - submit M1, then get_test_module(2) is window-blocked (module_not_yet_open)
 *     - start_test again returns the SAME run id (no duplicate run)         [KEY]
 *     - submit_test_module(2) is also blocked server-side (defense in depth)
 *     - set_test_module_windows can't re-lock M1 once passed (position_already_passed)
 *     - open M2..M4 → finish all four → single finalize, BOTH section_scores keys
 *   Course B / studentB (RW-only SUBSET, positions 1-2 deployed):
 *     - run starts at position 1, finalizes after M2 (scheduled_last_position=2)
 *     - section_scores has ONLY 'reading-writing' (a section score, not composite)
 *   Course C / studentC (stranded meter):
 *     - submit M1, M2 never opens → finalize_metered_run scores just M1
 *   studentD enrolled in A and B (both metered) → ambiguous_course_enrollment
 *   Pure teacher RPC guards: schedule_incomplete, non_contiguous_deployment
 *
 * Self-contained + disposable. Requires 0143/0144 applied. NOT in smoke-all
 * until merged. Usage from viewer/:
 *   node --env-file-if-exists=../.env scripts/smoke-test-windows.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY;
const miss = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY"].filter((k) => !process.env[k]);
if (miss.length) { console.error("smoke-test-windows: missing env:", miss.join(", ")); process.exit(2); }
const TAG = randomBytes(3).toString("hex");
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const userClient = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; console.log(`  FAIL  ${l}`); if (d) console.log(`        ${d}`); };
const step = (l) => console.log(`\n=== ${l} ===`);
const rx = (e, re) => re.test(e?.message ?? "");
const future = () => new Date(Date.now() + 3600e3).toISOString();
const past = () => new Date(Date.now() - 60e3).toISOString();

async function mkUser(role) {
  const email = `tw-${role}-${TAG}-${randomBytes(2).toString("hex")}@gmail.com`, password = "Tw!" + randomBytes(4).toString("hex");
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${role}: ${error.message}`);
  await svc.from("profiles").update({ role, display_name: `Tw ${role}` }).eq("id", data.user.id);
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
// answers map: { questionId: correctLetter } for the module at position p
function answersFor(qids, p) { return Object.fromEntries((qids[p] || []).map((id) => [id, "A"])); }

async function main() {
  step("provision");
  const teacher = await mkUser("teacher");
  const studentA = await mkUser("student");
  const studentB = await mkUser("student");
  const studentC = await mkUser("student");
  const studentD = await mkUser("student");
  const slug = `tw-test-${TAG}`;
  const title = `Windows Test ${TAG}`;

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
  const C = await mkCourse(`C ${TAG}`, teacher.id, slug, title);
  await svc.from("course_memberships").insert([
    { course_id: A.courseId, student_id: studentA.id },
    { course_id: B.courseId, student_id: studentB.id },
    { course_id: C.courseId, student_id: studentC.id },
    { course_id: A.courseId, student_id: studentD.id },
    { course_id: B.courseId, student_id: studentD.id },
  ]);

  const cleanup = async () => {
    await svc.from("test_runs").delete().eq("test_id", test.id);
    await svc.from("test_module_windows").delete().eq("test_id", test.id);
    for (const X of [A, B, C]) {
      await svc.from("module_items").delete().eq("module_id", X.courseModuleId);
      await svc.from("course_modules").delete().eq("id", X.courseModuleId);
      await svc.from("course_memberships").delete().eq("course_id", X.courseId);
      await svc.from("courses").delete().eq("id", X.courseId);
    }
    // questions/modules cascade from tests delete
    await svc.from("tests").delete().eq("id", test.id);
    for (const u of [teacher, studentA, studentB, studentC, studentD]) await svc.auth.admin.deleteUser(u.id);
  };

  try {
    const tc = await signedIn(teacher);
    const sa = await signedIn(studentA);
    const sb = await signedIn(studentB);
    const scl = await signedIn(studentC);
    const sd = await signedIn(studentD);

    step("teacher RPC guards");
    {
      const r = await tc.rpc("set_test_module_windows", { p_course_id: A.courseId, p_slug: slug,
        p_windows: [{ position: 1, deployed: true }, { position: 2, deployed: true }] }); // only 2 of 4
      rx(r.error, /schedule_incomplete/) ? ok("incomplete schedule rejected") : bad("expected schedule_incomplete", r.error?.message ?? JSON.stringify(r.data));
    }
    {
      const r = await tc.rpc("set_test_module_windows", { p_course_id: A.courseId, p_slug: slug,
        p_windows: [{ position: 1, deployed: true }, { position: 2, deployed: false }, { position: 3, deployed: true }, { position: 4, deployed: false }] });
      rx(r.error, /non_contiguous_deployment/) ? ok("non-contiguous deploy rejected") : bad("expected non_contiguous_deployment", r.error?.message ?? JSON.stringify(r.data));
    }

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
      if (error) bad("studentA starts", error.message);
      else { runA = data?.run_id; (runA && data.current_module === 1 && data.last_position === 4) ? ok("studentA run starts at M1, last=4") : bad("bad start payload", JSON.stringify(data)); }
    }
    {
      const { data, error } = await sa.rpc("submit_test_module", { p_run_id: runA, p_position: 1, p_answers: answersFor(qids, 1) });
      (!error && data?.finished === false && data?.next_module === 2) ? ok("submit M1 advances to M2") : bad("submit M1", error?.message ?? JSON.stringify(data));
    }
    {
      const { error } = await sa.rpc("get_test_module", { p_run_id: runA, p_position: 2 });
      rx(error, /module_not_yet_open/) ? ok("M2 fetch blocked (module_not_yet_open)") : bad("expected module_not_yet_open", error?.message ?? "no error");
    }
    {
      const { data, error } = await sa.rpc("start_test", { p_slug: slug });
      (!error && data?.run_id === runA && data?.status === "in_progress")
        ? ok("start_test returns SAME run (no duplicate)", runA) : bad("DUPLICATE RUN / wrong run", JSON.stringify({ got: data?.run_id, want: runA, err: error?.message }));
    }
    {
      const { error } = await sa.rpc("submit_test_module", { p_run_id: runA, p_position: 2, p_answers: answersFor(qids, 2) });
      rx(error, /module_not_yet_open/) ? ok("submit M2 blocked server-side too") : bad("expected submit gate", error?.message ?? "no error");
    }
    {
      // Re-lock M1 (already passed) → rejected.
      const r = await tc.rpc("set_test_module_windows", { p_course_id: A.courseId, p_slug: slug,
        p_windows: [{ position: 1, deployed: false }, { position: 2, deployed: true }, { position: 3, deployed: true }, { position: 4, deployed: true }] });
      rx(r.error, /position_already_passed/) ? ok("can't re-lock a passed module") : bad("expected position_already_passed", r.error?.message ?? JSON.stringify(r.data));
    }
    {
      // Open M2-4.
      const r = await tc.rpc("set_test_module_windows", { p_course_id: A.courseId, p_slug: slug,
        p_windows: [{ position: 1, deployed: true, opens_at: null }, { position: 2, deployed: true, opens_at: past() },
                    { position: 3, deployed: true, opens_at: past() }, { position: 4, deployed: true, opens_at: past() }] });
      r.error ? bad("teacher opens M2-4", r.error.message) : ok("M2-4 opened");
    }
    {
      let finished = null;
      for (const p of [2, 3, 4]) {
        const { data, error } = await sa.rpc("submit_test_module", { p_run_id: runA, p_position: p, p_answers: answersFor(qids, p) });
        if (error) { bad(`submit M${p}`, error.message); break; }
        finished = data?.finished;
      }
      const { data: row } = await svc.from("test_runs").select("status, section_scores, score").eq("id", runA).single();
      (finished === true && row?.status === "submitted" && row?.section_scores?.["reading-writing"] && row?.section_scores?.["math"])
        ? ok("full test finalizes once with BOTH section keys", JSON.stringify(row.section_scores))
        : bad("full finalize wrong", JSON.stringify(row));
      const { count } = await svc.from("test_runs").select("id", { count: "exact", head: true }).eq("test_id", test.id).eq("user_id", studentA.id);
      count === 1 ? ok("exactly ONE run for studentA") : bad("expected 1 run", `got ${count}`);
    }

    step("Course B — RW-only subset (positions 1-2 deployed)");
    {
      const r = await tc.rpc("set_test_module_windows", { p_course_id: B.courseId, p_slug: slug,
        p_windows: [{ position: 1, deployed: true, opens_at: null }, { position: 2, deployed: true, opens_at: null },
                    { position: 3, deployed: false }, { position: 4, deployed: false }] });
      r.error ? bad("teacher deploys RW-only subset", r.error.message) : ok("RW-only subset scheduled");
    }
    let runB = null;
    {
      const { data, error } = await sb.rpc("start_test", { p_slug: slug });
      runB = data?.run_id;
      (!error && data?.first_position === 1 && data?.last_position === 2) ? ok("subset run last_position=2") : bad("subset start payload", error?.message ?? JSON.stringify(data));
    }
    {
      await sb.rpc("submit_test_module", { p_run_id: runB, p_position: 1, p_answers: answersFor(qids, 1) });
      const { data } = await sb.rpc("submit_test_module", { p_run_id: runB, p_position: 2, p_answers: answersFor(qids, 2) });
      const { data: row } = await svc.from("test_runs").select("status, section_scores").eq("id", runB).single();
      (data?.finished === true && row?.status === "submitted" && row?.section_scores?.["reading-writing"] && !row?.section_scores?.["math"])
        ? ok("subset finalizes after M2; section_scores has ONLY R&W", JSON.stringify(row.section_scores))
        : bad("subset finalize wrong", JSON.stringify(row));
    }

    step("ambiguous cross-course enrollment");
    {
      // studentD is enrolled in A and B, both metered for this test.
      const { error } = await sd.rpc("start_test", { p_slug: slug });
      rx(error, /ambiguous_course_enrollment/) ? ok("dual metered enrollment → ambiguous_course_enrollment") : bad("expected ambiguous_course_enrollment", error?.message ?? "no error");
    }

    step("Course C — finalize_metered_run escape hatch");
    {
      await tc.rpc("set_test_module_windows", { p_course_id: C.courseId, p_slug: slug,
        p_windows: [{ position: 1, deployed: true, opens_at: null }, { position: 2, deployed: true, opens_at: future() },
                    { position: 3, deployed: true, opens_at: future() }, { position: 4, deployed: true, opens_at: future() }] });
      const { data: start } = await scl.rpc("start_test", { p_slug: slug });
      const runC = start?.run_id;
      await scl.rpc("submit_test_module", { p_run_id: runC, p_position: 1, p_answers: answersFor(qids, 1) }); // stranded at M2 (locked)
      const { data, error } = await tc.rpc("finalize_metered_run", { p_run_id: runC });
      const { data: row } = await svc.from("test_runs").select("status, section_scores, score").eq("id", runC).single();
      (!error && data?.finished === true && row?.status === "submitted" && row?.section_scores?.["reading-writing"] && !row?.section_scores?.["math"])
        ? ok("teacher finalizes stranded run at M1 (R&W only)", JSON.stringify(row.section_scores))
        : bad("finalize_metered_run wrong", error?.message ?? JSON.stringify(row));
    }
    {
      // a student cannot call it
      const r = await sa.rpc("finalize_metered_run", { p_run_id: runA });
      (r.error) ? ok("student can't force-finalize (not_authorized / already submitted)") : bad("student finalize should fail", JSON.stringify(r.data));
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
main().catch((e) => { console.error("smoke-test-windows crashed:", e?.message ?? e); process.exit(1); });
