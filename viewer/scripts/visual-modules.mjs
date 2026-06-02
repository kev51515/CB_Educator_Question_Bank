#!/usr/bin/env node
/**
 * visual-modules.mjs — opens the modules page in headless Chromium,
 * pre-injects a Supabase session for the demo teacher (so we skip the
 * sign-in screen), seeds 4 modules with a nested structure, captures
 * screenshots of the rendered tree + kebab menu, then cleans up.
 *
 * Output: /tmp/cb-lms-shots/*.png
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/cb-lms-shots";
mkdirSync(OUT, { recursive: true });

const SB_URL = process.env.SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY;
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;
const DEMO_COURSE_ID = "339fac02-c4b3-4cb5-a00f-5672616a4512";
const DEMO_COURSE_SLUG = "69WAJ3";

if (!SB_URL || !SB_ANON || !SB_SERVICE) {
  console.error("need SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_KEY");
  process.exit(2);
}

const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
const anon = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });

async function seedTree() {
  const created = [];
  async function ins(name, parent, pos) {
    const { data, error } = await admin
      .from("course_modules")
      .insert({
        course_id: DEMO_COURSE_ID,
        name,
        position: pos,
        published: false,
        parent_module_id: parent,
      })
      .select("id, name")
      .single();
    if (error) throw new Error(`seed ${name}: ${error.message}`);
    created.push(data);
    return data;
  }
  const w1 = await ins("[visual] Week 1: Linear Equations", null, 8000);
  await ins("[visual] Day 1 — Slope-Intercept", w1.id, 0);
  await ins("[visual] Day 2 — Standard Form", w1.id, 1);
  const w2 = await ins("[visual] Week 2: Functions", null, 8001);
  await ins("[visual] Day 1 — Domain & Range", w2.id, 0);
  return created;
}

async function cleanup(created) {
  if (!created.length) return;
  await admin.from("course_modules").delete().in("id", created.map((m) => m.id));
}

let created = [];

try {
  // 1. Sign in via supabase-js to get a session, then inject it into the
  //    browser's localStorage under the key the supabase-js client expects
  //    (sb-<project_ref>-auth-token).
  const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({
    email: "demo-teacher@example.com",
    password: "demoteacher123",
  });
  if (signinErr) throw new Error(`signin: ${signinErr.message}`);
  const session = signin.session;
  const projectRef = new URL(SB_URL).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  console.log(`signed in (storage key: ${storageKey})`);

  created = await seedTree();
  console.log(`seeded ${created.length} modules`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // Inject the session before any app code runs.
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: storageKey, value: JSON.stringify(session) },
  );

  // 2. Navigate
  page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[console.error] ${msg.text()}`);
  });
  await page.goto(`http://localhost:5173/courses/${DEMO_COURSE_SLUG}/modules`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2000);

  // Diagnostic screenshot first — show whatever's on the page right now.
  await page.screenshot({ path: `${OUT}/00-after-nav.png`, fullPage: true });
  console.log(`shot 0: after-nav (url=${page.url()})`);

  // Then try to find the seeded module — if missing, the diagnostic screenshot
  // explains why.
  // The text content has emoji-free "[visual]" prefix — Playwright text
  // selectors need exact substring match. Some renders wrap the text in
  // multiple spans; use a substring locator instead.
  try {
    await page
      .getByText("Week 1: Linear Equations", { exact: false })
      .first()
      .waitFor({ timeout: 8000 });
  } catch {
    console.log("seeded modules never rendered — see 00-after-nav.png");
    throw new Error("modules did not render");
  }
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${OUT}/01-idle.png`, fullPage: true });
  console.log("shot 1: idle tree (collapsed)");

  // Expand Week 1 to show children
  const w1Row = page.locator('text="Week 1: Linear Equations"').first();
  const w1Card = w1Row.locator(
    'xpath=ancestor::div[contains(@class, "rounded-2xl")][1]',
  );
  const expand = w1Card.locator('button[title="Expand"]').first();
  if (await expand.count()) {
    await expand.click();
    await page.waitForTimeout(300);
  }
  // Also expand Week 2
  const w2Row = page.locator('text="Week 2: Functions"').first();
  const w2Card = w2Row.locator(
    'xpath=ancestor::div[contains(@class, "rounded-2xl")][1]',
  );
  const expand2 = w2Card.locator('button[title="Expand"]').first();
  if (await expand2.count()) {
    await expand2.click();
    await page.waitForTimeout(300);
  }

  await page.screenshot({ path: `${OUT}/02-expanded.png`, fullPage: true });
  console.log("shot 2: expanded tree");

  // Open a kebab to verify menu visuals
  const kebab = w1Card.locator('button[aria-label="More actions"]').first();
  if (await kebab.count()) {
    await kebab.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/03-kebab.png`, fullPage: true });
    console.log("shot 3: kebab open");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }

  // 4. Capture a drag-in-progress shot showing the insertion bar.
  // Native HTML5 drag is hard to drive in Playwright; we simulate the
  // state by directly dispatching the events the component listens to.
  const day1Row = page.locator('text="Day 1 — Slope-Intercept"').first();
  const day1Card = day1Row.locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');

  // Drag Day 1 (child of Week 1) and hover Week 2's body to test "into"
  const day1Box = await day1Card.boundingBox();
  const w2Box = await w2Card.boundingBox();
  if (day1Box && w2Box) {
    // 4a. Sibling drop: hover Week 2's top half, cursor at left → "before"
    await page.mouse.move(day1Box.x + 40, day1Box.y + 30);
    await page.mouse.down();
    await page.mouse.move(w2Box.x + 40, w2Box.y + 8, { steps: 12 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/04-drag-before.png`, fullPage: true });
    console.log("shot 4: insertion bar — before Week 2");

    // 4b. Nest as child: cursor in bottom half + far right
    await page.mouse.move(w2Box.x + 300, w2Box.y + w2Box.height - 8, { steps: 8 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/05-drag-nest.png`, fullPage: true });
    console.log("shot 5: insertion bar — nest as child of Week 2");

    await page.mouse.up();
    await page.waitForTimeout(300);
  }

  await browser.close();
} finally {
  await cleanup(created);
  console.log(`cleaned up ${created.length} modules`);
}
