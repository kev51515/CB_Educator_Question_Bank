#!/usr/bin/env node
/**
 * smoke-pickleball.mjs
 *
 * End-to-end auth/RLS/RPC smoke for the pickleball coaching course types
 * (migrations 0174-0186) against Supabase Cloud. Provisions throwaway users +
 * a player course and a coach course, exercises the pk_* RPCs as the right
 * actor, checks RLS isolation + the waitlist + the hours->devstep auto-step
 * trigger, then deletes everything.
 *
 * Run: cd viewer && node --env-file-if-exists=../.env scripts/smoke-pickleball.mjs
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const miss = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY"].filter((k) => !process.env[k]);
if (miss.length) { console.error("missing env:", miss.join(", ")); process.exit(2); }

const TS = Date.now();
const TAG = `pbsmk-${TS}`;
const PW = "PbSmoke!" + randomBytes(4).toString("hex");
const service = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const userClient = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (l, x = "") => { pass++; console.log(`  PASS  ${l}${x ? "  " + x : ""}`); };
const bad = (l, d = "") => { fail++; console.log(`  FAIL  ${l}${d ? "  — " + d : ""}`); };
const step = (l) => console.log(`\n— ${l}`);
const created = { users: [], courses: [] };

async function mkUser(tag, role) {
  const email = `${tag}-${TAG}@gmail.com`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const id = data.user.id;
  created.users.push(id);
  if (role !== "student") {
    const { error: e } = await service.from("profiles").update({ role }).eq("id", id);
    if (e) throw new Error(`promote(${tag}): ${e.message}`);
  }
  return id;
}
async function signIn(tag) {
  const c = userClient();
  const { error } = await c.auth.signInWithPassword({ email: `${tag}-${TAG}@gmail.com`, password: PW });
  if (error) throw new Error(`signIn(${tag}): ${error.message}`);
  return c;
}
async function mkCourse(name, course_type, teacher_id) {
  const { data, error } = await service.from("courses").insert({ name, course_type, teacher_id }).select("id").single();
  if (error) throw new Error(`course(${course_type}): ${error.message}`);
  created.courses.push(data.id);
  return data.id;
}
async function enroll(course_id, student_id) {
  const { error } = await service.from("course_memberships").insert({ course_id, student_id });
  if (error) throw new Error(`enroll: ${error.message}`);
}
// rpc helper: returns {data,error}; treats a thrown as error
const call = async (client, fn, args) => client.rpc(fn, args);

async function cleanup() {
  step("cleanup");
  for (const id of created.courses) await service.from("courses").delete().eq("id", id);
  for (const id of created.users) await service.auth.admin.deleteUser(id).catch(() => {});
  console.log(`  removed ${created.courses.length} courses + ${created.users.length} users`);
}

async function main() {
  console.log(`pickleball auth smoke  tag=${TAG}`);
  // ---- provision ----
  step("provision users + courses");
  const T = await mkUser("teacher", "teacher");
  const A = await mkUser("playerA", "student");
  const B = await mkUser("playerB", "student");
  const C = await mkUser("coach", "student");
  const PC = await mkCourse(`PB Player ${TAG}`, "pickleball_player", T);
  const CC = await mkCourse(`PB Coach ${TAG}`, "pickleball_coach", T);
  await enroll(PC, A); await enroll(PC, B); await enroll(CC, C);
  ok("provisioned teacher + 2 players + coach + 2 courses");
  const t = await signIn("teacher"), a = await signIn("playerA"), b = await signIn("playerB"), c = await signIn("coach");

  // ---- domain layer ----
  step("domain layer");
  { const { error } = await call(t, "set_my_domain", { p_domain: "coaching" });
    if (error) bad("set_my_domain", error.message);
    else { const { data } = await service.from("profiles").select("domain").eq("id", T).single();
      data?.domain === "coaching" ? ok("set_my_domain -> coaching") : bad("domain not persisted", JSON.stringify(data)); } }

  // ---- player course: educator writes ----
  step("player course — educator RPCs");
  let prog, lesson, drill, hw, evt;
  { const { data, error } = await call(t, "pk_upsert_program", { p_course_id: PC, p_id: null, p_name: "Newbie" });
    error ? bad("pk_upsert_program", error.message) : (prog = data?.id, ok("pk_upsert_program", prog)); }
  { const { data, error } = await call(t, "pk_schedule_lesson", { p_course_id: PC, p_player_id: A, p_coach_id: T, p_program_id: prog, p_plan_md: "focus: dinks" });
    error ? bad("pk_schedule_lesson", error.message) : (lesson = data?.id, ok("pk_schedule_lesson", lesson)); }
  { const { error } = await call(t, "pk_record_assessment", { p_course_id: PC, p_player_id: A, p_type: "intake", p_scores: { serve: 3, dink: 2.5 }, p_overall_level: 3.0 });
    error ? bad("pk_record_assessment", error.message) : ok("pk_record_assessment"); }
  { const { data, error } = await call(t, "pk_upsert_drill", { p_course_id: PC, p_name: "Dink rally", p_skill_tags: ["dink"], p_solo_or_partner: "partner", p_status: "published" });
    error ? bad("pk_upsert_drill", error.message) : (drill = data?.id, ok("pk_upsert_drill", drill)); }
  { const { data, error } = await call(t, "pk_assign_homework", { p_course_id: PC, p_player_id: A, p_drill_id: drill, p_lesson_id: lesson });
    error ? bad("pk_assign_homework", error.message) : (hw = data?.id, ok("pk_assign_homework", hw)); }

  // ---- player course: player self-writes ----
  step("player course — player self RPCs");
  { const { error } = await call(a, "pk_upsert_player_profile", { p_course_id: PC, p_student_id: A, p_goal: "fitness", p_dupr: 3.2 });
    error ? bad("pk_upsert_player_profile (self)", error.message) : ok("player A upserts own profile"); }
  { const { error } = await call(a, "pk_set_homework_status", { p_id: hw, p_status: "done" });
    error ? bad("pk_set_homework_status (own)", error.message) : ok("player A marks own homework done"); }
  { const { error } = await call(a, "pk_submit_checkin", { p_lesson_id: lesson, p_condition: "injured", p_focus: "tweaked knee" });
    error ? bad("pk_submit_checkin (own, injured)", error.message) : ok("player A submits injury check-in"); }
  { const { data, error } = await call(a, "pk_player_skill_series", { p_course_id: PC, p_player_id: A });
    error ? bad("pk_player_skill_series (own)", error.message) : ok("player A reads own skill series", data ? "ok" : ""); }

  // ---- events + waitlist ----
  step("events + skill-gate-free waitlist promotion");
  { const { data, error } = await call(t, "pk_upsert_event", { p_course_id: PC, p_name: "Smoke Clinic", p_capacity: 1 });
    error ? bad("pk_upsert_event", error.message) : (evt = data?.id, ok("pk_upsert_event (cap 1)", evt)); }
  { const { error } = await call(t, "pk_publish_event", { p_id: evt, p_status: "published" });
    error ? bad("pk_publish_event", error.message) : ok("pk_publish_event"); }
  { const { data, error } = await call(a, "pk_register_event", { p_event_id: evt });
    error ? bad("A pk_register_event", error.message) : (data?.state === "registered" ? ok("player A registered") : bad("A state", JSON.stringify(data?.state))); }
  { const { data, error } = await call(b, "pk_register_event", { p_event_id: evt });
    error ? bad("B pk_register_event", error.message) : (data?.state === "waitlisted" ? ok("player B waitlisted (cap full)") : bad("B state (expect waitlisted)", JSON.stringify(data?.state))); }
  { const { error } = await call(a, "pk_cancel_registration", { p_event_id: evt });
    if (error) bad("A pk_cancel_registration", error.message);
    else { const { data } = await service.from("pickleball_event_registrations").select("state").eq("event_id", evt).eq("player_id", B).single();
      data?.state === "registered" ? ok("B auto-promoted off waitlist") : bad("B not promoted", JSON.stringify(data?.state)); } }

  // ---- RLS isolation (player course) ----
  step("RLS isolation");
  { const { data } = await b.from("pickleball_player_profiles").select("id, student_id").eq("course_id", PC);
    (data || []).some((r) => r.student_id === A) ? bad("player B can see A's profile (RLS leak)") : ok("player B cannot read player A's profile"); }
  { const { data } = await b.from("pickleball_homework").select("id, player_id").eq("course_id", PC);
    (data || []).some((r) => r.player_id === A) ? bad("player B can see A's homework (RLS leak)") : ok("player B cannot read player A's homework"); }
  { const { error } = await call(a, "pk_record_assessment", { p_course_id: PC, p_player_id: A, p_type: "progress", p_scores: { serve: 4 } });
    error ? ok("player A blocked from pk_record_assessment", error.code || "not_authorized") : bad("player A could record an assessment (authz leak)"); }

  // ---- coach course ----
  step("coach course — dev/cert/hours/auto-step/evaluation");
  let step1;
  { const { error } = await call(t, "pk_upsert_coach_profile", { p_course_id: CC, p_coach_id: C, p_bio: "new coach" });
    error ? bad("pk_upsert_coach_profile", error.message) : ok("pk_upsert_coach_profile"); }
  { const { error } = await call(t, "pk_add_certification", { p_course_id: CC, p_coach_id: C, p_name: "PPR L1", p_issuing_body: "PPR" });
    error ? bad("pk_add_certification", error.message) : ok("pk_add_certification"); }
  { const { data, error } = await call(t, "pk_add_devstep", { p_course_id: CC, p_coach_id: C, p_title: "Log 2 hours" });
    error ? bad("pk_add_devstep", error.message) : (step1 = data?.id, ok("pk_add_devstep", step1)); }
  { const { error } = await call(t, "pk_set_devstep_auto", { p_id: step1, p_step_type: "hours", p_auto_threshold: 2 });
    error ? bad("pk_set_devstep_auto", error.message) : ok("pk_set_devstep_auto (hours>=2)"); }
  { const { error } = await call(t, "pk_log_hours", { p_course_id: CC, p_coach_id: C, p_taught_on: new Date(TS).toISOString().slice(0, 10), p_hours: 3 });
    if (error) bad("pk_log_hours", error.message);
    else { const { data } = await service.from("pickleball_coach_devsteps").select("status, auto_completed").eq("id", step1).single();
      data?.status === "done" ? ok("logging 3h auto-completed the 2h devstep (trigger)") : bad("devstep not auto-completed", JSON.stringify(data)); } }
  { const { error } = await call(t, "pk_add_evaluation", { p_course_id: CC, p_coach_id: C, p_instruction: 4, p_communication: 5, p_safety: 5, p_retention: 4, p_notes: "solid" });
    error ? bad("pk_add_evaluation", error.message) : ok("pk_add_evaluation"); }
  { const { data, error } = await c.from("pickleball_coach_evaluations").select("id, instruction").eq("course_id", CC);
    error ? bad("coach reads own evals", error.message) : ((data || []).length === 1 ? ok("coach reads own evaluation") : bad("coach eval read count", String((data || []).length))); }

  // ---- chat ----
  step("community chat RPC");
  { const { error } = await call(t, "pk_post_chat_message", { p_course_id: CC, p_body: "welcome" });
    error ? bad("teacher pk_post_chat_message", error.message) : ok("teacher posts chat"); }
  { const { error } = await call(c, "pk_post_chat_message", { p_course_id: CC, p_body: "thanks coach" });
    error ? bad("coach pk_post_chat_message", error.message) : ok("enrolled coach posts chat"); }
}

main()
  .catch((e) => { bad("UNCAUGHT", e.message); })
  .finally(async () => {
    await cleanup().catch((e) => console.log("  cleanup error:", e.message));
    console.log(`\n${fail === 0 ? "ALL GREEN" : "RED"} — ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
  });
