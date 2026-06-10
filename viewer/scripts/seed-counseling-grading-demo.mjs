#!/usr/bin/env node
/**
 * seed-counseling-grading-demo.mjs
 *
 * Makes the counseling STAR-GRADING (migration 0140) visible in the demo:
 *   - ensures a counseling_grading_settings row for the demo course (enabled,
 *     3 on-time / 1 late / up to 2 quality, resubmissions on, cap 2)
 *   - grades a realistic mix of each enrolled student's existing tasks so the
 *     student card + caseload show real stars: a 5/5, a 4/5, a late 3/5, and
 *     one still "awaiting grade"; the rest stay un-submitted.
 *
 * Writes the grading columns DIRECTLY via the service role (the submit/grade
 * RPCs are auth.uid()-scoped and can't run under the service key). Idempotent:
 * re-running just rewrites the same fields.
 *
 * Usage: from viewer/  →  node --env-file-if-exists=../.env scripts/seed-counseling-grading-demo.mjs
 * Optional: SEED_COURSE_SHORT=HBWEDG (defaults to the demo counseling course).
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE) { console.error("seed-counseling-grading-demo: missing SUPABASE_URL / SUPABASE_SERVICE_KEY"); process.exit(2); }
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const COURSE_SHORT = process.env.SEED_COURSE_SHORT || "HBWEDG";
const ago = (n) => new Date(Date.now() - n * 86400000).toISOString();

// The grading states applied to each student's first N tasks, in order.
const PLAN = [
  { label: "graded 5/5",    on_time: true,  punctuality: 3, quality: 2, graded: true,  fb: "Outstanding — specific, well-organized, and turned in early. Five stars." },
  { label: "graded 4/5",    on_time: true,  punctuality: 3, quality: 1, graded: true,  fb: "Solid work on time. Tighten the personal reflection to reach five." },
  { label: "late 3/5",      on_time: false, punctuality: 1, quality: 2, graded: true,  fb: "Quality is excellent — the only thing missing was turning it in on time." },
  { label: "awaiting grade",on_time: true,  punctuality: 3, quality: null, graded: false, fb: null },
];

async function main() {
  const { data: course, error: cErr } = await svc
    .from("courses").select("id, name, short_code, teacher_id, course_type")
    .eq("short_code", COURSE_SHORT).maybeSingle();
  if (cErr || !course) throw new Error(`course ${COURSE_SHORT} not found: ${cErr?.message ?? ""}`);
  console.log(`Course: ${course.name} (${course.short_code})  type=${course.course_type}`);
  const courseId = course.id, counselor = course.teacher_id;

  // 1. Ensure grading settings (defaults, enabled).
  {
    const { error } = await svc.from("counseling_grading_settings").upsert({
      course_id: courseId, enabled: true, max_stars: 5, on_time_stars: 3,
      late_stars: 1, quality_max_stars: 2, allow_resubmission: true,
      max_resubmissions: 2, updated_by: counselor,
    }, { onConflict: "course_id" });
    if (error) throw new Error(`settings upsert: ${error.message}`);
    console.log("  settings: enabled (3 on-time / 1 late / up to 2 quality, resubmit cap 2)");
  }

  // 2. Enrolled students in the course.
  const { data: members } = await svc.from("course_memberships")
    .select("student_id, profiles(display_name)").eq("course_id", courseId);
  if (!members?.length) { console.log("  (no enrolled students — nothing to grade)"); return; }

  let graded = 0;
  for (const m of members) {
    const name = m.profiles?.display_name ?? m.student_id.slice(0, 8);
    const { data: tasks } = await svc.from("counseling_tasks")
      .select("id, title")
      .eq("course_id", courseId).eq("student_id", m.student_id)
      .order("created_at", { ascending: true });
    if (!tasks?.length) { console.log(`  ${name}: no tasks`); continue; }

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const plan = PLAN[i]; // only the first PLAN.length tasks get a state
      if (!plan) {
        // Leave the rest as plain gradable, un-submitted.
        await svc.from("counseling_tasks").update({ gradable: true }).eq("id", t.id);
        continue;
      }
      const stars = plan.graded ? Math.min(plan.punctuality + (plan.quality ?? 0), 5) : null;
      const patch = {
        gradable: true,
        submitted_at: ago(plan.on_time ? 6 : 1),
        submission_on_time: plan.on_time,
        punctuality_stars: plan.punctuality,
        quality_stars: plan.graded ? plan.quality : null,
        stars,
        feedback: plan.fb,
        graded_at: plan.graded ? ago(3) : null,
        graded_by: plan.graded ? counselor : null,
        status: plan.graded ? "done" : "open",
        resubmission_count: 0,
      };
      const { error } = await svc.from("counseling_tasks").update(patch).eq("id", t.id);
      if (error) { console.log(`  ${name}: "${t.title}" -> ERROR ${error.message}`); continue; }
      console.log(`  ${name}: "${t.title}" -> ${plan.label}${stars != null ? ` (${stars}/5)` : ""}`);
      graded++;
    }
  }
  console.log(`\nDone. Applied ${graded} grading states across ${members.length} student(s).`);
}
main().catch((e) => { console.error("seed-counseling-grading-demo crashed:", e?.message ?? e); process.exit(1); });
