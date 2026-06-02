#!/usr/bin/env node
/**
 * visual-courses.mjs — captures /dashboard and /courses side by side so you
 * can compare the card design alignment.
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/cb-courses-shots";
mkdirSync(OUT, { recursive: true });

const SB_URL = process.env.SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY;

if (!SB_URL || !SB_ANON) {
  console.error("need SUPABASE_URL + SUPABASE_ANON_KEY");
  process.exit(2);
}

const anon = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });

const { data: signin, error } = await anon.auth.signInWithPassword({
  email: "demo-teacher@example.com",
  password: "demoteacher123",
});
if (error) {
  console.error("signin:", error.message);
  process.exit(2);
}

const projectRef = new URL(SB_URL).hostname.split(".")[0];
const storageKey = `sb-${projectRef}-auth-token`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(
  ({ key, value }) => window.localStorage.setItem(key, value),
  { key: storageKey, value: JSON.stringify(signin.session) },
);

for (const [name, url] of [
  ["dashboard", "http://localhost:5173/dashboard"],
  ["courses", "http://localhost:5173/courses"],
]) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`shot: ${name} (${url})`);
}

await browser.close();
