#!/usr/bin/env node
/**
 * smoke-qbank.mjs — focused unhappy-path coverage for the qbank submission
 * RPC introduced by Lane A migration 0046:
 *
 *   submit_qbank_attempt(p_assignment_id uuid,
 *                        p_client_attempt_id uuid,
 *                        p_payload jsonb) RETURNS uuid
 *
 * The RPC is idempotent on client_attempt_id and writes an entry into
 * qbank_submission_log for every call (success or failure).
 *
 * Scenarios:
 *   1. Happy path — fresh client_attempt_id → returns new attempt_id
 *   2. Idempotency — same client_attempt_id returns the same attempt_id
 *      (no second row in assignment_attempts)
 *   3. max_attempts boundary — 3rd submission rejected with
 *      max_attempts_reached when max_attempts=2
 *   4. not_enrolled — student who isn't a member of the course
 *   5. wrong_kind — calling the qbank RPC on a kind='mocktest' assignment
 *   6. assignment_not_found — random UUID
 *   7. not_authenticated — anon client (no session)
 *   8. Payload clamping — score_percent capped at 100, correct_count
 *      capped at total_questions
 *   9. Score CHECK enforcement — direct INSERT with score_percent=200 must
 *      be rejected by the CHECK constraint
 *  10. Audit log captures success
 *  11. Audit log captures failure (not_enrolled)
 *
 * Hits the live cloud DB. Every row is tagged smoke-qbank-* and cleaned up
 * in finally{}.
 *
 * If migration 0046 hasn't landed yet, the script detects the old 2-arg
 * signature via a probe call and skips RPC-dependent scenarios with a
 * loud BLOCKED banner so the dispatcher sees it didn't silently pass.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_KEY;
if (!url || !anon || !service) {
  console.error("Need SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_KEY");
  process.exit(1);
}

// `sb` runs as the signed-in demo teacher (RPCs see auth.uid()).
// `admin` uses the service role for setup, cleanup, and provisioning
// users that the teacher session can't manage.
const sb = createClient(url, anon, { auth: { persistSession: false } });
const admin = createClient(url, service, { auth: { persistSession: false } });

const TAG = `smoke-qbank-${Date.now()}`;
let courseId = null;          // disposable course (deleted on teardown)
let teacherProfileId = null;  // disposable teacher

let total = 0, pass = 0, fail = 0;
const created = {
  assignmentIds: [],
  mocktestAssignmentId: null,
  tempUserIds: [],
  attemptIds: [],
};

function ok(name, cond, detail = "") {
  total += 1;
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

async function signInTeacher() {
  // Self-bootstrap a disposable teacher + course (no pre-seeded accounts needed).
  const email = `${TAG}-teacher@example.com`;
  const password = "SmokeTest!" + randomUUID().slice(0, 8);
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { display_name: "Smoke Qbank Teacher" },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  teacherProfileId = created.user.id;
  const { error: roleErr } = await admin
    .from("profiles").update({ role: "teacher" }).eq("id", teacherProfileId);
  if (roleErr) throw new Error(`promote teacher: ${roleErr.message}`);
  const { error: siErr } = await sb.auth.signInWithPassword({ email, password });
  if (siErr) throw new Error(`signin: ${siErr.message}`);
  const { data: course, error: cErr } = await admin
    .from("courses")
    .insert({ teacher_id: teacherProfileId, name: `Smoke Qbank ${Date.now()}` })
    .select("id").single();
  if (cErr) throw new Error(`create course: ${cErr.message}`);
  courseId = course.id;
  return teacherProfileId;
}

async function getTeacherId() {
  return teacherProfileId;
}

async function createQbankAssignment(teacherId, maxAttempts = 2) {
  const { data, error } = await admin
    .from("assignments")
    .insert({
      course_id: courseId,
      created_by: teacherId,
      title: `${TAG} qbank`,
      kind: "qbank_set",
      qbank_set_uid: "smoke-test-set",
      qbank_set_label: "Smoke Test",
      max_attempts: maxAttempts,
      question_count: 10,
      source_id: null,
      time_limit_minutes: 20,
      difficulty_mix: "any",
    })
    .select("id")
    .single();
  if (error) throw new Error(`createQbankAssignment: ${error.message}`);
  created.assignmentIds.push(data.id);
  return data.id;
}

async function createMocktestAssignment(teacherId) {
  // mocktest CHECK requires source_id NOT NULL and qbank_set_uid NULL.
  const { data, error } = await admin
    .from("assignments")
    .insert({
      course_id: courseId,
      created_by: teacherId,
      title: `${TAG} mocktest`,
      kind: "mocktest",
      question_count: 10,
      source_id: "cb",
      qbank_set_uid: null,
      time_limit_minutes: 20,
      difficulty_mix: "any",
    })
    .select("id")
    .single();
  if (error) throw new Error(`createMocktestAssignment: ${error.message}`);
  created.assignmentIds.push(data.id);
  created.mocktestAssignmentId = data.id;
  return data.id;
}

async function provisionTempUser() {
  const email = `${TAG}-outsider-${randomUUID().slice(0, 8)}@example.com`;
  const password = "SmokeTest!" + randomUUID().slice(0, 8);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: email, role: "student" },
  });
  if (error) throw new Error(`provisionTempUser: ${error.message}`);
  await admin.from("profiles").update({ role: "student" }).eq("id", data.user.id);
  created.tempUserIds.push(data.user.id);
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error: signErr } = await client.auth.signInWithPassword({ email, password });
  if (signErr) throw new Error(`provisionTempUser signin: ${signErr.message}`);
  return { id: data.user.id, client };
}

/**
 * Probe the RPC signature. If submit_qbank_attempt accepts 3 args, we get
 * a deterministic failure (assignment_not_found) vs a "function not found"
 * style error. Returns true if the 3-arg form is callable.
 */
async function probeRpcAvailable() {
  const { error } = await sb.rpc("submit_qbank_attempt", {
    p_assignment_id: randomUUID(),
    p_client_attempt_id: randomUUID(),
    p_payload: { probe: true },
  });
  if (!error) return true; // fine, RPC ran (probably assignment_not_found)
  const msg = (error.message || "").toLowerCase();
  // PostgREST PGRST202 = function not found / signature mismatch
  if (msg.includes("could not find") || msg.includes("function") && msg.includes("does not exist")) {
    return false;
  }
  // Any other error means the RPC exists and chose to reject — that's fine.
  return true;
}

async function callSubmit(client, assignmentId, clientAttemptId, payload) {
  return client.rpc("submit_qbank_attempt", {
    p_assignment_id: assignmentId,
    p_client_attempt_id: clientAttemptId,
    p_payload: payload,
  });
}

function errCode(error) {
  if (!error) return null;
  // Supabase surfaces RAISE EXCEPTION USING errcode via .code OR .message
  // depending on PostgREST version. Be defensive.
  return error.code || error.details || error.message || "";
}

function errSays(error, needle) {
  const blob = JSON.stringify(error || {}).toLowerCase();
  return blob.includes(needle.toLowerCase());
}

async function cleanup() {
  // Attempts (FK from log if any)
  if (created.attemptIds.length) {
    await admin.from("assignment_attempts").delete().in("id", created.attemptIds);
  }
  // Also nuke any attempts the RPC created that we didn't track by id
  if (created.assignmentIds.length) {
    await admin
      .from("assignment_attempts")
      .delete()
      .in("assignment_id", created.assignmentIds);
    await admin
      .from("qbank_submission_log")
      .delete()
      .in("assignment_id", created.assignmentIds);
    await admin
      .from("assignments")
      .delete()
      .in("id", created.assignmentIds);
  }
  // Temp users
  for (const uid of created.tempUserIds) {
    try {
      await admin.auth.admin.deleteUser(uid);
    } catch {/* ignore */}
  }
  // Disposable course (cascades assignments/attempts) + teacher.
  if (courseId) {
    try { await admin.from("courses").delete().eq("id", courseId); } catch {/* ignore */}
  }
  if (teacherProfileId) {
    try { await admin.auth.admin.deleteUser(teacherProfileId); } catch {/* ignore */}
  }
}

(async function main() {
  console.log("=== smoke-qbank.mjs ===");
  let teacherUid;
  try {
    teacherUid = await signInTeacher();
    console.log(`signed in as demo teacher (uid=${teacherUid?.slice(0, 8)}…)`);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  try {
    // ---- 0. RPC availability probe ----
    console.log("\n[0] probe submit_qbank_attempt RPC signature");
    const rpcOk = await probeRpcAvailable();
    if (!rpcOk) {
      console.log("\n╔════════════════════════════════════════════════════════╗");
      console.log("║  BLOCKED on Lane A — submit_qbank_attempt(3-arg) RPC   ║");
      console.log("║  is not yet deployed. Migration 0046 not applied.      ║");
      console.log("║  Skipping RPC-dependent scenarios.                     ║");
      console.log("╚════════════════════════════════════════════════════════╝");
      ok("RPC submit_qbank_attempt available (3-arg)", false, "migration 0046 not applied");
      // Still run the CHECK-constraint test that doesn't need the RPC.
      const teacherId = await getTeacherId();
      const aid = await createQbankAssignment(teacherId, 2);
      console.log("\n[9] CHECK constraint enforcement (no RPC needed)");
      const { error: chkErr } = await admin
        .from("assignment_attempts")
        .insert({
          assignment_id: aid,
          student_id: teacherUid,
          score_percent: 200,
          correct_count: 1,
          total_questions: 1,
        });
      ok("score_percent=200 rejected by CHECK", !!chkErr, chkErr ? "(expected)" : "(unexpectedly accepted)");
      return; // jumps to finally
    }
    ok("RPC submit_qbank_attempt available (3-arg)", true);

    const teacherId = await getTeacherId();
    if (!teacherId) throw new Error("demo teacher profile not found");

    // ---- 1. Happy path ----
    console.log("\n[1] happy path");
    const a1 = await createQbankAssignment(teacherId, 2);
    const c1 = randomUUID();
    const { data: attempt1, error: e1 } = await callSubmit(sb, a1, c1, {
      score_percent: 80,
      correct_count: 8,
      total_questions: 10,
    });
    ok("RPC returns attempt id", !e1 && !!attempt1, e1?.message);
    if (attempt1) created.attemptIds.push(attempt1);
    const { data: row1 } = await admin
      .from("assignment_attempts")
      .select("id, client_attempt_id, score_percent")
      .eq("assignment_id", a1)
      .eq("client_attempt_id", c1);
    ok("assignment_attempts row exists", row1?.length === 1);
    ok("score_percent stored", row1?.[0]?.score_percent === 80);

    // ---- 2. Idempotency ----
    console.log("\n[2] idempotency on client_attempt_id");
    const { data: attempt1b, error: e2 } = await callSubmit(sb, a1, c1, {
      score_percent: 80,
      correct_count: 8,
      total_questions: 10,
    });
    ok("second call no error", !e2, e2?.message);
    ok("same attempt id returned", attempt1b === attempt1);
    const { data: dupRows } = await admin
      .from("assignment_attempts")
      .select("id")
      .eq("assignment_id", a1)
      .eq("client_attempt_id", c1);
    ok("only ONE row in assignment_attempts", dupRows?.length === 1);

    // ---- 3. max_attempts boundary ----
    console.log("\n[3] max_attempts boundary (max=2 → 3rd rejected)");
    const c2 = randomUUID();
    const { data: attempt2, error: e3a } = await callSubmit(sb, a1, c2, {
      score_percent: 70,
      correct_count: 7,
      total_questions: 10,
    });
    ok("2nd distinct submission OK", !e3a && !!attempt2, e3a?.message);
    if (attempt2) created.attemptIds.push(attempt2);
    const c3 = randomUUID();
    const { error: e3b } = await callSubmit(sb, a1, c3, {
      score_percent: 50,
      correct_count: 5,
      total_questions: 10,
    });
    ok("3rd submission rejected", !!e3b);
    ok("error mentions max_attempts_reached", errSays(e3b, "max_attempts_reached"));

    // ---- 4. not_enrolled ----
    console.log("\n[4] not_enrolled (fresh user not in course)");
    const outsider = await provisionTempUser();
    const a4 = await createQbankAssignment(teacherId, 5);
    const c4 = randomUUID();
    const { error: e4 } = await callSubmit(outsider.client, a4, c4, {
      score_percent: 50,
      correct_count: 5,
      total_questions: 10,
    });
    ok("not_enrolled rejected", !!e4);
    ok("error mentions not_enrolled", errSays(e4, "not_enrolled"));
    // Mirror the client (viewer/src/student/qbankSubmit.ts): after a caught
    // failure, call log_qbank_failure so the audit row lands in its own
    // transaction. Migration 0047 dropped the in-RPC failure logging because
    // RAISE rolls back the parent transaction (autonomous-tx workaround).
    if (e4) {
      await outsider.client.rpc("log_qbank_failure", {
        p_assignment_id: a4,
        p_client_attempt_id: c4,
        p_payload: { score_percent: 50, correct_count: 5, total_questions: 10 },
        p_result_code: "not_enrolled",
        p_error_message: e4.message || "not_enrolled",
      });
    }

    // ---- 5. wrong_kind ----
    console.log("\n[5] wrong_kind (mocktest assignment via qbank RPC)");
    const aMock = await createMocktestAssignment(teacherId);
    const { error: e5 } = await callSubmit(sb, aMock, randomUUID(), {
      score_percent: 60,
      correct_count: 6,
      total_questions: 10,
    });
    ok("wrong_kind rejected", !!e5);
    ok("error mentions wrong_kind", errSays(e5, "wrong_kind"));

    // ---- 6. assignment_not_found ----
    console.log("\n[6] assignment_not_found");
    const { error: e6 } = await callSubmit(sb, randomUUID(), randomUUID(), {
      score_percent: 60,
      correct_count: 6,
      total_questions: 10,
    });
    ok("random UUID rejected", !!e6);
    ok("error mentions assignment_not_found", errSays(e6, "assignment_not_found"));

    // ---- 7. not_authenticated ----
    console.log("\n[7] not_authenticated (anon client, no session)");
    const anonClient = createClient(url, anon, { auth: { persistSession: false } });
    const { error: e7 } = await callSubmit(anonClient, a4, randomUUID(), {
      score_percent: 50,
      correct_count: 5,
      total_questions: 10,
    });
    ok("anon call rejected", !!e7);
    ok(
      "error mentions not_authenticated",
      errSays(e7, "not_authenticated") || errSays(e7, "jwt") || errSays(e7, "auth"),
      "(accepts auth-style errors)",
    );

    // ---- 8. Payload clamping ----
    console.log("\n[8] payload clamping (score_percent>100, correct>total)");
    const a8 = await createQbankAssignment(teacherId, 5);
    const c8 = randomUUID();
    const { data: attempt8, error: e8 } = await callSubmit(sb, a8, c8, {
      score_percent: 150,
      correct_count: 100,
      total_questions: 5,
    });
    ok("RPC accepts oversized payload", !e8 && !!attempt8, e8?.message);
    if (attempt8) created.attemptIds.push(attempt8);
    const { data: clamped } = await admin
      .from("assignment_attempts")
      .select("score_percent, correct_count, total_questions")
      .eq("id", attempt8 || "")
      .maybeSingle();
    ok("score_percent clamped to <=100", (clamped?.score_percent ?? 0) <= 100);
    ok(
      "correct_count clamped to <= total_questions",
      clamped && clamped.correct_count <= clamped.total_questions,
    );

    // ---- 9. Score CHECK enforcement (direct INSERT) ----
    console.log("\n[9] CHECK constraint on assignment_attempts.score_percent");
    const { error: chkErr } = await admin
      .from("assignment_attempts")
      .insert({
        assignment_id: a1,
        student_id: teacherUid,
        score_percent: 200,
        correct_count: 1,
        total_questions: 1,
      });
    ok("direct INSERT with score=200 rejected", !!chkErr, chkErr ? "(expected)" : "(unexpectedly accepted)");

    // ---- 10. Audit log on success ----
    console.log("\n[10] qbank_submission_log: success row");
    const { data: succLogs, error: lErr1 } = await admin
      .from("qbank_submission_log")
      .select("assignment_id, client_attempt_id, result_code")
      .eq("assignment_id", a1)
      .eq("client_attempt_id", c1);
    ok("audit-log query ran", !lErr1, lErr1?.message);
    ok("success row logged", (succLogs || []).some((r) => r.result_code === "success"));

    // ---- 11. Audit log on failure ----
    // Known Lane A risk: the PERFORM _log_qbank_attempt() call inside the
    // failure paths runs BEFORE the RAISE EXCEPTION, but a RAISE rolls back
    // the entire RPC transaction including that log INSERT unless the
    // helper uses an autonomous transaction (dblink) or pg_notify. If this
    // assertion fails, audit-log persistence for failures is broken.
    console.log("\n[11] qbank_submission_log: not_enrolled row");
    const { data: failLogs } = await admin
      .from("qbank_submission_log")
      .select("assignment_id, result_code")
      .eq("assignment_id", a4);
    ok(
      "not_enrolled row logged (RAISE rolls back log INSERT — Lane A risk)",
      (failLogs || []).some((r) => r.result_code === "not_enrolled"),
    );

  } catch (err) {
    console.error("\n[!] unhandled:", err.message);
    fail += 1;
  } finally {
    await cleanup();
  }

  console.log("\n----------------------------------");
  console.log(`TOTAL: ${total}  PASS: ${pass}  FAIL: ${fail}`);
  console.log("==================================");
  process.exit(fail > 0 ? 1 : 0);
})();
