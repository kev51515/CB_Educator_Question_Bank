#!/usr/bin/env node
/**
 * smoke-course-sharing.mjs
 *
 * Verifies the course-isolation + sharing + admin-gate contract from
 * migrations 0130 (course_shares + scoped courses/memberships RLS,
 * is_teacher_of_course extended to share recipients) and 0131 (privileged
 * RPCs re-locked to is_admin):
 *
 *   Isolation   — teacher B cannot see/edit teacher A's course; admin can.
 *   Sharing     — only the OWNER (or admin) may share; a shared teacher gets
 *                 full co-management (SELECT + roster read + UPDATE) but NOT
 *                 the ability to DELETE the course container.
 *   Revoke      — unshare removes access; a recipient may self-leave.
 *   Admin gate  — a teacher cannot mint invites / set roles / read system
 *                 stats; an admin can.
 *
 * Disposable + self-cleaning.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY;
const miss = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY"].filter((k) => !process.env[k]);
if (miss.length) { console.error("smoke-course-sharing: missing env:", miss.join(", ")); process.exit(2); }
const TAG = randomBytes(3).toString("hex");
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const userClient = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; console.log(`  FAIL  ${l}`); if (d) console.log(`        ${d}`); };
const step = (l) => console.log(`\n=== ${l} ===`);

async function mkUser(role) {
  const email = `cs-${role}-${TAG}-${randomBytes(2).toString("hex")}@gmail.com`, password = "Cs!" + randomBytes(4).toString("hex");
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${role}: ${error.message}`);
  await svc.from("profiles").update({ role, display_name: `Cs ${role}` }).eq("id", data.user.id);
  return { id: data.user.id, email, password };
}
async function signedIn(u) {
  const c = userClient();
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(`signIn ${u.email}: ${error.message}`);
  return c;
}

async function main() {
  step("provision");
  const admin = await mkUser("admin");
  const teacherA = await mkUser("teacher");
  const teacherB = await mkUser("teacher");
  const teacherC = await mkUser("teacher");
  const student = await mkUser("student");
  const { data: course, error: cErr } = await svc.from("courses")
    .insert({ name: `Shared ${TAG}`, teacher_id: teacherA.id }).select("id, name").single();
  if (cErr) throw new Error(`create course: ${cErr.message}`);
  await svc.from("course_memberships").insert({ course_id: course.id, student_id: student.id });

  const cleanup = async () => {
    await svc.from("course_memberships").delete().eq("course_id", course.id);
    await svc.from("course_shares").delete().eq("course_id", course.id);
    await svc.from("courses").delete().eq("id", course.id);
    for (const u of [admin, teacherA, teacherB, teacherC, student]) await svc.auth.admin.deleteUser(u.id);
  };

  try {
    const aClient = await signedIn(teacherA);
    const bClient = await signedIn(teacherB);
    const cClient = await signedIn(teacherC);
    const adminClient = await signedIn(admin);

    step("isolation (0130)");
    {
      const { data } = await aClient.from("courses").select("id").eq("id", course.id);
      (data?.length ?? 0) === 1 ? ok("owner A sees own course") : bad("owner A should see own course", `${data?.length}`);
    }
    {
      const { data } = await bClient.from("courses").select("id").eq("id", course.id);
      (data?.length ?? 0) === 0 ? ok("teacher B cannot see A's course") : bad("B should NOT see A's course", `${data?.length}`);
    }
    {
      const { data } = await adminClient.from("courses").select("id").eq("id", course.id);
      (data?.length ?? 0) === 1 ? ok("admin sees any course") : bad("admin should see any course", `${data?.length}`);
    }

    step("share authorization");
    {
      const { error } = await cClient.rpc("share_course", { p_course_id: course.id, p_recipient_id: teacherB.id });
      /not_authorized/.test(error?.message ?? "") ? ok("non-owner C cannot share A's course") : bad("C share should be rejected", error?.message ?? "no error");
    }
    {
      const { error } = await aClient.rpc("share_course", { p_course_id: course.id, p_recipient_id: student.id });
      /recipient_not_educator/.test(error?.message ?? "") ? ok("cannot share with a student") : bad("expected recipient_not_educator", error?.message ?? "no error");
    }
    {
      const { error } = await aClient.rpc("share_course", { p_course_id: course.id, p_recipient_id: teacherB.id });
      error ? bad("owner A shares with B", error.message) : ok("owner A shares course with B");
    }

    step("co-management (shared)");
    {
      const { data } = await bClient.from("courses").select("id").eq("id", course.id);
      (data?.length ?? 0) === 1 ? ok("B now sees shared course") : bad("B should see shared course", `${data?.length}`);
    }
    {
      const { data } = await bClient.from("course_memberships").select("student_id").eq("course_id", course.id);
      (data?.length ?? 0) === 1 ? ok("B reads shared course roster") : bad("B should read roster", `${data?.length}`);
    }
    {
      const newName = `Edited by B ${TAG}`;
      await bClient.from("courses").update({ name: newName }).eq("id", course.id);
      const { data } = await svc.from("courses").select("name").eq("id", course.id).single();
      data?.name === newName ? ok("B can edit shared course (co-manage)") : bad("B edit should persist", `${data?.name}`);
    }
    {
      await bClient.from("courses").delete().eq("id", course.id);
      const { data } = await svc.from("courses").select("id").eq("id", course.id);
      (data?.length ?? 0) === 1 ? ok("B cannot delete shared course (owner-only)") : bad("B delete should be blocked", "course gone");
    }

    step("admin gate (0131)");
    {
      const { error } = await bClient.rpc("mint_teacher_invite", { p_code: `cs${TAG}xx`, p_note: "x", p_expires_at: null, p_max_uses: null });
      /not_authorized/.test(error?.message ?? "") ? ok("teacher cannot mint invite") : bad("teacher mint should be rejected", error?.message ?? "no error");
    }
    {
      const { error } = await bClient.rpc("set_user_role", { p_user_id: student.id, p_role: "teacher" });
      /not_authorized/.test(error?.message ?? "") ? ok("teacher cannot set roles") : bad("teacher set_user_role should be rejected", error?.message ?? "no error");
    }
    {
      const { error } = await bClient.rpc("admin_dashboard_stats");
      /not_authorized/.test(error?.message ?? "") ? ok("teacher cannot read system stats") : bad("teacher stats should be rejected", error?.message ?? "no error");
    }
    {
      const { data, error } = await adminClient.rpc("admin_dashboard_stats");
      (!error && data?.users_by_role) ? ok("admin can read system stats") : bad("admin stats should work", error?.message ?? JSON.stringify(data)?.slice(0, 80));
    }

    step("revoke + self-leave");
    {
      const { error } = await aClient.rpc("unshare_course", { p_course_id: course.id, p_recipient_id: teacherB.id });
      if (error) bad("owner A unshares B", error.message);
      else {
        const { data } = await bClient.from("courses").select("id").eq("id", course.id);
        (data?.length ?? 0) === 0 ? ok("B loses access after unshare") : bad("B should lose access", `${data?.length}`);
      }
    }
    {
      await aClient.rpc("share_course", { p_course_id: course.id, p_recipient_id: teacherB.id });
      const { error } = await bClient.rpc("unshare_course", { p_course_id: course.id, p_recipient_id: teacherB.id });
      error ? bad("B self-leaves shared course", error.message) : ok("recipient can self-leave a shared course");
    }
  } finally {
    step("cleanup");
    await cleanup().catch((e) => console.log("  ..    cleanup error", e.message));
    console.log("  ..    disposable users + course removed");
  }

  console.log(`\n----------------------------------`);
  console.log(`TOTAL: ${pass + fail}  PASS: ${pass}  FAIL: ${fail}`);
  console.log(`==================================`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error("smoke-course-sharing crashed:", e?.message ?? e); process.exit(1); });
