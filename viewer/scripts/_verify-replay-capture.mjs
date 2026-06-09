#!/usr/bin/env node
/**
 * _verify-replay-capture.mjs
 *
 * Verifies migration 0126 (replay capture) end-to-end against Supabase Cloud:
 * the new action types (highlights per color, notes, calculator, dwell) log,
 * round-trip their meta, and dwell lands in the typed duration_seconds column.
 *
 *   1. Provision a fresh disposable student + an in_progress test_run.
 *   2. As the STUDENT, log: highlight_add (field/start/end/color/text),
 *      highlight_remove, highlight_clear, note_edit (text), calc_open,
 *      calc_close, dwell (durationSeconds).
 *   3. Read get_test_run_timeline; assert each event + meta + dwell seconds.
 *   4. Cleanup (best-effort).
 *
 * One-off harness; mirrors _verify-action-journal.mjs.
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
const TAG = `rc-${Date.now()}`;
const PW = "ReplayCap!" + randomBytes(4).toString("hex");
const studentEmail = `s-${TAG}@gmail.com`;

const service = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const userClient = () =>
  createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

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

let runId = null;
let studentUid = null;

async function main() {
  step("Provision student + in_progress run");
  const { data: tests, error: tErr } = await service
    .from("tests")
    .select("id")
    .eq("slug", SLUG)
    .limit(1);
  if (tErr || !tests?.length) throw new Error(`find test '${SLUG}': ${tErr?.message ?? "not found"}`);

  const { data: u, error: uErr } = await service.auth.admin.createUser({
    email: studentEmail,
    password: PW,
    email_confirm: true,
  });
  if (uErr) throw new Error(`createUser: ${uErr.message}`);
  studentUid = u.user.id;

  const { data: run, error: rErr } = await service
    .from("test_runs")
    .insert({ user_id: studentUid, test_id: tests[0].id })
    .select("id")
    .single();
  if (rErr) throw new Error(`insert test_run: ${rErr.message}`);
  runId = run.id;
  ok("run provisioned");

  const student = userClient();
  const { error: siErr } = await student.auth.signInWithPassword({
    email: studentEmail,
    password: PW,
  });
  if (siErr) throw new Error(`signIn: ${siErr.message}`);

  step("Log the replay-capture family");
  const calls = [
    ["highlight_add", { p_question: 3, p_meta: { field: "passage", start: 10, end: 22, color: "green", text: "not all of" } }],
    ["highlight_add", { p_question: 3, p_meta: { field: "stem", start: 0, end: 8, color: "yellow", text: "Which of" } }],
    ["highlight_remove", { p_question: 3, p_meta: { field: "passage", offset: 12 } }],
    ["highlight_clear", { p_question: 3 }],
    ["note_edit", { p_question: 4, p_meta: { text: "tricky vocab here" } }],
    ["calc_open", { p_question: 30 }],
    ["calc_close", { p_question: 30 }],
    ["dwell", { p_question: 3, p_duration_seconds: 47 }],
    ["dwell", { p_question: 4, p_duration_seconds: 12 }],
  ];
  for (const [type, args] of calls) {
    const { error } = await student.rpc("test_log_action", {
      p_run_id: runId,
      p_type: type,
      p_question: args.p_question ?? null,
      p_module: args.p_module ?? null,
      p_meta: args.p_meta ?? null,
      p_duration_seconds: args.p_duration_seconds ?? null,
    });
    if (error) bad(`test_log_action(${type})`, error.message);
    await sleep(8);
  }
  ok("logged 9 replay-capture events");

  step("Read timeline + assert");
  const { data: tl, error: tlErr } = await student.rpc("get_test_run_timeline", {
    p_run_id: runId,
  });
  if (tlErr) {
    bad("get_test_run_timeline", tlErr.message);
    return;
  }
  const rows = tl ?? [];
  if (rows.length === 9) ok("9 events recorded");
  else bad("9 events recorded", `got ${rows.length}: ${rows.map((r) => r.type).join(",")}`);

  const hadd = rows.filter((r) => r.type === "highlight_add");
  if (hadd.length === 2) ok("2 highlight_add events");
  else bad("2 highlight_add events", `got ${hadd.length}`);

  const green = hadd.find((r) => r.meta?.color === "green");
  if (green?.meta?.field === "passage" && green?.meta?.start === 10 && green?.meta?.end === 22 && green?.meta?.text === "not all of")
    ok("highlight_add meta {field,start,end,color,text} round-trips");
  else bad("highlight_add meta round-trips", JSON.stringify(green?.meta));

  const hrem = rows.find((r) => r.type === "highlight_remove");
  if (hrem?.meta?.field === "passage" && hrem?.meta?.offset === 12)
    ok("highlight_remove meta {field,offset} round-trips");
  else bad("highlight_remove meta round-trips", JSON.stringify(hrem?.meta));

  if (rows.some((r) => r.type === "highlight_clear")) ok("highlight_clear present");
  else bad("highlight_clear present");

  const note = rows.find((r) => r.type === "note_edit");
  if (note?.meta?.text === "tricky vocab here") ok("note_edit text round-trips");
  else bad("note_edit text round-trips", JSON.stringify(note?.meta));

  if (rows.some((r) => r.type === "calc_open") && rows.some((r) => r.type === "calc_close"))
    ok("calc_open + calc_close present");
  else bad("calc_open + calc_close present");

  const dwell3 = rows.find((r) => r.type === "dwell" && r.question === 3);
  const dwell4 = rows.find((r) => r.type === "dwell" && r.question === 4);
  if (dwell3?.duration_seconds === 47 && dwell4?.duration_seconds === 12)
    ok("dwell seconds land in duration_seconds column", "Q3=47s Q4=12s");
  else
    bad("dwell duration_seconds round-trips", `Q3=${dwell3?.duration_seconds} Q4=${dwell4?.duration_seconds}`);
}

async function cleanup() {
  try {
    if (runId) await service.from("test_runs").delete().eq("id", runId);
    if (studentUid) await service.auth.admin.deleteUser(studentUid);
  } catch (e) {
    console.log(`  ..    cleanup warning: ${e.message}`);
  }
}

main()
  .catch((e) => bad("harness threw", e.message))
  .finally(async () => {
    await cleanup();
    console.log(`\n----------------------------------`);
    console.log(`TOTAL: ${pass + fail}  PASS: ${pass}  FAIL: ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
  });
