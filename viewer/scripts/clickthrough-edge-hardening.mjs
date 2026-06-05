#!/usr/bin/env node
/**
 * clickthrough-edge-hardening.mjs
 *
 * Adversarial edge-case suite for the invite → claim → take-test pipeline,
 * focused on HARDENING (access control, abuse, input validation, races).
 * Complements clickthrough-practice-test-edges.mjs (which covers the linear
 * out-of-order / double-submit / post-submit lockout path).
 *
 * Groups:
 *   A. Cross-tenant access control — a 2nd student must never read or mutate
 *      another student's run (get_test_module / submit / save / get_result).
 *   B. Invite/claim abuse — bad code, bad email, weak password, and a 2nd claim
 *      of an already-claimed seat must NOT silently take it over.
 *   C. Proctor authorization (0104) — a non-admin teacher is rejected from
 *      release / retake / reset.
 *   D. Retake idempotency (0090/0104) — a 2nd un-consumed grant → retake_already_granted.
 *   E. Input validation / integrity — garbage question ids are ignored, invalid
 *      answer values grade as wrong (no crash), bad slug → test_not_found.
 *   F. Concurrency — two parallel submits of the same module must not double-
 *      count or double-advance; two parallel start_test must mint ONE run.
 *   G. RLS direct-table bypass — bypassing the RPCs and hitting tables directly
 *      via PostgREST, a student must not read another's run/answers/email, nor
 *      the answer key (test_questions.correct_answer).
 *
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY (root .env).
 * Self-cleans all disposable accounts + course.
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
if (missing.length) { console.error("ERROR: missing env:", missing.join(", ")); process.exit(2); }

const SLUG = "dsat-nov-2023";
const TS = Date.now();
const TAG = `edge-${TS}`;
const PW = "Hard!" + randomBytes(4).toString("hex");

const service = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
function userClient() { return createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } }); }

// ---------- Logging ----------
const findings = [];
let pass = 0, fail = 0;
function ok(label, extra = "") { pass++; console.log(`  PASS  ${label}${extra ? "  " + extra : ""}`); }
function bad(label, detail) { fail++; findings.push({ label, detail }); console.log(`  FAIL  ${label}`); if (detail) console.log(`        ${detail}`); }
function step(label) { console.log(`\n=== ${label} ===`); }
function info(label, detail = "") { console.log(`  ..    ${label}${detail ? "  " + detail : ""}`); }

// Assert an RPC raised an error whose message contains `code`.
function expectErr(label, rpc, code) {
  if (rpc.error && rpc.error.message.includes(code)) ok(`${label} → ${code}`);
  else bad(label, `expected '${code}', got ${rpc.error ? `'${rpc.error.message}'` : "<no error / success>"}`);
}
function expectOk(label, rpc) {
  if (rpc.error) bad(label, rpc.error.message);
  else ok(label);
}

const createdUsers = [];
let courseId = null;
let answerKey = new Map();

async function loadAnswerKey() {
  const { data: test } = await service.from("tests").select("id").eq("slug", SLUG).single();
  const { data: mods } = await service.from("test_modules").select("id").eq("test_id", test.id);
  const { data: qs } = await service.from("test_questions")
    .select("id,type,correct_answer,accepted").in("module_id", mods.map((m) => m.id));
  for (const q of qs) answerKey.set(q.id, q);
}
function correctFor(q) {
  const k = answerKey.get(q.id);
  if (k?.correct_answer) return String(k.correct_answer);
  return q.type === "grid" ? "1" : "A";
}

async function invite(teacherClient, name) {
  const { data, error } = await teacherClient.rpc("admin_create_student", {
    p_course_id: courseId, p_display_name: name, p_password: "temp-" + randomBytes(3).toString("hex"),
  });
  if (error) throw new Error(`invite ${name}: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  createdUsers.push(row.student_id);
  return { name, seatId: row.student_id, code: row.login_code };
}

async function claimAndSignIn(seat, suffix) {
  const email = `s-${suffix}-${TAG}@gmail.com`;
  const pw = "Claim!" + randomBytes(3).toString("hex");
  const anon = userClient();
  const a = await anon.auth.signInAnonymously();
  if (a.error) throw new Error(`anon: ${a.error.message}`);
  createdUsers.push(a.data.user.id);
  const claim = await anon.rpc("claim_student_seat", { p_code: seat.code, p_email: email, p_password: pw });
  if (claim.error) throw new Error(`claim ${seat.name}: ${claim.error.message}`);
  const c = userClient();
  const si = await c.auth.signInWithPassword({ email, password: pw });
  if (si.error) throw new Error(`signin ${seat.name}: ${si.error.message}`);
  return { client: c, email, pw, seat };
}

async function main() {
  console.log(`Edge-hardening vs ${URL}`);
  console.log(`tag=${TAG} slug=${SLUG}\n`);
  await loadAnswerKey();
  info("answer key", `${answerKey.size} questions`);

  // ---- Bootstrap admin teacher + non-admin teacher + course ----
  step("Bootstrap");
  const adminEmail = `admin-${TAG}@gmail.com`;
  const { data: ac, error: acErr } = await service.auth.admin.createUser({ email: adminEmail, password: PW, email_confirm: true });
  if (acErr) throw new Error(acErr.message);
  const adminId = ac.user.id; createdUsers.push(adminId);
  await service.from("profiles").update({ role: "admin" }).eq("id", adminId);
  const adminClient = userClient();
  await adminClient.auth.signInWithPassword({ email: adminEmail, password: PW });
  info("admin", adminEmail);

  const teacherEmail = `teacher-${TAG}@gmail.com`;
  const { data: tc2, error: tc2Err } = await service.auth.admin.createUser({ email: teacherEmail, password: PW, email_confirm: true });
  if (tc2Err) throw new Error(tc2Err.message);
  const teacherId = tc2.user.id; createdUsers.push(teacherId);
  await service.from("profiles").update({ role: "teacher" }).eq("id", teacherId);
  const teacherClient = userClient();
  await teacherClient.auth.signInWithPassword({ email: teacherEmail, password: PW });
  info("non-admin teacher", teacherEmail);

  const { data: course } = await service.from("courses")
    .insert({ teacher_id: adminId, name: `Edge ${TS}` }).select("id, short_code").single();
  courseId = course.id;
  const { data: modRow } = await service.from("course_modules")
    .insert({ course_id: courseId, name: "Tests", position: 1 }).select("id").single();
  await service.from("module_items").insert({ module_id: modRow.id, item_type: "link", title: "T", url: `/test/${SLUG}`, position: 1 });
  info("course", `${courseId.slice(0, 8)} short=${course.short_code}`);

  // ---- Invite seats (admin acts as the inviter) ----
  const sVictim = await invite(adminClient, "Victim");
  const sAttacker = await invite(adminClient, "Attacker");
  const sValidator = await invite(adminClient, "Validator");
  const sDup = await invite(adminClient, "Dup");
  ok("invited 4 seats", `${sVictim.code}, ${sAttacker.code}, ${sValidator.code}, ${sDup.code}`);

  // =====================================================================
  step("B. Invite/claim abuse");
  // Bad code → seat_not_found
  {
    const anon = userClient(); const a = await anon.auth.signInAnonymously(); createdUsers.push(a.data.user.id);
    expectErr("claim invalid code", await anon.rpc("claim_student_seat",
      { p_code: "ZZZZZZ-99", p_email: `x-${TAG}@gmail.com`, p_password: "Valid123" }), "seat_not_found");
  }
  // Bad email → invalid_email
  {
    const anon = userClient(); const a = await anon.auth.signInAnonymously(); createdUsers.push(a.data.user.id);
    expectErr("claim invalid email", await anon.rpc("claim_student_seat",
      { p_code: sDup.code, p_email: "not-an-email", p_password: "Valid123" }), "invalid_email");
  }
  // Weak password → weak_password
  {
    const anon = userClient(); const a = await anon.auth.signInAnonymously(); createdUsers.push(a.data.user.id);
    expectErr("claim weak password", await anon.rpc("claim_student_seat",
      { p_code: sDup.code, p_email: `dup-${TAG}@gmail.com`, p_password: "123" }), "weak_password");
  }
  // First valid claim of Dup → claimed; second claim (different email) → pending (no takeover)
  {
    const dupEmail = `dup-${TAG}@gmail.com`, dupPw = "DupPass1";
    const anon1 = userClient(); const a1 = await anon1.auth.signInAnonymously(); createdUsers.push(a1.data.user.id);
    const c1 = await anon1.rpc("claim_student_seat", { p_code: sDup.code, p_email: dupEmail, p_password: dupPw });
    const r1 = Array.isArray(c1.data) ? c1.data[0] : c1.data;
    if (c1.error || r1?.status !== "claimed") bad("Dup first claim → claimed", c1.error?.message || JSON.stringify(r1));
    else ok("Dup first claim → claimed");

    const anon2 = userClient(); const a2 = await anon2.auth.signInAnonymously(); createdUsers.push(a2.data.user.id);
    const c2 = await anon2.rpc("claim_student_seat", { p_code: sDup.code, p_email: `dup2-${TAG}@gmail.com`, p_password: "Dup2Pass1" });
    const r2 = Array.isArray(c2.data) ? c2.data[0] : c2.data;
    if (c2.error || r2?.status !== "pending") bad("Dup 2nd claim → pending (no takeover)", c2.error?.message || JSON.stringify(r2));
    else ok("Dup 2nd claim → pending (no silent takeover)");
    // Original credentials must still work.
    const probe = userClient();
    const reSign = await probe.auth.signInWithPassword({ email: dupEmail, password: dupPw });
    if (reSign.error) bad("Dup original login still valid after pending request", reSign.error.message);
    else ok("Dup original login intact through pending request");
  }

  // ---- Claim the three test-taking seats ----
  const victim = await claimAndSignIn(sVictim, "victim");
  const attacker = await claimAndSignIn(sAttacker, "attacker");
  const validator = await claimAndSignIn(sValidator, "validator");

  // Victim starts a run and stays mid-test (cross-tenant target).
  const vStart = await victim.client.rpc("start_test", { p_slug: SLUG });
  if (vStart.error) throw new Error(`victim start: ${vStart.error.message}`);
  const victimRun = vStart.data.run_id;
  info("victim run", `${victimRun.slice(0, 8)} (in-progress on module 1)`);

  // =====================================================================
  step("A. Cross-tenant access control (attacker vs victim's run)");
  expectErr("attacker get_test_module(victim run)",
    await attacker.client.rpc("get_test_module", { p_run_id: victimRun, p_position: 1 }), "not_authorized");
  expectErr("attacker submit_test_module(victim run)",
    await attacker.client.rpc("submit_test_module", { p_run_id: victimRun, p_position: 1, p_answers: {} }), "not_authorized");
  expectErr("attacker save_test_progress(victim run)",
    await attacker.client.rpc("save_test_progress", { p_run_id: victimRun, p_position: 1, p_answers: {}, p_eliminated: {} }), "not_authorized");
  // Victim's result, once released, must NOT be readable by the attacker.
  // (First finish victim quickly so a result exists.)
  await walkToFinish(victim.client, victimRun, "victim", "correct");
  expectOk("admin release victim result", await adminClient.rpc("release_test_results", { p_run_id: victimRun, p_released: true }));
  const stolen = await attacker.client.rpc("get_test_result", { p_run_id: victimRun });
  if (stolen.error && (stolen.error.message.includes("not_authorized") || stolen.error.message.includes("run_not_found"))) {
    ok("attacker get_test_result(victim run) blocked", stolen.error.message.split("\n")[0]);
  } else if (stolen.error) {
    bad("attacker get_test_result(victim run)", `unexpected error: ${stolen.error.message}`);
  } else {
    bad("attacker get_test_result(victim run)", "LEAK — attacker read victim's released result");
  }

  // =====================================================================
  step("C. Proctor authorization — non-admin teacher rejected (0104)");
  expectErr("teacher release_test_results",
    await teacherClient.rpc("release_test_results", { p_run_id: victimRun, p_released: false }), "not_authorized");
  expectErr("teacher allow_test_retake",
    await teacherClient.rpc("allow_test_retake", { p_student_id: victim.seat.seatId, p_slug: SLUG }), "not_authorized");
  expectErr("teacher reset_test_attempt",
    await teacherClient.rpc("reset_test_attempt", { p_student_id: victim.seat.seatId, p_slug: SLUG }), "not_authorized");

  // =====================================================================
  step("D. Retake idempotency (admin) — 2nd un-consumed grant rejected");
  expectOk("admin allow_test_retake (1st)",
    await adminClient.rpc("allow_test_retake", { p_student_id: victim.seat.seatId, p_slug: SLUG }));
  expectErr("admin allow_test_retake (2nd, un-consumed)",
    await adminClient.rpc("allow_test_retake", { p_student_id: victim.seat.seatId, p_slug: SLUG }), "retake_already_granted");

  // =====================================================================
  step("E. Input validation / integrity");
  // Bad slug
  expectErr("start_test bad slug", await validator.client.rpc("start_test", { p_slug: "no-such-test-xyz" }), "test_not_found");
  // Real run for validator
  const valStart = await validator.client.rpc("start_test", { p_slug: SLUG });
  const valRun = valStart.data.run_id;
  // Module 1: submit with garbage qids mixed in + invalid answer values.
  const gm1 = await validator.client.rpc("get_test_module", { p_run_id: valRun, p_position: 1 });
  const ans1 = {};
  gm1.data.questions.forEach((q, i) => {
    // alternate: valid wrong, invalid letter, invalid grid value
    ans1[q.id] = i % 3 === 0 ? "Z" : (q.type === "grid" ? "abc" : "A");
  });
  ans1["deadbeef-0000-0000-0000-000000000000"] = "A"; // garbage qid not in module
  ans1["not-even-a-uuid"] = "Q";                       // garbage key
  const vSub1 = await validator.client.rpc("submit_test_module", { p_run_id: valRun, p_position: 1, p_answers: ans1 });
  if (vSub1.error) {
    bad("submit with garbage qids + invalid answers", vSub1.error.message);
  } else if (vSub1.data?.next_module !== 2) {
    bad("garbage-id submit still advances", `next_module=${vSub1.data?.next_module}`);
  } else {
    ok("submit ignores garbage qids + tolerates invalid answers (advanced to module 2)");
  }
  // Confirm the DB only stored the module's real questions (no garbage rows).
  const { count: storedM1 } = await service.from("test_run_answers")
    .select("question_id", { count: "exact", head: true })
    .eq("run_id", valRun).eq("module_position", 1);
  if (storedM1 === gm1.data.questions.length) ok(`only ${storedM1} real answers stored for module 1 (garbage dropped)`);
  else bad("garbage answers leaked into storage", `stored=${storedM1} expected=${gm1.data.questions.length}`);

  // =====================================================================
  step("F. Concurrency");
  // F1: two parallel submits of module 2 — must not double-advance / double-store.
  const gm2 = await validator.client.rpc("get_test_module", { p_run_id: valRun, p_position: 2 });
  const ans2 = {}; gm2.data.questions.forEach((q) => { ans2[q.id] = correctFor(q); });
  const [r2a, r2b] = await Promise.all([
    validator.client.rpc("submit_test_module", { p_run_id: valRun, p_position: 2, p_answers: ans2 }),
    validator.client.rpc("submit_test_module", { p_run_id: valRun, p_position: 2, p_answers: ans2 }),
  ]);
  const succeeded = [r2a, r2b].filter((r) => !r.error);
  const erroredCodes = [r2a, r2b].filter((r) => r.error).map((r) => r.error.message.split("\n")[0]);
  const { data: runAfter } = await service.from("test_runs").select("current_module,status").eq("id", valRun).single();
  const { count: storedM2 } = await service.from("test_run_answers")
    .select("question_id", { count: "exact", head: true }).eq("run_id", valRun).eq("module_position", 2);
  if (runAfter.current_module === 3 && storedM2 === gm2.data.questions.length) {
    ok("concurrent double-submit serialized cleanly", `advanced once → module 3, ${storedM2} answers (winners=${succeeded.length}, errs=[${erroredCodes.join(",")}])`);
  } else {
    bad("concurrent double-submit consistency",
      `current_module=${runAfter.current_module} (want 3), storedM2=${storedM2} (want ${gm2.data.questions.length}), errs=[${erroredCodes.join(",")}]`);
  }

  // F2: two parallel start_test for the ATTACKER (who already has a finished run? no — attacker never started).
  // Use a fresh seat to test the one-attempt lock under a race.
  const sRacer = await invite(adminClient, "Racer");
  const racer = await claimAndSignIn(sRacer, "racer");
  const [sa, sb] = await Promise.all([
    racer.client.rpc("start_test", { p_slug: SLUG }),
    racer.client.rpc("start_test", { p_slug: SLUG }),
  ]);
  if (sa.error || sb.error) {
    bad("concurrent start_test both succeed", `${sa.error?.message || ""} ${sb.error?.message || ""}`);
  } else if (sa.data.run_id !== sb.data.run_id) {
    bad("concurrent start_test mints ONE run", `got two runs: ${sa.data.run_id.slice(0, 8)} vs ${sb.data.run_id.slice(0, 8)}`);
  } else {
    // Double-check the DB really has one run for this user+test.
    const { count } = await service.from("test_runs")
      .select("id", { count: "exact", head: true }).eq("user_id", sRacer.seatId);
    if (count === 1) ok("concurrent start_test → exactly one run (one-attempt lock holds)");
    else bad("concurrent start_test created duplicate runs", `${count} runs in DB for racer`);
  }

  // =====================================================================
  step("G. RLS direct-table bypass (attacker hits tables directly, no RPC)");
  // victimRun is finished + released and has stored answers — the juiciest target.
  // test_runs by victim run id
  {
    const r = await attacker.client.from("test_runs").select("id,user_id,score").eq("id", victimRun);
    if ((r.data || []).length === 0) ok("test_runs: attacker sees 0 rows of victim run");
    else bad("test_runs RLS", `LEAK: ${JSON.stringify(r.data)}`);
  }
  // test_run_answers by run id
  {
    const r = await attacker.client.from("test_run_answers").select("question_id,chosen,is_correct").eq("run_id", victimRun);
    if ((r.data || []).length === 0) ok("test_run_answers: attacker sees 0 rows");
    else bad("test_run_answers RLS", `LEAK: ${r.data.length} rows e.g. ${JSON.stringify(r.data[0])}`);
  }
  // Full enumeration of test_runs — attacker must see only its own (it never started one).
  {
    const r = await attacker.client.from("test_runs").select("id,user_id");
    const foreign = (r.data || []).filter((x) => x.user_id !== sAttacker.seatId);
    if (foreign.length === 0) ok(`test_runs enumerate: 0 foreign rows (saw ${(r.data || []).length} own)`);
    else bad("test_runs enumeration RLS", `LEAK: ${foreign.length} foreign rows`);
  }
  // Victim PII (email) via profiles
  {
    const r = await attacker.client.from("profiles").select("id,email,display_name").eq("id", sVictim.seatId);
    const leakedEmail = (r.data || []).some((x) => x.email);
    if ((r.data || []).length === 0 || !leakedEmail) ok(`profiles: victim email not readable (rows=${(r.data || []).length})`);
    else bad("profiles email RLS", `PII LEAK: ${JSON.stringify(r.data)}`);
  }
  // Answer key — test_questions.correct_answer must not be directly readable by a student.
  {
    const r = await attacker.client.from("test_questions").select("id,correct_answer").limit(3);
    const keyLeak = (r.data || []).some((x) => x.correct_answer);
    if ((r.data || []).length === 0 || !keyLeak) ok(`test_questions: answer key not directly readable (rows=${(r.data || []).length})`);
    else bad("answer-key RLS", `ANSWER KEY LEAK: ${JSON.stringify(r.data)}`);
  }

  await cleanup();
  finish();
}

// Finish a run from its current module to the end (used to produce a result).
async function walkToFinish(client, runId, label, mode) {
  for (let guard = 0; guard < 6; guard++) {
    const { data: run } = await service.from("test_runs").select("current_module,status").eq("id", runId).single();
    if (run.status !== "in_progress") break;
    const pos = run.current_module;
    const gm = await client.rpc("get_test_module", { p_run_id: runId, p_position: pos });
    if (gm.error) { bad(`${label} walkToFinish get(${pos})`, gm.error.message); return; }
    const ans = {};
    gm.data.questions.forEach((q) => { ans[q.id] = mode === "correct" ? correctFor(q) : (q.type === "grid" ? "1" : "A"); });
    const sub = await client.rpc("submit_test_module", { p_run_id: runId, p_position: pos, p_answers: ans });
    if (sub.error) { bad(`${label} walkToFinish submit(${pos})`, sub.error.message); return; }
    if (sub.data?.finished) return;
  }
}

async function cleanup() {
  step("Cleanup");
  if (courseId) await service.from("courses").delete().eq("id", courseId);
  let n = 0;
  for (const id of [...new Set(createdUsers)]) {
    try { await service.auth.admin.deleteUser(id); n++; } catch { /* best effort */ }
  }
  info("removed", `${n} users + course`);
}

function finish() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${pass} pass / ${fail} fail`);
  if (findings.length) {
    console.log("\nDefects:");
    findings.forEach((f, i) => { console.log(`  ${i + 1}. ${f.label}`); if (f.detail) console.log(`     ${f.detail}`); });
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (err) => { console.error("FATAL:", err); try { await cleanup(); } catch { /* */ } process.exit(2); });
