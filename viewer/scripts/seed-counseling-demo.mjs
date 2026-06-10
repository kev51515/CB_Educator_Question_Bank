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

  // ===== Course-level tabs (this is a demo course, so we clear + reseed) ====
  await svc.from("course_announcements").delete().eq("course_id", courseId);
  await svc.from("course_materials").delete().eq("course_id", courseId);
  await svc.from("discussion_topics").delete().eq("course_id", courseId); // cascades posts
  await svc.from("portfolio_templates").delete().eq("course_id", courseId); // cascades items/subs/feedback

  // ----- Announcements --------------------------------------------------
  const ann = (title, body, pinned) => ({
    course_id: courseId, author_id: counselor, title, body,
    pinned, published: true, publish_at: null,
  });
  await svc.from("course_announcements").insert([
    ann("Welcome to College Counseling", "This is our hub for everything college + career. Check the Materials tab for key links, keep your Portfolio up to date, and watch here for deadlines and workshops. Questions any time — message me in the Inbox.", true),
    ann("Juniors: let's map your fall timeline", "If you're in 11th grade, please finalize your college list and line up two teacher recommendations before the summer ends. Book a meeting with me if you haven't yet.", false),
    ann("Financial Aid 101 — workshop next month", "We'll walk through the FAFSA, CSS Profile, and scholarship search together. Bring a parent/guardian if you can. Details to follow.", false),
  ]);

  // ----- Materials (links) ----------------------------------------------
  const mat = (title, url, description, position) => ({
    course_id: courseId, uploader_id: counselor, kind: "link", title, url,
    description: description ?? null, position, published: true,
    file_path: null, file_size: null, mime_type: null,
  });
  await svc.from("course_materials").insert([
    mat("Common App", "https://www.commonapp.org", "Where most applications are submitted — create your account early.", 0),
    mat("FAFSA — Federal Student Aid", "https://studentaid.gov/h/apply-for-aid/fafsa", "The federal financial-aid form. Opens in the fall.", 1),
    mat("College Scorecard", "https://collegescorecard.ed.gov", "Compare cost, outcomes, and admissions data.", 2),
    mat("BigFuture Scholarship Search", "https://bigfuture.collegeboard.org/pay-for-college", "Find scholarships that fit you.", 3),
    mat("Personal Statement — prompts & tips", "https://www.commonapp.org/apply/essay-prompts", "This year's Common App essay prompts.", 4),
  ]);

  // ----- Discussions ----------------------------------------------------
  const { data: topics } = await svc.from("discussion_topics")
    .insert([
      { course_id: courseId, author_id: counselor, title: "Introduce yourself + your top career interest", body: "Drop a quick intro: your grade, an activity you love, and one career or major you're curious about right now.", pinned: true, locked: false },
      { course_id: courseId, author_id: counselor, title: "Summer plans — what are you up to?", body: "Internship, job, volunteering, a class, a project? Share what you're doing this summer — it all counts.", pinned: false, locked: false },
    ])
    .select("id, title");
  const topicId = (t) => topics.find((x) => x.title === t)?.id;
  const post = (topic, sid, body) => ({ topic_id: topicId(topic), author_id: sid, body, parent_post_id: null });
  await svc.from("discussion_posts").insert([
    post("Introduce yourself + your top career interest", mayaId, "Hi! I'm Maya, 9th grade. I play JV soccer and I'm in Science Club — pretty into biology so far. Curious about anything medical or environmental."),
    post("Introduce yourself + your top career interest", ethanId, "Hey everyone, Ethan, 11th grade. I captain the robotics team and founded our coding club. Aiming for computer science / ML."),
    post("Summer plans — what are you up to?", ethanId, "Doing a machine-learning research internship at a university lab this summer, plus prepping for a possible SAT retake."),
  ]);

  // ----- Portfolio ------------------------------------------------------
  const { data: tmpl } = await svc.from("portfolio_templates")
    .insert({ course_id: courseId, name: "College Application Portfolio", description: "Build the core pieces of your application here — we'll refine them together.", published: true })
    .select("id").single();
  const item = (position, title, item_type, opts = {}) => ({
    template_id: tmpl.id, position, title, item_type,
    prompt: opts.prompt ?? null, required: opts.required ?? true,
    due_at: null, settings: {}, parent_item_id: null,
  });
  const { data: items } = await svc.from("portfolio_items")
    .insert([
      item(1, "Activities list", "long_text", { prompt: "List your activities with role and hours/week, most important first." }),
      item(2, "Brag sheet", "long_text", { prompt: "Strengths, accomplishments, and stories your recommenders can use." }),
      item(3, "Resume", "link", { prompt: "Link to your resume (Google Doc or PDF).", required: false }),
      item(4, "Personal statement draft", "long_text", { prompt: "Your Common App personal essay draft." }),
      item(5, "Intended major + why", "short_text", { prompt: "What do you want to study, and why?" }),
    ])
    .select("id, title");
  const itemId = (t) => items.find((x) => x.title === t)?.id;
  const sub = (itemTitle, sid, opts = {}) => ({
    item_id: itemId(itemTitle), student_id: sid,
    status: opts.status ?? "draft",
    submitted_at: opts.status === "submitted" ? new Date().toISOString() : null,
    value_text: opts.value_text ?? null, value_url: opts.value_url ?? null,
    value_file_path: null, value_file_size: null, value_file_mime: null,
    value_number: null, value_date: null, value_choice: null, value_multi_choice: null,
  });
  const { data: subs } = await svc.from("portfolio_submissions")
    .insert([
      // Ethan — well along.
      sub("Activities list", ethanId, { status: "submitted", value_text: "Robotics Team — Captain (10 hrs/wk)\nVarsity Tennis — Co-captain (8 hrs/wk)\nUniversity ML Research Lab — Summer intern (20 hrs/wk)\nCoding Club — Founder & President (4 hrs/wk)\nPeer Math Tutoring — Volunteer (3 hrs/wk)" }),
      sub("Brag sheet", ethanId, { status: "submitted", value_text: "Built and led a 12-person robotics team to regionals. Founded a coding club that now mentors 30+ younger students. Co-authored a research poster on an ML side project." }),
      sub("Resume", ethanId, { status: "submitted", value_url: "https://docs.google.com/document/d/EXAMPLE-ethan-resume" }),
      sub("Personal statement draft", ethanId, { status: "draft", value_text: "When I started the coding club, only three people showed up. By spring we had thirty... (working draft — needs a stronger middle)." }),
      sub("Intended major + why", ethanId, { status: "submitted", value_text: "Computer Science — I love building things that scale and teaching others to do the same." }),
      // Maya — just getting started.
      sub("Activities list", mayaId, { status: "draft", value_text: "Science Club (member), JV Soccer (defender), Library volunteer (weekends)." }),
      sub("Intended major + why", mayaId, { status: "draft", value_text: "Not sure yet — interested in biology and the environment." }),
    ])
    .select("id, item_id, student_id");
  const psSub = subs.find((s) => s.item_id === itemId("Personal statement draft") && s.student_id === ethanId);
  if (psSub) {
    await svc.from("portfolio_feedback").insert({
      submission_id: psSub.id, author_id: counselor,
      body: "Strong, specific opening. Tighten the middle paragraph and land on what you learned about leadership — then this is in great shape.",
    });
  }

  console.log("\nSeeded:");
  console.log(`  • Maya Chen   (9th, 'class of 2030)  → maya.chen.demo@example.com`);
  console.log(`  • Ethan Park  (11th, 'class of 2028) → ethan.park.demo@example.com`);
  console.log(`  Password for both: ${PW}`);
  console.log(`  Course: ${course.name} (${course.short_code})`);
  console.log("Done.");
}
main().catch((e) => { console.error("seed-counseling-demo crashed:", e?.message ?? e); process.exit(1); });
