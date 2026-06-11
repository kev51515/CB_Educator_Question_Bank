/**
 * _qa-ivy-screens.mjs — QA harness for the Ivy Ledger theme migration.
 * Provisions a disposable TEACHER (with 2 real courses) + a disposable STUDENT,
 * injects their sessions into Playwright, and screenshots the main surfaces in
 * BOTH themes (classic + ivy) at 1380x900.
 *
 * Run:  node --env-file-if-exists=../.env scripts/_qa-ivy-screens.mjs
 * Requires: `npx vite preview --port 4199` running.
 * Output: design-explorations/ivy-ledger/shots/qa/<page>-<theme>.png
 * Cleanup: deletes both disposable users (and their courses via FK/service) in finally{}.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL_ || !ANON || !SERVICE) { console.error("missing env"); process.exit(1); }

const APP = "http://localhost:4199";
const OUT = "/Users/kevin/coding/CB_Educator_Question_Bank/design-explorations/ivy-ledger/shots/qa";
const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const ref = new URL(URL_).hostname.split(".")[0];
const storageKey = `sb-${ref}-auth-token`;

async function provision(role, displayName) {
  const pw = "Qa-Ivy-1!" + randomBytes(4).toString("hex");
  const email = `qa-ivy-${role}-${randomBytes(4).toString("hex")}@example.com`;
  const { data: cu, error: cuErr } = await service.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (cuErr) throw new Error(`createUser(${role}): ${cuErr.message}`);
  const uid = cu.user.id;
  const patch = { display_name: displayName };
  if (role !== "student") patch.role = role; // student stays at the trigger default
  const { error: upErr } = await service.from("profiles").update(patch).eq("id", uid);
  if (upErr) throw new Error(`profile(${role}): ${upErr.message}`);
  const userClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: si, error: siErr } = await userClient.auth.signInWithPassword({ email, password: pw });
  if (siErr) throw new Error(`signIn(${role}): ${siErr.message}`);
  return { uid, session: si.session };
}

let teacherId = null, studentId = null, courseIds = [];
try {
  // ---- provision users ----
  const teacher = await provision("teacher", "QA Ivy Teacher");
  teacherId = teacher.uid;
  const student = await provision("student", "QA Ivy Student");
  studentId = student.uid;
  console.log("provisioned teacher", teacherId, "+ student", studentId);

  // ---- seed 2 courses (best-effort, 2 attempts) ----
  const courseRows = [
    { teacher_id: teacherId, name: "SAT June Intensive", course_type: "class" },
    { teacher_id: teacherId, name: "Counseling — Class of 2027", course_type: "counseling" },
  ];
  for (let attempt = 1; attempt <= 2 && courseIds.length === 0; attempt++) {
    const { data, error } = await service.from("courses").insert(courseRows).select("id, name");
    if (error) {
      console.warn(`course insert attempt ${attempt} failed:`, error.message);
    } else {
      courseIds = data.map((r) => r.id);
      console.log("seeded courses:", data.map((r) => r.name).join(" | "));
    }
  }
  if (courseIds.length === 0) console.warn("proceeding with EMPTY STATE (no courses)");

  // ---- browser ----
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 900 } });
  const page = await ctx.newPage();

  async function shoot(session, path, slug) {
    // (re)inject the session for whichever user owns this surface
    await page.goto(`${APP}/signin`, { waitUntil: "domcontentloaded" });
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [storageKey, JSON.stringify(session)]);
    for (const theme of ["classic", "ivy"]) {
      await page.evaluate((t) => localStorage.setItem("ui.theme", t), theme);
      await page.goto(`${APP}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000); // profile fetch + lazy fonts
      const file = `${OUT}/${slug}-${theme}.png`;
      await page.screenshot({ path: file });
      const cls = await page.evaluate(() => document.documentElement.className);
      console.log(`${slug} [${theme}] html.class=${JSON.stringify(cls)} url=${page.url()}`);
    }
  }

  const educatorPages = [
    ["/educator/dashboard", "edu-dashboard"],
    ["/educator/courses", "edu-courses"],
    ["/educator/calendar", "edu-calendar"],
    ["/educator/inbox", "edu-inbox"],
    ["/educator/account/settings", "edu-settings"],
  ];
  for (const [path, slug] of educatorPages) await shoot(teacher.session, path, slug);

  // student home (fresh context state — clear teacher's session key first via shoot's reinjection)
  await shoot(student.session, "/student", "stu-home");

  await browser.close();
  console.log("done — screenshots in", OUT);
} finally {
  // courses cascade-delete is NOT guaranteed (teacher_id is ON DELETE RESTRICT)
  // so remove courses first, then the users.
  if (courseIds.length) {
    const { error } = await service.from("courses").delete().in("id", courseIds);
    console.log(error ? "course cleanup FAILED: " + error.message : "courses deleted");
  }
  for (const [label, uid] of [["teacher", teacherId], ["student", studentId]]) {
    if (!uid) continue;
    const { error } = await service.auth.admin.deleteUser(uid);
    console.log(error ? `${label} cleanup FAILED: ` + error.message : `${label} deleted`);
  }
}
