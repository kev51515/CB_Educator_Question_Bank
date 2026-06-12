#!/usr/bin/env node
/**
 * smoke-recordings.mjs — contract coverage for the Recordings → quiz
 * publish/take RPCs introduced by migrations 0218 + 0221:
 *
 *   publish_authored_quiz(p_recording_id uuid, p_course_id uuid,
 *                         p_title text, p_module_id uuid DEFAULT NULL)
 *                         RETURNS uuid
 *   get_authored_questions(p_assignment_id uuid)
 *                         RETURNS TABLE(id, position, stem, choices)
 *   submit_authored_attempt(p_assignment_id uuid,
 *                          p_client_attempt_id uuid,
 *                          p_answers jsonb) RETURNS uuid
 *
 * publish_authored_quiz snapshots a recording's DRAFT authored_questions into a
 * new kind='authored_set' assignment (PUBLISHED copies carry assignment_id).
 * get_authored_questions returns answer-stripped questions to enrolled
 * students. submit_authored_attempt grades server-side and is idempotent on
 * client_attempt_id.
 *
 * Scenarios:
 *   1. happy path — owner-teacher with 3 DRAFT questions publishes to a course
 *      they teach → returns an assignment id; assignment.kind='authored_set',
 *      question_count=3; 3 PUBLISHED authored_questions carry assignment_id.
 *   2. publish authz — a different teacher (not owner / not teacher of course)
 *      → not_authorized.
 *   3. publish no_questions — recording with 0 drafts → no_questions.
 *   4. get_authored_questions — enrolled student gets stem+choices but NO
 *      correct_answer field; a NON-enrolled user → not_enrolled.
 *   5. submit_authored_attempt — enrolled student answers 2/3 correctly →
 *      score 66.67, correct_count 2; same client_attempt_id returns the SAME
 *      attempt id (idempotent); a non-enrolled user → not_enrolled.
 *
 * Hits the live cloud DB. Every row is tagged smoke-recordings-* and cleaned
 * up in finally{}. Exit non-zero on any failed assertion.
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

// `admin` uses the service role for setup, cleanup, and provisioning users.
// Each user signs in on a fresh anon client so the RPCs see their auth.uid().
const admin = createClient(url, service, { auth: { persistSession: false } });

const TAG = `smoke-recordings-${Date.now()}`;

let total = 0, pass = 0, fail = 0;
const created = {
  userIds: [],          // disposable auth users (teacher/outsider/student)
  courseIds: [],        // disposable courses
  recordingIds: [],     // disposable recordings
  assignmentIds: [],    // assignments produced by publish_authored_quiz
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

function errSays(error, needle) {
  const blob = JSON.stringify(error || {}).toLowerCase();
  return blob.includes(needle.toLowerCase());
}

/**
 * Provision a disposable auth user with a profile role, plus a fresh anon
 * client already signed in as them (so RPC calls carry their auth.uid()).
 */
async function provisionUser(role, label) {
  const email = `${TAG}-${label}-${randomUUID().slice(0, 8)}@example.com`;
  const password = "SmokeTest!" + randomUUID().slice(0, 8);
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { display_name: `Smoke ${label}`, role },
  });
  if (error) throw new Error(`provisionUser(${label}): ${error.message}`);
  const uid = data.user.id;
  created.userIds.push(uid);
  const { error: roleErr } = await admin
    .from("profiles").update({ role }).eq("id", uid);
  if (roleErr) throw new Error(`set role ${role}: ${roleErr.message}`);
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error: siErr } = await client.auth.signInWithPassword({ email, password });
  if (siErr) throw new Error(`signin(${label}): ${siErr.message}`);
  return { id: uid, client };
}

async function createCourse(teacherId) {
  const { data, error } = await admin
    .from("courses")
    .insert({ teacher_id: teacherId, name: `${TAG} course ${Date.now()}` })
    .select("id").single();
  if (error) throw new Error(`createCourse: ${error.message}`);
  created.courseIds.push(data.id);
  return data.id;
}

async function enroll(courseId, studentId) {
  const { error } = await admin
    .from("course_memberships")
    .insert({ course_id: courseId, student_id: studentId });
  if (error) throw new Error(`enroll: ${error.message}`);
}

async function createRecording(ownerId) {
  const { data, error } = await admin
    .from("recordings")
    .insert({ owner_id: ownerId, title: `${TAG} recording`, domain: "academic" })
    .select("id").single();
  if (error) throw new Error(`createRecording: ${error.message}`);
  created.recordingIds.push(data.id);
  return data.id;
}

/**
 * Insert N draft authored_questions as the owner (owner-all RLS) so RLS lets
 * the insert through. Each question has a single correct choice key.
 */
async function seedDrafts(ownerClient, recordingId, ownerId, specs) {
  const rows = specs.map((s, i) => ({
    recording_id: recordingId,
    owner_id: ownerId,
    position: i,
    style: "general",
    stem: `${TAG} Q${i + 1}: ${s.stem}`,
    choices: { A: "alpha", B: "bravo", C: "charlie", D: "delta" },
    correct_answer: s.correct,
    status: "draft",
  }));
  const { error } = await ownerClient.from("authored_questions").insert(rows);
  if (error) throw new Error(`seedDrafts: ${error.message}`);
}

async function cleanup() {
  // authored_questions snapshot rows cascade with the assignment (ON DELETE
  // CASCADE on assignment_id) and drafts cascade with the recording; delete
  // assignments + attempts explicitly first, then recordings + courses + users.
  if (created.assignmentIds.length) {
    try {
      await admin.from("assignment_attempts").delete()
        .in("assignment_id", created.assignmentIds);
    } catch { /* ignore */ }
    try {
      await admin.from("assignments").delete().in("id", created.assignmentIds);
    } catch { /* ignore */ }
  }
  if (created.recordingIds.length) {
    try {
      await admin.from("authored_questions").delete()
        .in("recording_id", created.recordingIds);
    } catch { /* ignore */ }
    try {
      await admin.from("recordings").delete().in("id", created.recordingIds);
    } catch { /* ignore */ }
  }
  if (created.courseIds.length) {
    try { await admin.from("courses").delete().in("id", created.courseIds); }
    catch { /* ignore */ }
  }
  for (const uid of created.userIds) {
    try { await admin.auth.admin.deleteUser(uid); } catch { /* ignore */ }
  }
}

(async function main() {
  console.log("=== smoke-recordings.mjs ===");
  try {
    // ---- Bootstrap principals ----
    const teacher = await provisionUser("teacher", "owner");
    const otherTeacher = await provisionUser("teacher", "other");
    const student = await provisionUser("student", "student");
    const outsider = await provisionUser("student", "outsider");
    console.log(
      `principals: owner=${teacher.id.slice(0, 8)}… ` +
      `other=${otherTeacher.id.slice(0, 8)}… ` +
      `student=${student.id.slice(0, 8)}… ` +
      `outsider=${outsider.id.slice(0, 8)}…`,
    );

    const courseId = await createCourse(teacher.id);
    await enroll(courseId, student.id);

    // ---- 1. happy path ----
    console.log("\n[1] happy path — publish 3 drafts to owned course");
    const recId = await createRecording(teacher.id);
    await seedDrafts(teacher.client, recId, teacher.id, [
      { stem: "first", correct: "A" },
      { stem: "second", correct: "B" },
      { stem: "third", correct: "C" },
    ]);
    const { data: assignmentId, error: pubErr } = await teacher.client.rpc(
      "publish_authored_quiz",
      { p_recording_id: recId, p_course_id: courseId, p_title: `${TAG} quiz` },
    );
    ok("publish returns assignment id", !pubErr && !!assignmentId, pubErr?.message);
    if (assignmentId) created.assignmentIds.push(assignmentId);

    const { data: asg } = await admin
      .from("assignments")
      .select("kind, question_count, source_recording_id")
      .eq("id", assignmentId || "")
      .maybeSingle();
    ok("assignment kind=authored_set", asg?.kind === "authored_set", asg?.kind);
    ok("assignment question_count=3", asg?.question_count === 3, String(asg?.question_count));
    ok("assignment traces source_recording_id", asg?.source_recording_id === recId);

    const { data: published } = await admin
      .from("authored_questions")
      .select("id, status, assignment_id, correct_answer")
      .eq("assignment_id", assignmentId || "");
    ok("3 PUBLISHED snapshots carry assignment_id", published?.length === 3,
      String(published?.length));
    ok("all snapshots status=published",
      (published || []).every((q) => q.status === "published"));

    // Drafts left intact (status=draft, assignment_id NULL) for re-publish.
    const { data: stillDrafts } = await admin
      .from("authored_questions")
      .select("id")
      .eq("recording_id", recId)
      .eq("status", "draft")
      .is("assignment_id", null);
    ok("original drafts preserved", stillDrafts?.length === 3, String(stillDrafts?.length));

    // ---- 2. publish authz ----
    console.log("\n[2] publish authz — different teacher rejected");
    const recId2 = await createRecording(teacher.id);
    await seedDrafts(teacher.client, recId2, teacher.id, [
      { stem: "x", correct: "A" },
    ]);
    const { error: authzErr } = await otherTeacher.client.rpc(
      "publish_authored_quiz",
      { p_recording_id: recId2, p_course_id: courseId, p_title: `${TAG} unauth` },
    );
    ok("non-owner/non-teacher rejected", !!authzErr);
    ok("error mentions not_authorized", errSays(authzErr, "not_authorized"));

    // ---- 3. publish no_questions ----
    console.log("\n[3] publish no_questions — recording with 0 drafts");
    const recEmpty = await createRecording(teacher.id);
    const { error: noqErr } = await teacher.client.rpc(
      "publish_authored_quiz",
      { p_recording_id: recEmpty, p_course_id: courseId, p_title: `${TAG} empty` },
    );
    ok("empty recording rejected", !!noqErr);
    ok("error mentions no_questions", errSays(noqErr, "no_questions"));

    // ---- 4. get_authored_questions ----
    console.log("\n[4] get_authored_questions — enrolled gets answer-stripped");
    const { data: qs, error: getErr } = await student.client.rpc(
      "get_authored_questions",
      { p_assignment_id: assignmentId },
    );
    ok("enrolled student read OK", !getErr && Array.isArray(qs), getErr?.message);
    ok("returns 3 questions", qs?.length === 3, String(qs?.length));
    ok("each carries stem + choices",
      (qs || []).every((q) => typeof q.stem === "string" && q.choices != null));
    ok("NO correct_answer field exposed",
      (qs || []).every((q) => !("correct_answer" in q)));
    ok("NO rationale field exposed",
      (qs || []).every((q) => !("rationale" in q)));

    const { error: getOutErr } = await outsider.client.rpc(
      "get_authored_questions",
      { p_assignment_id: assignmentId },
    );
    ok("non-enrolled read rejected", !!getOutErr);
    ok("error mentions not_enrolled", errSays(getOutErr, "not_enrolled"));

    // ---- 5. submit_authored_attempt ----
    console.log("\n[5] submit_authored_attempt — 2/3 correct, idempotent");
    // Map each published question id → its choice. correct answers are A,B,C
    // by seed order; answer Q1=A (right), Q2=B (right), Q3=D (wrong) → 2/3.
    const { data: pubWithPos } = await admin
      .from("authored_questions")
      .select("id, position, correct_answer")
      .eq("assignment_id", assignmentId || "")
      .order("position", { ascending: true });
    const answers = {};
    (pubWithPos || []).forEach((q) => {
      // give the correct answer for positions 0,1; a wrong one for position 2.
      answers[q.id] = q.position === 2 ? "D" : q.correct_answer;
    });
    const clientAttemptId = randomUUID();
    const { data: attemptId, error: subErr } = await student.client.rpc(
      "submit_authored_attempt",
      {
        p_assignment_id: assignmentId,
        p_client_attempt_id: clientAttemptId,
        p_answers: answers,
      },
    );
    ok("submit returns attempt id", !subErr && !!attemptId, subErr?.message);

    const { data: attemptRow } = await admin
      .from("assignment_attempts")
      .select("score_percent, correct_count, total_questions, client_attempt_id")
      .eq("id", attemptId || "")
      .maybeSingle();
    ok("score_percent = 66.67", Number(attemptRow?.score_percent) === 66.67,
      String(attemptRow?.score_percent));
    ok("correct_count = 2", attemptRow?.correct_count === 2, String(attemptRow?.correct_count));
    ok("total_questions = 3", attemptRow?.total_questions === 3,
      String(attemptRow?.total_questions));

    // Idempotency: same client_attempt_id → same attempt id, no new row.
    const { data: attemptId2, error: subErr2 } = await student.client.rpc(
      "submit_authored_attempt",
      {
        p_assignment_id: assignmentId,
        p_client_attempt_id: clientAttemptId,
        p_answers: answers,
      },
    );
    ok("idempotent re-submit no error", !subErr2, subErr2?.message);
    ok("same attempt id returned", attemptId2 === attemptId);
    const { data: dupRows } = await admin
      .from("assignment_attempts")
      .select("id")
      .eq("assignment_id", assignmentId || "")
      .eq("client_attempt_id", clientAttemptId);
    ok("only ONE attempt row", dupRows?.length === 1, String(dupRows?.length));

    // Non-enrolled submit rejected.
    const { error: subOutErr } = await outsider.client.rpc(
      "submit_authored_attempt",
      {
        p_assignment_id: assignmentId,
        p_client_attempt_id: randomUUID(),
        p_answers: answers,
      },
    );
    ok("non-enrolled submit rejected", !!subOutErr);
    ok("error mentions not_enrolled", errSays(subOutErr, "not_enrolled"));

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
