#!/usr/bin/env node
/**
 * smoke-proctor-chat.mjs
 *
 * Integration check for proctor ⇄ student messaging (migration 0113).
 * Disposable + self-cleaning, like the other clickthrough harnesses.
 *
 *   1. Provision an admin (the proctor), a non-admin teacher (staff, read-only),
 *      two students (A enrolled, B not), a course linking /test/<slug>.
 *   2. Student A start_test → run is in_progress (not paused yet).
 *   3. NEG: A cannot message while NOT paused → not_paused.
 *   4. Admin pauses A.
 *   5. NEG: a non-admin teacher cannot proctor_send_message (admin-only, 0104/
 *      0114) → not_authorized. NEG: student B cannot message A's run →
 *      not_authorized.
 *   6. A sends a preset; admin replies (pause reason + a text). Both succeed.
 *   7. Records/RLS: admin, the non-admin teacher, and A all read the full
 *      thread (staff keep read access); B reads nothing.
 *   8. Admin resumes → A can no longer message (not_paused again).
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
  console.error("smoke-proctor-chat: missing env:", missing.join(", "));
  process.exit(2);
}

const SLUG = "dsat-nov-2023";
const TAG = `pchat-${Date.now()}`;
const PW = "Pchat!" + randomBytes(4).toString("hex");

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
const isErr = (e, code) => !!e && e.message.includes(code);

async function createUser(email, role, displayName) {
  const { data, error } = await service.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  const uid = data.user.id;
  const patch = {};
  if (role !== "student") patch.role = role;
  if (displayName) patch.display_name = displayName;
  if (Object.keys(patch).length) {
    const { error: e } = await service.from("profiles").update(patch).eq("id", uid);
    if (e) throw new Error(`patch(${email}): ${e.message}`);
  }
  return uid;
}
async function signIn(email) {
  const c = userClient();
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return c;
}

async function main() {
  step("provision");
  const adminId = await createUser(`adm-${TAG}@gmail.com`, "admin", `Adm ${TAG}`);
  const teacherId = await createUser(`t-${TAG}@gmail.com`, "teacher", `T ${TAG}`);
  const aId = await createUser(`sa-${TAG}@gmail.com`, "student", `A ${TAG}`);
  const bId = await createUser(`sb-${TAG}@gmail.com`, "student", `B ${TAG}`);

  const { data: course, error: cErr } = await service
    .from("courses").insert({ name: `Pchat-${TAG}`, teacher_id: adminId }).select("id").single();
  if (cErr) throw new Error(`course: ${cErr.message}`);
  await service.from("course_memberships").insert({ course_id: course.id, student_id: aId });
  const { data: mod } = await service
    .from("course_modules").insert({ course_id: course.id, name: "Tests", position: 1 }).select("id").single();
  await service.from("module_items").insert({
    module_id: mod.id, item_type: "link", title: "DSAT", url: `/test/${SLUG}`, position: 1,
  });
  info("course + link + enrolment ready");

  const a = await signIn(`sa-${TAG}@gmail.com`);
  const b = await signIn(`sb-${TAG}@gmail.com`);
  const adm = await signIn(`adm-${TAG}@gmail.com`);
  const t = await signIn(`t-${TAG}@gmail.com`);

  step("start run");
  const { data: start, error: sErr } = await a.rpc("start_test", { p_slug: SLUG });
  if (sErr) { bad("start_test", sErr.message); return cleanup(); }
  const runId = start.run_id;
  info("run", runId);

  step("student can't message before being paused");
  {
    const { error } = await a.rpc("student_send_proctor_message", { p_run_id: runId, p_kind: "preset", p_body: "👍 Okay" });
    if (isErr(error, "not_paused")) ok("send before pause → not_paused");
    else bad("send before pause → not_paused", `got ${error ? error.message : "no error"}`);
  }

  step("admin pauses the student");
  {
    const { error } = await adm.rpc("proctor_set_pause", { p_run_id: runId, p_paused: true });
    if (error) { bad("proctor_set_pause(true)", error.message); return cleanup(); }
    ok("admin paused the run");
  }

  step("authorization");
  {
    const { error: e1 } = await t.rpc("proctor_send_message", { p_run_id: runId, p_kind: "text", p_body: "hi" });
    if (isErr(e1, "not_authorized")) ok("non-admin teacher send → not_authorized (admin-only)");
    else bad("non-admin teacher send rejected", `got ${e1 ? e1.message : "no error"}`);

    const { error: e2 } = await b.rpc("student_send_proctor_message", { p_run_id: runId, p_kind: "text", p_body: "hi" });
    if (isErr(e2, "not_authorized")) ok("other student → not_authorized");
    else bad("other student rejected", `got ${e2 ? e2.message : "no error"}`);
  }

  step("two-way exchange");
  {
    const { error: ea } = await a.rpc("student_send_proctor_message", { p_run_id: runId, p_kind: "preset", p_body: "🙋 I have a question" });
    if (ea) bad("student sends preset", ea.message); else ok("student sends preset");

    const { error: ep } = await adm.rpc("proctor_send_message", { p_run_id: runId, p_kind: "pause", p_body: "Tech check — one moment" });
    if (ep) bad("admin sends pause reason", ep.message); else ok("admin sends pause reason");

    const { error: et } = await adm.rpc("proctor_send_message", { p_run_id: runId, p_kind: "text", p_body: "On my way" });
    if (et) bad("admin sends reply", et.message); else ok("admin sends reply");
  }

  step("records + RLS");
  {
    const sel = (c) => c.from("proctor_messages").select("sender,kind,body,created_at").eq("run_id", runId).order("created_at", { ascending: true });
    const { data: admView } = await sel(adm);
    if ((admView ?? []).length === 3) ok("admin reads full thread (3)"); else bad("admin reads 3", `got ${admView?.length}`);
    const senders = (admView ?? []).map((m) => m.sender).join(",");
    if (senders === "student,staff,staff") ok("sender order student,staff,staff"); else bad("sender order", senders);

    const { data: tView } = await sel(t);
    if ((tView ?? []).length === 3) ok("non-admin staff reads thread (read access kept)"); else bad("teacher reads 3", `got ${tView?.length}`);

    const { data: aView } = await sel(a);
    if ((aView ?? []).length === 3) ok("student A reads own thread (3)"); else bad("student A reads 3", `got ${aView?.length}`);

    const { data: bView } = await sel(b);
    if ((bView ?? []).length === 0) ok("unrelated student B sees nothing (RLS)"); else bad("student B sees nothing", `got ${bView?.length}`);
  }

  step("resume closes the student's window");
  {
    const { error: er } = await adm.rpc("proctor_set_pause", { p_run_id: runId, p_paused: false });
    if (er) bad("resume", er.message); else ok("admin resumed");
    const { error } = await a.rpc("student_send_proctor_message", { p_run_id: runId, p_kind: "text", p_body: "still there?" });
    if (isErr(error, "not_paused")) ok("student can't message after resume → not_paused");
    else bad("student blocked after resume", `got ${error ? error.message : "no error"}`);
  }

  return cleanup();

  async function cleanup() {
    step("cleanup");
    await service.from("courses").delete().eq("id", course.id).then(() => {}, () => {});
    for (const id of [adminId, teacherId, aId, bId]) await service.auth.admin.deleteUser(id).catch(() => {});
    info("removed disposable users + course");
  }
}

main()
  .catch((e) => bad("uncaught", e?.message ?? String(e)))
  .finally(() => {
    console.log(`\n----------------------------------`);
    console.log(`TOTAL: ${pass + fail}  PASS: ${pass}  FAIL: ${fail}`);
    console.log(`==================================`);
    process.exit(fail > 0 ? 1 : 0);
  });
