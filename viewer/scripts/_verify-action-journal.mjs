#!/usr/bin/env node
/**
 * _verify-action-journal.mjs
 *
 * Verifies migration 0124 (action journal) end-to-end against Supabase Cloud:
 *
 *   1. Provision a fresh disposable student (service role) + an in_progress
 *      test_run owned by them (inserted directly — no course-scope needed; we
 *      only need a run the RPC will accept).
 *   2. As the STUDENT, log the full action family via test_log_action:
 *      answer_set/change/clear (with from→to meta), flag, eliminate, nav×2.
 *   3. Negative: an out-of-allowlist type is silently dropped (CHECK + RPC
 *      allowlist), and a NON-owner cannot write to someone else's run.
 *   4. As the STUDENT, read get_test_run_timeline and assert every event is
 *      present, ordered by `at`, with meta round-tripping (from/to/choice).
 *   5. Cleanup (best-effort): delete the run + disposable users.
 *
 * One-off harness (consumes disposable users), mirrors clickthrough-*.mjs.
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
  console.error("ERROR: missing env:", missing.join(", "));
  process.exit(2);
}

const SLUG = "dsat-nov-2023";
const TAG = `aj-${Date.now()}`;
const PW = "ActionJournal!" + randomBytes(4).toString("hex");
const studentEmail = `s-${TAG}@gmail.com`;
const otherEmail = `o-${TAG}@gmail.com`;

const service = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
function userClient() {
  return createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

let pass = 0,
  fail = 0;
const ok = (l, e = "") => {
  pass++;
  console.log(`  PASS  ${l}${e ? "  " + e : ""}`);
};
const bad = (l, d = "") => {
  fail++;
  console.log(`  FAIL  ${l}`);
  if (d) console.log(`        ${d}`);
};
const step = (l) => console.log(`\n=== ${l} ===`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createUser(email) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  return data.user.id;
}
async function signIn(email) {
  const c = userClient();
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return c;
}

let runId = null;
let studentUid = null;
let otherUid = null;

async function main() {
  step("Provision student + in_progress run");
  const { data: tests, error: tErr } = await service
    .from("tests")
    .select("id")
    .eq("slug", SLUG)
    .limit(1);
  if (tErr || !tests?.length) throw new Error(`find test '${SLUG}': ${tErr?.message ?? "not found"}`);
  const testId = tests[0].id;

  studentUid = await createUser(studentEmail);
  otherUid = await createUser(otherEmail);
  const { data: run, error: rErr } = await service
    .from("test_runs")
    .insert({ user_id: studentUid, test_id: testId })
    .select("id, status")
    .single();
  if (rErr) throw new Error(`insert test_run: ${rErr.message}`);
  runId = run.id;
  if (run.status === "in_progress") ok("run is in_progress");
  else bad("run is in_progress", `status=${run.status}`);

  const student = await signIn(studentEmail);
  const other = await signIn(otherEmail);

  step("Log the action family (as owner)");
  // Each call its own txn → distinct now(); small sleeps guarantee ordering.
  const calls = [
    ["nav", { p_question: 5 }],
    ["answer_set", { p_question: 5, p_meta: { to: "B" } }],
    ["answer_change", { p_question: 5, p_meta: { from: "B", to: "D" } }],
    ["answer_change", { p_question: 5, p_meta: { from: "D", to: "A" } }],
    ["answer_clear", { p_question: 5, p_meta: { from: "A" } }],
    ["flag", { p_question: 7 }],
    ["eliminate", { p_question: 9, p_meta: { choice: "C" } }],
    ["nav", { p_question: 5 }], // revisit
  ];
  for (const [type, args] of calls) {
    const { error } = await student.rpc("test_log_action", {
      p_run_id: runId,
      p_type: type,
      p_question: args.p_question ?? null,
      p_module: args.p_module ?? null,
      p_meta: args.p_meta ?? null,
    });
    if (error) bad(`test_log_action(${type}) returns void`, error.message);
    await sleep(8);
  }
  ok("logged 8 owner action events (no RPC error)");

  step("Negative cases");
  // Out-of-allowlist type — best-effort no-op (should not error, should not insert).
  const { error: evilErr } = await student.rpc("test_log_action", {
    p_run_id: runId,
    p_type: "evil_inject",
    p_question: 99,
    p_module: null,
    p_meta: null,
  });
  if (evilErr) bad("disallowed type is swallowed (no error)", evilErr.message);
  else ok("disallowed type is swallowed (no error)");

  // Non-owner write — must no-op.
  const { error: otherErr } = await other.rpc("test_log_action", {
    p_run_id: runId,
    p_type: "answer_change",
    p_question: 5,
    p_module: null,
    p_meta: { from: "X", to: "Y" },
  });
  if (otherErr) bad("non-owner write is swallowed (no error)", otherErr.message);
  else ok("non-owner write is swallowed (no error)");

  step("Read timeline (as owner)");
  const { data: tl, error: tlErr } = await student.rpc("get_test_run_timeline", {
    p_run_id: runId,
  });
  if (tlErr) {
    bad("get_test_run_timeline returns rows", tlErr.message);
    return;
  }
  const rows = tl ?? [];

  // Only our 8 events should be present (disallowed + non-owner dropped).
  if (rows.length === 8) ok("exactly 8 events recorded (negatives dropped)");
  else bad("exactly 8 events recorded", `got ${rows.length}: ${rows.map((r) => r.type).join(",")}`);

  // No forged / injected type leaked in.
  if (!rows.some((r) => r.type === "evil_inject")) ok("disallowed type never persisted");
  else bad("disallowed type never persisted", "evil_inject present");

  // Ordered by `at` ASC.
  const ats = rows.map((r) => new Date(r.at).getTime());
  if (ats.every((v, i) => i === 0 || v >= ats[i - 1])) ok("timeline ordered by at ASC");
  else bad("timeline ordered by at ASC", JSON.stringify(ats));

  // Answer chain for Q5 reconstructs B → D → A → cleared.
  const q5 = rows.filter((r) => r.question === 5 && r.type.startsWith("answer_"));
  const chain = q5.map((r) => (r.type === "answer_clear" ? "—" : r.meta?.to));
  if (JSON.stringify(chain) === JSON.stringify(["B", "D", "A", "—"]))
    ok("Q5 answer chain round-trips", chain.join("→"));
  else bad("Q5 answer chain round-trips", `got ${JSON.stringify(chain)}`);

  // from-meta round-trips on a change.
  const firstChange = rows.find((r) => r.type === "answer_change");
  if (firstChange?.meta?.from === "B" && firstChange?.meta?.to === "D")
    ok("answer_change meta {from,to} round-trips");
  else bad("answer_change meta {from,to} round-trips", JSON.stringify(firstChange?.meta));

  // eliminate choice meta.
  const elim = rows.find((r) => r.type === "eliminate");
  if (elim?.question === 9 && elim?.meta?.choice === "C")
    ok("eliminate meta {choice} round-trips");
  else bad("eliminate meta {choice} round-trips", JSON.stringify(elim?.meta));

  // flag + two navs present.
  if (rows.some((r) => r.type === "flag" && r.question === 7)) ok("flag event present");
  else bad("flag event present");
  if (rows.filter((r) => r.type === "nav").length === 2) ok("two nav (revisit) events present");
  else bad("two nav events present", `got ${rows.filter((r) => r.type === "nav").length}`);
}

async function cleanup() {
  try {
    if (runId) await service.from("test_runs").delete().eq("id", runId);
    if (studentUid) await service.auth.admin.deleteUser(studentUid);
    if (otherUid) await service.auth.admin.deleteUser(otherUid);
  } catch (e) {
    console.log(`  ..    cleanup warning: ${e.message}`);
  }
}

main()
  .catch((e) => {
    bad("harness threw", e.message);
  })
  .finally(async () => {
    await cleanup();
    console.log(`\n----------------------------------`);
    console.log(`TOTAL: ${pass + fail}  PASS: ${pass}  FAIL: ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
  });
