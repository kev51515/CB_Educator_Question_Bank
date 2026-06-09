#!/usr/bin/env node
/**
 * _verify-run-replay.mjs
 *
 * Verifies migration 0127 (get_test_run_replay) against Supabase Cloud:
 * the replay RPC returns run meta + module content + events + final state,
 * is readable by the OWNER and an ADMIN, and rejects an unrelated student.
 *
 *   1. Provision student + admin + a disposable "other" student.
 *   2. Student in_progress run; log a few actions (nav/answer/highlight/dwell).
 *   3. Owner get_test_run_replay → assert shape (run/modules+content/events/final).
 *   4. Admin get_test_run_replay → success.
 *   5. Unrelated student → not_authorized.
 *   6. Cleanup (best-effort).
 *
 * One-off harness; mirrors _verify-action-journal.mjs. (The teacher-of-test
 * path reuses is_teacher_of_test, already covered by the 0108 proctor RPCs.)
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const miss = [];
if (!URL) miss.push("SUPABASE_URL");
if (!ANON) miss.push("SUPABASE_ANON_KEY");
if (!SERVICE) miss.push("SUPABASE_SERVICE_KEY");
if (miss.length) {
  console.error("ERROR: missing env:", miss.join(", "));
  process.exit(2);
}

const SLUG = "dsat-nov-2023";
const TAG = `rr-${Date.now()}`;
const PW = "RunReplay!" + randomBytes(4).toString("hex");
const studentEmail = `s-${TAG}@gmail.com`;
const adminEmail = `a-${TAG}@gmail.com`;
const otherEmail = `o-${TAG}@gmail.com`;

const service = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const uc = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

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

async function mkUser(email, role) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  if (role) {
    const { error: e2 } = await service.from("profiles").update({ role }).eq("id", data.user.id);
    if (e2) throw new Error(`promote(${email}): ${e2.message}`);
  }
  return data.user.id;
}
async function signIn(email) {
  const c = uc();
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return c;
}

let runId = null;
const uids = [];

async function main() {
  step("Provision");
  const { data: tests, error: tErr } = await service
    .from("tests").select("id").eq("slug", SLUG).limit(1);
  if (tErr || !tests?.length) throw new Error(`find test: ${tErr?.message ?? "not found"}`);

  const studentUid = await mkUser(studentEmail);
  const adminUid = await mkUser(adminEmail, "admin");
  const otherUid = await mkUser(otherEmail);
  uids.push(studentUid, adminUid, otherUid);

  const { data: run, error: rErr } = await service
    .from("test_runs").insert({ user_id: studentUid, test_id: tests[0].id }).select("id").single();
  if (rErr) throw new Error(`insert run: ${rErr.message}`);
  runId = run.id;
  ok("run provisioned");

  const student = await signIn(studentEmail);
  for (const [type, args] of [
    ["nav", { p_question: 1 }],
    ["answer_set", { p_question: 1, p_meta: { to: "B" } }],
    ["highlight_add", { p_question: 1, p_meta: { field: "stem", start: 0, end: 5, color: "blue", text: "Which" } }],
    ["dwell", { p_question: 1, p_duration_seconds: 33 }],
  ]) {
    await student.rpc("test_log_action", {
      p_run_id: runId,
      p_type: type,
      p_question: args.p_question ?? null,
      p_module: 1,
      p_meta: args.p_meta ?? null,
      p_duration_seconds: args.p_duration_seconds ?? null,
    });
  }
  ok("logged sample actions");

  step("Owner reads replay");
  const { data: rep, error: repErr } = await student.rpc("get_test_run_replay", { p_run_id: runId });
  if (repErr) {
    bad("owner get_test_run_replay", repErr.message);
  } else {
    if (rep?.run?.id === runId) ok("run meta present");
    else bad("run meta present", JSON.stringify(rep?.run));
    if (Array.isArray(rep?.modules) && rep.modules.length > 0) ok("modules present", `${rep.modules.length} modules`);
    else bad("modules present");
    const q = rep?.modules?.[0]?.questions?.[0];
    if (q?.id && q?.stem != null) ok("module content (questions w/ stem) present");
    else bad("module content present", JSON.stringify(q)?.slice(0, 120));
    if (Array.isArray(rep?.events) && rep.events.length === 4) ok("events present", `${rep.events.length}`);
    else bad("events present (4)", `got ${rep?.events?.length}`);
    if (rep?.final && typeof rep.final === "object") ok("final state present");
    else bad("final state present");
    if (rep?.run?.proctoring_level) ok("proctoring_level present", rep.run.proctoring_level);
    else bad("proctoring_level present");
  }

  step("Admin reads replay");
  const admin = await signIn(adminEmail);
  const { data: aRep, error: aErr } = await admin.rpc("get_test_run_replay", { p_run_id: runId });
  if (!aErr && aRep?.run?.id === runId) ok("admin can read any replay");
  else bad("admin can read any replay", aErr?.message);

  step("Unrelated student rejected");
  const other = await signIn(otherEmail);
  const { error: oErr } = await other.rpc("get_test_run_replay", { p_run_id: runId });
  if (oErr && /not_authorized/.test(oErr.message)) ok("unrelated student → not_authorized");
  else bad("unrelated student → not_authorized", oErr?.message ?? "no error");
}

async function cleanup() {
  try {
    if (runId) await service.from("test_runs").delete().eq("id", runId);
    for (const u of uids) await service.auth.admin.deleteUser(u);
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
