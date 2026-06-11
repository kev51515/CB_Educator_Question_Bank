/**
 * _verify-additem-ivy.mjs — one-off visual check that the Modules "+ Add item"
 * inline form follows the Ivy Ledger theme (fused-band type selector, compact
 * hug-content filter pills — no stretched ovals).
 *
 * Provisions a disposable teacher + course + one module, opens the Modules
 * page, pops the add-item form, and screenshots it (Header type + Question Set
 * type so the filter pill rows are visible too).
 *
 * Run:  node --env-file-if-exists=../.env scripts/_verify-additem-ivy.mjs
 * Requires: `npx vite preview --port 4199` running.
 * Output: /tmp/additem-ivy-*.png. Cleans up the disposable user in finally{}.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL_ || !ANON || !SERVICE) { console.error("missing env"); process.exit(1); }

const APP = "http://localhost:4199";
const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const ref = new URL(URL_).hostname.split(".")[0];
const storageKey = `sb-${ref}-auth-token`;

let teacherId = null;
let browser = null;
try {
  // ---- provision teacher ----
  const pw = "Qa-Additem-1!" + randomBytes(4).toString("hex");
  const email = `qa-additem-${randomBytes(4).toString("hex")}@example.com`;
  const { data: cu, error: cuErr } = await service.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (cuErr) throw new Error(`createUser: ${cuErr.message}`);
  teacherId = cu.user.id;
  const { error: upErr } = await service.from("profiles").update({ display_name: "QA AddItem Teacher", role: "teacher" }).eq("id", teacherId);
  if (upErr) throw new Error(`profile: ${upErr.message}`);

  // ---- course + module ----
  const { data: course, error: cErr } = await service.from("courses")
    .insert({ teacher_id: teacherId, name: "AddItem QA Course", course_type: "class" })
    .select("id, short_code").single();
  if (cErr) throw new Error(`course: ${cErr.message}`);
  const { data: mod, error: mErr } = await service.from("course_modules")
    .insert({ course_id: course.id, name: "Week 1", position: 0, published: true })
    .select("id").single();
  if (mErr) throw new Error(`module: ${mErr.message}`);
  console.log("provisioned", { teacherId, course: course.id, module: mod.id });

  // ---- sign in for a session to inject ----
  const userClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: si, error: siErr } = await userClient.auth.signInWithPassword({ email, password: pw });
  if (siErr) throw new Error(`signIn: ${siErr.message}`);

  // ---- browser ----
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 950 } });
  const page = await ctx.newPage();
  await page.addInitScript(([key, sess]) => {
    window.localStorage.setItem(key, JSON.stringify(sess));
    window.localStorage.setItem("ui.theme", "ivy");
  }, [storageKey, si.session]);

  await page.goto(`${APP}/educator/courses/${course.short_code}/modules`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // Expand module if collapsed, then open the add-item form.
  const addItem = page.getByRole("button", { name: /Add item/ }).first();
  await addItem.waitFor({ state: "visible", timeout: 10000 });
  await addItem.click();
  await page.waitForTimeout(400);

  const form = page.locator("form", { has: page.locator('button[aria-pressed]') }).first();
  await form.waitFor({ state: "visible", timeout: 5000 });

  // Shot 1: Header type (simple input).
  await page.getByRole("button", { name: "Header", exact: true }).click();
  await page.waitForTimeout(300);
  await form.screenshot({ path: "/tmp/additem-ivy-header.png" });

  // Shot 2: Question Set type (filter pill rows) — only renders for
  // Question-Bank allow-listed educators; skip gracefully otherwise.
  const qsChip = page.getByRole("button", { name: "Question Set", exact: true });
  if (await qsChip.count()) {
    await qsChip.click();
    await page.waitForTimeout(600);
    await form.screenshot({ path: "/tmp/additem-ivy-qset.png" });
  } else {
    console.log("Question Set chip not visible (teacher not allow-listed) — skipping qset shot");
  }

  // Shot 3: full page for context.
  await page.screenshot({ path: "/tmp/additem-ivy-page.png" });
  console.log("screenshots written to /tmp/additem-ivy-*.png");
} finally {
  if (browser) await browser.close().catch(() => {});
  if (teacherId) {
    // Courses first — the profile delete is blocked by the course FK.
    await service.from("courses").delete().eq("teacher_id", teacherId);
    const { error } = await service.auth.admin.deleteUser(teacherId).catch((e) => ({ error: e }));
    if (error) console.warn("cleanup failed:", error.message ?? error);
    else console.log("cleaned up disposable teacher");
  }
}
