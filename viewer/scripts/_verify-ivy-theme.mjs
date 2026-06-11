/**
 * _verify-ivy-theme.mjs — one-off: verify the classic↔ivy theme switch on the
 * real authenticated educator dashboard. Creates a disposable teacher, injects
 * its session into the browser, screenshots both themes, deletes the user.
 * Run: node --env-file-if-exists=../.env scripts/_verify-ivy-theme.mjs
 * Requires: `npx vite preview --port 4199` running.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL_ || !ANON || !SERVICE) { console.error("missing env"); process.exit(1); }
const APP = "http://localhost:4199";
const OUT = "/Users/kevin/coding/CB_Educator_Question_Bank/design-explorations/ivy-ledger/shots";
const PW = "Verify-Theme-1!" + randomBytes(3).toString("hex");
const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const email = `theme-verify-${randomBytes(4).toString("hex")}@example.com`;
const { data: cu, error: cuErr } = await service.auth.admin.createUser({ email, password: PW, email_confirm: true });
if (cuErr) { console.error("createUser:", cuErr.message); process.exit(1); }
const uid = cu.user.id;
try {
  const { error: upErr } = await service.from("profiles").update({ role: "teacher", display_name: "Theme Verifier" }).eq("id", uid);
  if (upErr) throw new Error("promote: " + upErr.message);

  const userClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: si, error: siErr } = await userClient.auth.signInWithPassword({ email, password: PW });
  if (siErr) throw new Error("signIn: " + siErr.message);
  const session = si.session;
  const ref = new URL(URL_).hostname.split(".")[0];
  const storageKey = `sb-${ref}-auth-token`;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${APP}/signin`, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [storageKey, JSON.stringify(session)]);

  for (const theme of ["classic", "ivy"]) {
    await page.evaluate((t) => localStorage.setItem("ui.theme", t), theme);
    await page.goto(`${APP}/educator/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500); // profile fetch + fonts
    await page.screenshot({ path: `${OUT}/_dash-${theme}.png` });
    const cls = await page.evaluate(() => document.documentElement.className);
    console.log(theme, "→ html class:", JSON.stringify(cls), "url:", page.url());
  }
  await browser.close();
} finally {
  const { error: delErr } = await service.auth.admin.deleteUser(uid);
  console.log(delErr ? "cleanup FAILED: " + delErr.message : "disposable user deleted");
}
