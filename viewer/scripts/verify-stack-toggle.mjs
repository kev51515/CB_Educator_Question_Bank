#!/usr/bin/env node
/**
 * verify-stack-toggle.mjs — live browser check of the Review-Mode "Stack" toggle.
 *
 * Creates a disposable admin, injects its Supabase session into the running dev
 * server (localhost:9000), opens the DSAT-Nov-2023 Review page, and measures the
 * passage vs. question geometry BEFORE and AFTER clicking "Stack":
 *   • default (wide): passage LEFT of the question (two-column split)
 *   • after Stack:    question BELOW the passage (single column)
 * Screenshots both to /tmp. Self-cleaning. Requires the dev server to be up.
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const SUPA_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const APP = "http://localhost:9000";
const SLUG = "dsat-nov-2023";
if (!SUPA_URL || !ANON || !SERVICE) {
  console.error("missing env SUPABASE_URL / ANON / SERVICE");
  process.exit(2);
}
const ref = new URL(SUPA_URL).host.split(".")[0];
const storageKey = `sb-${ref}-auth-token`;

const service = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
const PW = "Verify!" + randomBytes(4).toString("hex");
const email = `verify-stack-${Date.now()}@gmail.com`;

let pass = 0, fail = 0;
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; console.log(`  FAIL  ${l}`); if (d) console.log(`        ${d}`); };

async function main() {
  // 1. disposable admin
  const { data: created, error: cErr } = await service.auth.admin.createUser({
    email, password: PW, email_confirm: true,
  });
  if (cErr) throw new Error(`createUser: ${cErr.message}`);
  const uid = created.user.id;
  await service.from("profiles").update({ role: "admin", display_name: "Verify Admin" }).eq("id", uid);

  // 2. real session
  const anon = createClient(SUPA_URL, ANON, { auth: { persistSession: false } });
  const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({ email, password: PW });
  if (sErr) throw new Error(`signIn: ${sErr.message}`);
  const session = signIn.session;

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    await ctx.addInitScript(
      ([k, v]) => window.localStorage.setItem(k, v),
      [storageKey, JSON.stringify(session)],
    );
    const page = await ctx.newPage();
    await page.goto(`${APP}/educator/tests/${SLUG}/review`, { waitUntil: "domcontentloaded" });

    // wait for the rendered passage + question stem
    await page.waitForSelector('[data-annot-field="passage"]', { timeout: 20_000 });
    await page.waitForSelector('[data-annot-field="stem"]', { timeout: 20_000 });

    const boxes = async () => {
      const p = await page.locator('[data-annot-field="passage"]').first().boundingBox();
      const s = await page.locator('[data-annot-field="stem"]').first().boundingBox();
      return { p, s };
    };

    // ---- BEFORE: expect side-by-side (split) ----
    const b1 = await boxes();
    await page.screenshot({ path: "/tmp/stack-before.png" });
    if (!b1.p || !b1.s) { bad("found passage + stem boxes (before)"); return cleanup(browser, uid); }
    const splitSideBySide = b1.s.x > b1.p.x + b1.p.width * 0.5;
    if (splitSideBySide) ok("default: question is RIGHT of passage (two-column split)", `passage.x=${Math.round(b1.p.x)} stem.x=${Math.round(b1.s.x)}`);
    else bad("default should be side-by-side", `passage.x=${Math.round(b1.p.x)} w=${Math.round(b1.p.width)} stem.x=${Math.round(b1.s.x)}`);

    // ---- click Stack ----
    const stackBtn = page.getByRole("button", { name: "Stack", exact: true });
    await stackBtn.click();
    const pressed = await stackBtn.getAttribute("aria-pressed");
    if (pressed === "true") ok("Stack button toggles aria-pressed=true");
    else bad("Stack aria-pressed=true after click", `got ${pressed}`);
    await page.waitForTimeout(300); // allow re-layout

    // ---- AFTER: expect stacked (question below passage) ----
    const b2 = await boxes();
    await page.screenshot({ path: "/tmp/stack-after.png" });
    if (!b2.p || !b2.s) { bad("found passage + stem boxes (after)"); return cleanup(browser, uid); }
    const stacked = b2.s.y > b2.p.y + b2.p.height - 4 && b2.s.x < b2.p.x + b2.p.width * 0.5;
    if (stacked) ok("after Stack: question is BELOW passage (single column)", `passage.bottom=${Math.round(b2.p.y + b2.p.height)} stem.y=${Math.round(b2.s.y)} dx=${Math.round(Math.abs(b2.s.x - b2.p.x))}`);
    else bad("after Stack should be stacked", `passage(y=${Math.round(b2.p.y)},h=${Math.round(b2.p.height)},x=${Math.round(b2.p.x)}) stem(y=${Math.round(b2.s.y)},x=${Math.round(b2.s.x)})`);

    // ---- toggle back: expect split again ----
    await stackBtn.click();
    await page.waitForTimeout(300);
    const b3 = await boxes();
    if (b3.p && b3.s && b3.s.x > b3.p.x + b3.p.width * 0.5) ok("toggling off returns to split");
    else bad("toggling off should return to split", JSON.stringify(b3));

    return cleanup(browser, uid);
  } catch (e) {
    bad("uncaught", e?.message ?? String(e));
    return cleanup(browser, uid);
  }
}

async function cleanup(browser, uid) {
  await browser.close().catch(() => {});
  await service.auth.admin.deleteUser(uid).catch(() => {});
}

main().finally(() => {
  console.log(`\n----------------------------------`);
  console.log(`TOTAL: ${pass + fail}  PASS: ${pass}  FAIL: ${fail}`);
  console.log(`screenshots: /tmp/stack-before.png, /tmp/stack-after.png`);
  console.log(`==================================`);
  process.exit(fail > 0 ? 1 : 0);
});
