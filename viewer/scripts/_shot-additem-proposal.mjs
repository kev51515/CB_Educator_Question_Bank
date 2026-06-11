/**
 * _shot-additem-proposal.mjs — before/after screenshots of the Modules
 * "+ Add item" form for the UX-improvement proposal. Same provisioning as
 * _verify-additem-ivy.mjs but captures every reachable type view.
 *
 * Run:  OUT=/tmp/additem-before node --env-file-if-exists=../.env scripts/_shot-additem-proposal.mjs
 * Requires: `npx vite preview --port 4199` running against the build to shoot.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const OUT = process.env.OUT || "/tmp/additem-shots";
if (!URL_ || !ANON || !SERVICE) { console.error("missing env"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const APP = "http://localhost:4199";
const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const ref = new URL(URL_).hostname.split(".")[0];
const storageKey = `sb-${ref}-auth-token`;

let teacherId = null;
let browser = null;
try {
  const pw = "Qa-Shot-1!" + randomBytes(4).toString("hex");
  const email = `qa-shot-${randomBytes(4).toString("hex")}@example.com`;
  const { data: cu, error: cuErr } = await service.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (cuErr) throw new Error(`createUser: ${cuErr.message}`);
  teacherId = cu.user.id;
  await service.from("profiles").update({ display_name: "QA Shot Teacher", role: "teacher" }).eq("id", teacherId);

  const { data: course, error: cErr } = await service.from("courses")
    .insert({ teacher_id: teacherId, name: "Proposal QA Course", course_type: "class" })
    .select("id, short_code").single();
  if (cErr) throw new Error(`course: ${cErr.message}`);
  const { error: mErr } = await service.from("course_modules")
    .insert({ course_id: course.id, name: "Week 1", position: 0, published: true });
  if (mErr) throw new Error(`module: ${mErr.message}`);

  // One assignment so the Assignment combobox has content.
  await service.from("assignments").insert({
    course_id: course.id, created_by: teacherId, title: "Vocab Quiz 1",
    kind: "mocktest", source_id: "cb", question_count: 10,
  }).then(({ error }) => { if (error) console.warn("assignment seed:", error.message); });

  const userClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: si, error: siErr } = await userClient.auth.signInWithPassword({ email, password: pw });
  if (siErr) throw new Error(`signIn: ${siErr.message}`);

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 950 } });
  const page = await ctx.newPage();
  await page.addInitScript(([key, sess]) => {
    window.localStorage.setItem(key, JSON.stringify(sess));
    window.localStorage.setItem("ui.theme", "ivy");
  }, [storageKey, si.session]);

  await page.goto(`${APP}/educator/courses/${course.short_code}/modules`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const addItem = page.getByRole("button", { name: /Add item/ }).first();
  await addItem.waitFor({ state: "visible", timeout: 10000 });
  await addItem.click();
  await page.waitForTimeout(400);

  const form = page.locator("form", { has: page.locator("button[aria-pressed]") }).first();
  await form.waitFor({ state: "visible", timeout: 5000 });

  const shoot = async (chipName, file, { focusInput = false } = {}) => {
    const chipBtn = page.getByRole("button", { name: chipName, exact: true });
    if (!(await chipBtn.count())) { console.log(`skip ${chipName} (not visible)`); return; }
    await chipBtn.click();
    await page.waitForTimeout(350);
    if (focusInput) {
      await form.locator("input[type=text]").first().click().catch(() => {});
      await page.waitForTimeout(150);
    }
    await form.screenshot({ path: `${OUT}/${file}` });
    console.log(`shot ${OUT}/${file}`);
  };

  await shoot("Header", "header.png", { focusInput: true });
  await shoot("Assignment", "assignment.png");
  await shoot("Link", "link.png");
  await page.screenshot({ path: `${OUT}/page.png` });
  console.log(`shot ${OUT}/page.png`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (teacherId) {
    await service.from("courses").delete().eq("teacher_id", teacherId);
    const { error } = await service.auth.admin.deleteUser(teacherId).catch((e) => ({ error: e }));
    console.log(error ? `cleanup failed: ${error.message ?? error}` : "cleaned up");
  }
}
