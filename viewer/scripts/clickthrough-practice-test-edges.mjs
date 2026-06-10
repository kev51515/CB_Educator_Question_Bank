#!/usr/bin/env node
/**
 * clickthrough-practice-test-edges.mjs
 *
 * Edge cases the happy-path harness didn't cover:
 *   • get_test_module(position > current_module) → module_out_of_order
 *   • submit_test_module(position < current_module) after advance → module_out_of_order
 *   • Double-submit same module → run_already_submitted or module_out_of_order
 *   • get_test_module on a submitted run → run_already_submitted
 *   • save_test_progress on a submitted run → run_already_submitted
 *   • get_test_result with bogus run_id → run_not_found
 *
 * Fresh disposable student per run.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !ANON || !SERVICE) { console.error("missing env"); process.exit(2); }

const SLUG = "dsat-nov-2023";
const TS = Date.now();
const PW = "Edge!" + randomBytes(4).toString("hex");
const email = `e-${TS}@gmail.com`;

const service = createClient(URL, SERVICE,
  { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
function expectErr(rpc, code) {
  if (rpc.error && rpc.error.message.includes(code)) { pass++; console.log(`  PASS  ${code}`); }
  else { fail++; console.log(`  FAIL  expected ${code}, got ${rpc.error?.message || "<ok>"}`); }
}

async function main() {
  const { data: cu, error: cuErr } = await service.auth.admin.createUser(
    { email, password: PW, email_confirm: true });
  if (cuErr) throw new Error(cuErr.message);

  const client = createClient(URL, ANON,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await client.auth.signInWithPassword({ email, password: PW });

  // 0141 enrollment gate: a non-staff caller must be enrolled in a course that
  // links this test. Build a disposable course + Modules link + enrolment.
  const { data: course } = await service.from("courses")
    .insert({ name: `Edge ${TS}`, teacher_id: cu.user.id }).select("id").single();
  const { data: mod } = await service.from("course_modules")
    .insert({ course_id: course.id, name: "M", position: 0 }).select("id").single();
  await service.from("module_items").insert(
    { module_id: mod.id, item_type: "link", url: `/test/${SLUG}`, title: "Edge", position: 0 });
  await service.from("course_memberships").insert({ course_id: course.id, student_id: cu.user.id });

  const { data: start } = await client.rpc("start_test", { p_slug: SLUG });
  const runId = start.run_id;
  console.log(`run=${runId} modules=${start.modules.length}`);

  console.log("\n--- bogus run_id ---");
  // Use a random UUID instead of "00000000..." (all-zero is a valid UUID some
  // ORMs treat as "the null UUID"; a random one is unambiguously not-found).
  const bogus = "11111111-1111-1111-1111-111111111111";
  expectErr(await client.rpc("get_test_result", { p_run_id: bogus }), "run_not_found");
  expectErr(await client.rpc("get_test_module",
    { p_run_id: bogus, p_position: 1 }), "run_not_found");

  console.log("\n--- module_out_of_order: ask for module 2 while on 1 ---");
  expectErr(await client.rpc("get_test_module",
    { p_run_id: runId, p_position: 2 }), "module_out_of_order");
  expectErr(await client.rpc("submit_test_module",
    { p_run_id: runId, p_position: 2, p_answers: {} }), "module_out_of_order");

  console.log("\n--- walk module 1, then submit module 1 AGAIN ---");
  const { data: m1 } = await client.rpc("get_test_module",
    { p_run_id: runId, p_position: 1 });
  const answers = {};
  m1.questions.forEach((q) => { answers[q.id] = q.type === "grid" ? "1" : "A"; });
  const sub = await client.rpc("submit_test_module",
    { p_run_id: runId, p_position: 1, p_answers: answers });
  if (sub.error) { console.log(`  FAIL initial submit: ${sub.error.message}`); fail++; }
  else { console.log(`  PASS initial submit advanced to ${sub.data?.next_module}`); pass++; }

  // Now we're on module 2 — re-submitting module 1 should be module_out_of_order.
  expectErr(await client.rpc("submit_test_module",
    { p_run_id: runId, p_position: 1, p_answers: answers }), "module_out_of_order");
  // get_test_module on the just-finished module is allowed (position <= current),
  // but its saved_answers/seconds_remaining should not be writable. Just verify
  // it doesn't blow up:
  const m1again = await client.rpc("get_test_module",
    { p_run_id: runId, p_position: 1 });
  if (m1again.error) { console.log(`  FAIL get_test_module replay: ${m1again.error.message}`); fail++; }
  else { console.log(`  PASS get_test_module on completed module is readable`); pass++; }

  console.log("\n--- finish remaining modules quickly to test submitted-state errors ---");
  for (let p = 2; p <= start.modules.length; p++) {
    const { data: mm } = await client.rpc("get_test_module",
      { p_run_id: runId, p_position: p });
    const aa = {};
    mm.questions.forEach((q) => { aa[q.id] = q.type === "grid" ? "1" : "A"; });
    await client.rpc("submit_test_module",
      { p_run_id: runId, p_position: p, p_answers: aa });
  }

  console.log("\n--- post-submit: writes must refuse, get_test_module must refuse ---");
  expectErr(await client.rpc("get_test_module",
    { p_run_id: runId, p_position: 1 }), "run_already_submitted");
  expectErr(await client.rpc("save_test_progress",
    { p_run_id: runId, p_position: 1, p_answers: {} }), "run_already_submitted");
  expectErr(await client.rpc("submit_test_module",
    { p_run_id: runId, p_position: 1, p_answers: {} }), "run_already_submitted");

  await service.from("test_runs").delete().eq("user_id", cu.user.id);
  await service.from("module_items").delete().eq("module_id", mod.id);
  await service.from("course_modules").delete().eq("id", mod.id);
  await service.from("course_memberships").delete().eq("course_id", course.id);
  await service.from("courses").delete().eq("id", course.id);
  await service.auth.admin.deleteUser(cu.user.id).catch(() => {});

  console.log(`\n${pass} pass / ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
