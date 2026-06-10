#!/usr/bin/env node
/**
 * verify-subset-deployment.mjs
 *
 * End-to-end check of per-occurrence module-subset deployment against a REAL
 * course + seeded test (defaults to Class B + dsat-june-2026-asia, whose
 * Modules links are `?m=1-1` and `?m=2-2`). Provisions ONE disposable student,
 * enrols them in the course, drives both occurrences through the actual RPCs,
 * asserts the runs/scores are independent + correctly scoped, then cleans up.
 *
 * Touches the real course only by adding/removing a temp membership + the
 * disposable student's own runs — never an existing student.
 *
 * Usage from viewer/:
 *   node --env-file-if-exists=../.env scripts/verify-subset-deployment.mjs
 *   COURSE_SHORT=R7TJU8 SLUG=dsat-june-2026-asia node ... scripts/verify-subset-deployment.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY;
const miss = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY"].filter((k) => !process.env[k]);
if (miss.length) { console.error("verify-subset: missing env:", miss.join(", ")); process.exit(2); }
const COURSE_SHORT = process.env.COURSE_SHORT || "R7TJU8";
const SLUG = process.env.SLUG || "dsat-june-2026-asia";
const FIRST = { occ: "Module 1", m: [1, 1] };
const SECOND = { occ: "Module 2", m: [2, 2] };

const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const userClient = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
let pass = 0, fail = 0;
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; console.log(`  FAIL  ${l}`); if (d) console.log(`        ${d}`); };
const step = (l) => console.log(`\n=== ${l} ===`);
const rx = (e, re) => re.test(e?.message ?? "");

async function main() {
  step(`setup (course ${COURSE_SHORT}, test ${SLUG})`);
  const { data: course } = await svc.from("courses").select("id, name").eq("short_code", COURSE_SHORT).single();
  if (!course) { console.error(`course ${COURSE_SHORT} not found`); process.exit(2); }
  const { data: links } = await svc.from("module_items").select("title, url, course_modules!inner(course_id)").ilike("url", `%/test/${SLUG}%`);
  const inCourse = (links ?? []).filter((l) => l.course_modules.course_id === course.id);
  console.log(`  ..    ${course.name}: ${inCourse.map((l) => `${l.title} → ${l.url}`).join(" | ")}`);
  const hasM1 = inCourse.some((l) => l.url.includes("?m=1-1"));
  const hasM2 = inCourse.some((l) => l.url.includes("?m=2-2"));
  hasM1 && hasM2 ? ok("both ?m=1-1 and ?m=2-2 links present") : bad("expected ?m=1-1 and ?m=2-2 links", JSON.stringify(inCourse.map((l) => l.url)));

  // disposable student enrolled in the real course
  const email = `vs-${randomBytes(3).toString("hex")}@gmail.com`, password = "Vs!" + randomBytes(4).toString("hex");
  const { data: cu, error: cuErr } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (cuErr) { console.error(cuErr.message); process.exit(2); }
  const studentId = cu.user.id;
  await svc.from("profiles").update({ role: "student", display_name: "Verify Student" }).eq("id", studentId);
  await svc.from("course_memberships").insert({ course_id: course.id, student_id: studentId });

  const cleanup = async () => {
    await svc.from("test_runs").delete().eq("user_id", studentId);
    await svc.from("course_memberships").delete().eq("course_id", course.id).eq("student_id", studentId);
    await svc.auth.admin.deleteUser(studentId);
  };

  try {
    const s = userClient();
    await s.auth.signInWithPassword({ email, password });
    let runM1, runM2;

    step("occurrence: Module 1 (?m=1-1)");
    {
      const { data, error } = await s.rpc("start_test", { p_slug: SLUG, p_first: 1, p_last: 1 });
      runM1 = data?.run_id;
      (!error && runM1 && data.current_module === 1 && data.first_position === 1 && data.last_position === 1)
        ? ok("starts at module 1, range 1-1") : bad("M1 start", error?.message ?? JSON.stringify(data));
    }
    {
      const { data, error } = await s.rpc("get_test_module", { p_run_id: runM1, p_position: 1 });
      (!error && Array.isArray(data?.questions) && data.questions.length === 27)
        ? ok("module 1 serves 27 RW questions") : bad("get module 1", error?.message ?? `q=${data?.questions?.length}`);
    }
    {
      const { error } = await s.rpc("get_test_module", { p_run_id: runM1, p_position: 2 });
      rx(error, /module_out_of_order|module_not/) ? ok("module 2 blocked in a 1-1 run") : bad("expected module 2 blocked", error?.message ?? "no error");
    }
    {
      const { data: qm } = await s.rpc("get_test_module", { p_run_id: runM1, p_position: 1 });
      const answers = Object.fromEntries((qm?.questions ?? []).map((q) => [q.id, "A"]));
      const { data, error } = await s.rpc("submit_test_module", { p_run_id: runM1, p_position: 1, p_answers: answers });
      const { data: row } = await svc.from("test_runs").select("status, section_scores, total").eq("id", runM1).single();
      (!error && data?.finished === true && row?.status === "submitted" && row?.section_scores?.["reading-writing"]?.total === 27 && !row?.section_scores?.["math"])
        ? ok("M1 finalizes; scored over 27 RW only", JSON.stringify(row.section_scores))
        : bad("M1 finalize/score", error?.message ?? JSON.stringify(row));
    }

    step("occurrence: Module 2 (?m=2-2) — independent run");
    {
      const { data, error } = await s.rpc("start_test", { p_slug: SLUG, p_first: 2, p_last: 2 });
      runM2 = data?.run_id;
      (!error && runM2 && runM2 !== runM1 && data.current_module === 2 && data.first_position === 2)
        ? ok("a SEPARATE run starting at module 2", runM2) : bad("M2 not a separate run", JSON.stringify({ runM1, got: data?.run_id, cur: data?.current_module, err: error?.message }));
    }
    {
      const { data: qm } = await s.rpc("get_test_module", { p_run_id: runM2, p_position: 2 });
      const answers = Object.fromEntries((qm?.questions ?? []).map((q) => [q.id, "A"]));
      const { data } = await s.rpc("submit_test_module", { p_run_id: runM2, p_position: 2, p_answers: answers });
      const { data: row } = await svc.from("test_runs").select("status, section_scores").eq("id", runM2).single();
      (data?.finished === true && row?.section_scores?.["reading-writing"]?.total === 27)
        ? ok("M2 finalizes independently; its own 27-q score") : bad("M2 finalize", JSON.stringify(row));
    }
    {
      const { count } = await svc.from("test_runs").select("id", { count: "exact", head: true }).eq("user_id", studentId).eq("status", "submitted");
      count === 2 ? ok("two independent submitted runs (M1 + M2)") : bad("expected 2 runs", `got ${count}`);
    }
    {
      // re-open M1 → returns the M1 run (one-attempt per range), not M2
      const { data } = await s.rpc("start_test", { p_slug: SLUG, p_first: 1, p_last: 1 });
      data?.run_id === runM1 ? ok("re-opening Module 1 returns the M1 report (not M2)") : bad("expected M1 run", JSON.stringify({ got: data?.run_id, runM1, runM2 }));
    }
  } finally {
    step("cleanup");
    await cleanup().catch((e) => console.log("  ..    cleanup error", e.message));
    console.log("  ..    disposable student + runs removed (real students untouched)");
  }
  console.log(`\n----------------------------------\nTOTAL: ${pass + fail}  PASS: ${pass}  FAIL: ${fail}\n==================================`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("verify-subset crashed:", e?.message ?? e); process.exit(1); });
