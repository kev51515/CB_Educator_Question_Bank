/**
 * quick-start-seat.spec.ts — REAL-BROWSER managed-seat quick-start claim
 * ======================================================================
 * Regression for the reported bug: a teacher pre-creates a student ("BBB", a
 * managed seat via admin_create_student); the student goes to /quick-start,
 * enters their per-seat code (XXXXXX-NN) + email + password to CLAIM the seat —
 * and was BOUNCED back to /quick-start instead of landing in the app.
 *
 * Root cause (fixed in QuickStartScreen.tsx): signInAnonymously() makes AuthGate
 * route off /quick-start and unmount the screen mid-flow; submitSeat bailed on
 * `!aliveRef` AFTER the claim succeeded but BEFORE signing in as the seat, then
 * the `finally` signed out the shared session → stranded on /quick-start.
 *
 * This drives the real flow in a browser (no auth bypass — see
 * playwright.role.config.ts) and asserts the student lands on their home.
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SERVICE || !ANON) {
  throw new Error(
    "quick-start-seat.spec: missing SUPABASE_URL / SUPABASE_SERVICE_KEY / SUPABASE_ANON_KEY " +
      "(root ../.env — playwright.role.config.ts loads it).",
  );
}

const service: SupabaseClient = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TS = Date.now();
const TEACHER_PW = "SeatTeach!" + randomBytes(6).toString("hex");
const teacherEmail = `e2e-seat-teacher-${TS}@example.com`;
// The real email + password the student claims the seat with.
const studentEmail = `e2e-seat-student-${TS}@example.com`;
const studentPw = "SeatClaim!" + randomBytes(6).toString("hex");

const created: {
  teacherId: string | null;
  courseId: string | null;
  seatId: string | null;
  loginCode: string | null;
} = { teacherId: null, courseId: null, seatId: null, loginCode: null };

test.beforeAll(async () => {
  // 1. Teacher.
  const { data: t, error: tErr } = await service.auth.admin.createUser({
    email: teacherEmail,
    password: TEACHER_PW,
    email_confirm: true,
    user_metadata: { display_name: "Seat Teacher", role: "teacher" },
  });
  if (tErr) throw new Error(`createUser teacher: ${tErr.message}`);
  created.teacherId = t.user.id;
  await service.from("profiles").update({ role: "teacher" }).eq("id", created.teacherId);

  // 2. Course owned by the teacher.
  const { data: course, error: cErr } = await service
    .from("courses")
    .insert({
      teacher_id: created.teacherId,
      name: `Seat E2E ${TS}`,
      join_code: `SE${randomBytes(2).toString("hex").toUpperCase()}`,
    })
    .select("id, short_code")
    .single();
  if (cErr) throw new Error(`insert course: ${cErr.message}`);
  created.courseId = course.id;

  // 3. Teacher pre-creates the managed seat "BBB" → yields the per-seat login code.
  const tc = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { error: siErr } = await tc.auth.signInWithPassword({
    email: teacherEmail,
    password: TEACHER_PW,
  });
  if (siErr) throw new Error(`teacher signin: ${siErr.message}`);
  const { data, error } = await tc.rpc("admin_create_student", {
    p_course_id: created.courseId,
    p_display_name: "BBB",
    p_password: "temp-" + randomBytes(3).toString("hex"),
  });
  if (error) throw new Error(`admin_create_student: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  created.seatId = row.student_id;
  created.loginCode = row.login_code;
  if (!/^[A-HJ-NP-Z2-9]{6}-\d{2,}$/.test(created.loginCode ?? "")) {
    throw new Error(`unexpected login_code: ${created.loginCode}`);
  }
});

test.afterAll(async () => {
  for (const id of [created.seatId, created.teacherId]) {
    if (id) await service.auth.admin.deleteUser(id).catch(() => undefined);
  }
  if (created.courseId) {
    // NB: a PostgREST builder isn't a native promise — no `.catch`; use try/catch.
    try {
      await service.from("courses").delete().eq("id", created.courseId);
    } catch {
      /* best-effort teardown */
    }
  }
});

test("managed-seat student claims their seat on /quick-start and lands in the app", async ({
  page,
}) => {
  await page.goto("/quick-start");

  // Entering the per-seat code (XXXXXX-NN) switches the form into seat-claim mode,
  // revealing email + confirm-email + password.
  await page.getByPlaceholder("ABC234").fill(created.loginCode!);
  await page.getByPlaceholder("you@example.com").fill(studentEmail);
  await page.getByPlaceholder("Re-type your email").fill(studentEmail);
  await page.getByPlaceholder("At least 6 characters").fill(studentPw);
  await page.getByRole("button", { name: "Claim my login" }).click();

  // FIX assertion: the student lands on their home (AreaSelector "Hi, BBB"),
  // NOT bounced back to /quick-start. Before the fix the shared-session signOut
  // stranded the just-claimed seat here.
  await expect(page.getByRole("heading", { name: /^Hi,/ })).toBeVisible({ timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/quick-start/);
});
