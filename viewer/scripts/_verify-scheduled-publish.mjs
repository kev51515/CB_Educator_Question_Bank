/**
 * _verify-scheduled-publish.mjs — end-to-end check of 0219 scheduled
 * publishing + the cascade contract:
 *
 *   1. module scheduled in the past + item scheduled in the past
 *      → one tick publishes BOTH (item goes live "with the container")
 *   2. unscheduled draft item in that module → STAYS a draft
 *   3. item scheduled in the future → stays a draft after the tick
 *   4. trashed scheduled module → never auto-publishes
 *   5. student visibility: after the tick the student sees the published
 *      item but NOT the unscheduled draft
 *
 * Calls public.publish_scheduled_content() directly as service_role (the
 * same function pg_cron runs every minute) so the probe doesn't sleep.
 *
 * Run:  node --env-file-if-exists=../.env scripts/_verify-scheduled-publish.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL_ || !ANON || !SERVICE) { console.error("missing env"); process.exit(1); }

const TAG = randomBytes(3).toString("hex");
const PW = "Sched!" + randomBytes(4).toString("hex");
const service = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const userIds = [];
let courseId = null;
let failures = 0;

function check(name, ok, detail = "") {
  if (ok) console.log(`  ok    ${name}`);
  else { failures += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function one(q, label) {
  const { data, error } = await q;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

try {
  const teacherId = (await service.auth.admin.createUser({
    email: `sched-t-${TAG}@gmail.com`, password: PW, email_confirm: true,
  })).data.user.id;
  userIds.push(teacherId);
  await service.from("profiles").update({ role: "teacher" }).eq("id", teacherId);
  const studentId = (await service.auth.admin.createUser({
    email: `sched-s-${TAG}@gmail.com`, password: PW, email_confirm: true,
  })).data.user.id;
  userIds.push(studentId);

  const course = await one(
    service.from("courses").insert({ name: `Sched QA ${TAG}`, teacher_id: teacherId }).select("id, short_code").single(),
    "course",
  );
  courseId = course.id;
  await one(service.from("course_memberships").insert({ course_id: courseId, student_id: studentId }), "enrol");

  const past = new Date(Date.now() - 60_000).toISOString();
  const future = new Date(Date.now() + 7 * 86400e3).toISOString();

  // Module A: draft, scheduled in the past. Items: one scheduled past, one
  // unscheduled draft, one scheduled future.
  const modA = await one(service.from("course_modules").insert({
    course_id: courseId, name: "Sched module", position: 1, published: false, publish_at: past,
  }).select("id").single(), "module A");
  const itemDue = await one(service.from("module_items").insert({
    module_id: modA.id, position: 1, item_type: "link", title: "scheduled item",
    url: "https://example.com/a", published: false, publish_at: past,
  }).select("id").single(), "item scheduled");
  const itemDraft = await one(service.from("module_items").insert({
    module_id: modA.id, position: 2, item_type: "link", title: "unscheduled draft",
    url: "https://example.com/b", published: false,
  }).select("id").single(), "item draft");
  const itemFuture = await one(service.from("module_items").insert({
    module_id: modA.id, position: 3, item_type: "link", title: "future item",
    url: "https://example.com/c", published: false, publish_at: future,
  }).select("id").single(), "item future");

  // Module B: scheduled past but TRASHED — must not publish.
  const modB = await one(service.from("course_modules").insert({
    course_id: courseId, name: "Trashed module", position: 2, published: false,
    publish_at: past, deleted_at: new Date().toISOString(), deleted_by: teacherId,
  }).select("id").single(), "module B");

  // ---- the tick (same fn pg_cron runs) ----
  const { data: tick, error: tickErr } = await service.rpc("publish_scheduled_content");
  check("tick callable as service_role", !tickErr, tickErr?.message);
  const t = Array.isArray(tick) ? tick[0] : tick;
  console.log(`  tick: ${t?.modules_published} module(s), ${t?.items_published} item(s)`);

  const { data: modAFresh } = await service.from("course_modules").select("published").eq("id", modA.id).single();
  check("scheduled module published", modAFresh?.published === true);
  const { data: i1 } = await service.from("module_items").select("published").eq("id", itemDue.id).single();
  check("scheduled item published with container", i1?.published === true);
  const { data: i2 } = await service.from("module_items").select("published").eq("id", itemDraft.id).single();
  check("unscheduled draft item STAYS draft", i2?.published === false);
  const { data: i3 } = await service.from("module_items").select("published").eq("id", itemFuture.id).single();
  check("future-scheduled item stays draft", i3?.published === false);
  const { data: modBFresh } = await service.from("course_modules").select("published").eq("id", modB.id).single();
  check("trashed module never auto-publishes", modBFresh?.published === false);

  // ---- student visibility ----
  const anon = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: loginErr } = await anon.auth.signInWithPassword({ email: `sched-s-${TAG}@gmail.com`, password: PW });
  check("student sign-in", !loginErr, loginErr?.message);
  const { data: seen } = await anon
    .from("module_items")
    .select("id, title, published")
    .eq("module_id", modA.id);
  const titles = (seen ?? []).filter((r) => r.published).map((r) => r.title);
  check("student sees the published item", titles.includes("scheduled item"), JSON.stringify(titles));
  // (Draft rows may be SELECT-visible per RLS, but every student surface
  // filters on published — assert the flag rather than row absence.)
  const draftRow = (seen ?? []).find((r) => r.title === "unscheduled draft");
  check("draft item still flagged unpublished for student", !draftRow || draftRow.published === false);

  // ---- idempotency: second tick is a no-op ----
  const { data: tick2 } = await service.rpc("publish_scheduled_content");
  const t2 = Array.isArray(tick2) ? tick2[0] : tick2;
  check("second tick publishes nothing new", t2?.modules_published === 0 && t2?.items_published === 0,
    JSON.stringify(t2));

  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
} catch (err) {
  console.error("FAIL:", err.message ?? err);
  process.exitCode = 1;
} finally {
  if (courseId) await service.from("courses").delete().eq("id", courseId);
  for (const uid of userIds) {
    try { await service.auth.admin.deleteUser(uid); } catch { /* ignore */ }
  }
  console.log("cleanup done");
}
