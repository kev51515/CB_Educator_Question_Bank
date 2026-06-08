#!/usr/bin/env node
/**
 * smoke-review.mjs
 *
 * Integration check for the staff Review answer-breakdown RPCs (migration 0112):
 *   • list_test_review_courses(slug)
 *   • get_test_answer_breakdown(slug, course_id)
 *
 * Disposable + self-cleaning (like the clickthrough harnesses): provisions a
 * fresh teacher + two students + a course that links /test/<slug>, drives two
 * real, deterministic submissions, then asserts the RPCs return the right
 * per-option counts + student names and enforce authorization. Deletes
 * everything it created at the end.
 *
 *   1. Provision teacher (role teacher, NOT admin → exercises is_teacher_of_course),
 *      two students with known display names, a course, enrol both, module link.
 *   2. Each student takes the whole test: student A answers 'A' on every MCQ
 *      (grid '1'); student B answers 'B' (grid '2'). Run is submitted only after
 *      the last module, which the breakdown requires.
 *   3. list_test_review_courses(slug) as teacher → our course present, taken=2.
 *   4. get_test_answer_breakdown(slug, course) as teacher → for a known MCQ:
 *      A chosen by student A, B chosen by student B, names + is_correct present.
 *   5. Authorization: a student (not staff) and an unrelated teacher (not owner)
 *      are both rejected with not_authorized.
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
  console.error("smoke-review: missing env:", missing.join(", "));
  process.exit(2);
}

const SLUG = "dsat-nov-2023";
const TS = Date.now();
const TAG = `rev-${TS}`;
const PW = "Review!" + randomBytes(4).toString("hex");

const service = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const userClient = () =>
  createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; console.log(`  FAIL  ${l}`); if (d) console.log(`        ${d}`); };
const step = (l) => console.log(`\n=== ${l} ===`);
const info = (l, d = "") => console.log(`  ..    ${l}${d ? "  " + d : ""}`);

async function createUser(email, role, displayName) {
  const { data, error } = await service.auth.admin.createUser({
    email, password: PW, email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  const uid = data.user.id;
  const patch = {};
  if (role !== "student") patch.role = role;
  if (displayName) patch.display_name = displayName;
  if (Object.keys(patch).length) {
    const { error: upErr } = await service.from("profiles").update(patch).eq("id", uid);
    if (upErr) throw new Error(`patch(${email}): ${upErr.message}`);
  }
  return uid;
}
async function signIn(email) {
  const c = userClient();
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return c;
}

/** Take the whole test, answering every MCQ with `letter`, grid with `gridVal`.
 *  Returns module-1's questions (for picking a known MCQ to assert on). */
async function takeTest(client, letter, gridVal) {
  const { data: start, error: sErr } = await client.rpc("start_test", { p_slug: SLUG });
  if (sErr) throw new Error(`start_test: ${sErr.message}`);
  const runId = start.run_id;
  const mods = [...start.modules].sort((a, b) => a.position - b.position);
  let module1Questions = null;
  for (const m of mods) {
    const { data: mod, error: mErr } = await client.rpc("get_test_module", {
      p_run_id: runId, p_position: m.position,
    });
    if (mErr) throw new Error(`get_test_module(${m.position}): ${mErr.message}`);
    if (m.position === 1) module1Questions = mod.questions;
    const answers = {};
    for (const q of mod.questions) answers[q.id] = q.type === "grid" ? gridVal : letter;
    const { error: subErr } = await client.rpc("submit_test_module", {
      p_run_id: runId, p_position: m.position, p_answers: answers, p_eliminated: {},
    });
    if (subErr) throw new Error(`submit_test_module(${m.position}): ${subErr.message}`);
  }
  return { runId, module1Questions };
}

async function main() {
  step("provision");
  const teacherEmail = `t-${TAG}@gmail.com`;
  const teacher2Email = `t2-${TAG}@gmail.com`;
  const aEmail = `sa-${TAG}@gmail.com`;
  const bEmail = `sb-${TAG}@gmail.com`;
  const aName = `Stu A ${TAG}`;
  const bName = `Stu B ${TAG}`;

  const teacherId = await createUser(teacherEmail, "teacher", `Teacher ${TAG}`);
  const teacher2Id = await createUser(teacher2Email, "teacher", `Teacher2 ${TAG}`);
  const aId = await createUser(aEmail, "student", aName);
  const bId = await createUser(bEmail, "student", bName);
  info("teacher", teacherId);
  info("students", `${aId}, ${bId}`);

  const { data: courseRow, error: cErr } = await service
    .from("courses").insert({ name: `Review-${TAG}`, teacher_id: teacherId })
    .select("id").single();
  if (cErr) throw new Error(`create course: ${cErr.message}`);
  const courseId = courseRow.id;
  info("course", courseId);

  const { error: memErr } = await service.from("course_memberships").insert([
    { course_id: courseId, student_id: aId },
    { course_id: courseId, student_id: bId },
  ]);
  if (memErr) throw new Error(`enroll: ${memErr.message}`);

  const { data: modRow, error: modErr } = await service
    .from("course_modules").insert({ course_id: courseId, name: "Tests", position: 1 })
    .select("id").single();
  if (modErr) throw new Error(`module: ${modErr.message}`);
  const { error: miErr } = await service.from("module_items").insert({
    module_id: modRow.id, item_type: "link", title: "DSAT", url: `/test/${SLUG}`, position: 1,
  });
  if (miErr) throw new Error(`module_item: ${miErr.message}`);

  step("students take the test");
  const aClient = await signIn(aEmail);
  const bClient = await signIn(bEmail);
  const { module1Questions } = await takeTest(aClient, "A", "1");
  await takeTest(bClient, "B", "2");
  ok("both students submitted runs");

  // pick a known MCQ question from module 1
  const knownMcq = (module1Questions ?? []).find((q) => q.type === "mcq");
  if (!knownMcq) { bad("module 1 has an MCQ to assert on"); return cleanup(); }
  info("assert question", `Q${knownMcq.number} (${knownMcq.id})`);

  const teacherClient = await signIn(teacherEmail);

  step("list_test_review_courses");
  {
    const { data, error } = await teacherClient.rpc("list_test_review_courses", { p_slug: SLUG });
    if (error) { bad("list_test_review_courses callable", error.message); }
    else {
      const mine = (data ?? []).find((c) => c.course_id === courseId);
      if (!mine) bad("our course present in list", `got ${JSON.stringify(data)}`);
      else {
        ok("our course present");
        if (mine.taken === 2) ok("taken count = 2");
        else bad("taken count = 2", `got ${mine.taken}`);
        if (mine.title === `Review-${TAG}`) ok("course title returned");
        else bad("course title", `got ${mine.title}`);
      }
    }
  }

  step("get_test_answer_breakdown");
  {
    const { data, error } = await teacherClient.rpc("get_test_answer_breakdown", {
      p_slug: SLUG, p_course_id: courseId,
    });
    if (error) { bad("get_test_answer_breakdown callable", error.message); }
    else {
      const rows = data ?? [];
      ok("breakdown returned rows", `${rows.length} rows`);
      const forQ = rows.filter((r) => r.question_id === knownMcq.id);
      if (forQ.length !== 2) bad("2 answers for the known MCQ", `got ${forQ.length}`);
      else ok("2 answers for the known MCQ");

      const aRow = forQ.find((r) => r.student_id === aId);
      const bRow = forQ.find((r) => r.student_id === bId);
      if (aRow?.chosen === "A") ok("student A chose A"); else bad("student A chose A", `got ${aRow?.chosen}`);
      if (bRow?.chosen === "B") ok("student B chose B"); else bad("student B chose B", `got ${bRow?.chosen}`);
      if (aRow?.student_name === aName) ok("student A name returned");
      else bad("student A name", `got ${aRow?.student_name}`);
      if (typeof aRow?.is_correct === "boolean") ok("is_correct is a boolean");
      else bad("is_correct boolean", `got ${typeof aRow?.is_correct}`);
      // exactly one of A/B is correct (the key is a single letter)
      const correctCount = forQ.filter((r) => r.is_correct).length;
      if (correctCount <= 1) ok("at most one chosen option is correct", `correct=${correctCount}`);
      else bad("at most one correct", `got ${correctCount}`);
    }
  }

  step("authorization");
  {
    // a student is not staff
    const { error: sErr } = await aClient.rpc("get_test_answer_breakdown", {
      p_slug: SLUG, p_course_id: courseId,
    });
    if (sErr && /not_authorized/.test(sErr.message)) ok("student rejected (not_authorized)");
    else bad("student rejected", `got ${sErr ? sErr.message : "no error"}`);

    const { error: sErr2 } = await aClient.rpc("list_test_review_courses", { p_slug: SLUG });
    if (sErr2 && /not_authorized/.test(sErr2.message)) ok("student rejected from course list");
    else bad("student rejected from course list", `got ${sErr2 ? sErr2.message : "no error"}`);

    // a teacher who does not own this course
    const teacher2Client = await signIn(teacher2Email);
    const { error: t2Err } = await teacher2Client.rpc("get_test_answer_breakdown", {
      p_slug: SLUG, p_course_id: courseId,
    });
    if (t2Err && /not_authorized/.test(t2Err.message)) ok("non-owner teacher rejected (not_authorized)");
    else bad("non-owner teacher rejected", `got ${t2Err ? t2Err.message : "no error"}`);
  }

  return cleanup();

  async function cleanup() {
    step("cleanup");
    await service.from("courses").delete().eq("id", courseId).then(() => {}, () => {});
    for (const id of [teacherId, teacher2Id, aId, bId]) {
      await service.auth.admin.deleteUser(id).catch(() => {});
    }
    info("disposable users + course removed");
  }
}

main()
  .catch((e) => { bad("uncaught", e?.message ?? String(e)); })
  .finally(() => {
    console.log(`\n----------------------------------`);
    console.log(`TOTAL: ${pass + fail}  PASS: ${pass}  FAIL: ${fail}`);
    console.log(`==================================`);
    process.exit(fail > 0 ? 1 : 0);
  });
