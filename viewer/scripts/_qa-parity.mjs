/**
 * _qa-parity.mjs — visual QA harness for ivy-ledger mockup parity.
 * Provisions a disposable teacher (academic domain) + one academic course,
 * seeds 2 modules w/ items + 3 assignments (one due in 2 days), enrolls a
 * disposable student, then screenshots:
 *   teacher: /educator/courses/<code> (modules), .../grades, /educator/dashboard
 *   student: /student
 * Run:  node --env-file-if-exists=../.env scripts/_qa-parity.mjs
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
const OUT = "/Users/kevin/coding/CB_Educator_Question_Bank/design-explorations/ivy-ledger/shots/qa-parity";
mkdirSync(OUT, { recursive: true });
const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const ref = new URL(URL_).hostname.split(".")[0];
const storageKey = `sb-${ref}-auth-token`;

// best-effort insert: 2 attempts, proceed on failure
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
  const pw = "Qa-Pp-1!" + randomBytes(4).toString("hex");
  const tEmail = `qa-parity-teacher-${randomBytes(4).toString("hex")}@example.com`;
  const { data: cu, error: cuErr } = await service.auth.admin.createUser({ email: tEmail, password: pw, email_confirm: true });
  if (cuErr) throw new Error(cuErr.message);
  teacherId = cu.user.id;
  await service.from("profiles").update({ role: "teacher", display_name: "QA Parity Teacher", domain: "academic" }).eq("id", teacherId);

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

  // ---- assignments (due dates this week; one due in 2 days) ----
  const d = (days, hour = 23) => { const t = new Date(); t.setDate(t.getDate() + days); t.setHours(hour, 59, 0, 0); return t.toISOString(); };
  const assignments = await tryInsert("assignments", [
    { course_id: course.id, created_by: teacherId, title: "Diagnostic — Reading & Writing", source_id: "mixed", question_count: 27, due_at: d(2), kind: "mocktest" },
    { course_id: course.id, created_by: teacherId, title: "Vocab in Context Drill", source_id: "mixed", question_count: 15, due_at: d(4), kind: "mocktest" },
    { course_id: course.id, created_by: teacherId, title: "Craft & Structure Set A", source_id: "mixed", question_count: 12, due_at: d(6), kind: "mocktest" },
  ]);

  // ---- module items ----
  if (modules) {
    const [m1, m2] = modules;
    const a = assignments || [];
    await tryInsert("module_items", [
      // NOTE: every row must carry the SAME keys — PostgREST batch inserts
      // pass NULL for missing keys, which violates NOT NULL on `indent`.
      { module_id: m1.id, position: 0, item_type: "header", item_ref_id: null, title: "Getting started", url: null, indent: 0, published: true },
      ...(a[0] ? [{ module_id: m1.id, position: 1, item_type: "assignment", item_ref_id: a[0].id, title: a[0].title, url: null, indent: 1, published: true }] : []),
      { module_id: m1.id, position: 2, item_type: "link", item_ref_id: null, title: "Khan Academy — SAT practice", url: "https://www.khanacademy.org/sat", indent: 1, published: true },
      ...(a[1] ? [{ module_id: m2.id, position: 0, item_type: "assignment", item_ref_id: a[1].id, title: a[1].title, url: null, indent: 0, published: true }] : []),
      ...(a[2] ? [{ module_id: m2.id, position: 1, item_type: "assignment", item_ref_id: a[2].id, title: a[2].title, url: null, indent: 0, published: true }] : []),
      { module_id: m2.id, position: 2, item_type: "link", item_ref_id: null, title: "Annotation strategy guide", url: "https://example.com/guide", indent: 0, published: true },
    ]);
  }

  // ---- student + enrollment ----
  const sEmail = `qa-parity-student-${randomBytes(4).toString("hex")}@example.com`;
  const { data: su, error: suErr } = await service.auth.admin.createUser({ email: sEmail, password: pw, email_confirm: true });
  if (suErr) console.warn("student create failed:", suErr.message);
  else {
    studentId = su.user.id;
    await service.from("profiles").update({ display_name: "QA Parity Student" }).eq("id", studentId);
    await tryInsert("course_memberships", [{ course_id: course.id, student_id: studentId }]);
  }

  // ---- browser ----
  const browser = await chromium.launch();

  // teacher session
  const userClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: si, error: siErr } = await userClient.auth.signInWithPassword({ email: tEmail, password: pw });
  if (siErr) throw new Error(siErr.message);
  const tPage = await (await browser.newContext({ viewport: { width: 1380, height: 900 } })).newPage();
  await tPage.goto(`${APP}/signin`, { waitUntil: "domcontentloaded" });
  await tPage.evaluate(([k, v]) => localStorage.setItem(k, v), [storageKey, JSON.stringify(si.session)]);

  const teacherShots = [
    ["teacher-modules", `/educator/courses/${course.short_code}`],
    ["teacher-grades", `/educator/courses/${course.short_code}/grades`],
    ["teacher-dashboard", "/educator/dashboard"],
  ];
  for (const [name, path] of teacherShots) {
    await tPage.goto(`${APP}${path}`, { waitUntil: "domcontentloaded" });
    await tPage.waitForTimeout(3500);
    await tPage.screenshot({ path: `${OUT}/${name}.png` });
    console.log("shot", name);
  }

  // student session
  if (studentId) {
    const sClient = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data: ssi, error: ssiErr } = await sClient.auth.signInWithPassword({ email: sEmail, password: pw });
    if (ssiErr) console.warn("student signin failed:", ssiErr.message);
    else {
      const sPage = await (await browser.newContext({ viewport: { width: 1380, height: 900 } })).newPage();
      await sPage.goto(`${APP}/signin`, { waitUntil: "domcontentloaded" });
      await sPage.evaluate(([k, v]) => localStorage.setItem(k, v), [storageKey, JSON.stringify(ssi.session)]);
      await sPage.goto(`${APP}/student`, { waitUntil: "domcontentloaded" });
      await sPage.waitForTimeout(3500);
      await sPage.screenshot({ path: `${OUT}/student-home.png` });
      console.log("shot student-home");
    }
  }

  // mockup reference shots
  const MOCK = "/Users/kevin/coding/CB_Educator_Question_Bank/design-explorations/ivy-ledger";
  const mPage = await (await browser.newContext({ viewport: { width: 1380, height: 900 } })).newPage();
  for (const f of ["modules", "gradebook", "educator-dashboard", "student-home"]) {
    await mPage.goto(`file://${MOCK}/${f}.html`, { waitUntil: "load" });
    await mPage.waitForTimeout(800);
    await mPage.screenshot({ path: `${OUT}/mockup-${f}.png` });
    console.log("shot mockup", f);
  }

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
