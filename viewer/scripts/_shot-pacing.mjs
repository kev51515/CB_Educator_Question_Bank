/**
 * _shot-pacing.mjs — visual verification of the student report's redesigned
 * "Pacing vs. your class" band chart.
 *
 * Seeds a realistic cohort: 1 viewer student + 4 classmates, all taking
 * dsat-nov-2023 in the same course, each with per-question dwell events on a
 * distinct speed profile (fast / mid / slow), so `get_test_pacing_cohort`
 * returns a real fastest↔slowest band. Releases the viewer's result and
 * screenshots the report under the ivy theme.
 *
 * Run:  OUT=/tmp/pacing node --env-file-if-exists=../.env scripts/_shot-pacing.mjs
 * Requires: `npx vite preview --port 4199` running.
 * Cleanup: deletes the course + all 6 disposable users in finally{}.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const OUT = process.env.OUT || "/tmp/pacing";
if (!URL_ || !ANON || !SERVICE) { console.error("missing env"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const APP = "http://localhost:4199";
const SLUG = "dsat-nov-2023";
const TAG = randomBytes(3).toString("hex");
const PW = "Pacing!" + randomBytes(4).toString("hex");
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
  if (role !== "student") {
    await service.from("profiles").update({ role }).eq("id", data.user.id);
  }
  return data.user.id;
}

async function signIn(email) {
  const c = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return { client: c, session: data.session };
}

/** Deterministic per-(student, question) dwell seconds for a speed profile. */
function dwellSeconds(profile, qOrdinal) {
  // Cheap stable hash → 0..1
  const h = Math.abs(Math.sin(qOrdinal * 12.9898 + profile.seed * 78.233)) % 1;
  let s = profile.base + h * profile.spread;
  // The viewer gets a few deliberate outliers so the chart shows both sides.
  if (profile.viewer) {
    if (qOrdinal % 9 === 3) s = profile.base * 3.2 + h * 30; // notably slow
    if (qOrdinal % 11 === 5) s = 6 + h * 5; // very fast
  }
  return Math.max(4, Math.round(s));
}

/** Take the whole test as one student: answer everything, emit dwell rows. */
async function sitTest(email, profile) {
  const { client } = await signIn(email);
  const { data: start, error: sErr } = await client.rpc("start_test", { p_slug: SLUG });
  if (sErr) throw new Error(`start_test(${email}): ${sErr.message}`);
  const runId = start.run_id;
  const modules = [...start.modules].sort((a, b) => a.position - b.position);

  let qOrdinal = 0;
  for (const mod of modules) {
    const { data: m, error: mErr } = await client.rpc("get_test_module", {
      p_run_id: runId, p_position: mod.position,
    });
    if (mErr) throw new Error(`get_test_module(${email}, ${mod.position}): ${mErr.message}`);

    const answers = {};
    const dwellRows = [];
    m.questions.forEach((q, idx) => {
      qOrdinal += 1;
      answers[q.id] = q.type === "grid" ? "1" : "A";
      dwellRows.push({
        run_id: runId,
        type: "dwell",
        module: mod.position,
        question: q.number ?? idx + 1,
        duration_seconds: dwellSeconds(profile, qOrdinal),
      });
    });

    const { error: dErr } = await service.from("test_run_events").insert(dwellRows);
    if (dErr) throw new Error(`dwell insert(${email}, m${mod.position}): ${dErr.message}`);

    const { error: subErr } = await client.rpc("submit_test_module", {
      p_run_id: runId, p_position: mod.position, p_answers: answers, p_eliminated: {},
    });
    if (subErr) throw new Error(`submit(${email}, m${mod.position}): ${subErr.message}`);
  }
  console.log(`  sat ${email} (${profile.label}) run=${runId}`);
  return runId;
}

try {
  // ---- provision ----
  const adminId = await createUser(`pace-admin-${TAG}@gmail.com`, "admin");
  const students = [
    { email: `pace-you-${TAG}@gmail.com`,  profile: { label: "viewer", base: 45, spread: 40, seed: 1, viewer: true } },
    { email: `pace-s1-${TAG}@gmail.com`,   profile: { label: "fast",   base: 16, spread: 18, seed: 2 } },
    { email: `pace-s2-${TAG}@gmail.com`,   profile: { label: "fastish",base: 28, spread: 26, seed: 3 } },
    { email: `pace-s3-${TAG}@gmail.com`,   profile: { label: "mid",    base: 50, spread: 45, seed: 4 } },
    { email: `pace-s4-${TAG}@gmail.com`,   profile: { label: "slow",   base: 85, spread: 70, seed: 5 } },
  ];
  const studentIds = [];
  for (const s of students) studentIds.push(await createUser(s.email, "student"));

  const { data: courseRow, error: cErr } = await service.from("courses")
    .insert({ name: `Pacing QA ${TAG}`, teacher_id: adminId })
    .select("id").single();
  if (cErr) throw new Error(`course: ${cErr.message}`);
  courseId = courseRow.id;
  await service.from("course_memberships").insert(
    studentIds.map((id) => ({ course_id: courseId, student_id: id })),
  );
  const { data: modRow, error: mErr } = await service.from("course_modules")
    .insert({ course_id: courseId, name: "Practice Tests", position: 1 })
    .select("id").single();
  if (mErr) throw new Error(`module: ${mErr.message}`);
  await service.from("module_items").insert({
    module_id: modRow.id, item_type: "link", title: "DSAT Nov 2023",
    url: `/test/${SLUG}`, position: 1,
  });
  console.log("course ready", courseId);

  // ---- everyone sits the test (classmates first, viewer last) ----
  let viewerRun = null;
  for (let i = students.length - 1; i >= 1; i--) {
    await sitTest(students[i].email, students[i].profile);
  }
  viewerRun = await sitTest(students[0].email, students[0].profile);

  // ---- release the viewer's result ----
  const admin = await signIn(`pace-admin-${TAG}@gmail.com`);
  const { error: relErr } = await admin.client.rpc("release_test_results", {
    p_run_id: viewerRun, p_released: true,
  });
  if (relErr) throw new Error(`release: ${relErr.message}`);
  console.log("released", viewerRun);

  // ---- screenshot the report ----
  const viewer = await signIn(students[0].email);
  browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1380, height: 1400 } })).newPage();
  await page.addInitScript(([k, sess]) => {
    localStorage.setItem(k, JSON.stringify(sess));
    localStorage.setItem("ui.theme", "ivy");
  }, [storageKey, viewer.session]);
  await page.goto(`${APP}/test/${SLUG}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);

  const panel = page.locator("section", { hasText: "Pacing vs. your class" }).first();
  if (await panel.count()) {
    await panel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await panel.screenshot({ path: `${OUT}/panel.png` });
    // Hover mid-chart for the tooltip state.
    const box = await panel.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.62);
      await page.waitForTimeout(300);
      await panel.screenshot({ path: `${OUT}/panel-hover.png` });
    }
    console.log(`shots → ${OUT}/panel.png + panel-hover.png`);
  } else {
    await page.screenshot({ path: `${OUT}/page-nopanel.png`, fullPage: true });
    console.log("PANEL NOT FOUND — full page in page-nopanel.png");
  }
  await page.screenshot({ path: `${OUT}/page.png` });
} finally {
  if (browser) await browser.close().catch(() => {});
  if (courseId) await service.from("courses").delete().eq("id", courseId);
  for (const id of userIds.reverse()) {
    await service.auth.admin.deleteUser(id).catch((e) => console.warn("cleanup:", e.message));
  }
  console.log("cleaned up", userIds.length, "users");
}
