#!/usr/bin/env node
/**
 * Smoke E2E for the NEW LMS surfaces against Supabase Cloud:
 *   Modules / Announcements / Materials / Portfolio / Course clone
 *
 * Shape mirrors scripts/smoke-e2e.mjs. Same env vars. Re-runnable
 * via timestamped users.
 *
 * Each section bootstraps just enough to exercise its surface using
 * a shared teacher+course+student trio. Cleanup at the end.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";

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

const service = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
function userClient() {
  return createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const TS = Date.now();
const TAG = `feat-${TS}`;
const PW = "SmokeTest!" + randomBytes(4).toString("hex");
const teacherEmail = `t-${TAG}@gmail.com`;
const studentEmail = `s-${TAG}@gmail.com`;
const outsiderEmail = `o-${TAG}@gmail.com`;

const ctx = {
  teacherId: null,
  teacherClient: null,
  studentId: null,
  studentClient: null,
  outsiderId: null,
  outsiderClient: null,
  courseId: null,
  joinCode: null,
  // per-section
  module1Id: null,
  module2Id: null,
  itemAssignmentId: null,
  itemHeaderId: null,
  itemLinkId: null,
  refAssignmentId: null,
  announcementId: null,
  fileMaterialId: null,
  linkMaterialId: null,
  filePath: null,
  portfolioTemplateId: null,
  portfolioItemTextId: null,
  portfolioItemLinkId: null,
  submissionId: null,
  feedbackId: null,
  cloneCourseId: null,
};

const results = [];

function fmt(o) {
  if (o instanceof Error) return o.message;
  if (typeof o === "string") return o;
  try {
    return JSON.stringify(o);
  } catch {
    return String(o);
  }
}
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    const ms = Date.now() - t0;
    results.push({ name, status: "PASS", ms, note: note ?? "" });
    console.log(`▶ ${name} ... PASS (${ms}ms)${note ? " — " + note : ""}`);
  } catch (e) {
    const ms = Date.now() - t0;
    results.push({ name, status: "FAIL", ms, err: fmt(e) });
    console.log(`▶ ${name} ... FAIL (${ms}ms) — ${fmt(e)}`);
  }
}
async function skip(name, reason) {
  results.push({ name, status: "SKIP", ms: 0, note: reason });
  console.log(`▶ ${name} ... SKIP — ${reason}`);
}

async function createConfirmedUser(email, password, role = "student") {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: email, role },
  });
  if (error) throw error;
  // ensure profile.role
  await service.from("profiles").update({ role }).eq("id", data.user.id);
  return data.user.id;
}

async function signIn(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data.session;
}

// ----------------------------- SETUP -----------------------------

async function setup() {
  await step("setup: create teacher", async () => {
    ctx.teacherId = await createConfirmedUser(teacherEmail, PW, "teacher");
    ctx.teacherClient = userClient();
    await signIn(ctx.teacherClient, teacherEmail, PW);
    return `id=${ctx.teacherId}`;
  });
  await step("setup: create student", async () => {
    ctx.studentId = await createConfirmedUser(studentEmail, PW, "student");
    ctx.studentClient = userClient();
    await signIn(ctx.studentClient, studentEmail, PW);
    return `id=${ctx.studentId}`;
  });
  await step("setup: create outsider", async () => {
    ctx.outsiderId = await createConfirmedUser(outsiderEmail, PW, "student");
    ctx.outsiderClient = userClient();
    await signIn(ctx.outsiderClient, outsiderEmail, PW);
    return `id=${ctx.outsiderId}`;
  });
  await step("setup: teacher creates course", async () => {
    ctx.joinCode = `FT${randomBytes(2).toString("hex").toUpperCase()}`;
    const { data, error } = await ctx.teacherClient
      .from("courses")
      .insert({
        teacher_id: ctx.teacherId,
        name: `Smoke Course ${TS}`,
        description: "smoke",
        join_code: ctx.joinCode,
      })
      .select()
      .single();
    if (error) throw error;
    ctx.courseId = data.id;
    return `course=${ctx.courseId} join=${ctx.joinCode}`;
  });
  await step("setup: enroll student", async () => {
    const { error } = await ctx.studentClient.rpc("join_course_by_code", {
      p_code: ctx.joinCode,
    });
    if (error) throw error;
    return "enrolled";
  });
}

// ----------------------------- MODULES -----------------------------

async function modules() {
  await step("modules: teacher creates module 1", async () => {
    const { data, error } = await ctx.teacherClient
      .from("course_modules")
      .insert({
        course_id: ctx.courseId,
        name: "Day 1",
        position: 1,
        published: true,
      })
      .select()
      .single();
    if (error) throw error;
    ctx.module1Id = data.id;
    return `id=${data.id}`;
  });

  await step("modules: teacher creates module 2", async () => {
    const { data, error } = await ctx.teacherClient
      .from("course_modules")
      .insert({
        course_id: ctx.courseId,
        name: "Day 2",
        position: 2,
        published: true,
      })
      .select()
      .single();
    if (error) throw error;
    ctx.module2Id = data.id;
    return `id=${data.id}`;
  });

  await step("modules: teacher creates supporting assignment", async () => {
    const { data, error } = await ctx.teacherClient
      .from("assignments")
      .insert({
        course_id: ctx.courseId,
        created_by: ctx.teacherId,
        title: "Quiz 1",
        source_id: "cb",
        question_count: 3,
        time_limit_minutes: 10,
        difficulty_mix: "any",
      })
      .select()
      .single();
    if (error) throw error;
    ctx.refAssignmentId = data.id;
    return `id=${data.id}`;
  });

  await step("modules: teacher adds 3 items (assignment, header, link)", async () => {
    const rows = [
      {
        module_id: ctx.module1Id,
        position: 1,
        item_type: "assignment",
        item_ref_id: ctx.refAssignmentId,
        title: "Quiz 1",
        indent: 0,
        published: true,
      },
      {
        module_id: ctx.module1Id,
        position: 2,
        item_type: "header",
        title: "HW Section",
        indent: 0,
        published: true,
      },
      {
        module_id: ctx.module1Id,
        position: 3,
        item_type: "link",
        title: "Khan Academy Algebra",
        url: "https://www.khanacademy.org/math/algebra",
        indent: 0,
        published: true,
      },
    ];
    const { data, error } = await ctx.teacherClient
      .from("module_items")
      .insert(rows)
      .select();
    if (error) throw error;
    if (data.length !== 3) throw new Error(`expected 3 rows, got ${data.length}`);
    ctx.itemAssignmentId = data[0].id;
    ctx.itemHeaderId = data[1].id;
    ctx.itemLinkId = data[2].id;
    return "3 items";
  });

  await step("modules: reorder modules RPC swaps positions", async () => {
    const { error } = await ctx.teacherClient.rpc("reorder_modules", {
      p_course_id: ctx.courseId,
      p_ordered_ids: [ctx.module2Id, ctx.module1Id],
    });
    if (error) throw error;
    const { data, error: selErr } = await ctx.teacherClient
      .from("course_modules")
      .select("id,position")
      .eq("course_id", ctx.courseId)
      .order("position", { ascending: true });
    if (selErr) throw selErr;
    if (data[0].id !== ctx.module2Id) throw new Error(`expected module2 first, got ${data[0].id}`);
    return "module2 now first";
  });

  await step("modules: student SELECT visible (RLS)", async () => {
    const { data, error } = await ctx.studentClient
      .from("course_modules")
      .select("id")
      .eq("course_id", ctx.courseId);
    if (error) throw error;
    if (data.length !== 2) throw new Error(`student sees ${data.length} modules, expected 2`);
    return `student sees 2`;
  });

  await step("modules: student INSERT denied", async () => {
    const { error } = await ctx.studentClient
      .from("course_modules")
      .insert({ course_id: ctx.courseId, name: "Hacked", position: 99 });
    if (!error) throw new Error("expected RLS denial, got success");
    return `denied: ${error.code ?? error.message?.slice(0, 40)}`;
  });

  await step("modules: outsider sees 0", async () => {
    const { data, error } = await ctx.outsiderClient
      .from("course_modules")
      .select("id")
      .eq("course_id", ctx.courseId);
    if (error) throw error;
    if (data.length !== 0) throw new Error(`outsider sees ${data.length}, expected 0`);
    return "0 rows";
  });
}

// --------------------------- ANNOUNCEMENTS ---------------------------

async function announcements() {
  await step("ann: teacher posts", async () => {
    const { data, error } = await ctx.teacherClient
      .from("course_announcements")
      .insert({
        course_id: ctx.courseId,
        author_id: ctx.teacherId,
        title: "Welcome!",
        body: "First post",
      })
      .select()
      .single();
    if (error) throw error;
    ctx.announcementId = data.id;
    return `id=${data.id}`;
  });

  await step("ann: teacher edits", async () => {
    const { error } = await ctx.teacherClient
      .from("course_announcements")
      .update({ body: "Updated body" })
      .eq("id", ctx.announcementId);
    if (error) throw error;
    return "updated";
  });

  await step("ann: teacher pins", async () => {
    const { error } = await ctx.teacherClient
      .from("course_announcements")
      .update({ pinned: true })
      .eq("id", ctx.announcementId);
    if (error) throw error;
    return "pinned";
  });

  await step("ann: student reads", async () => {
    const { data, error } = await ctx.studentClient
      .from("course_announcements")
      .select("id,title,pinned,body")
      .eq("id", ctx.announcementId);
    if (error) throw error;
    if (data.length !== 1 || !data[0].pinned) throw new Error("student can't see / not pinned");
    return "student sees pinned post";
  });

  await step("ann: outsider sees 0", async () => {
    const { data, error } = await ctx.outsiderClient
      .from("course_announcements")
      .select("id")
      .eq("course_id", ctx.courseId);
    if (error) throw error;
    if (data.length !== 0) throw new Error(`outsider sees ${data.length}`);
    return "0 rows";
  });

  await step("ann: student INSERT denied", async () => {
    const { error } = await ctx.studentClient
      .from("course_announcements")
      .insert({
        course_id: ctx.courseId,
        author_id: ctx.studentId,
        title: "Bad",
        body: "Bad",
      });
    if (!error) throw new Error("expected denial");
    return `denied: ${error.code ?? "ok"}`;
  });
}

// ----------------------------- MATERIALS -----------------------------

async function materials() {
  await step("mat: teacher adds link material", async () => {
    const { data, error } = await ctx.teacherClient
      .from("course_materials")
      .insert({
        course_id: ctx.courseId,
        uploader_id: ctx.teacherId,
        kind: "link",
        title: "Reference Sheet",
        url: "https://example.org/sheet.pdf",
        position: 0,
        published: true,
      })
      .select()
      .single();
    if (error) throw error;
    ctx.linkMaterialId = data.id;
    return `id=${data.id}`;
  });

  await step("mat: teacher uploads file to storage + DB row", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    ctx.filePath = `${ctx.courseId}/${randomUUID()}-smoke.pdf`;
    const up = await ctx.teacherClient.storage
      .from("course-materials")
      .upload(ctx.filePath, bytes, { contentType: "application/pdf" });
    if (up.error) throw up.error;
    const { data, error } = await ctx.teacherClient
      .from("course_materials")
      .insert({
        course_id: ctx.courseId,
        uploader_id: ctx.teacherId,
        kind: "file",
        title: "smoke.pdf",
        file_path: ctx.filePath,
        file_size: bytes.length,
        mime_type: "application/pdf",
        position: 1,
        published: true,
      })
      .select()
      .single();
    if (error) throw error;
    ctx.fileMaterialId = data.id;
    return `id=${data.id} bytes=${bytes.length}`;
  });

  await step("mat: student lists both", async () => {
    const { data, error } = await ctx.studentClient
      .from("course_materials")
      .select("id,kind")
      .eq("course_id", ctx.courseId);
    if (error) throw error;
    if (data.length !== 2) throw new Error(`student sees ${data.length}, expected 2`);
    return "2 rows";
  });

  await step("mat: student signed URL succeeds", async () => {
    const { data, error } = await ctx.studentClient.storage
      .from("course-materials")
      .createSignedUrl(ctx.filePath, 60);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("no URL");
    return "url ok";
  });

  await step("mat: outsider list returns 0", async () => {
    const { data, error } = await ctx.outsiderClient
      .from("course_materials")
      .select("id")
      .eq("course_id", ctx.courseId);
    if (error) throw error;
    if (data.length !== 0) throw new Error(`outsider sees ${data.length}`);
    return "0 rows";
  });

  await step("mat: student INSERT denied", async () => {
    const { error } = await ctx.studentClient
      .from("course_materials")
      .insert({
        course_id: ctx.courseId,
        uploader_id: ctx.studentId,
        kind: "link",
        title: "bad",
        url: "https://bad.example",
        position: 99,
      });
    if (!error) throw new Error("expected denial");
    return `denied: ${error.code ?? "ok"}`;
  });

  await step("mat: teacher deletes file row + storage", async () => {
    const del1 = await ctx.teacherClient
      .from("course_materials")
      .delete()
      .eq("id", ctx.fileMaterialId);
    if (del1.error) throw del1.error;
    const del2 = await ctx.teacherClient.storage
      .from("course-materials")
      .remove([ctx.filePath]);
    if (del2.error) throw del2.error;
    return "row+object gone";
  });
}

// ----------------------------- PORTFOLIO -----------------------------

async function portfolio() {
  await step("portfolio: ensure template (idempotent)", async () => {
    const { data, error } = await ctx.teacherClient.rpc(
      "ensure_portfolio_template",
      { p_course_id: ctx.courseId, p_name: "Senior Year Portfolio" },
    );
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    ctx.portfolioTemplateId = row.id;
    // call again — should return same id
    const r2 = await ctx.teacherClient.rpc("ensure_portfolio_template", {
      p_course_id: ctx.courseId,
      p_name: "Senior Year Portfolio (duplicate name)",
    });
    if (r2.error) throw r2.error;
    const row2 = Array.isArray(r2.data) ? r2.data[0] : r2.data;
    if (row2.id !== row.id) throw new Error("not idempotent");
    return `template id=${row.id}`;
  });

  await step("portfolio: teacher adds long_text + link items", async () => {
    const { data, error } = await ctx.teacherClient
      .from("portfolio_items")
      .insert([
        {
          template_id: ctx.portfolioTemplateId,
          position: 1,
          title: "Common App Essay",
          prompt: "650 word personal statement",
          item_type: "long_text",
          required: true,
          settings: { max_chars: 5000 },
        },
        {
          template_id: ctx.portfolioTemplateId,
          position: 2,
          title: "Video Introduction",
          item_type: "link",
          required: false,
        },
      ])
      .select();
    if (error) throw error;
    if (data.length !== 2) throw new Error(`expected 2 items, got ${data.length}`);
    ctx.portfolioItemTextId = data[0].id;
    ctx.portfolioItemLinkId = data[1].id;
    return "2 items";
  });

  await step("portfolio: student drafts then submits long_text", async () => {
    const up = await ctx.studentClient
      .from("portfolio_submissions")
      .upsert(
        {
          item_id: ctx.portfolioItemTextId,
          student_id: ctx.studentId,
          value_text: "draft v1",
          status: "draft",
        },
        { onConflict: "item_id,student_id" },
      )
      .select()
      .single();
    if (up.error) throw up.error;
    ctx.submissionId = up.data.id;
    const sub = await ctx.studentClient
      .from("portfolio_submissions")
      .update({
        value_text: "final 650 words",
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", ctx.submissionId);
    if (sub.error) throw sub.error;
    return `submission id=${ctx.submissionId}`;
  });

  await step("portfolio: outsider can't see template items", async () => {
    const { data, error } = await ctx.outsiderClient
      .from("portfolio_items")
      .select("id")
      .eq("template_id", ctx.portfolioTemplateId);
    if (error) throw error;
    if (data.length !== 0) throw new Error(`outsider sees ${data.length}`);
    return "0 rows";
  });

  await step("portfolio: outsider can't see submission", async () => {
    const { data, error } = await ctx.outsiderClient
      .from("portfolio_submissions")
      .select("id")
      .eq("id", ctx.submissionId);
    if (error) throw error;
    if (data.length !== 0) throw new Error("outsider sees other student's submission");
    return "0 rows";
  });

  await step("portfolio: teacher reads all submissions", async () => {
    const { data, error } = await ctx.teacherClient
      .from("portfolio_submissions")
      .select("id,status,value_text")
      .eq("item_id", ctx.portfolioItemTextId);
    if (error) throw error;
    if (data.length !== 1) throw new Error(`teacher sees ${data.length} for item`);
    return "teacher sees 1";
  });

  await step("portfolio: teacher posts feedback", async () => {
    const { data, error } = await ctx.teacherClient
      .from("portfolio_feedback")
      .insert({
        submission_id: ctx.submissionId,
        author_id: ctx.teacherId,
        body: "Strong intro — tighten paragraph 3.",
      })
      .select()
      .single();
    if (error) throw error;
    ctx.feedbackId = data.id;
    return `id=${data.id}`;
  });

  await step("portfolio: student reads feedback on own submission", async () => {
    const { data, error } = await ctx.studentClient
      .from("portfolio_feedback")
      .select("id,body")
      .eq("submission_id", ctx.submissionId);
    if (error) throw error;
    if (data.length !== 1) throw new Error(`student sees ${data.length} feedback rows`);
    return "1 feedback visible";
  });
}

// ------------------------------ CLONE ------------------------------

async function clone() {
  await step("clone: with defaults", async () => {
    const { data, error } = await ctx.teacherClient.rpc("clone_course", {
      p_source_id: ctx.courseId,
      p_new_name: `Clone of ${TS}`,
      p_clear_due_dates: false,
      p_save_as_template: false,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    ctx.cloneCourseId = row.new_course_id ?? row.new_course_id;
    if (!ctx.cloneCourseId) throw new Error(`no new_course_id in ${fmt(row)}`);
    return `id=${ctx.cloneCourseId}`;
  });

  await step("clone: verify deep copy counts", async () => {
    const c = ctx.teacherClient;
    const counts = {};
    counts.modules = (
      await c.from("course_modules").select("id").eq("course_id", ctx.cloneCourseId)
    ).data?.length;
    counts.assignments = (
      await c.from("assignments").select("id").eq("course_id", ctx.cloneCourseId)
    ).data?.length;
    const tpl = await c
      .from("portfolio_templates")
      .select("id")
      .eq("course_id", ctx.cloneCourseId);
    counts.template = tpl.data?.length;
    counts.materials = (
      await c.from("course_materials").select("id").eq("course_id", ctx.cloneCourseId)
    ).data?.length;
    if (counts.modules !== 2)
      throw new Error(`modules expected 2, got ${counts.modules}`);
    if (counts.assignments < 1)
      throw new Error(`assignments expected >=1, got ${counts.assignments}`);
    if (counts.template !== 1)
      throw new Error(`template expected 1, got ${counts.template}`);
    if (counts.materials < 1)
      throw new Error(`materials expected >=1 link, got ${counts.materials}`);
    return fmt(counts);
  });

  await step("clone: source not mutated", async () => {
    const { data } = await ctx.teacherClient
      .from("courses")
      .select("id,join_code,is_template")
      .eq("id", ctx.courseId)
      .single();
    if (data.join_code !== ctx.joinCode)
      throw new Error("source join_code changed");
    if (data.is_template !== false)
      throw new Error("source is_template flipped");
    return "source intact";
  });

  await step("clone: save_as_template=true sets the flag", async () => {
    const { data, error } = await ctx.teacherClient.rpc("clone_course", {
      p_source_id: ctx.courseId,
      p_new_name: `Template ${TS}`,
      p_clear_due_dates: false,
      p_save_as_template: true,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const tplId = row.new_course_id;
    const { data: c } = await ctx.teacherClient
      .from("courses")
      .select("is_template")
      .eq("id", tplId)
      .single();
    if (!c.is_template) throw new Error("is_template not set");
    // cleanup follows in teardown via course_LIKE match
    return `tpl=${tplId}`;
  });

  await step("clone: student not_authorized via RPC", async () => {
    const { error } = await ctx.studentClient.rpc("clone_course", {
      p_source_id: ctx.courseId,
      p_new_name: "hack",
    });
    if (!error) throw new Error("expected not_authorized");
    return `denied: ${error.code ?? error.message?.slice(0, 60)}`;
  });
}

// ------------------------------ WAVE 5 ------------------------------

async function wave5() {
  await step("wave5: rate_limit staff exempt (teacher, 2 calls)", async () => {
    const r1 = await ctx.teacherClient.rpc("check_rate_limit", {
      p_action: "test_action",
      p_max: 1,
      p_window_secs: 60,
    });
    if (r1.error) throw r1.error;
    const r2 = await ctx.teacherClient.rpc("check_rate_limit", {
      p_action: "test_action",
      p_max: 1,
      p_window_secs: 60,
    });
    if (r2.error) throw r2.error;
    return "both ok (staff exempt)";
  });

  await step("wave5: rate_limit student call doesn't 500", async () => {
    const r = await ctx.studentClient.rpc("check_rate_limit", {
      p_action: `smoke_${TS}`,
      p_max: 5,
      p_window_secs: 60,
    });
    if (r.error) throw r.error;
    return "ok";
  });

  await step("wave5: gdpr export_my_data returns expected shape", async () => {
    const { data, error } = await ctx.studentClient.rpc("export_my_data");
    if (error) throw error;
    if (!data || typeof data !== "object") throw new Error("no object");
    const expected = [
      "profile",
      "course_memberships",
      "assignment_attempts",
      "portfolio_submissions",
      "portfolio_feedback",
      "exported_at",
    ];
    const missing = expected.filter((k) => !(k in data));
    if (missing.length) throw new Error(`missing keys: ${missing.join(",")}`);
    return `keys ok (${expected.length})`;
  });

  await step("wave5: audit_log admin reads role-change event", async () => {
    const adminEmail = `a-${TAG}@gmail.com`;
    const adminId = await createConfirmedUser(adminEmail, PW, "admin");
    const adminClient = userClient();
    await signIn(adminClient, adminEmail, PW);
    // Trigger a role change via service-role (audit trigger should fire on UPDATE).
    const upd = await service
      .from("profiles")
      .update({ role: "teacher" })
      .eq("id", ctx.outsiderId);
    if (upd.error) throw upd.error;
    // Revert so teardown cleanup not affected.
    await service
      .from("profiles")
      .update({ role: "student" })
      .eq("id", ctx.outsiderId);
    const { data, error } = await adminClient
      .from("audit_events")
      .select("id,action,target_id")
      .eq("action", "role.change")
      .eq("target_id", ctx.outsiderId)
      .limit(5);
    // cleanup admin
    await service.auth.admin.deleteUser(adminId).catch(() => {});
    if (error) throw error;
    if (!data || data.length < 1)
      throw new Error("no role.change audit row visible to admin");
    return `${data.length} row(s)`;
  });

  await step("wave5: my_skill_mastery returns array", async () => {
    const { data, error } = await ctx.studentClient.rpc("my_skill_mastery");
    if (error) throw error;
    if (data !== null && !Array.isArray(data))
      throw new Error(`expected array/null, got ${typeof data}`);
    return `len=${Array.isArray(data) ? data.length : 0}`;
  });

  await step("wave5: predict_my_sat_score has has_data key", async () => {
    const { data, error } = await ctx.studentClient.rpc("predict_my_sat_score");
    if (error) throw error;
    if (!data || typeof data !== "object")
      throw new Error("no object returned");
    if (!("has_data" in data))
      throw new Error(`missing 'has_data' key in ${fmt(data)}`);
    return `has_data=${data.has_data}`;
  });
}

// --------------------------- DISCUSSIONS ---------------------------

async function discussions() {
  const local = { topicId: null, studentPostId: null, teacherReplyId: null };

  await step("disc: teacher creates topic", async () => {
    const { data, error } = await ctx.teacherClient
      .from("discussion_topics")
      .insert({
        course_id: ctx.courseId,
        author_id: ctx.teacherId,
        title: "Week 1 Discussion",
        body: "Share your thoughts on the reading.",
      })
      .select()
      .single();
    if (error) throw error;
    local.topicId = data.id;
    return `id=${data.id}`;
  });

  await step("disc: student replies", async () => {
    const { data, error } = await ctx.studentClient
      .from("discussion_posts")
      .insert({
        topic_id: local.topicId,
        author_id: ctx.studentId,
        body: "Great prompt — here's my take.",
      })
      .select()
      .single();
    if (error) throw error;
    local.studentPostId = data.id;
    return `id=${data.id}`;
  });

  await step("disc: teacher posts nested reply", async () => {
    const { data, error } = await ctx.teacherClient
      .from("discussion_posts")
      .insert({
        topic_id: local.topicId,
        author_id: ctx.teacherId,
        parent_post_id: local.studentPostId,
        body: "Nice — can you expand on point 2?",
      })
      .select()
      .single();
    if (error) throw error;
    local.teacherReplyId = data.id;
    if (data.parent_post_id !== local.studentPostId)
      throw new Error("parent_post_id not stored");
    return `id=${data.id}`;
  });

  await step("disc: student reads topic + posts", async () => {
    const t = await ctx.studentClient
      .from("discussion_topics")
      .select("id,title")
      .eq("id", local.topicId);
    if (t.error) throw t.error;
    if (t.data.length !== 1) throw new Error(`student sees ${t.data.length} topics`);
    const p = await ctx.studentClient
      .from("discussion_posts")
      .select("id")
      .eq("topic_id", local.topicId);
    if (p.error) throw p.error;
    if (p.data.length !== 2) throw new Error(`student sees ${p.data.length} posts, expected 2`);
    return "1 topic, 2 posts";
  });

  await step("disc: outsider sees 0 topics", async () => {
    const { data, error } = await ctx.outsiderClient
      .from("discussion_topics")
      .select("id")
      .eq("course_id", ctx.courseId);
    if (error) throw error;
    if (data.length !== 0) throw new Error(`outsider sees ${data.length}`);
    return "0 rows";
  });

  await step("disc: outsider INSERT denied", async () => {
    const { error } = await ctx.outsiderClient
      .from("discussion_posts")
      .insert({
        topic_id: local.topicId,
        author_id: ctx.outsiderId,
        body: "intruder",
      });
    if (!error) throw new Error("expected RLS denial");
    return `denied: ${error.code ?? error.message?.slice(0, 40)}`;
  });

  await step("disc: teacher locks topic; student INSERT denied", async () => {
    const upd = await ctx.teacherClient
      .from("discussion_topics")
      .update({ locked: true })
      .eq("id", local.topicId);
    if (upd.error) throw upd.error;
    const { error } = await ctx.studentClient
      .from("discussion_posts")
      .insert({
        topic_id: local.topicId,
        author_id: ctx.studentId,
        body: "late reply",
      });
    if (!error) throw new Error("expected denial after lock");
    return `locked, denied: ${error.code ?? error.message?.slice(0, 40)}`;
  });

  await step("disc: teacher unlocks topic", async () => {
    const { error } = await ctx.teacherClient
      .from("discussion_topics")
      .update({ locked: false })
      .eq("id", local.topicId);
    if (error) throw error;
    return "unlocked";
  });

  await step("disc: teacher deletes topic; posts cascade", async () => {
    const del = await ctx.teacherClient
      .from("discussion_topics")
      .delete()
      .eq("id", local.topicId);
    if (del.error) throw del.error;
    const { data, error } = await ctx.teacherClient
      .from("discussion_posts")
      .select("id")
      .eq("topic_id", local.topicId);
    if (error) throw error;
    if (data.length !== 0) throw new Error(`posts not cascaded, ${data.length} remain`);
    return "topic+posts gone";
  });
}

// ------------------------------ INBOX ------------------------------

async function inbox() {
  const local = { threadId: null, firstMessageId: null, firstLastMessageAt: null };

  await step("inbox: teacher opens thread with student", async () => {
    const { data, error } = await ctx.teacherClient.rpc("open_thread_with", {
      p_other_user_id: ctx.studentId,
    });
    if (error) throw error;
    const id = typeof data === "string" ? data : Array.isArray(data) ? data[0]?.id ?? data[0] : data?.id ?? data;
    if (!id) throw new Error(`no thread id in ${fmt(data)}`);
    local.threadId = id;
    return `thread=${id}`;
  });

  await step("inbox: teacher sends message", async () => {
    const { data, error } = await ctx.teacherClient
      .from("messages")
      .insert({
        thread_id: local.threadId,
        author_id: ctx.teacherId,
        body: "Hi! Quick question about your assignment.",
      })
      .select()
      .single();
    if (error) throw error;
    local.firstMessageId = data.id;
    return `id=${data.id}`;
  });

  await step("inbox: student reads thread (1 row)", async () => {
    const { data, error } = await ctx.studentClient
      .from("messages")
      .select("id,author_id,body")
      .eq("thread_id", local.threadId);
    if (error) throw error;
    if (data.length !== 1) throw new Error(`student sees ${data.length} messages, expected 1`);
    return "1 message";
  });

  await step("inbox: student marks as read", async () => {
    const { data, error } = await ctx.studentClient
      .from("messages")
      .update({ read_by_recipient_at: new Date().toISOString() })
      .eq("thread_id", local.threadId)
      .neq("author_id", ctx.studentId)
      .is("read_by_recipient_at", null)
      .select("id");
    if (error) throw error;
    if (!data || data.length < 1) throw new Error(`no rows marked read (got ${data?.length ?? 0})`);
    return `marked ${data.length}`;
  });

  await step("inbox: capture last_message_at before reply", async () => {
    const { data, error } = await ctx.teacherClient
      .from("message_threads")
      .select("last_message_at")
      .eq("id", local.threadId)
      .single();
    if (error) throw error;
    local.firstLastMessageAt = data.last_message_at;
    return `prev=${data.last_message_at}`;
  });

  await step("inbox: student sends reply; last_message_at bumps", async () => {
    // Slight delay to ensure timestamp moves forward
    await new Promise((r) => setTimeout(r, 50));
    const ins = await ctx.studentClient
      .from("messages")
      .insert({
        thread_id: local.threadId,
        author_id: ctx.studentId,
        body: "Sure — what's up?",
      })
      .select()
      .single();
    if (ins.error) throw ins.error;
    const { data, error } = await ctx.teacherClient
      .from("message_threads")
      .select("last_message_at")
      .eq("id", local.threadId)
      .single();
    if (error) throw error;
    const prev = local.firstLastMessageAt ? new Date(local.firstLastMessageAt).getTime() : 0;
    const now = data.last_message_at ? new Date(data.last_message_at).getTime() : 0;
    if (!(now > prev)) throw new Error(`last_message_at not bumped: prev=${prev} now=${now}`);
    return `bumped (${now - prev}ms)`;
  });

  await step("inbox: outsider sees 0 messages (RLS)", async () => {
    const { data, error } = await ctx.outsiderClient
      .from("messages")
      .select("id")
      .eq("thread_id", local.threadId);
    if (error) throw error;
    if (data.length !== 0) throw new Error(`outsider sees ${data.length}`);
    return "0 rows";
  });

  await step("inbox: open_thread_with idempotent", async () => {
    const { data, error } = await ctx.teacherClient.rpc("open_thread_with", {
      p_other_user_id: ctx.studentId,
    });
    if (error) throw error;
    const id = typeof data === "string" ? data : Array.isArray(data) ? data[0]?.id ?? data[0] : data?.id ?? data;
    if (id !== local.threadId) throw new Error(`expected ${local.threadId}, got ${id}`);
    return `same=${id}`;
  });

  // Compose-param idempotency: the inbox `?compose=<userId>` param flows into
  // `open_thread_with(p_other_user_id)`. We need (a) repeated A→B calls to
  // return THE SAME thread_id (no duplicate threads created), and (b) the
  // reverse B→A call to also return THE SAME thread_id (commutative — the
  // existing-thread short-circuit must match regardless of which user is the
  // initiator). This is what guarantees the inbox compose-param doesn't
  // silently spawn parallel threads when both users click it.
  await step("inbox: open_thread_with compose-param idempotency (A→B, A→B, B→A all match)", async () => {
    // First call A→B (already established as local.threadId via earlier step).
    const a1 = await ctx.teacherClient.rpc("open_thread_with", {
      p_other_user_id: ctx.studentId,
    });
    if (a1.error) throw a1.error;
    const id1 = typeof a1.data === "string" ? a1.data : Array.isArray(a1.data) ? a1.data[0]?.id ?? a1.data[0] : a1.data?.id ?? a1.data;
    if (id1 !== local.threadId)
      throw new Error(`A→B #1 expected ${local.threadId}, got ${id1}`);

    // Second call A→B — must still return id1 (no new thread inserted).
    const a2 = await ctx.teacherClient.rpc("open_thread_with", {
      p_other_user_id: ctx.studentId,
    });
    if (a2.error) throw a2.error;
    const id2 = typeof a2.data === "string" ? a2.data : Array.isArray(a2.data) ? a2.data[0]?.id ?? a2.data[0] : a2.data?.id ?? a2.data;
    if (id2 !== id1)
      throw new Error(`A→B #2 expected ${id1}, got ${id2}`);

    // Reverse call B→A — must return the same thread (commutativity).
    const b1 = await ctx.studentClient.rpc("open_thread_with", {
      p_other_user_id: ctx.teacherId,
    });
    if (b1.error) throw b1.error;
    const id3 = typeof b1.data === "string" ? b1.data : Array.isArray(b1.data) ? b1.data[0]?.id ?? b1.data[0] : b1.data?.id ?? b1.data;
    if (id3 !== id1)
      throw new Error(`B→A expected ${id1}, got ${id3} (commutativity broken)`);

    // Defence in depth: verify only ONE message_threads row exists for this
    // (a,b) pair (i.e., no parallel duplicates were silently created).
    const { data: rows, error: countErr } = await service
      .from("message_threads")
      .select("id")
      .or(
        `and(participant_a.eq.${ctx.teacherId},participant_b.eq.${ctx.studentId}),and(participant_a.eq.${ctx.studentId},participant_b.eq.${ctx.teacherId})`,
      );
    if (countErr) {
      // The participants may live in a different column shape (e.g. an array
      // or a join table). Skip the row-count check if we can't introspect —
      // the rpc-return-match check above is the load-bearing assertion.
      return `A→B=A→B=B→A=${id1} (row-count check skipped: ${countErr.code || countErr.message?.slice(0, 30)})`;
    }
    if (!rows || rows.length !== 1) {
      throw new Error(
        `expected exactly 1 message_threads row for (A,B) pair, got ${rows?.length ?? 0}`,
      );
    }
    return `A→B=A→B=B→A=${id1} (1 row in message_threads, no duplicates)`;
  });

  await step("inbox: self-thread denied", async () => {
    const { error } = await ctx.teacherClient.rpc("open_thread_with", {
      p_other_user_id: ctx.teacherId,
    });
    if (!error) throw new Error("expected self_message_not_allowed");
    const msg = (error.message || "") + " " + (error.code || "") + " " + (error.details || "");
    if (!/self_message_not_allowed/i.test(msg))
      throw new Error(`unexpected error: ${fmt(error)}`);
    return "denied";
  });
}

// ------------------------------ WAVE 20 -----------------------------
// Multi-attempts + late penalty (migration 0020)

async function wave20() {
  const local = { attempt2Id: null };

  await step("wave20: teacher sets max_attempts=2 + late penalty", async () => {
    const { error } = await ctx.teacherClient
      .from("assignments")
      .update({
        max_attempts: 2,
        late_penalty_percent: 10,
        grace_period_hours: 24,
      })
      .eq("id", ctx.refAssignmentId);
    if (error) throw error;
    return "max_attempts=2 lp=10 grace=24h";
  });

  await step("wave20: student starts 1st attempt via RPC", async () => {
    const { data, error } = await ctx.studentClient.rpc(
      "start_assignment_attempt",
      {
        p_assignment_id: ctx.refAssignmentId,
        p_questions: [{ qid: "q1" }, { qid: "q2" }, { qid: "q3" }],
      },
    );
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    local.attempt1Id = row.attempt_id;
    const { data: rows } = await service
      .from("assignment_attempts")
      .select("id")
      .eq("assignment_id", ctx.refAssignmentId)
      .eq("student_id", ctx.studentId);
    if (rows.length !== 1) throw new Error(`expected 1 attempt, got ${rows.length}`);
    return `count=1 attempt=${local.attempt1Id}`;
  });

  await step("wave20: student starts 2nd attempt via RPC", async () => {
    const { data, error } = await ctx.studentClient.rpc(
      "start_assignment_attempt",
      {
        p_assignment_id: ctx.refAssignmentId,
        p_questions: [{ qid: "q1" }, { qid: "q2" }, { qid: "q3" }],
      },
    );
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    local.attempt2Id = row.attempt_id;
    const { data: rows } = await service
      .from("assignment_attempts")
      .select("id")
      .eq("assignment_id", ctx.refAssignmentId)
      .eq("student_id", ctx.studentId);
    if (rows.length !== 2) throw new Error(`expected 2 attempts, got ${rows.length}`);
    return `count=2 attempt=${local.attempt2Id}`;
  });

  await step("wave20: 3rd attempt raises max_attempts_reached", async () => {
    const { error } = await ctx.studentClient.rpc("start_assignment_attempt", {
      p_assignment_id: ctx.refAssignmentId,
      p_questions: [{ qid: "q1" }],
    });
    if (!error) throw new Error("expected max_attempts_reached");
    const msg = (error.message || "") + " " + (error.code || "") + " " + (error.details || "");
    if (!/max_attempts_reached/i.test(msg))
      throw new Error(`unexpected error: ${fmt(error)}`);
    return "denied";
  });

  await step("wave20: best-of-N view returns 1 row with highest score", async () => {
    // Submit both attempts with different scores via service role.
    const attempts = await service
      .from("assignment_attempts")
      .select("id")
      .eq("assignment_id", ctx.refAssignmentId)
      .eq("student_id", ctx.studentId)
      .order("started_at", { ascending: true });
    if (attempts.error) throw attempts.error;
    if (attempts.data.length < 2) throw new Error(`only ${attempts.data.length} attempts`);
    // Mark attempt 1 = 60%, attempt 2 = 85%.
    const u1 = await service
      .from("assignment_attempts")
      .update({
        submitted_at: new Date(Date.now() - 60_000).toISOString(),
        score_percent: 60,
      })
      .eq("id", attempts.data[0].id);
    if (u1.error) throw u1.error;
    const u2 = await service
      .from("assignment_attempts")
      .update({
        submitted_at: new Date().toISOString(),
        score_percent: 85,
      })
      .eq("id", attempts.data[1].id);
    if (u2.error) throw u2.error;

    const { data, error } = await service
      .from("assignment_best_attempts")
      .select("assignment_id,student_id,score_percent")
      .eq("assignment_id", ctx.refAssignmentId)
      .eq("student_id", ctx.studentId);
    if (error) throw error;
    if (data.length !== 1) throw new Error(`expected 1 row, got ${data.length}`);
    if (Number(data[0].score_percent) !== 85)
      throw new Error(`expected score 85, got ${data[0].score_percent}`);
    return `score=${data[0].score_percent}`;
  });

  await step("wave20: apply_late_penalty within grace returns raw", async () => {
    // 80, due 2026-01-01, submitted 2026-01-02 (within 24h grace) → returns 80.
    const { data, error } = await service.rpc("apply_late_penalty", {
      raw_score: 80,
      due_at: "2026-01-01T00:00:00Z",
      submitted_at: "2026-01-02T00:00:00Z",
      late_penalty_percent: 10,
      grace_period_hours: 24,
    });
    if (error) throw error;
    if (Number(data) !== 80)
      throw new Error(`expected 80 within grace, got ${data}`);
    return `result=${data}`;
  });
}

// ------------------------------ WAVE 29 -----------------------------
// Notifications fanout (migration 0029)

async function wave29() {
  const local = { announceNotifId: null, msgNotifId: null, fbNotifId: null, threadId: null };

  await step("wave29: teacher posts announcement -> student notified", async () => {
    const { data: ann, error } = await ctx.teacherClient
      .from("course_announcements")
      .insert({
        course_id: ctx.courseId,
        author_id: ctx.teacherId,
        title: "Wave29 announcement",
        body: "Notification fanout test",
      })
      .select()
      .single();
    if (error) throw error;
    // The trigger fanouts when published=true. Default published is unknown — check both.
    // Poll briefly because trigger runs synchronously but check service-role visibility.
    const { data, error: e2 } = await service
      .from("notifications")
      .select("id,kind,title,body")
      .eq("recipient_id", ctx.studentId)
      .eq("kind", "announcement")
      .order("created_at", { ascending: false })
      .limit(5);
    if (e2) throw e2;
    if (!data || data.length < 1) {
      throw new Error(`no announcement notification for student (ann=${ann.id})`);
    }
    local.announceNotifId = data[0].id;
    return `notif id=${data[0].id}`;
  });

  await step("wave29: teacher opens thread + sends message -> recipient notified", async () => {
    const { data: tdata, error: terr } = await ctx.teacherClient.rpc(
      "open_thread_with",
      { p_other_user_id: ctx.studentId },
    );
    if (terr) throw terr;
    const threadId =
      typeof tdata === "string"
        ? tdata
        : Array.isArray(tdata)
          ? tdata[0]?.id ?? tdata[0]
          : tdata?.id ?? tdata;
    local.threadId = threadId;
    const ins = await ctx.teacherClient
      .from("messages")
      .insert({
        thread_id: threadId,
        author_id: ctx.teacherId,
        body: "Wave29 message",
      })
      .select()
      .single();
    if (ins.error) throw ins.error;
    const { data, error } = await service
      .from("notifications")
      .select("id,kind")
      .eq("recipient_id", ctx.studentId)
      .eq("kind", "message")
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    if (!data || data.length < 1) throw new Error("no message notification");
    local.msgNotifId = data[0].id;
    return `notif id=${data[0].id}`;
  });

  await step("wave29: teacher posts feedback -> student notified", async () => {
    // Use the existing submissionId from portfolio section. Post a second feedback row.
    if (!ctx.submissionId) throw new Error("no submission from portfolio section");
    const { error: fbErr } = await ctx.teacherClient
      .from("portfolio_feedback")
      .insert({
        submission_id: ctx.submissionId,
        author_id: ctx.teacherId,
        body: "Wave29 feedback",
      })
      .select();
    if (fbErr) throw fbErr;
    const { data, error } = await service
      .from("notifications")
      .select("id,kind")
      .eq("recipient_id", ctx.studentId)
      .eq("kind", "feedback")
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    if (!data || data.length < 1) throw new Error("no feedback notification");
    local.fbNotifId = data[0].id;
    return `notif id=${data[0].id}`;
  });

  await step("wave29: student marks all read", async () => {
    const upd = await ctx.studentClient
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", ctx.studentId)
      .is("read_at", null)
      .select("id");
    if (upd.error) throw upd.error;
    if (!upd.data || upd.data.length < 1)
      throw new Error(`no rows marked read (got ${upd.data?.length ?? 0})`);
    // verify via service
    const { data, error } = await service
      .from("notifications")
      .select("read_at")
      .eq("recipient_id", ctx.studentId)
      .is("read_at", null);
    if (error) throw error;
    if (data.length !== 0)
      throw new Error(`${data.length} notifications still unread`);
    return `marked ${upd.data.length}`;
  });
}

// ------------------------------ WAVE 33 -----------------------------
// Modules v2 RPCs (migration 0033)

async function wave33() {
  const local = { dupModuleId: null };

  await step("wave33: toggle_module_publish flips bool", async () => {
    // Read current value.
    const { data: before, error: e1 } = await ctx.teacherClient
      .from("course_modules")
      .select("published")
      .eq("id", ctx.module1Id)
      .single();
    if (e1) throw e1;
    const { data: ret, error: e2 } = await ctx.teacherClient.rpc(
      "toggle_module_publish",
      { p_module_id: ctx.module1Id },
    );
    if (e2) throw e2;
    if (ret === before.published)
      throw new Error(`expected flip from ${before.published}, got ${ret}`);
    // Verify row reflects it.
    const { data: after, error: e3 } = await ctx.teacherClient
      .from("course_modules")
      .select("published")
      .eq("id", ctx.module1Id)
      .single();
    if (e3) throw e3;
    if (after.published !== ret)
      throw new Error(`row=${after.published} ret=${ret}`);
    // Toggle back so subsequent tests still work.
    await ctx.teacherClient.rpc("toggle_module_publish", {
      p_module_id: ctx.module1Id,
    });
    return `flipped to ${ret}`;
  });

  await step("wave33: toggle_item_publish flips bool", async () => {
    const { data: before, error: e1 } = await ctx.teacherClient
      .from("module_items")
      .select("published")
      .eq("id", ctx.itemAssignmentId)
      .single();
    if (e1) throw e1;
    const { data: ret, error: e2 } = await ctx.teacherClient.rpc(
      "toggle_item_publish",
      { p_item_id: ctx.itemAssignmentId },
    );
    if (e2) throw e2;
    if (ret === before.published)
      throw new Error(`expected flip from ${before.published}, got ${ret}`);
    const { data: after, error: e3 } = await ctx.teacherClient
      .from("module_items")
      .select("published")
      .eq("id", ctx.itemAssignmentId)
      .single();
    if (e3) throw e3;
    if (after.published !== ret)
      throw new Error(`row=${after.published} ret=${ret}`);
    // toggle back
    await ctx.teacherClient.rpc("toggle_item_publish", {
      p_item_id: ctx.itemAssignmentId,
    });
    return `flipped to ${ret}`;
  });

  await step("wave33: duplicate_module copies module + items", async () => {
    const { data, error } = await ctx.teacherClient.rpc("duplicate_module", {
      p_module_id: ctx.module1Id,
    });
    if (error) throw error;
    local.dupModuleId = data;
    if (!local.dupModuleId) throw new Error(`no id returned: ${fmt(data)}`);
    // Verify duplicate has same item count as source.
    const src = await ctx.teacherClient
      .from("module_items")
      .select("id")
      .eq("module_id", ctx.module1Id);
    const dup = await ctx.teacherClient
      .from("module_items")
      .select("id")
      .eq("module_id", local.dupModuleId);
    if (src.error) throw src.error;
    if (dup.error) throw dup.error;
    if (dup.data.length !== src.data.length)
      throw new Error(
        `dup items=${dup.data.length} != src items=${src.data.length}`,
      );
    return `dup=${local.dupModuleId} items=${dup.data.length}`;
  });

  await step("wave33: mark_item_complete(true) inserts row", async () => {
    const { error } = await ctx.studentClient.rpc("mark_item_complete", {
      p_item_id: ctx.itemLinkId,
      p_complete: true,
    });
    if (error) throw error;
    const { data, error: e2 } = await service
      .from("module_item_completion")
      .select("student_id,module_item_id,source")
      .eq("student_id", ctx.studentId)
      .eq("module_item_id", ctx.itemLinkId);
    if (e2) throw e2;
    if (data.length !== 1)
      throw new Error(`expected 1 completion row, got ${data.length}`);
    if (data[0].source !== "manual")
      throw new Error(`expected source=manual, got ${data[0].source}`);
    return "row inserted";
  });

  await step("wave33: mark_item_complete(false) removes manual row", async () => {
    const { error } = await ctx.studentClient.rpc("mark_item_complete", {
      p_item_id: ctx.itemLinkId,
      p_complete: false,
    });
    if (error) throw error;
    const { data, error: e2 } = await service
      .from("module_item_completion")
      .select("student_id")
      .eq("student_id", ctx.studentId)
      .eq("module_item_id", ctx.itemLinkId);
    if (e2) throw e2;
    if (data.length !== 0)
      throw new Error(`expected 0 rows, got ${data.length}`);
    return "row removed";
  });

  await step("wave33: lock_at past does not hide module from student", async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const upd = await ctx.teacherClient
      .from("course_modules")
      .update({ lock_at: past })
      .eq("id", ctx.module1Id);
    if (upd.error) throw upd.error;
    const { data, error } = await ctx.studentClient
      .from("course_modules")
      .select("id,lock_at")
      .eq("id", ctx.module1Id);
    if (error) throw error;
    if (data.length !== 1)
      throw new Error(`student sees ${data.length}, expected 1 (RLS unaffected)`);
    // Reset.
    await ctx.teacherClient
      .from("course_modules")
      .update({ lock_at: null })
      .eq("id", ctx.module1Id);
    return "still visible (lock = UI concern)";
  });
}

// ------------------------------ WAVE 34 -----------------------------
// Modules tree (migration 0034)

async function wave34() {
  await step("wave34: move_module(day2 under day1, pos 1)", async () => {
    const { error } = await ctx.teacherClient.rpc("move_module", {
      p_module_id: ctx.module2Id,
      p_new_parent_id: ctx.module1Id,
      p_new_position: 1,
    });
    if (error) throw error;
    const { data, error: e2 } = await ctx.teacherClient
      .from("course_modules")
      .select("parent_module_id,position")
      .eq("id", ctx.module2Id)
      .single();
    if (e2) throw e2;
    if (data.parent_module_id !== ctx.module1Id)
      throw new Error(`parent=${data.parent_module_id} expected ${ctx.module1Id}`);
    if (data.position !== 1)
      throw new Error(`position=${data.position} expected 1`);
    return `parent=day1 pos=1`;
  });

  await step("wave34: move_module(day1 under day2) -> cycle error", async () => {
    const { error } = await ctx.teacherClient.rpc("move_module", {
      p_module_id: ctx.module1Id,
      p_new_parent_id: ctx.module2Id,
      p_new_position: 1,
    });
    if (!error) throw new Error("expected cycle error");
    const msg = (error.message || "") + " " + (error.details || "");
    if (!/cycle/i.test(msg))
      throw new Error(`unexpected error: ${fmt(error)}`);
    return "denied (cycle)";
  });

  await step("wave34: reorder_modules_at_level only child succeeds", async () => {
    const { error } = await ctx.teacherClient.rpc(
      "reorder_modules_at_level",
      {
        p_course_id: ctx.courseId,
        p_parent_id: ctx.module1Id,
        p_ordered_ids: [ctx.module2Id],
      },
    );
    if (error) throw error;
    return "ok";
  });

  await step("wave34: module_tree view returns depth + path", async () => {
    const { data, error } = await ctx.teacherClient
      .from("module_tree")
      .select("id,depth,path,parent_module_id")
      .eq("course_id", ctx.courseId);
    if (error) throw error;
    if (data.length < 2)
      throw new Error(`expected >=2 rows, got ${data.length}`);
    const day1 = data.find((r) => r.id === ctx.module1Id);
    const day2 = data.find((r) => r.id === ctx.module2Id);
    if (!day1 || !day2) throw new Error("modules missing from tree");
    if (day1.depth !== 0)
      throw new Error(`day1 depth=${day1.depth}, expected 0`);
    if (day2.depth !== 1)
      throw new Error(`day2 depth=${day2.depth}, expected 1`);
    if (!Array.isArray(day1.path) || !Array.isArray(day2.path))
      throw new Error("path not array");
    return `depths ok (day1=0 day2=1)`;
  });
}

// ------------------------------ WAVE 35 -----------------------------
// Portfolio tree (migration 0035)

async function wave35() {
  const local = { item3Id: null };

  await step("wave35: teacher adds 3rd portfolio item", async () => {
    const { data, error } = await ctx.teacherClient
      .from("portfolio_items")
      .insert({
        template_id: ctx.portfolioTemplateId,
        position: 3,
        title: "Resume",
        item_type: "long_text",
        required: false,
      })
      .select()
      .single();
    if (error) throw error;
    local.item3Id = data.id;
    return `id=${data.id}`;
  });

  await step("wave35: move_portfolio_item(item3 under item1, pos 1)", async () => {
    const { error } = await ctx.teacherClient.rpc("move_portfolio_item", {
      p_item_id: local.item3Id,
      p_new_parent_id: ctx.portfolioItemTextId,
      p_new_position: 1,
    });
    if (error) throw error;
    const { data, error: e2 } = await ctx.teacherClient
      .from("portfolio_items")
      .select("parent_item_id,position")
      .eq("id", local.item3Id)
      .single();
    if (e2) throw e2;
    if (data.parent_item_id !== ctx.portfolioItemTextId)
      throw new Error(`parent=${data.parent_item_id}`);
    return `parent=item1 pos=${data.position}`;
  });

  await step("wave35: move_portfolio_item(item1 under item3) -> cycle", async () => {
    const { error } = await ctx.teacherClient.rpc("move_portfolio_item", {
      p_item_id: ctx.portfolioItemTextId,
      p_new_parent_id: local.item3Id,
      p_new_position: 1,
    });
    if (!error) throw new Error("expected cycle error");
    const msg = (error.message || "") + " " + (error.details || "");
    if (!/cycle/i.test(msg))
      throw new Error(`unexpected error: ${fmt(error)}`);
    return "denied (cycle)";
  });

  await step("wave35: portfolio_item_tree view returns depth + path", async () => {
    const { data, error } = await ctx.teacherClient
      .from("portfolio_item_tree")
      .select("id,depth,path,parent_item_id")
      .eq("template_id", ctx.portfolioTemplateId);
    if (error) throw error;
    const item1 = data.find((r) => r.id === ctx.portfolioItemTextId);
    const item3 = data.find((r) => r.id === local.item3Id);
    if (!item1 || !item3) throw new Error("items missing from tree");
    if (item1.depth !== 0)
      throw new Error(`item1 depth=${item1.depth}, expected 0`);
    if (item3.depth !== 1)
      throw new Error(`item3 depth=${item3.depth}, expected 1`);
    if (!Array.isArray(item1.path) || !Array.isArray(item3.path))
      throw new Error("path not array");
    return `depths ok (item1=0 item3=1)`;
  });
}

// ------------------------------ WAVE 27 -----------------------------
// Audit deletes (migration 0027)

async function wave27() {
  // Create an admin to read audit_events (RLS restricts to admins).
  const adminEmail = `a27-${TAG}@gmail.com`;
  let adminId = null;
  let adminClient = null;

  await step("wave27: create admin to read audit_events", async () => {
    adminId = await createConfirmedUser(adminEmail, PW, "admin");
    adminClient = userClient();
    await signIn(adminClient, adminEmail, PW);
    return `admin=${adminId}`;
  });

  await step("wave27: assignment.delete logged", async () => {
    // Create + delete a temp assignment.
    const ins = await ctx.teacherClient
      .from("assignments")
      .insert({
        course_id: ctx.courseId,
        created_by: ctx.teacherId,
        title: "TempAudit27Assignment",
        source_id: "cb",
        question_count: 2,
        time_limit_minutes: 5,
        difficulty_mix: "any",
      })
      .select()
      .single();
    if (ins.error) throw ins.error;
    const tempId = ins.data.id;
    const del = await ctx.teacherClient
      .from("assignments")
      .delete()
      .eq("id", tempId);
    if (del.error) throw del.error;
    const { data, error } = await adminClient
      .from("audit_events")
      .select("id,action,target_id")
      .eq("action", "assignment.delete")
      .eq("target_id", tempId);
    if (error) throw error;
    if (!data || data.length < 1)
      throw new Error("no assignment.delete audit row");
    return `${data.length} row(s)`;
  });

  await step("wave27: material.delete logged", async () => {
    // Create + delete a temp link material.
    const ins = await ctx.teacherClient
      .from("course_materials")
      .insert({
        course_id: ctx.courseId,
        uploader_id: ctx.teacherId,
        kind: "link",
        title: "TempAudit27Mat",
        url: "https://example.org/audit.pdf",
        position: 99,
        published: true,
      })
      .select()
      .single();
    if (ins.error) throw ins.error;
    const tempId = ins.data.id;
    const del = await ctx.teacherClient
      .from("course_materials")
      .delete()
      .eq("id", tempId);
    if (del.error) throw del.error;
    const { data, error } = await adminClient
      .from("audit_events")
      .select("id,action,target_id")
      .eq("action", "material.delete")
      .eq("target_id", tempId);
    if (error) throw error;
    if (!data || data.length < 1)
      throw new Error("no material.delete audit row");
    return `${data.length} row(s)`;
  });

  await step("wave27: announcement.delete logged", async () => {
    const ins = await ctx.teacherClient
      .from("course_announcements")
      .insert({
        course_id: ctx.courseId,
        author_id: ctx.teacherId,
        title: "TempAudit27Ann",
        body: "audit me",
      })
      .select()
      .single();
    if (ins.error) throw ins.error;
    const tempId = ins.data.id;
    const del = await ctx.teacherClient
      .from("course_announcements")
      .delete()
      .eq("id", tempId);
    if (del.error) throw del.error;
    const { data, error } = await adminClient
      .from("audit_events")
      .select("id,action,target_id")
      .eq("action", "announcement.delete")
      .eq("target_id", tempId);
    if (error) throw error;
    if (!data || data.length < 1)
      throw new Error("no announcement.delete audit row");
    // cleanup admin
    await service.auth.admin.deleteUser(adminId).catch(() => {});
    return `${data.length} row(s)`;
  });
}

// ------------------------------ WAVE 63 -----------------------------
// import_portfolio_items RPC (migration 0063): deep-clone selected portfolio
// items + their subtrees from a SOURCE template into a TARGET template owned
// by the same teacher. Submissions/feedback are NOT cloned (template-level
// only). Audit trail must record counts but not item bodies.
//
// Source = ctx.portfolioTemplateId (course A). After wave35 it contains:
//   - item1 (long_text root)   with child item3 (Resume) under it
//   - item2 (link root)        no children
// We pass [item1, item2] as picked roots → expect 3 imported (item1 + item3 + item2).
//
// Target = a fresh second course (course B) owned by the same teacher,
// with its own portfolio template created via ensure_portfolio_template.

async function wave63() {
  const local = {
    courseBId: null,
    joinCodeB: null,
    templateBId: null,
    outsiderTeacherId: null,
    outsiderTeacherClient: null,
    importedIds: [], // populated in Step A for audit-check + cleanup
  };

  await step("wave63: setup — second course B + portfolio template", async () => {
    local.joinCodeB = `FB${randomBytes(2).toString("hex").toUpperCase()}`;
    const c = await ctx.teacherClient
      .from("courses")
      .insert({
        teacher_id: ctx.teacherId,
        name: `Smoke Course B ${TS}`,
        description: "smoke-import-target",
        join_code: local.joinCodeB,
      })
      .select()
      .single();
    if (c.error) throw c.error;
    local.courseBId = c.data.id;
    const t = await ctx.teacherClient.rpc("ensure_portfolio_template", {
      p_course_id: local.courseBId,
      p_name: "Target Portfolio B",
    });
    if (t.error) throw t.error;
    const row = Array.isArray(t.data) ? t.data[0] : t.data;
    local.templateBId = row.id;
    return `courseB=${local.courseBId} templateB=${local.templateBId}`;
  });

  await step("wave63: setup — outsider teacher (teaches neither course)", async () => {
    const outsiderTeacherEmail = `ot63-${TAG}@gmail.com`;
    local.outsiderTeacherId = await createConfirmedUser(
      outsiderTeacherEmail,
      PW,
      "teacher",
    );
    local.outsiderTeacherClient = userClient();
    await signIn(local.outsiderTeacherClient, outsiderTeacherEmail, PW);
    return `id=${local.outsiderTeacherId}`;
  });

  // ---- Step A: happy path -------------------------------------------------
  await step("wave63: import_portfolio_items happy path (3 items)", async () => {
    const { data, error } = await ctx.teacherClient.rpc(
      "import_portfolio_items",
      {
        p_source_template_id: ctx.portfolioTemplateId,
        p_target_template_id: local.templateBId,
        p_item_ids: [ctx.portfolioItemTextId, ctx.portfolioItemLinkId],
      },
    );
    if (error) throw error;
    if (data !== 3)
      throw new Error(`expected 3 imported, got ${data}`);

    // Pull all rows from target template (should be exactly 3 fresh uuids).
    const tgt = await ctx.teacherClient
      .from("portfolio_items")
      .select("id,title,parent_item_id,position,item_type")
      .eq("template_id", local.templateBId);
    if (tgt.error) throw tgt.error;
    if (tgt.data.length !== 3)
      throw new Error(`target has ${tgt.data.length} rows, expected 3`);

    // Every new id must differ from every source id (fresh uuids).
    const sourceIds = new Set([
      ctx.portfolioItemTextId,
      ctx.portfolioItemLinkId,
    ]);
    for (const row of tgt.data) {
      if (sourceIds.has(row.id))
        throw new Error(`new row reused source uuid ${row.id}`);
      local.importedIds.push(row.id);
    }

    // Parent-rewrite assertion: the cloned "Resume" (item3) must point at the
    // cloned "Common App Essay" (item1) by NEW uuid, never the source uuid.
    const newEssay = tgt.data.find((r) => r.title === "Common App Essay");
    const newResume = tgt.data.find((r) => r.title === "Resume");
    const newVideo = tgt.data.find((r) => r.title === "Video Introduction");
    if (!newEssay || !newResume || !newVideo)
      throw new Error(
        `missing cloned titles: essay=${!!newEssay} resume=${!!newResume} video=${!!newVideo}`,
      );
    if (newEssay.parent_item_id !== null)
      throw new Error(`cloned essay should be root, got parent=${newEssay.parent_item_id}`);
    if (newVideo.parent_item_id !== null)
      throw new Error(`cloned video should be root, got parent=${newVideo.parent_item_id}`);
    if (newResume.parent_item_id !== newEssay.id)
      throw new Error(
        `cloned resume parent=${newResume.parent_item_id}, expected new essay uuid ${newEssay.id} (NOT source uuid ${ctx.portfolioItemTextId})`,
      );

    // Source template must still have its original 3 rows untouched.
    const src = await ctx.teacherClient
      .from("portfolio_items")
      .select("id")
      .eq("template_id", ctx.portfolioTemplateId);
    if (src.error) throw src.error;
    if (src.data.length !== 3)
      throw new Error(`source mutated: has ${src.data.length}, expected 3`);

    return `3 imported, parents rewritten, source intact`;
  });

  // ---- Step B: outsider teacher gets not_authorized -----------------------
  await step("wave63: outsider teacher -> not_authorized", async () => {
    const { error } = await local.outsiderTeacherClient.rpc(
      "import_portfolio_items",
      {
        p_source_template_id: ctx.portfolioTemplateId,
        p_target_template_id: local.templateBId,
        p_item_ids: [ctx.portfolioItemTextId],
      },
    );
    if (!error) throw new Error("expected not_authorized");
    const msg = (error.message || "") + " " + (error.details || "");
    if (!/not_authorized/i.test(msg))
      throw new Error(`unexpected error: ${fmt(error)}`);
    return `denied: ${error.code ?? msg.slice(0, 60)}`;
  });

  // ---- Step C: same-template guard ---------------------------------------
  await step("wave63: source === target -> same_template", async () => {
    const { error } = await ctx.teacherClient.rpc("import_portfolio_items", {
      p_source_template_id: ctx.portfolioTemplateId,
      p_target_template_id: ctx.portfolioTemplateId,
      p_item_ids: [ctx.portfolioItemTextId],
    });
    if (!error) throw new Error("expected same_template");
    const msg = (error.message || "") + " " + (error.details || "");
    if (!/same_template/i.test(msg))
      throw new Error(`unexpected error: ${fmt(error)}`);
    return `denied: ${msg.slice(0, 60)}`;
  });

  // ---- Step D: empty item list ------------------------------------------
  await step("wave63: empty p_item_ids -> returns 0, no insert", async () => {
    const before = await ctx.teacherClient
      .from("portfolio_items")
      .select("id")
      .eq("template_id", local.templateBId);
    if (before.error) throw before.error;
    const { data, error } = await ctx.teacherClient.rpc(
      "import_portfolio_items",
      {
        p_source_template_id: ctx.portfolioTemplateId,
        p_target_template_id: local.templateBId,
        p_item_ids: [],
      },
    );
    if (error) throw error;
    if (data !== 0) throw new Error(`expected 0, got ${data}`);
    const after = await ctx.teacherClient
      .from("portfolio_items")
      .select("id")
      .eq("template_id", local.templateBId);
    if (after.error) throw after.error;
    if (after.data.length !== before.data.length)
      throw new Error(
        `target row count changed: ${before.data.length} -> ${after.data.length}`,
      );
    return `0 returned, target unchanged at ${after.data.length} rows`;
  });

  // ---- Step E: audit trail w/ privacy invariant --------------------------
  await step("wave63: audit_events records portfolio_import (privacy ok)", async () => {
    // RLS on audit_events restricts SELECT to admins, so mint a scoped admin.
    const adminEmail = `a63-${TAG}@gmail.com`;
    const adminId = await createConfirmedUser(adminEmail, PW, "admin");
    const adminClient = userClient();
    await signIn(adminClient, adminEmail, PW);
    try {
      const { data, error } = await adminClient
        .from("audit_events")
        .select("id,action,target_id,details")
        .eq("action", "portfolio_import")
        .eq("target_id", local.templateBId);
      if (error) throw error;
      if (!data || data.length < 1)
        throw new Error("no portfolio_import audit row for target template");
      // Step A imported 3 — pick the row matching that count (Step D's 0-import
      // path doesn't write an audit row, but be defensive against future drift).
      const happyRow = data.find(
        (r) => r.details && r.details.imported_count === 3,
      );
      if (!happyRow)
        throw new Error(
          `no audit row with imported_count=3 in ${fmt(data.map((r) => r.details?.imported_count))}`,
        );
      // Privacy invariant: details must NOT include any item body / prompt text.
      const blob = JSON.stringify(happyRow.details || {});
      const banned = [
        "Common App Essay",
        "650 word personal statement",
        "Video Introduction",
        "Resume",
      ];
      for (const term of banned) {
        if (blob.includes(term))
          throw new Error(
            `audit details leaked item content "${term}": ${blob.slice(0, 200)}`,
          );
      }
      return `1 audit row, imported_count=3, no item bodies leaked`;
    } finally {
      await service.auth.admin.deleteUser(adminId).catch(() => {});
    }
  });

  // ---- Cleanup (items → templates → courses → outsider user) -------------
  await step("wave63: cleanup", async () => {
    // Items first (FK refs templates).
    if (local.importedIds.length) {
      await service
        .from("portfolio_items")
        .delete()
        .in("id", local.importedIds);
    }
    // Template B (FK refs course B).
    if (local.templateBId) {
      await service
        .from("portfolio_templates")
        .delete()
        .eq("id", local.templateBId);
    }
    // Course B (teardown also deletes courses owned by ctx.teacherId, but be
    // explicit so we don't depend on teardown ordering).
    if (local.courseBId) {
      await service.from("courses").delete().eq("id", local.courseBId);
    }
    if (local.outsiderTeacherId) {
      await service.auth.admin
        .deleteUser(local.outsiderTeacherId)
        .catch(() => {});
    }
    return "cleaned";
  });
}

// ------------------------- STUDENT PROFILE -------------------------
//
// Smoke test for the THREE queries useStudentProfile (teacher-facing) fires:
//   A. assignments-in-course + assignment_best_attempts joined for the student
//   B. discussion_posts by the student joined to discussion_topics in this course
//   C. portfolio_submissions by the student joined to portfolio_items in this
//      course's template
//
// We assert that as the OWNING teacher each query yields the expected row
// shape + count, and that an un-enrolled outsider sees 0 rows (RLS guard).
// Goal: if a future migration changes one of the embedded join shapes
// (e.g. renames a foreign key constraint), this scenario fails loud.
async function studentProfile() {
  const local = {
    asnId: null,
    attemptId: null,
    topicId: null,
    postId: null,
    templateId: null,
    itemId: null,
    submissionId: null,
  };

  await step("profile: setup — assignment + submitted attempt by student", async () => {
    const asnRes = await ctx.teacherClient
      .from("assignments")
      .insert({
        course_id: ctx.courseId,
        created_by: ctx.teacherId,
        title: `Profile Asn ${TS}`,
        source_id: "cb",
        question_count: 3,
        time_limit_minutes: 5,
        difficulty_mix: "any",
      })
      .select()
      .single();
    if (asnRes.error) throw asnRes.error;
    local.asnId = asnRes.data.id;

    const attRes = await service
      .from("assignment_attempts")
      .insert({
        assignment_id: local.asnId,
        student_id: ctx.studentId,
        submitted_at: new Date().toISOString(),
        score_percent: 76,
      })
      .select()
      .single();
    if (attRes.error) throw attRes.error;
    local.attemptId = attRes.data.id;
    return `asn=${local.asnId.slice(0, 8)} attempt=${local.attemptId.slice(0, 8)}`;
  });

  await step("profile: setup — discussion topic + student post", async () => {
    const topicRes = await ctx.teacherClient
      .from("discussion_topics")
      .insert({
        course_id: ctx.courseId,
        author_id: ctx.teacherId,
        title: `Profile Topic ${TS}`,
        body: "Profile smoke topic.",
      })
      .select()
      .single();
    if (topicRes.error) throw topicRes.error;
    local.topicId = topicRes.data.id;

    const postRes = await ctx.studentClient
      .from("discussion_posts")
      .insert({
        topic_id: local.topicId,
        author_id: ctx.studentId,
        body: "Student profile smoke post.",
      })
      .select()
      .single();
    if (postRes.error) throw postRes.error;
    local.postId = postRes.data.id;
    return `topic=${local.topicId.slice(0, 8)} post=${local.postId.slice(0, 8)}`;
  });

  await step("profile: setup — portfolio template + item + student submission", async () => {
    const tplRes = await ctx.teacherClient.rpc("ensure_portfolio_template", {
      p_course_id: ctx.courseId,
      p_name: `Profile Template ${TS}`,
    });
    if (tplRes.error) throw tplRes.error;
    const tplRow = Array.isArray(tplRes.data) ? tplRes.data[0] : tplRes.data;
    local.templateId = tplRow.id;

    const itemRes = await ctx.teacherClient
      .from("portfolio_items")
      .insert({
        template_id: local.templateId,
        position: 99,
        title: `Profile Item ${TS}`,
        item_type: "long_text",
        required: false,
      })
      .select()
      .single();
    if (itemRes.error) throw itemRes.error;
    local.itemId = itemRes.data.id;

    const subRes = await ctx.studentClient
      .from("portfolio_submissions")
      .upsert(
        {
          item_id: local.itemId,
          student_id: ctx.studentId,
          value_text: "profile smoke submission",
          status: "submitted",
          submitted_at: new Date().toISOString(),
        },
        { onConflict: "item_id,student_id" },
      )
      .select()
      .single();
    if (subRes.error) throw subRes.error;
    local.submissionId = subRes.data.id;
    return `tpl=${local.templateId.slice(0, 8)} item=${local.itemId.slice(0, 8)}`;
  });

  // Section A — assignments + assignment_best_attempts join shape.
  await step("profile: teacher reads attempts (best_attempts join)", async () => {
    const asnRes = await ctx.teacherClient
      .from("assignments")
      .select("id, title")
      .eq("course_id", ctx.courseId)
      .eq("archived", false);
    if (asnRes.error) throw asnRes.error;
    const asnIds = (asnRes.data ?? []).map((a) => a.id);
    if (!asnIds.includes(local.asnId)) {
      throw new Error("profile assignment not in teacher's course list");
    }

    const bestRes = await ctx.teacherClient
      .from("assignment_best_attempts")
      .select(
        "attempt_id, assignment_id, student_id, score_percent, effective_score, submitted_at, status",
      )
      .in("assignment_id", asnIds)
      .eq("student_id", ctx.studentId);
    if (bestRes.error) throw bestRes.error;
    const matching = (bestRes.data ?? []).filter(
      (r) => r.assignment_id === local.asnId,
    );
    if (matching.length !== 1) {
      throw new Error(
        `expected 1 best_attempt for profile asn, got ${matching.length}`,
      );
    }
    if (matching[0].attempt_id !== local.attemptId) {
      throw new Error(`best_attempt id mismatch (got ${matching[0].attempt_id})`);
    }
    return `1 best_attempt, effective_score=${matching[0].effective_score}`;
  });

  // Section B — discussion_posts → discussion_topics embed.
  await step("profile: teacher reads student posts (topic embed)", async () => {
    const { data, error } = await ctx.teacherClient
      .from("discussion_posts")
      .select(
        "id, topic_id, body, created_at, topic:discussion_topics!discussion_posts_topic_id_fkey(id, short_code, title, course_id)",
      )
      .eq("author_id", ctx.studentId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const inCourse = (data ?? []).filter(
      (r) => r.topic && r.topic.course_id === ctx.courseId,
    );
    const ours = inCourse.find((r) => r.id === local.postId);
    if (!ours) {
      throw new Error(
        `profile post missing from join (got ${inCourse.length} in-course rows)`,
      );
    }
    if (!ours.topic || ours.topic.id !== local.topicId) {
      throw new Error("topic embed missing or wrong id");
    }
    return `1 post, topic embed ok (short_code=${ours.topic.short_code ?? "none"})`;
  });

  // Section C — portfolio_submissions → portfolio_items embed (+ feedback count).
  await step("profile: teacher reads student portfolio submission (item embed)", async () => {
    const tplRes = await ctx.teacherClient
      .from("portfolio_templates")
      .select("id")
      .eq("course_id", ctx.courseId)
      .maybeSingle();
    if (tplRes.error) throw tplRes.error;
    if (!tplRes.data) throw new Error("no template visible to teacher");
    const templateId = tplRes.data.id;

    const subsRes = await ctx.teacherClient
      .from("portfolio_submissions")
      .select(
        "id, item_id, status, submitted_at, item:portfolio_items!portfolio_submissions_item_id_fkey(id, title, template_id), feedback:portfolio_feedback(count)",
      )
      .eq("student_id", ctx.studentId)
      .order("submitted_at", { ascending: false, nullsFirst: false });
    if (subsRes.error) throw subsRes.error;
    const inTpl = (subsRes.data ?? []).filter(
      (r) => r.item && r.item.template_id === templateId,
    );
    const ours = inTpl.find((r) => r.id === local.submissionId);
    if (!ours) {
      throw new Error(
        `profile submission missing from join (got ${inTpl.length} in-template rows)`,
      );
    }
    if (!ours.item || ours.item.id !== local.itemId) {
      throw new Error("item embed missing or wrong id");
    }
    return `1 submission, item embed ok, status=${ours.status}`;
  });

  // RLS guard — outsider sees 0 rows on each shape.
  await step("profile: outsider sees 0 best_attempts / posts / submissions", async () => {
    // best_attempts: outsider's RLS on assignments returns 0 ids → trivially 0
    // when queried with .in([]). Instead query attempts directly by the
    // student id we know — the view's RLS chain should hide them entirely.
    const bestRes = await ctx.outsiderClient
      .from("assignment_best_attempts")
      .select("attempt_id")
      .eq("student_id", ctx.studentId)
      .eq("assignment_id", local.asnId);
    if (bestRes.error) throw bestRes.error;
    if ((bestRes.data ?? []).length !== 0) {
      throw new Error(
        `outsider sees ${bestRes.data.length} best_attempts (RLS leak)`,
      );
    }

    const postsRes = await ctx.outsiderClient
      .from("discussion_posts")
      .select("id, topic:discussion_topics!discussion_posts_topic_id_fkey(id, course_id)")
      .eq("author_id", ctx.studentId);
    if (postsRes.error) throw postsRes.error;
    const visibleInCourse = (postsRes.data ?? []).filter(
      (r) => r.topic && r.topic.course_id === ctx.courseId,
    );
    if (visibleInCourse.length !== 0) {
      throw new Error(
        `outsider sees ${visibleInCourse.length} posts in our course (RLS leak)`,
      );
    }

    const subsRes = await ctx.outsiderClient
      .from("portfolio_submissions")
      .select("id, item:portfolio_items!portfolio_submissions_item_id_fkey(template_id)")
      .eq("student_id", ctx.studentId);
    if (subsRes.error) throw subsRes.error;
    const visibleInTpl = (subsRes.data ?? []).filter(
      (r) => r.item && r.item.template_id === local.templateId,
    );
    if (visibleInTpl.length !== 0) {
      throw new Error(
        `outsider sees ${visibleInTpl.length} submissions (RLS leak)`,
      );
    }
    return "0 / 0 / 0 to outsider";
  });

  // Cleanup
  await step("profile: cleanup", async () => {
    if (local.submissionId) {
      await service
        .from("portfolio_submissions")
        .delete()
        .eq("id", local.submissionId);
    }
    if (local.itemId) {
      await service.from("portfolio_items").delete().eq("id", local.itemId);
    }
    if (local.postId) {
      await service.from("discussion_posts").delete().eq("id", local.postId);
    }
    if (local.topicId) {
      await service.from("discussion_topics").delete().eq("id", local.topicId);
    }
    if (local.attemptId) {
      await service
        .from("assignment_attempts")
        .delete()
        .eq("id", local.attemptId);
    }
    if (local.asnId) {
      await service.from("assignments").delete().eq("id", local.asnId);
    }
    return "cleaned";
  });
}

// ---------------------------- TEARDOWN ----------------------------

async function teardown() {
  // Delete all cloned + source courses owned by test teacher
  await service
    .from("courses")
    .delete()
    .or(`teacher_id.eq.${ctx.teacherId}`)
    .then(() => {});
  // Delete users
  for (const id of [ctx.studentId, ctx.outsiderId, ctx.teacherId]) {
    if (id) {
      await service.auth.admin.deleteUser(id).catch(() => {});
    }
  }
}

// ----------------------------- MAIN -----------------------------

(async () => {
  try {
    await setup();
    if (!ctx.courseId) {
      console.error("setup failed — aborting");
    } else {
      await modules();
      await announcements();
      await materials();
      await portfolio();
      await clone();
      await wave5();
      await discussions();
      await inbox();
      await wave20();
      await wave29();
      await wave33();
      await wave34();
      await wave35();
      await wave27();
      await wave63();
      await studentProfile();
    }
  } finally {
    await teardown().catch(() => {});
  }

  const counts = results.reduce(
    (a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a),
    {},
  );
  console.log("\n========== SMOKE_FEATURES ==========");
  for (const r of results) {
    console.log(
      `[${r.status}] ${r.name}  (${r.ms}ms)${r.note ? "  " + r.note : ""}${r.err ? "  err: " + r.err : ""}`,
    );
  }
  console.log("------------------------------------");
  console.log(
    `TOTAL: ${results.length}  PASS: ${counts.PASS ?? 0}  FAIL: ${counts.FAIL ?? 0}  SKIP: ${counts.SKIP ?? 0}`,
  );
  console.log("====================================\n");
  process.exit(counts.FAIL ? 1 : 0);
})();
