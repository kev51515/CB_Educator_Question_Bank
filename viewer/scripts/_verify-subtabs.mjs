/** Verify two-level tabs, compact course header, and domain-switch bounce. */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";
const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY;
const APP = "http://localhost:4199";
const OUT = "/Users/kevin/coding/CB_Educator_Question_Bank/design-explorations/ivy-ledger/shots/qa-workspaces";
const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const ref = new URL(URL_).hostname.split(".")[0];
let uid = null, courseIds = [];
const ok = (m) => console.log("  PASS", m), bad = (m) => { console.log("  FAIL", m); process.exitCode = 1; };
try {
  const pw = "Qa-St-1!" + randomBytes(4).toString("hex");
  const email = `qa-subtabs-${randomBytes(4).toString("hex")}@example.com`;
  const { data: cu } = await service.auth.admin.createUser({ email, password: pw, email_confirm: true });
  uid = cu.user.id;
  await service.from("profiles").update({ role: "teacher", domain: "academic" }).eq("id", uid);
  const { data: courses } = await service.from("courses").insert([{ teacher_id: uid, name: "SAT June Intensive", course_type: "class" }]).select("id, short_code");
  courseIds = courses.map(c => c.id);
  await service.from("course_modules").insert([{ course_id: courses[0].id, name: "Week 1", position: 0, published: true }]);
  const userClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: si } = await userClient.auth.signInWithPassword({ email, password: pw });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1380, height: 900 } })).newPage();
  await page.goto(`${APP}/signin`, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify(si.session)]);
  await page.goto(`${APP}/educator/courses/${courses[0].short_code}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // 1. No course-title h1 in the course chrome (breadcrumb carries it)
  const h1Count = await page.locator('main h1', { hasText: "SAT June Intensive" }).count();
  (h1Count === 0 ? ok : bad)(`course-name h1 removed (count=${h1Count})`);
  // breadcrumb still shows the name
  const crumb = await page.getByText("SAT June Intensive").first().count();
  (crumb > 0 ? ok : bad)("breadcrumb shows course name");

  // 2. Subtab band visible with Teach pages; Modules active
  const band = page.locator('nav[aria-label="Teach pages"]');
  ((await band.count()) === 1 ? ok : bad)("subtab band renders for Teach");
  const bandLinks = await band.locator("a").allTextContents();
  (JSON.stringify(bandLinks) === JSON.stringify(["Modules","Assignments","Grades"]) ? ok : bad)(`band pages = ${JSON.stringify(bandLinks)}`);
  // 3. Click Grades subtab → band persists, URL changes
  await band.getByText("Grades").click();
  await page.waitForTimeout(1200);
  (page.url().endsWith("/grades") ? ok : bad)("subtab navigates to /grades");
  // 4. Click People group tab → first page (roster)
  await page.locator('nav[aria-label="Course sections"] button', { hasText: "People" }).click();
  await page.waitForTimeout(1200);
  (page.url().endsWith("/roster") ? ok : bad)(`People group opens roster (${page.url().split("/").pop()})`);
  const band2 = await page.locator('nav[aria-label="People pages"]').count();
  (band2 === 1 ? ok : bad)("band switches to People pages");
  await page.screenshot({ path: `${OUT}/subtabs-people.png` });

  // 5. Domain switch bounces out of the course to the courses list
  await page.locator('button[aria-haspopup="menu"][aria-label^="Active domain"]').click();
  await page.waitForTimeout(300);
  await page.locator('[role="menuitemradio"]', { hasText: "Counselor" }).click();
  await page.waitForTimeout(1500);
  (new URL(page.url()).pathname === "/educator/courses" ? ok : bad)(`domain switch bounced to courses list (${new URL(page.url()).pathname})`);
  await page.screenshot({ path: `${OUT}/bounce-after-switch.png` });
  await browser.close();
} finally {
  if (courseIds.length) await service.from("courses").delete().in("id", courseIds);
  if (uid) { await service.auth.admin.deleteUser(uid); console.log("cleanup done"); }
}
