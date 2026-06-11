/** Verify the grouped-tab menu anchors to its trigger (portal fix). */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";
const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY;
const APP = "http://localhost:4199";
const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const ref = new URL(URL_).hostname.split(".")[0];
let uid = null, courseIds = [];
try {
  const pw = "Qa-Tm-1!" + randomBytes(4).toString("hex");
  const email = `qa-tabmenu-${randomBytes(4).toString("hex")}@example.com`;
  const { data: cu } = await service.auth.admin.createUser({ email, password: pw, email_confirm: true });
  uid = cu.user.id;
  await service.from("profiles").update({ role: "teacher", domain: "coaching" }).eq("id", uid);
  const { data: courses } = await service.from("courses").insert([{ teacher_id: uid, name: "Pickleball Demo — Coaches", course_type: "pickleball_coach" }]).select("id, short_code");
  courseIds = courses.map(c => c.id);
  const userClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: si } = await userClient.auth.signInWithPassword({ email, password: pw });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1380, height: 900 } })).newPage();
  await page.goto(`${APP}/signin`, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify(si.session)]);
  await page.goto(`${APP}/educator/courses/${courses[0].short_code}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const trigger = page.locator('nav[aria-label="Course sections"] button', { hasText: "People" }).first();
  await trigger.click();
  await page.waitForTimeout(400);
  const tRect = await trigger.boundingBox();
  const menu = page.locator('[role="menu"][aria-label="People"]');
  const mRect = await menu.boundingBox();
  const dx = Math.abs(mRect.x - tRect.x), dy = mRect.y - (tRect.y + tRect.height);
  console.log("trigger", JSON.stringify(tRect), "menu", JSON.stringify(mRect));
  console.log(`anchor check: dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} ->`, dx < 40 && dy >= 0 && dy < 16 ? "PASS" : "FAIL");
  await page.screenshot({ path: "/Users/kevin/coding/CB_Educator_Question_Bank/design-explorations/ivy-ledger/shots/qa-workspaces/tabmenu-fixed.png" });
  await browser.close();
} finally {
  if (courseIds.length) await service.from("courses").delete().in("id", courseIds);
  if (uid) { await service.auth.admin.deleteUser(uid); console.log("cleanup done"); }
}
