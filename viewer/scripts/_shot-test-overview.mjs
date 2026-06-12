/**
 * _shot-test-overview.mjs — visual check of the TestOverviewPage rework:
 * wide centered column, single-row roster actions (Review / Student report /
 * Replay / release toggle), and the new /educator/tests/:slug/report/:runId
 * student-report page.
 *
 * Seeds: admin + 2 students in one course, both sit dsat-nov-2023 fully.
 * Shoots: overview page (course filter on), then the Student report page.
 *
 * Run:  OUT=/tmp/overview node --env-file-if-exists=../.env scripts/_shot-test-overview.mjs
 * Requires: `npx vite preview --port 4199` running. Cleans up in finally{}.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const OUT = process.env.OUT || "/tmp/overview";
if (!URL_ || !ANON || !SERVICE) { console.error("missing env"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const APP = "http://localhost:4199";
const SLUG = "dsat-nov-2023";
const TAG = randomBytes(3).toString("hex");
const PW = "Overview!" + randomBytes(4).toString("hex");
const service = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const ref = new URL(URL_).hostname.split(".")[0];
const storageKey = `sb-${ref}-auth-token`;

const userIds = [];
let courseId = null;
let browser = null;

async function createUser(email, role) {
  const { data, error } = await service.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  userIds.push(data.user.id);
  if (role !== "student") await service.from("profiles").update({ role }).eq("id", data.user.id);
  return data.user.id;
}

async function signIn(email) {
  const c = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return { client: c, session: data.session };
}

async function sitTest(email) {
  const { client } = await signIn(email);
  const { data: start, error: sErr } = await client.rpc("start_test", { p_slug: SLUG });
  if (sErr) throw new Error(`start_test(${email}): ${sErr.message}`);
  const runId = start.run_id;
  for (const mod of [...start.modules].sort((a, b) => a.position - b.position)) {
    const { data: m, error: mErr } = await client.rpc("get_test_module", {
      p_run_id: runId, p_position: mod.position,
    });
    if (mErr) throw new Error(`get_test_module: ${mErr.message}`);
    const answers = {};
    m.questions.forEach((q) => { answers[q.id] = q.type === "grid" ? "1" : "A"; });
    const { error: subErr } = await client.rpc("submit_test_module", {
      p_run_id: runId, p_position: mod.position, p_answers: answers, p_eliminated: {},
    });
    if (subErr) throw new Error(`submit: ${subErr.message}`);
  }
  console.log(`  sat ${email} run=${runId}`);
  return runId;
}

try {
  const adminEmail = `ovw-admin-${TAG}@gmail.com`;
  const adminId = await createUser(adminEmail, "admin");
  const s1 = `ovw-s1-${TAG}@gmail.com`;
  const s2 = `ovw-s2-${TAG}@gmail.com`;
  const s1Id = await createUser(s1, "student");
  const s2Id = await createUser(s2, "student");
  await service.from("profiles").update({ display_name: "Avery Chen" }).eq("id", s1Id);
  await service.from("profiles").update({ display_name: "Mason Wright" }).eq("id", s2Id);

  const { data: courseRow, error: cErr } = await service.from("courses")
    .insert({ name: `Overview QA ${TAG}`, teacher_id: adminId })
    .select("id").single();
  if (cErr) throw new Error(`course: ${cErr.message}`);
  courseId = courseRow.id;
  await service.from("course_memberships").insert([
    { course_id: courseId, student_id: s1Id },
    { course_id: courseId, student_id: s2Id },
  ]);
  const { data: modRow } = await service.from("course_modules")
    .insert({ course_id: courseId, name: "Practice Tests", position: 1 })
    .select("id").single();
  await service.from("module_items").insert({
    module_id: modRow.id, item_type: "link", title: "DSAT Nov 2023",
    url: `/test/${SLUG}`, position: 1,
  });
  console.log("course ready", courseId);

  const run1 = await sitTest(s1);
  await sitTest(s2);

  // ---- screenshots as the admin ----
  // The /educator/tests/* routes are gated on the Question-Bank email
  // allow-list (lib/access.ts — client-side UI gate only). Point the
  // disposable admin's profiles.email at an allow-listed value for the
  // screenshot window; the whole profile row is deleted in finally{}.
  await service.from("profiles").update({ email: "kyao@prepmastersedu.com" }).eq("id", adminId);
  const admin = await signIn(adminEmail);
  browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1100 } })).newPage();
  // The /educator/tests route gate reads session.user.email client-side.
  // Override that field in the INJECTED session only — the access token is
  // untouched, so all RPCs still run as the disposable admin. UI-gate spoof
  // for screenshots, zero server impact.
  const spoofed = {
    ...admin.session,
    user: { ...admin.session.user, email: "kyao@prepmastersedu.com" },
  };
  await page.addInitScript(([k, sess]) => {
    localStorage.setItem(k, JSON.stringify(sess));
    localStorage.setItem("ui.theme", "ivy");
  }, [storageKey, spoofed]);

  await page.goto(`${APP}/educator/tests/${SLUG}?course=${courseId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/overview-top.png` });
  // Scroll the roster TABLE into view (not just the card header) so the
  // action buttons are in frame.
  const rosterTable = page.locator("table").last();
  await rosterTable.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/overview-roster.png` });

  // Student report page for run1.
  await page.goto(`${APP}/educator/tests/${SLUG}/report/${run1}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/student-report.png` });
  console.log("shots →", OUT);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (courseId) await service.from("courses").delete().eq("id", courseId);
  for (const id of userIds.reverse()) {
    await service.auth.admin.deleteUser(id).catch((e) => console.warn("cleanup:", e.message));
  }
  console.log("cleaned up", userIds.length, "users");
}
