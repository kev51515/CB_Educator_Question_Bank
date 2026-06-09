#!/usr/bin/env node
/**
 * seed-counseling-demo.mjs
 *
 * Seeds two realistic counseling students (a 9th grader just starting to
 * explore, and an 11th grader deep in college prep) into a counseling course,
 * with full data across all four counseling surfaces: digital profile, college
 * list + application tracker (with document checklists), counselor tasks, and
 * meeting notes.
 *
 * Idempotent: reuses the demo students by email and clears their counseling
 * data for the course before re-inserting, so you can re-run to refresh.
 *
 * Usage: from viewer/  →  node --env-file-if-exists=../.env scripts/seed-counseling-demo.mjs
 * Optional: SEED_COURSE_SHORT=HBWEDG (defaults to the first counseling course).
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE) { console.error("seed-counseling-demo: missing SUPABASE_URL / SUPABASE_SERVICE_KEY"); process.exit(2); }
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const PW = "OmniDemo2026!";
const COURSE_SHORT = process.env.SEED_COURSE_SHORT || "HBWEDG";

// date helper → YYYY-MM-DD, n days from today
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function ensureStudent(email, name) {
  const { data: existing } = await svc.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing?.id) {
    await svc.from("profiles").update({ role: "student", display_name: name }).eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  await svc.from("profiles").update({ role: "student", display_name: name }).eq("id", data.user.id);
  return data.user.id;
}

async function clearCounseling(courseId, studentId) {
  for (const t of ["counseling_meetings", "counseling_tasks", "college_applications", "counseling_profiles"]) {
    await svc.from(t).delete().eq("course_id", courseId).eq("student_id", studentId);
  }
}

async function main() {
  // Resolve the counseling course.
  const { data: course, error: cErr } = await svc
    .from("courses").select("id, name, short_code, teacher_id, course_type")
    .eq("short_code", COURSE_SHORT).maybeSingle();
  if (cErr || !course) throw new Error(`course ${COURSE_SHORT} not found: ${cErr?.message ?? ""}`);
  if (course.course_type !== "counseling") {
    console.warn(`WARNING: course ${COURSE_SHORT} is '${course.course_type}', not 'counseling'. Seeding anyway.`);
  }
  const courseId = course.id;
  const counselor = course.teacher_id; // attribute meetings/tasks to the course owner
  console.log(`Course: ${course.name} (${course.short_code})`);

  // ---- Student A — 9th grade, early exploration -------------------------
  const mayaId = await ensureStudent("maya.chen.demo@example.com", "Maya Chen");
  // ---- Student B — 11th grade, active college prep ----------------------
  const ethanId = await ensureStudent("ethan.park.demo@example.com", "Ethan Park");

  // Enrol both (ignore duplicate).
  for (const sid of [mayaId, ethanId]) {
    await svc.from("course_memberships").insert({ course_id: courseId, student_id: sid });
    await clearCounseling(courseId, sid);
  }

  // ----- Profiles -------------------------------------------------------
  await svc.from("counseling_profiles").insert([
    {
      course_id: courseId, student_id: mayaId, updated_by: counselor,
      grad_year: 2030, gpa: 3.70, intended_major: "Exploring — leaning Biology",
      goals: "Build a strong academic foundation in 9th–10th grade, explore interests across science and the humanities, and try at least one new activity each year.",
      activities: [
        { name: "Science Club", role: "Member", hours_per_week: 2 },
        { name: "JV Soccer", role: "Defender", hours_per_week: 6 },
        { name: "Community Library", role: "Weekend volunteer", hours_per_week: 3 },
      ],
      test_scores: {},
    },
    {
      course_id: courseId, student_id: ethanId, updated_by: counselor,
      grad_year: 2028, gpa: 3.92, intended_major: "Computer Science",
      goals: "Earn admission to a strong CS program. Strengthen the application through ML research, robotics leadership, and an authentic personal essay; decide on an SAT retake.",
      activities: [
        { name: "Robotics Team", role: "Captain", hours_per_week: 10 },
        { name: "Varsity Tennis", role: "Co-captain", hours_per_week: 8 },
        { name: "Peer Math Tutoring", role: "Volunteer tutor", hours_per_week: 3 },
        { name: "University ML Research Lab", role: "Summer research intern", hours_per_week: 20 },
        { name: "Coding Club", role: "Founder & President", hours_per_week: 4 },
      ],
      test_scores: { sat: 1480, act: 33 },
    },
  ]);

  // ----- College applications ------------------------------------------
  // NOTE: PostgREST bulk insert requires every row to share the SAME keys, so
  // we build rows through a uniform shape (missing fields default to null/[]).
  const D = (docs) => docs.map(([label, done]) => ({ label, done }));
  const app = (sid, college_name, tier, opts = {}) => ({
    course_id: courseId, student_id: sid, created_by: counselor,
    college_name,
    tier: tier ?? null,
    plan: opts.plan ?? null,
    deadline: opts.deadline ?? null,
    status: opts.status ?? "considering",
    notes: opts.notes ?? null,
    documents: opts.documents ?? [],
  });
  await svc.from("college_applications").insert([
    // Maya (9th) — a couple of early "dream" schools, exploratory.
    app(mayaId, "UC Berkeley", "reach", { notes: "Loved the campus on a family visit; strong biology." }),
    app(mayaId, "UC Davis", "target", { notes: "Great for life sciences; closer to home." }),

    // Ethan (11th) — a balanced, CS-focused list with plans, deadlines, docs.
    app(ethanId, "MIT", "reach", { plan: "EA", deadline: "2027-11-01", status: "in_progress", notes: "Top choice — CS + research fit.", documents: D([["Transcript", true], ["Recommendation (CS teacher)", false], ["Recommendation (Math teacher)", false], ["Test scores", true], ["Essay", false]]) }),
    app(ethanId, "Stanford", "reach", { plan: "REA", deadline: "2027-11-01", notes: "REA — can't combine with other ED/EA.", documents: D([["Transcript", true], ["Recommendation", false], ["Test scores", true], ["Essay", false]]) }),
    app(ethanId, "Carnegie Mellon", "reach", { plan: "ED", deadline: "2027-11-01", notes: "Strong SCS; ED would be a big commitment.", documents: D([["Transcript", true], ["Recommendation", false], ["Test scores", true], ["Essay", false]]) }),
    app(ethanId, "Georgia Tech", "target", { plan: "EA", deadline: "2027-10-15", status: "in_progress", notes: "EA non-binding; rolling-ish CS admit.", documents: D([["Transcript", true], ["Test scores", true], ["Essay", false]]) }),
    app(ethanId, "University of Michigan", "target", { plan: "EA", deadline: "2027-11-01", documents: D([["Transcript", true], ["Test scores", true]]) }),
    app(ethanId, "UIUC", "target", { plan: "RD", deadline: "2028-01-05", notes: "Strong CS; RD." }),
    app(ethanId, "Purdue", "safety", { plan: "EA", deadline: "2027-11-01", documents: D([["Transcript", true], ["Test scores", true]]) }),
    app(ethanId, "Arizona State", "safety", { plan: "rolling", notes: "Rolling admission — likely safety." }),
  ]);

  // ----- Tasks ----------------------------------------------------------
  const task = (sid, title, due, status, details) => ({
    course_id: courseId, student_id: sid, assigned_by: counselor,
    title, due_date: due, status,
    completed_at: status === "done" ? new Date().toISOString() : null,
    details: details ?? null,
  });
  await svc.from("counseling_tasks").insert([
    // Maya (9th)
    task(mayaId, "Take the career interests quiz", day(20), "open", "Bring 2–3 careers that look interesting to our next meeting."),
    task(mayaId, "Join one new club this fall", day(95), "open"),
    task(mayaId, "Summer reading: finish 2 books", day(80), "open", "Pick one fiction + one nonfiction."),
    task(mayaId, "Meet with counselor to set 9th-grade goals", day(-5), "done"),
    // Ethan (11th)
    task(ethanId, "Finalize the college list (3 reach / 3 target / 2 safety)", day(-11), "open", "Currently 3/3/2 — confirm before essays."),
    task(ethanId, "Register for the fall SAT retake", day(8), "open", "Aim for the late-August/September date."),
    task(ethanId, "Draft Common App personal essay", day(35), "open", "Topic: founding the coding club + mentoring."),
    task(ethanId, "Request 2 teacher recommendations", day(60), "open", "AP CS and Honors Math."),
    task(ethanId, "Submit summer research program report", day(-9), "done"),
  ]);

  // ----- Meeting notes (counselor-private) ------------------------------
  const meet = (sid, on, summary, next) => ({
    course_id: courseId, student_id: sid, created_by: counselor,
    met_on: on, summary, next_steps: next,
  });
  await svc.from("counseling_meetings").insert([
    meet(mayaId, day(-5),
      "Initial 9th-grade planning meeting. Discussed interests (science, soccer), reviewed 10th-grade course selection, and set goals: keep GPA ≥ 3.5, join one new activity, and start exploring careers.",
      "Take the career interests quiz; shortlist 2 summer enrichment ideas."),
    meet(ethanId, day(-21),
      "Junior college-planning meeting. Built a balanced CS-focused list (3 reach / 3 target / 2 safety). SAT 1480 is strong; weighed whether a fall retake is worthwhile vs. focusing on essays.",
      "Decide on the SAT retake by mid-July; begin essay brainstorming."),
    meet(ethanId, day(-2),
      "Essay brainstorm. Explored a topic around founding the coding club and mentoring younger students — authentic and specific. Also discussed which teachers to ask for recommendations.",
      "Draft an outline this week; email the AP CS and Math teachers about recommendations."),
  ]);

  console.log("\nSeeded:");
  console.log(`  • Maya Chen   (9th, 'class of 2030)  → maya.chen.demo@example.com`);
  console.log(`  • Ethan Park  (11th, 'class of 2028) → ethan.park.demo@example.com`);
  console.log(`  Password for both: ${PW}`);
  console.log(`  Course: ${course.name} (${course.short_code})`);
  console.log("Done.");
}
main().catch((e) => { console.error("seed-counseling-demo crashed:", e?.message ?? e); process.exit(1); });
