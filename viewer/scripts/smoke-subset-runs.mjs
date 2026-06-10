#!/usr/bin/env node
/**
 * smoke-subset-runs.mjs
 *
 * Verifies migration 0156 — the SAME test assigned twice for different module
 * subsets launches INDEPENDENT runs (separate reports), instead of collapsing
 * into one run. Two Modules links: `/test/<slug>?m=1-1` and `?m=2-2`.
 *
 * Checks:
 *   A) start_test(slug, 1, 1) → run A scoped to module 1 (first=1,last=1,current=1)
 *   B) submit M1 → run A finalizes
 *   C) start_test(slug, 2, 2) → a DIFFERENT run B (first=2,last=2,current=2),
 *      NOT run A — this is the bug fix (was returning A's submitted report)
 *   D) submit M2 → run B finalizes; A and B are two distinct submitted runs
 *   E) start_test(slug, 1, 1) again → returns run A (one-attempt per range), not B
 *   F) get_test_module(runB, 1) → module_out_of_order (subset lower-bound gate)
 *   G) start_test(slug, 3, 3) → not_enrolled (no ?m=3-3 link deployed)
 *
 * Requires 0156 applied. Usage from viewer/:
 *   node --env-file-if-exists=../.env scripts/smoke-subset-runs.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY;
const miss = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY"].filter((k) => !process.env[k]);
if (miss.length) { console.error("smoke-subset-runs: missing env:", miss.join(", ")); process.exit(2); }
const TAG = randomBytes(3).toString("hex");
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const userClient = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; console.log(`  FAIL  ${l}`); if (d) console.log(`        ${d}`); };
const step = (l) => console.log(`\n=== ${l} ===`);
const rx = (e, re) => re.test(e?.message ?? "");

async function mkUser(role) {
  const email = `sr-${role}-${TAG}-${randomBytes(2).toString("hex")}@gmail.com`, password = "Sr!" + randomBytes(4).toString("hex");
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${role}: ${error.message}`);
  await svc.from("profiles").update({ role, display_name: `Sr ${role}` }).eq("id", data.user.id);
  return { id: data.user.id, email, password };
}
async function signedIn(u) {
  const c = userClient();
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(`signIn: ${error.message}`);
  return c;
}
function answers(qids, p) { return Object.fromEntries((qids[p] || []).map((id) => [id, "A"])); }

async function main() {
  step("provision (4-module test, 2 subset links: ?m=1-1 and ?m=2-2)");
  const teacher = await mkUser("teacher");
  const student = await mkUser("student");
  const slug = `sr-test-${TAG}`;
  const { data: test } = await svc.from("tests").insert({ slug, title: `Subset ${TAG}`, total_questions: 4 }).select("id").single();
  const sections = ["reading-writing", "reading-writing", "math", "math"];
  const qids = {};
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
  const { data: course } = await svc.from("courses").insert({ name: `SR ${TAG}`, teacher_id: teacher.id }).select("id").single();
  const { data: mod } = await svc.from("course_modules").insert({ course_id: course.id, name: "M", position: 0 }).select("id").single();
  await svc.from("module_items").insert([
    { module_id: mod.id, item_type: "link", url: `/test/${slug}?m=1-1`, title: "Module 1", position: 0 },
    { module_id: mod.id, item_type: "link", url: `/test/${slug}?m=2-2`, title: "Module 2", position: 1 },
  ]);
  await svc.from("course_memberships").insert({ course_id: course.id, student_id: student.id });

  const cleanup = async () => {
    await svc.from("test_runs").delete().eq("test_id", test.id);
    await svc.from("module_items").delete().eq("module_id", mod.id);
    await svc.from("course_modules").delete().eq("id", mod.id);
    await svc.from("course_memberships").delete().eq("course_id", course.id);
    await svc.from("courses").delete().eq("id", course.id);
    await svc.from("tests").delete().eq("id", test.id);
    for (const u of [teacher, student]) await svc.auth.admin.deleteUser(u.id);
  };

  try {
    const s = await signedIn(student);
    let runA, runB;
    step("A: start module-1 subset");
    {
      const { data, error } = await s.rpc("start_test", { p_slug: slug, p_first: 1, p_last: 1 });
      runA = data?.run_id;
      (!error && runA && data.current_module === 1 && data.first_position === 1 && data.last_position === 1)
        ? ok("module-1 run starts at M1 (1-1)") : bad("start 1-1", error?.message ?? JSON.stringify(data));
    }
    step("B: submit M1 → run A finalizes");
    {
      const { data } = await s.rpc("submit_test_module", { p_run_id: runA, p_position: 1, p_answers: answers(qids, 1) });
      data?.finished === true ? ok("M1 finalizes run A") : bad("submit M1", JSON.stringify(data));
    }
    step("C: start module-2 subset → a DIFFERENT run (the fix)");
    {
      const { data, error } = await s.rpc("start_test", { p_slug: slug, p_first: 2, p_last: 2 });
      runB = data?.run_id;
      (!error && runB && runB !== runA && data.status === "in_progress" && data.current_module === 2 && data.first_position === 2)
        ? ok("module-2 is a separate in-progress run at M2", runB)
        : bad("DID NOT get a separate M2 run", JSON.stringify({ runA, got: data?.run_id, status: data?.status, cur: data?.current_module, err: error?.message }));
    }
    step("D: submit M2 → run B finalizes; A and B distinct");
    {
      const { data } = await s.rpc("submit_test_module", { p_run_id: runB, p_position: 2, p_answers: answers(qids, 2) });
      const { count } = await svc.from("test_runs").select("id", { count: "exact", head: true }).eq("test_id", test.id).eq("user_id", student.id).eq("status", "submitted");
      (data?.finished === true && count === 2) ? ok("two distinct submitted runs (M1 + M2)") : bad("expected 2 submitted runs", `finished=${data?.finished} count=${count}`);
    }
    step("E: re-open module-1 → returns run A (one-attempt per range), not B");
    {
      const { data } = await s.rpc("start_test", { p_slug: slug, p_first: 1, p_last: 1 });
      data?.run_id === runA ? ok("module-1 re-open returns run A's report") : bad("expected run A", JSON.stringify({ got: data?.run_id, runA, runB }));
    }
    step("F: subset lower-bound gate");
    {
      // runB is submitted now; start a fresh student to test the gate on an in-progress 2-2 run
      const student2 = await mkUser("student");
      await svc.from("course_memberships").insert({ course_id: course.id, student_id: student2.id });
      const s2 = await signedIn(student2);
      const { data: st } = await s2.rpc("start_test", { p_slug: slug, p_first: 2, p_last: 2 });
      const { error } = await s2.rpc("get_test_module", { p_run_id: st?.run_id, p_position: 1 });
      rx(error, /module_out_of_order/) ? ok("module 1 blocked in a 2-2 run (lower-bound)") : bad("expected module_out_of_order", error?.message ?? "no error");
      await svc.auth.admin.deleteUser(student2.id);
    }
    step("G: undeployed range rejected");
    {
      const { error } = await s.rpc("start_test", { p_slug: slug, p_first: 3, p_last: 3 });
      rx(error, /not_enrolled/) ? ok("no ?m=3-3 link → not_enrolled") : bad("expected not_enrolled", error?.message ?? "no error");
    }
    step("H: teacher roster scoped per occurrence (course + range)");
    {
      const tc = await signedIn(teacher);
      const r1 = await tc.rpc("test_roster_status", { p_slug: slug, p_first: 1, p_last: 1 });
      const r2 = await tc.rpc("test_roster_status", { p_slug: slug, p_first: 2, p_last: 2 });
      const row1 = (r1.data ?? []).find((x) => x.student_id === student.id);
      const row2 = (r2.data ?? []).find((x) => x.student_id === student.id);
      (!r1.error && !r2.error && row1?.run_id === runA && row2?.run_id === runB && runA !== runB)
        ? ok("M1 roster shows the M1 run; M2 roster shows the M2 run")
        : bad("roster not scoped per occurrence", JSON.stringify({ r1: row1?.run_id, runA, r2: row2?.run_id, runB, e1: r1.error?.message, e2: r2.error?.message }));
    }
  } finally {
    step("cleanup");
    await cleanup().catch((e) => console.log("  ..    cleanup error", e.message));
  }
  console.log(`\n----------------------------------\nTOTAL: ${pass + fail}  PASS: ${pass}  FAIL: ${fail}\n==================================`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("smoke-subset-runs crashed:", e?.message ?? e); process.exit(1); });
