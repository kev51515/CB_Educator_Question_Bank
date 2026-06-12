/**
 * _verify-journey-popover.mjs — positioning checks for the journey cell
 * popover (flip-up near the viewport bottom, width clamp on phones).
 *
 * Seeds a 6-module course so the trail outgrows the viewport, then:
 *   1. desktop 1380x900: click a BOTTOM-row cell → popover must flip above
 *      the cell and sit fully inside the viewport.
 *   2. mobile 390x844: click a cell → popover must not overflow the
 *      viewport horizontally (width clamp) and the page must not gain a
 *      horizontal scrollbar.
 * Exits non-zero on any failed assertion. Screenshots to OUT for eyeballs.
 *
 * Run:  OUT=/tmp/jpop node --env-file-if-exists=../.env scripts/_verify-journey-popover.mjs
 * Requires: `npx vite preview --port 4199` running.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const OUT = process.env.OUT || "/tmp/jpop";
if (!URL_ || !ANON || !SERVICE) { console.error("missing env"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const APP = "http://localhost:4199";
const TAG = randomBytes(3).toString("hex");
const PW = "Jpop!" + randomBytes(4).toString("hex");
const service = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const ref = new URL(URL_).hostname.split(".")[0];
const storageKey = `sb-${ref}-auth-token`;

const userIds = [];
let courseId = null;
let browser = null;
let failures = 0;

function check(name, ok, detail = "") {
  if (ok) console.log(`  ok    ${name}`);
  else { failures += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function one(q, label) {
  const { data, error } = await q;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

try {
  const teacherId = (await service.auth.admin.createUser({
    email: `jpop-t-${TAG}@gmail.com`, password: PW, email_confirm: true,
  })).data.user.id;
  userIds.push(teacherId);
  await service.from("profiles").update({ role: "teacher" }).eq("id", teacherId);
  const studentId = (await service.auth.admin.createUser({
    email: `jpop-s-${TAG}@gmail.com`, password: PW, email_confirm: true,
  })).data.user.id;
  userIds.push(studentId);

  const course = await one(
    service.from("courses").insert({ name: `Jpop QA ${TAG}`, teacher_id: teacherId }).select("id, short_code").single(),
    "course",
  );
  courseId = course.id;
  await one(service.from("course_memberships").insert({ course_id: courseId, student_id: studentId }), "enrol");

  // 6 modules x 2 sets each → trail taller than any viewport.
  for (let m = 1; m <= 6; m++) {
    const mod = await one(
      service.from("course_modules").insert({ course_id: courseId, name: `Week ${m}`, position: m, published: true }).select("id").single(),
      `module ${m}`,
    );
    for (let i = 1; i <= 2; i++) {
      const a = await one(service.from("assignments").insert({
        course_id: courseId, created_by: teacherId, title: `W${m} Set ${i}`, kind: "qbank_set",
        qbank_set_uid: "smoke-test-set", qbank_set_label: "QA", question_count: 10,
        source_id: null, time_limit_minutes: 20, difficulty_mix: "any",
      }).select("id").single(), "assignment");
      await one(service.from("module_items").insert({
        module_id: mod.id, position: i, published: true,
        item_type: "assignment", item_ref_id: a.id, title: `W${m} Set ${i}`,
      }), "item");
      // Submitted attempt so popovers show the full (tallest) content.
      await one(service.from("assignment_attempts").insert({
        assignment_id: a.id, student_id: studentId, submitted_at: new Date().toISOString(),
        score_percent: 55 + m, correct_count: 6, total_questions: 10,
      }), "attempt");
    }
  }
  console.log("seeded", course.short_code);

  const anon = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: auth, error: sErr } = await anon.auth.signInWithPassword({ email: `jpop-s-${TAG}@gmail.com`, password: PW });
  if (sErr) throw sErr;

  browser = await chromium.launch();
  const coursePath = `/student/courses/${course.short_code}`;

  async function openAndMeasure(viewport, clickTitle, file) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await page.addInitScript(([k, sess]) => {
      localStorage.setItem(k, JSON.stringify(sess));
      localStorage.setItem("ui.theme", "ivy");
      localStorage.setItem("journey.preview", "1");
    }, [storageKey, auth.session]);
    await page.goto(`${APP}${coursePath}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const btn = page.locator(`button[title*="${clickTitle}"]`).first();
    await btn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await btn.click();
    await page.waitForTimeout(600);
    const dialog = page.locator('div[role="dialog"]').first();
    const box = await dialog.boundingBox();
    const btnBox = await btn.boundingBox();
    const scrollW = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    await page.screenshot({ path: `${OUT}/${file}` });
    await ctx.close();
    return { box, btnBox, scrollW, viewport };
  }

  // 1. Desktop, bottom-row cell → must flip above + stay in viewport.
  console.log("desktop bottom cell:");
  {
    const { box, btnBox, viewport } = await openAndMeasure(
      { width: 1380, height: 900 }, "W6 Set 2", "desktop-bottom-flip.png",
    );
    check("popover rendered", !!box);
    if (box && btnBox) {
      check("flipped above the cell", box.y + box.height <= btnBox.y + 1,
        `popover bottom ${Math.round(box.y + box.height)} vs cell top ${Math.round(btnBox.y)}`);
      check("inside viewport vertically", box.y >= 0 && box.y + box.height <= viewport.height + 1,
        `y=${Math.round(box.y)} h=${Math.round(box.height)}`);
    }
  }

  // 2. Mobile width clamp.
  console.log("mobile cell:");
  {
    const { box, scrollW, viewport } = await openAndMeasure(
      { width: 390, height: 844 }, "W1 Set 1", "mobile-clamp.png",
    );
    check("popover rendered", !!box);
    if (box) {
      check("inside viewport horizontally", box.x >= 0 && box.x + box.width <= viewport.width + 1,
        `x=${Math.round(box.x)} w=${Math.round(box.width)}`);
    }
    check("no horizontal page scroll", scrollW.doc <= scrollW.win + 1,
      `scrollWidth ${scrollW.doc} vs innerWidth ${scrollW.win}`);
  }

  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
} catch (err) {
  console.error("FAIL:", err.message ?? err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (courseId) await service.from("courses").delete().eq("id", courseId);
  for (const uid of userIds) {
    try { await service.auth.admin.deleteUser(uid); } catch { /* ignore */ }
  }
  console.log("cleanup done");
}
