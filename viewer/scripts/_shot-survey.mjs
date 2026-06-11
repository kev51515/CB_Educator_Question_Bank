/**
 * _shot-survey.mjs — broad ivy-theme screenshot survey of educator + student
 * surfaces, for UX review. Disposable teacher + enrolled student, one course
 * with a module, an assignment, and a module item, so list surfaces aren't
 * all empty states.
 *
 * Run:  OUT=/tmp/survey node --env-file-if-exists=../.env scripts/_shot-survey.mjs
 * Requires: `npx vite preview --port 4199` running.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const OUT = process.env.OUT || "/tmp/survey";
if (!URL_ || !ANON || !SERVICE) { console.error("missing env"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const APP = "http://localhost:4199";
const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const ref = new URL(URL_).hostname.split(".")[0];
const storageKey = `sb-${ref}-auth-token`;

async function provision(role, displayName) {
  const pw = "Qa-Survey-1!" + randomBytes(4).toString("hex");
  const email = `qa-survey-${role}-${randomBytes(4).toString("hex")}@example.com`;
  const { data: cu, error } = await service.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error(`createUser(${role}): ${error.message}`);
  const patch = { display_name: displayName };
  if (role !== "student") patch.role = role;
  await service.from("profiles").update(patch).eq("id", cu.user.id);
  const userClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: si, error: siErr } = await userClient.auth.signInWithPassword({ email, password: pw });
  if (siErr) throw new Error(`signIn(${role}): ${siErr.message}`);
  return { uid: cu.user.id, session: si.session };
}

let teacherId = null, studentId = null, courseId = null;
let browser = null;
try {
  const teacher = await provision("teacher", "QA Survey Teacher");
  teacherId = teacher.uid;
  const student = await provision("student", "QA Survey Student");
  studentId = student.uid;

  const { data: course, error: cErr } = await service.from("courses")
    .insert({ teacher_id: teacherId, name: "SAT June Intensive", course_type: "class" })
    .select("id, short_code").single();
  if (cErr) throw new Error(`course: ${cErr.message}`);
  courseId = course.id;

  const { data: mod } = await service.from("course_modules")
    .insert({ course_id: courseId, name: "Week 1 — Foundations", position: 0, published: true })
    .select("id").single();
  const { data: asg } = await service.from("assignments").insert({
    course_id: courseId, created_by: teacherId, title: "Vocab Quiz 1",
    kind: "mocktest", source_id: "cb", question_count: 10,
    due_at: new Date(Date.now() + 3 * 864e5).toISOString(),
  }).select("id").single();
  if (mod && asg) {
    await service.from("module_items").insert([
      { module_id: mod.id, position: 0, item_type: "header", title: "Diagnostics", url: null },
      { module_id: mod.id, position: 1, item_type: "assignment", item_ref_id: asg.id, title: "Vocab Quiz 1", url: null },
      { module_id: mod.id, position: 2, item_type: "link", title: "Khan Academy — Linear equations", url: "https://khanacademy.org" },
    ]);
  }
  await service.from("course_memberships").insert({ course_id: courseId, student_id: studentId });
  console.log("seeded course", course.short_code);

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 950 } });
  const page = await ctx.newPage();

  async function shoot(session, path, slug) {
    await page.goto(`${APP}/signin`, { waitUntil: "domcontentloaded" });
    await page.evaluate(([k, v]) => {
      localStorage.setItem(k, v);
      localStorage.setItem("ui.theme", "ivy");
    }, [storageKey, JSON.stringify(session)]);
    await page.goto(`${APP}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${slug}.png` });
    console.log(`shot ${slug} url=${page.url()}`);
  }

  const cc = course.short_code;
  const educatorPages = [
    ["/educator/dashboard", "edu-dashboard"],
    ["/educator/courses", "edu-courses"],
    [`/educator/courses/${cc}/assignments`, "edu-assignments"],
    [`/educator/courses/${cc}/people`, "edu-people"],
    [`/educator/courses/${cc}/materials`, "edu-materials"],
    [`/educator/courses/${cc}/grades`, "edu-grades"],
    [`/educator/courses/${cc}/discussions`, "edu-discussions"],
    [`/educator/courses/${cc}/announcements`, "edu-announcements"],
    [`/educator/courses/${cc}/settings`, "edu-course-settings"],
    ["/educator/calendar", "edu-calendar"],
    ["/educator/inbox", "edu-inbox"],
    ["/educator/account/settings", "edu-settings"],
  ];
  for (const [path, slug] of educatorPages) await shoot(teacher.session, path, slug);

  const studentPages = [
    ["/student", "stu-home"],
    [`/student/courses/${cc}`, "stu-course"],
    ["/student/my-feedback", "stu-feedback"],
    ["/student/inbox", "stu-inbox"],
  ];
  for (const [path, slug] of studentPages) await shoot(student.session, path, slug);

  console.log("done —", OUT);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (courseId) await service.from("courses").delete().eq("id", courseId);
  for (const uid of [studentId, teacherId]) {
    if (!uid) continue;
    const { error } = await service.auth.admin.deleteUser(uid).catch((e) => ({ error: e }));
    if (error) console.warn("cleanup:", error.message ?? error);
  }
  console.log("cleaned up");
}
