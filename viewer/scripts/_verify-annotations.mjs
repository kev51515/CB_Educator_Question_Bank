// _verify-annotations.mjs — browser-level check of the annotation suite.
// Expects the viewer dev server on :9000 (npx vite --port 9000).
//
// Verifies, on /educator/tests/<slug>/review:
//   1. selecting text pops the SelectionPopover (selectionchange path — the
//      same mechanism that fixes student highlighting on touch devices),
//   2. picking a color paints a <mark> in the stem,
//   3. the highlight persists to teacher_item_annotations for the SELECTED
//      course (debounced upsert),
//   4. the underline tool paints a text-decoration mark,
//   5. course isolation: the same test reviewed under a second course shows
//      ZERO marks (the whole point of the per-(teacher,course,item) scoping).
import { readFileSync as _rf } from "node:fs";
for (const line of _rf("/Users/kevin/coding/CB_Educator_Question_Bank/.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const SUPA_URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY;
const APP = "http://localhost:9000", SLUG = "dsat-nov-2023";
const ref = new URL(SUPA_URL).host.split(".")[0], storageKey = `sb-${ref}-auth-token`;
const service = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  ok ? pass++ : fail++;
};

// --- disposable admin + two courses linking the same test ---
const PW = "Verify!" + randomBytes(4).toString("hex");
const email = `verify-annot-${Date.now()}@gmail.com`;
const { data: created, error: cErr } = await service.auth.admin.createUser({ email, password: PW, email_confirm: true });
if (cErr) throw cErr;
const uid = created.user.id;
await service.from("profiles").update({ role: "admin", display_name: "Verify Annot" }).eq("id", uid);

async function mkCourse(name) {
  const { data: course, error } = await service.from("courses").insert({ name, teacher_id: uid }).select("id").single();
  if (error) throw error;
  const { data: mod, error: mErr } = await service.from("course_modules")
    .insert({ course_id: course.id, name: "Tests", published: true }).select("id").single();
  if (mErr) throw mErr;
  const { error: iErr } = await service.from("module_items")
    .insert({ module_id: mod.id, item_type: "link", title: "DSAT Nov", url: `/test/${SLUG}`, published: true });
  if (iErr) throw iErr;
  return course.id;
}
const courseA = await mkCourse("Annot Verify A");
const courseB = await mkCourse("Annot Verify B");

const anon = createClient(SUPA_URL, ANON, { auth: { persistSession: false } });
const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({ email, password: PW });
if (sErr) throw sErr;
const session = signIn.session;

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [storageKey, JSON.stringify(session)]);
  const page = await ctx.newPage();

  // The test-review routes are gated client-side to an email allow-list
  // (lib/access.ts). The disposable verify user isn't on it, so stub the
  // module at the dev-server boundary — verification targets the annotation
  // suite, not the gate (which has its own registry comment + is trivially
  // inspectable).
  await page.route("**/src/lib/access.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "export function canAccessQuestionBank() { return true; }",
    }),
  );

  // Select `len` chars inside the stem's longest text node, starting at `from`.
  const selectInStem = async (from, len) => {
    await page.evaluate(([f, l]) => {
      const stem = document.querySelector('[data-annot-field="stem"]');
      const walker = document.createTreeWalker(stem, NodeFilter.SHOW_TEXT);
      let node = null, best = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const length = n.textContent?.length ?? 0;
        if (length > best) { best = length; node = n; }
      }
      const start = Math.min(f, Math.max(0, best - l - 1));
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, Math.min(start + l, best));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }, [from, len]);
  };

  // Surface the annotation save traffic — a silent RLS failure shows up here.
  page.on("response", (res) => {
    if (res.url().includes("teacher_item_annotations")) {
      console.log(`  [net] ${res.request().method()} ${res.status()} ${res.url().slice(0, 120)}`);
      if (res.status() >= 400) void res.text().then((t) => console.log("  [net body]", t.slice(0, 300)));
    }
  });

  await page.goto(`${APP}/educator/tests/${SLUG}/review?course=${courseA}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-annot-field="stem"]', { timeout: 20000 });
  await page.waitForTimeout(800); // let the course-scoped annotation store load

  // 1. popover appears over a settled selection
  await selectInStem(0, 8);
  const popover = page.locator('[aria-label="Highlight selection"]');
  await popover.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  check("selection popover appears", await popover.isVisible());

  // 2. pick yellow → mark painted
  await page.locator('[aria-label="Highlight yellow"]').click();
  await page.waitForTimeout(300);
  const markCount = await page.locator('[data-annot-field="stem"] mark').count();
  check("color pick paints a mark", markCount >= 1, `marks=${markCount}`);

  // 3. underline tool
  await selectInStem(12, 6);
  await popover.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  await page.locator('[aria-label="Underline selection"]').click();
  await page.waitForTimeout(300);
  const deco = await page.evaluate(() => {
    const marks = [...document.querySelectorAll('[data-annot-field="stem"] mark')];
    return marks.some((m) => getComputedStyle(m).textDecorationLine.includes("underline"));
  });
  check("underline tool paints an underline", deco);

  // 4. DB persistence for course A (after the 800ms debounce)
  await page.waitForTimeout(1600);
  const { data: rows } = await service
    .from("teacher_item_annotations")
    .select("course_id, annotations")
    .eq("teacher_id", uid)
    .eq("item_kind", "test")
    .eq("item_key", SLUG);
  const rowA = (rows ?? []).find((r) => r.course_id === courseA);
  const savedHl = rowA ? Object.values(rowA.annotations).flatMap((q) => q.highlights ?? []) : [];
  check("annotations saved to DB for course A", savedHl.length >= 2, `highlights=${savedHl.length}`);
  check("no row leaked to course B", !(rows ?? []).some((r) => r.course_id === courseB));

  // 5. course isolation in the UI: same test under course B → zero marks
  await page.goto(`${APP}/educator/tests/${SLUG}/review?course=${courseB}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-annot-field="stem"]', { timeout: 20000 });
  await page.waitForTimeout(1000);
  const marksB = await page.locator('[data-annot-field="stem"] mark').count();
  check("course B sees no course-A marks", marksB === 0, `marks=${marksB}`);

  await page.screenshot({ path: "/tmp/annot-courseB.png" });
} finally {
  await browser.close();
  try { await service.from("courses").delete().in("id", [courseA, courseB]); } catch { /* best-effort */ }
  try { await service.auth.admin.deleteUser(uid); } catch { /* best-effort */ }
}
console.log(`\nTOTAL: ${pass + fail}  PASS: ${pass}  FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
