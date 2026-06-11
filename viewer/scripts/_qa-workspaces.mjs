/**
 * _qa-workspaces.mjs — QA harness for domain workspaces + grouped course tabs.
 * Provisions a disposable teacher with one course per domain, then per domain
 * (academic/counseling/coaching): sets profiles.domain via service role and
 * screenshots /educator/courses + /educator/dashboard (hard-scoped views).
 * Also screenshots the grouped tab strip on the academic + pickleball courses,
 * including one open group menu.
 * Run:  node --env-file-if-exists=../.env scripts/_qa-workspaces.mjs
 * Requires: `npx vite preview --port 4199` running. Cleans up in finally{}.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL_ || !ANON || !SERVICE) { console.error("missing env"); process.exit(1); }
const APP = "http://localhost:4199";
const OUT = "/Users/kevin/coding/CB_Educator_Question_Bank/design-explorations/ivy-ledger/shots/qa-workspaces";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });
const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const ref = new URL(URL_).hostname.split(".")[0];
const storageKey = `sb-${ref}-auth-token`;

let teacherId = null;
let courseIds = [];
try {
  const pw = "Qa-Ws-1!" + randomBytes(4).toString("hex");
  const email = `qa-ws-teacher-${randomBytes(4).toString("hex")}@example.com`;
  const { data: cu, error: cuErr } = await service.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (cuErr) throw new Error(cuErr.message);
  teacherId = cu.user.id;
  await service.from("profiles").update({ role: "teacher", display_name: "QA Workspace Teacher" }).eq("id", teacherId);

  const { data: courses, error: cErr } = await service.from("courses").insert([
    { teacher_id: teacherId, name: "SAT June Intensive", course_type: "class" },
    { teacher_id: teacherId, name: "Counseling — Class of 2027", course_type: "counseling" },
    { teacher_id: teacherId, name: "Pickleball Squad A", course_type: "pickleball_player" },
  ]).select("id, short_code, course_type");
  if (cErr) throw new Error("courses: " + cErr.message);
  courseIds = courses.map((c) => c.id);
  const byType = Object.fromEntries(courses.map((c) => [c.course_type, c]));

  // seed one folder per domain to verify folder scoping
  await service.from("course_folders").insert([
    { owner_id: teacherId, name: "SAT Folder", domain: "academic", position: 0 },
    { owner_id: teacherId, name: "Counseling Folder", domain: "counseling", position: 0 },
  ]);

  const userClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: si, error: siErr } = await userClient.auth.signInWithPassword({ email, password: pw });
  if (siErr) throw new Error(siErr.message);

  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1380, height: 900 } })).newPage();
  await page.goto(`${APP}/signin`, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [storageKey, JSON.stringify(si.session)]);

  for (const domain of ["academic", "counseling", "coaching"]) {
    await service.from("profiles").update({ domain }).eq("id", teacherId);
    for (const [name, path] of [["courses", "/educator/courses"], ["dashboard", "/educator/dashboard"]]) {
      await page.goto(`${APP}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${OUT}/${domain}-${name}.png` });
      console.log("shot", domain, name);
    }
  }

  // tab groups: academic course page + open Teach menu
  await service.from("profiles").update({ domain: "academic" }).eq("id", teacherId);
  await page.goto(`${APP}/educator/courses/${byType["class"].short_code}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/tabs-academic.png` });
  const teach = page.getByRole("button", { name: /Teach/ }).first();
  if (await teach.count()) { await teach.click(); await page.waitForTimeout(400); }
  await page.screenshot({ path: `${OUT}/tabs-academic-menu-open.png` });
  console.log("shot tabs-academic (+menu)");

  await service.from("profiles").update({ domain: "coaching" }).eq("id", teacherId);
  await page.goto(`${APP}/educator/courses/${byType["pickleball_player"].short_code}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/tabs-pickleball.png` });
  console.log("shot tabs-pickleball");

  await browser.close();
} finally {
  if (courseIds.length) await service.from("courses").delete().in("id", courseIds);
  if (teacherId) {
    await service.from("course_folders").delete().eq("owner_id", teacherId);
    const { error } = await service.auth.admin.deleteUser(teacherId);
    console.log(error ? "cleanup FAILED: " + error.message : "cleanup done");
  }
}
