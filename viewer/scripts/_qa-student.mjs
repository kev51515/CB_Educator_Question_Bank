/**
 * _qa-student.mjs — visual QA harness for the STUDENT journey (ivy theme).
 * Modeled on _qa-parity.mjs. Provisions a disposable teacher (academic) +
 * academic course; 2 modules:
 *   - "Week 1 — Foundations": PUBLISHED, 3 published items incl. a
 *     /test/dsat-nov-2023 link item titled "Practice Test 4"
 *   - "Week 2 — Reading Deep Dive": PUBLISHED but ALL items draft
 *     (title-only for students; dimmed items for teacher)
 * 2 assignments due this week. Disposable student "Sophia Chen" (academic)
 * enrolled. Screenshots at 1380x900:
 *   student: /student, /student/courses/<short>, /student/my-feedback
 *   teacher: /educator/courses/<short> (modules — draft-item greying)
 * Run:  node --env-file-if-exists=../.env scripts/_qa-student.mjs
 * Requires: `npx vite preview --port 4199` running. Cleans up in finally{}.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL_ || !ANON || !SERVICE) { console.error("missing env"); process.exit(1); }
const APP = "http://localhost:4199";
const OUT = "/Users/kevin/coding/CB_Educator_Question_Bank/design-explorations/ivy-ledger/shots/qa-student";
mkdirSync(OUT, { recursive: true });
const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const ref = new URL(URL_).hostname.split(".")[0];
const storageKey = `sb-${ref}-auth-token`;

async function tryInsert(table, rows) {
  for (let i = 0; i < 2; i++) {
    const { data, error } = await service.from(table).insert(rows).select();
    if (!error) return data;
    console.warn(`insert ${table} attempt ${i + 1} failed:`, error.message);
  }
  return null;
}

let teacherId = null;
let studentId = null;
let courseIds = [];
try {
  // ---- teacher ----
  const pw = "Qa-St-1!" + randomBytes(4).toString("hex");
  const tEmail = `qa-student-teacher-${randomBytes(4).toString("hex")}@example.com`;
  const { data: cu, error: cuErr } = await service.auth.admin.createUser({ email: tEmail, password: pw, email_confirm: true });
  if (cuErr) throw new Error(cuErr.message);
  teacherId = cu.user.id;
  await service.from("profiles").update({ role: "teacher", display_name: "QA Student-Journey Teacher", domain: "academic" }).eq("id", teacherId);

  // ---- course ----
  const { data: courses, error: cErr } = await service.from("courses").insert([
    { teacher_id: teacherId, name: "SAT June Intensive", course_type: "class" },
  ]).select("id, short_code");
  if (cErr) throw new Error("courses: " + cErr.message);
  courseIds = courses.map((c) => c.id);
  const course = courses[0];

  // ---- modules ----
  const modules = await tryInsert("course_modules", [
    { course_id: course.id, name: "Week 1 — Foundations", position: 0, published: true },
    { course_id: course.id, name: "Week 2 — Reading Deep Dive", position: 1, published: true },
  ]);

  // ---- assignments (2, due this week) ----
  const d = (days, hour = 23) => { const t = new Date(); t.setDate(t.getDate() + days); t.setHours(hour, 59, 0, 0); return t.toISOString(); };
  const assignments = await tryInsert("assignments", [
    { course_id: course.id, created_by: teacherId, title: "Diagnostic — Reading & Writing", source_id: "mixed", question_count: 27, due_at: d(2), kind: "mocktest" },
    { course_id: course.id, created_by: teacherId, title: "Vocab in Context Drill", source_id: "mixed", question_count: 15, due_at: d(5), kind: "mocktest" },
  ]);

  // ---- module items ----
  if (modules) {
    const [m1, m2] = modules;
    const a = assignments || [];
    await tryInsert("module_items", [
      // NOTE: every row must carry the SAME keys — PostgREST batch inserts
      // pass NULL for missing keys, which violates NOT NULL on `indent`.
      // Module 1: PUBLISHED, 3 published items (incl. full-test link)
      ...(a[0] ? [{ module_id: m1.id, position: 0, item_type: "assignment", item_ref_id: a[0].id, title: a[0].title, url: null, indent: 0, published: true }] : []),
      { module_id: m1.id, position: 1, item_type: "link", item_ref_id: null, title: "Practice Test 4", url: "/test/dsat-nov-2023", indent: 0, published: true },
      { module_id: m1.id, position: 2, item_type: "link", item_ref_id: null, title: "Annotation strategy guide", url: "https://example.com/guide", indent: 0, published: true },
      // Module 2: module PUBLISHED but every item is DRAFT
      ...(a[1] ? [{ module_id: m2.id, position: 0, item_type: "assignment", item_ref_id: a[1].id, title: a[1].title, url: null, indent: 0, published: false }] : []),
      { module_id: m2.id, position: 1, item_type: "header", item_ref_id: null, title: "Close-reading toolkit", url: null, indent: 0, published: false },
      { module_id: m2.id, position: 2, item_type: "link", item_ref_id: null, title: "Khan Academy — SAT practice", url: "https://www.khanacademy.org/sat", indent: 1, published: false },
    ]);
  }

  // ---- student + enrollment ----
  const sEmail = `qa-student-student-${randomBytes(4).toString("hex")}@example.com`;
  const { data: su, error: suErr } = await service.auth.admin.createUser({ email: sEmail, password: pw, email_confirm: true });
  if (suErr) console.warn("student create failed:", suErr.message);
  else {
    studentId = su.user.id;
    await service.from("profiles").update({ display_name: "Sophia Chen", domain: "academic" }).eq("id", studentId);
    await tryInsert("course_memberships", [{ course_id: course.id, student_id: studentId }]);
  }

  // ---- browser ----
  const browser = await chromium.launch();

  // student session
  if (studentId) {
    const sClient = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data: ssi, error: ssiErr } = await sClient.auth.signInWithPassword({ email: sEmail, password: pw });
    if (ssiErr) console.warn("student signin failed:", ssiErr.message);
    else {
      const sPage = await (await browser.newContext({ viewport: { width: 1380, height: 900 } })).newPage();
      await sPage.goto(`${APP}/signin`, { waitUntil: "domcontentloaded" });
      await sPage.evaluate(([k, v]) => localStorage.setItem(k, v), [storageKey, JSON.stringify(ssi.session)]);
      const studentShots = [
        ["student-home", "/student"],
        ["student-course", `/student/courses/${course.short_code}`],
        ["student-my-feedback", "/student/my-feedback"],
      ];
      for (const [name, path] of studentShots) {
        await sPage.goto(`${APP}${path}`, { waitUntil: "domcontentloaded" });
        await sPage.waitForTimeout(3500);
        await sPage.screenshot({ path: `${OUT}/${name}.png` });
        console.log("shot", name);
      }
    }
  }

  // teacher session — modules page (draft-item greying)
  const userClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: si, error: siErr } = await userClient.auth.signInWithPassword({ email: tEmail, password: pw });
  if (siErr) throw new Error(siErr.message);
  const tPage = await (await browser.newContext({ viewport: { width: 1380, height: 900 } })).newPage();
  await tPage.goto(`${APP}/signin`, { waitUntil: "domcontentloaded" });
  await tPage.evaluate(([k, v]) => localStorage.setItem(k, v), [storageKey, JSON.stringify(si.session)]);
  await tPage.goto(`${APP}/educator/courses/${course.short_code}`, { waitUntil: "domcontentloaded" });
  await tPage.waitForTimeout(3500);
  await tPage.screenshot({ path: `${OUT}/teacher-modules.png` });
  console.log("shot teacher-modules");

  await browser.close();
} catch (e) {
  console.error("FATAL:", e.message);
} finally {
  if (courseIds.length) await service.from("courses").delete().in("id", courseIds);
  if (studentId) {
    const { error } = await service.auth.admin.deleteUser(studentId);
    console.log(error ? "student cleanup FAILED: " + error.message : "student cleanup done");
  }
  if (teacherId) {
    const { error } = await service.auth.admin.deleteUser(teacherId);
    console.log(error ? "teacher cleanup FAILED: " + error.message : "teacher cleanup done");
  }
}
