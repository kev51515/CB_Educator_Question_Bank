/**
 * _shot-journey.mjs — visual verification of the Journey view (docs/JOURNEY_VIEW.md).
 *
 * Seeds a disposable class: 1 teacher + 1 student, 3 modules
 * (Week 1 fully attempted with sealed/proficient/attempted scores, Week 2
 * in-progress with an "up next" cell + a full-test link, Week 3 locked),
 * then screenshots:
 *   1. student course page (journey default, ivy light + dark)
 *   2. student List toggle (regression: old view intact)
 *   3. educator Modules with the Journey class-aggregate toggle on
 *
 * Run:  OUT=/tmp/journey node --env-file-if-exists=../.env scripts/_shot-journey.mjs
 * Requires: `npx vite preview --port 4199` running.
 * Cleanup: deletes the course + both disposable users in finally{}.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const OUT = process.env.OUT || "/tmp/journey";
if (!URL_ || !ANON || !SERVICE) { console.error("missing env"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const APP = "http://localhost:4199";
const TAG = randomBytes(3).toString("hex");
const PW = "Journey!" + randomBytes(4).toString("hex");
const service = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const ref = new URL(URL_).hostname.split(".")[0];
const storageKey = `sb-${ref}-auth-token`;

const userIds = [];
let courseId = null;
let browser = null;

async function createUser(email, role) {
  const { data, error } = await service.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  userIds.push(data.user.id);
  if (role !== "student") await service.from("profiles").update({ role }).eq("id", data.user.id);
  return data.user.id;
}

async function signIn(email) {
  const c = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return data.session;
}

async function one(q, label) {
  const { data, error } = await q;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

try {
  const teacherId = await createUser(`jrny-t-${TAG}@gmail.com`, "teacher");
  const studentId = await createUser(`jrny-s-${TAG}@gmail.com`, "student");

  const course = await one(
    service.from("courses").insert({ name: `Journey QA ${TAG}`, teacher_id: teacherId }).select("id, short_code").single(),
    "course",
  );
  courseId = course.id;
  await one(service.from("course_memberships").insert({ course_id: courseId, student_id: studentId }), "enrol");

  const mkModule = (name, position, opens_at = null) =>
    one(service.from("course_modules").insert({ course_id: courseId, name, position, published: true, opens_at }).select("id").single(), `module ${name}`);
  const m1 = await mkModule("Week 1 — Foundations", 1);
  const m2 = await mkModule("Week 2 — Algebra", 2);
  const m3 = await mkModule("Week 3 — Geometry", 3, new Date(Date.now() + 4 * 86400e3).toISOString());

  const mkSet = (title) =>
    one(service.from("assignments").insert({
      course_id: courseId, created_by: teacherId, title, kind: "qbank_set",
      qbank_set_uid: "smoke-test-set", qbank_set_label: "QA", question_count: 10,
      source_id: null, time_limit_minutes: 20, difficulty_mix: "any",
    }).select("id").single(), `set ${title}`);
  const mkMock = (title) =>
    one(service.from("assignments").insert({
      course_id: courseId, created_by: teacherId, title, kind: "mocktest",
      question_count: 10, source_id: "cb", qbank_set_uid: null,
      time_limit_minutes: 20, difficulty_mix: "any",
    }).select("id").single(), `mock ${title}`);

  const a1 = await mkSet("Vocab Quiz 1");
  const a2 = await mkSet("Reading drill — Craft & Structure");
  const a3 = await mkMock("Linear equations Practice Test");
  const a4 = await mkSet("Systems of equations");
  const a5 = await mkSet("Quadratics Quiz");
  const a6 = await mkSet("Angles & triangles");

  const item = (module_id, position, fields) =>
    one(service.from("module_items").insert({ module_id, position, published: true, ...fields }), "item");
  await item(m1.id, 1, { item_type: "assignment", item_ref_id: a1.id, title: "Vocab Quiz 1" });
  await item(m1.id, 2, { item_type: "assignment", item_ref_id: a2.id, title: "Reading drill — Craft & Structure" });
  await item(m1.id, 3, { item_type: "assignment", item_ref_id: a3.id, title: "Linear equations Practice Test" });
  await item(m1.id, 4, { item_type: "link", title: "Khan Academy — practice", url: "https://www.khanacademy.org" });
  await item(m2.id, 1, { item_type: "assignment", item_ref_id: a4.id, title: "Systems of equations" });
  await item(m2.id, 2, { item_type: "assignment", item_ref_id: a5.id, title: "Quadratics Quiz" });
  await item(m2.id, 3, { item_type: "link", title: "DSAT Nov 2023 — full test", url: "/test/dsat-nov-2023" });
  await item(m3.id, 1, { item_type: "assignment", item_ref_id: a6.id, title: "Angles & triangles" });

  const attempt = (assignment_id, score) =>
    one(service.from("assignment_attempts").insert({
      assignment_id, student_id: studentId, submitted_at: new Date().toISOString(),
      score_percent: score, correct_count: Math.round(score / 10), total_questions: 10,
    }), `attempt ${score}`);
  await attempt(a1.id, 85); // sealed
  await attempt(a2.id, 55); // attempted
  await attempt(a3.id, 72); // proficient (mocktest, 200 possible)
  await attempt(a4.id, 88); // sealed
  // a5 untouched → up next; a6 locked
  console.log("seeded course", courseId, course.short_code);

  browser = await chromium.launch();

  async function shot(session, path, file, { theme = "ivy", dark = false, before, preview = false, fullPage = true } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1380, height: 1500 }, colorScheme: dark ? "dark" : "light" });
    const page = await ctx.newPage();
    await page.addInitScript(([k, sess, th, dk, pv]) => {
      localStorage.setItem(k, JSON.stringify(sess));
      localStorage.setItem("ui.theme", th);
      localStorage.setItem("sat:dark-mode", dk ? "true" : "false");
      // journey.preview unlocks the student journey while the build flag is off
      if (pv) localStorage.setItem("journey.preview", "1");
    }, [storageKey, session, theme, dark, preview]);
    await page.goto(`${APP}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    if (before) await before(page);
    await page.screenshot({ path: `${OUT}/${file}`, fullPage });
    console.log("shot", file);
    await ctx.close();
  }

  // Student journey (via the journey.preview escape hatch while the build
  // flag is off): grid default, then the 1A cell-detail popover on the
  // attempted (72-style) cell, then the 3A seal moment on a reload after a
  // new >=80% attempt lands.
  const studentSession = await signIn(`jrny-s-${TAG}@gmail.com`);
  const coursePath = `/student/courses/${course.short_code}`;

  // One PERSISTENT context for the student journey flow: the seal-moment
  // diff compares against the localStorage snapshot from the prior visit,
  // so the first load records and the reload (after a new >=80% attempt
  // lands) celebrates. Fresh contexts would never have a snapshot.
  {
    const ctx = await browser.newContext({ viewport: { width: 1380, height: 1500 } });
    const page = await ctx.newPage();
    await page.addInitScript(([k, sess]) => {
      localStorage.setItem(k, JSON.stringify(sess));
      localStorage.setItem("ui.theme", "ivy");
      localStorage.setItem("journey.preview", "1");
    }, [storageKey, studentSession]);
    await page.goto(`${APP}${coursePath}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    // First visit: must show NO celebration (snapshot just records).
    await page.screenshot({ path: `${OUT}/student-journey-ivy.png`, fullPage: true });
    console.log("shot student-journey-ivy.png");

    // 1A cell-detail popover on the attempted cell.
    await page.locator('button[title*="Reading drill"]').first().click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/student-cell-popover.png` });
    console.log("shot student-cell-popover.png");
    await page.keyboard.press("Escape");

    // New sealed attempt on the up-next quiz → reload → stamp + toast + delta.
    await one(service.from("assignment_attempts").insert({
      assignment_id: a5.id, student_id: studentId, submitted_at: new Date().toISOString(),
      score_percent: 86, correct_count: 9, total_questions: 10,
    }), "seal attempt");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${OUT}/student-seal-moment.png` });
    console.log("shot student-seal-moment.png");
    await ctx.close();
  }

  // List regression (no preview flag → flag off → plain list).
  await shot(studentSession, coursePath, "student-course-list.png");

  // Educator Modules: Journey primary; 2A triage popover on a cell click.
  const teacherSession = await signIn(`jrny-t-${TAG}@gmail.com`);
  const modsPath = `/educator/courses/${course.short_code}/modules`;
  await shot(teacherSession, modsPath, "educator-journey-ivy.png");
  // Triage popover on the LOW-score cell (Reading drill, 55%) so the
  // needs-attention list + Nudge render; click Nudge and verify the DM.
  await shot(teacherSession, modsPath, "educator-triage-popover.png", {
    fullPage: false,
    before: async (page) => {
      await page.locator('button[title*="Reading drill"]').first().click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/educator-triage-before-nudge.png` });
      await page.getByRole("button", { name: /Nudge 1 student/ }).click();
      await page.waitForTimeout(2500); // open_thread_with + insert + toast
    },
  });
  {
    const { data: msgs, error: mErr } = await service
      .from("messages")
      .select("body")
      .ilike("body", "%Reading drill%");
    if (mErr || !msgs?.length) throw new Error("nudge DM not found in messages");
    console.log("nudge DM verified:", JSON.stringify(msgs[0].body));
  }
  await shot(teacherSession, modsPath, "educator-list-ivy.png", {
    before: async (page) => {
      await page.getByRole("tab", { name: "List" }).click();
      await page.waitForTimeout(1200);
    },
  });

  console.log("OK — screenshots in", OUT);
} catch (err) {
  console.error("FAIL:", err.message ?? err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (courseId) await service.from("courses").delete().eq("id", courseId);
  for (const uid of userIds) {
    try { await service.auth.admin.deleteUser(uid); } catch { /* ignore */ }
  }
  console.log("cleanup done");
}
