#!/usr/bin/env node
/**
 * seed-pickleball-iptpa.mjs
 *
 * Rich, IPTPA-aligned demo content for the pickleball courses (Player + Coach)
 * owned by kevyao@gmail.com. Content references the IPTPA Player Skills Rating
 * Assessment (the 10-skill matrix) + the IPTPA Level I/II teaching-certification
 * development track.
 *
 * Inserts directly via the service role (bypasses RLS — the pk_* RPCs are
 * auth.uid()-scoped and can't be called server-side). Idempotent-ish: programs,
 * drills, events, and per-person content are find-or-create / seed-once.
 *
 * Run: cd viewer && node --env-file=../.env scripts/seed-pickleball-iptpa.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE) { console.error("missing SUPABASE_URL / SUPABASE_SERVICE_KEY"); process.exit(2); }
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const OWNER = "kevyao@gmail.com";
const PLAYER_COURSE = "Pickleball Demo — Players";
const COACH_COURSE = "Pickleball Demo — Coaches";
const today = new Date();
const iso = (d) => new Date(d).toISOString();
const day = (offset) => iso(today.getTime() + offset * 864e5).slice(0, 10);

// ---- IPTPA-aligned content ----------------------------------------------
const PLAYER_PROGRAMS = [
  { name: "Intro to Pickleball", description: "Rules, scoring, ready position, basic strokes — first-timers.", level_min: 1.0, level_max: 2.0, sort_order: 0 },
  { name: "Beginner Fundamentals", description: "Serve, return, dink and the soft game — IPTPA 2.5 skills.", level_min: 2.0, level_max: 2.5, sort_order: 1 },
  { name: "Intermediate Development", description: "Third-shot drop, transition-zone resets, shot selection — IPTPA 3.0–3.5.", level_min: 3.0, level_max: 3.5, sort_order: 2 },
  { name: "Advanced Strategy", description: "Hands battles, stacking, patience and pace control — IPTPA 4.0+.", level_min: 4.0, level_max: 5.0, sort_order: 3 },
];
const COACH_PROGRAMS = [
  { name: "Coach Track — IPTPA Level I Prep", description: "On-court teaching methodology, drill design, the IPTPA Level I assessment.", sort_order: 0 },
  { name: "Coach Track — IPTPA Level II Prep", description: "Advanced player development + the IPTPA Level II pathway.", sort_order: 1 },
];
const DRILLS = [
  { name: "Cross-Court Dink Rally", skill_tags: ["dink"], level_min: 2.5, level_max: 4.5, solo_or_partner: "partner", description: "Sustain 20 cross-court dinks below net-tape height; reset on any pop-up." },
  { name: "Dink to Targets", skill_tags: ["dink", "court_positioning"], level_min: 3.0, level_max: 5.0, solo_or_partner: "partner", description: "Place dinks to cones in the kitchen corners — 7 of 10 to target." },
  { name: "Wall Dinks (Solo)", skill_tags: ["dink"], level_min: 1.0, level_max: 3.0, solo_or_partner: "wall", description: "Control soft dinks against a wall — 30 in a row." },
  { name: "Third-Shot Drop Progression", skill_tags: ["third_shot_drop"], level_min: 3.0, level_max: 5.0, solo_or_partner: "partner", description: "Drop from mid-court, then the baseline — land 6 of 10 in the kitchen." },
  { name: "Drop-and-Run", skill_tags: ["third_shot_drop", "footwork"], level_min: 3.5, level_max: 5.0, solo_or_partner: "partner", description: "Third-shot drop then advance to the NVZ line together." },
  { name: "Deep Serve Consistency", skill_tags: ["serve"], level_min: 2.0, level_max: 4.0, solo_or_partner: "solo", description: "10 serves — 7+ land in the back third, all in." },
  { name: "Serve Placement Ladder", skill_tags: ["serve"], level_min: 3.0, level_max: 5.0, solo_or_partner: "solo", description: "Serve to backhand / body / wide targets in sequence." },
  { name: "Deep Return + Crash", skill_tags: ["return", "footwork"], level_min: 2.5, level_max: 4.5, solo_or_partner: "partner", description: "Return deep, then move to the kitchen line." },
  { name: "Hands Battle (Volley Exchange)", skill_tags: ["volley_reset"], level_min: 3.5, level_max: 5.0, solo_or_partner: "partner", description: "Fast volley exchanges at the NVZ; first to lose control resets." },
  { name: "Reset from the Transition Zone", skill_tags: ["volley_reset", "court_positioning"], level_min: 3.5, level_max: 5.0, solo_or_partner: "partner", description: "Soft-block hard balls into the kitchen while advancing." },
  { name: "Topspin Drive Depth", skill_tags: ["drive"], level_min: 3.0, level_max: 5.0, solo_or_partner: "partner", description: "Drive with topspin — 6 of 10 past the NVZ, in." },
  { name: "Overhead Put-Away", skill_tags: ["lob_overhead"], level_min: 3.0, level_max: 5.0, solo_or_partner: "partner", description: "Track and finish lobs; footwork back, then put away." },
  { name: "Split-Step Timing", skill_tags: ["footwork"], level_min: 2.0, level_max: 5.0, solo_or_partner: "solo", description: "Split-step on every opponent contact — shadow drill." },
  { name: "Stacking & Recovery", skill_tags: ["court_positioning", "strategy"], level_min: 3.5, level_max: 5.0, solo_or_partner: "group", description: "Practice stacking, the switch, and recovery to formation." },
  { name: "Shot-Selection Decision Drill", skill_tags: ["strategy"], level_min: 3.0, level_max: 5.0, solo_or_partner: "partner", description: "Call drive / drop / dink by ball height — build patience on unattackable balls." },
];

async function findCourse(name) {
  const { data: owner } = await svc.from("profiles").select("id").eq("email", OWNER).single();
  const { data } = await svc.from("courses").select("id, short_code").eq("name", name).eq("teacher_id", owner.id).maybeSingle();
  return data ? { ...data, ownerId: owner.id } : { ownerId: owner.id };
}
async function ensure(table, match, row) {
  const { data } = await svc.from(table).select("id").match(match).maybeSingle();
  if (data) return data.id;
  const { data: ins, error } = await svc.from(table).insert(row).select("id").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return ins.id;
}
async function mkStudent(prefix, displayName, courseId) {
  // reuse an existing enrolled demo person of this prefix if present
  const email = `${prefix}-${randomBytes(3).toString("hex")}@gmail.com`;
  const password = prefix.includes("coach") ? "PbCoach!" + randomBytes(4).toString("hex") : "PbPlayer!" + randomBytes(4).toString("hex");
  const { data: u, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${prefix}: ${error.message}`);
  await svc.from("profiles").update({ display_name: displayName }).eq("id", u.user.id);
  await svc.from("course_memberships").insert({ course_id: courseId, student_id: u.user.id });
  return { id: u.user.id, email, password };
}

async function main() {
  const PC = await findCourse(PLAYER_COURSE);
  const CC = await findCourse(COACH_COURSE);
  if (!PC.id || !CC.id) throw new Error("Demo courses missing — run seed-pickleball-demo.mjs first.");
  const owner = PC.ownerId;
  console.log(`Player course ${PC.short_code} · Coach course ${CC.short_code}`);

  // ---- PROGRAMS + DRILLS ----
  const progIds = {};
  for (const p of PLAYER_PROGRAMS) progIds[p.name] = await ensure("pickleball_programs", { course_id: PC.id, name: p.name }, { course_id: PC.id, ...p });
  for (const p of COACH_PROGRAMS) progIds[p.name] = await ensure("pickleball_programs", { course_id: CC.id, name: p.name }, { course_id: CC.id, ...p });
  const drillIds = {};
  for (const d of DRILLS) drillIds[d.name] = await ensure("pickleball_drills", { course_id: PC.id, name: d.name }, { course_id: PC.id, contributed_by: owner, status: "published", ...d });
  console.log(`✓ ${PLAYER_PROGRAMS.length}+${COACH_PROGRAMS.length} programs, ${DRILLS.length} drills`);

  // ---- EVENTS / CLINICS (IPTPA-style) ----
  const events = [
    { name: "Beginner Clinic (2.0–2.5)", type: "clinic", description: "Fundamentals for new players — serve, return, dink.", skill_min: 1.0, skill_max: 2.5, capacity: 8 },
    { name: "Dinking & Soft Game Workshop (3.0+)", type: "clinic", description: "Cross-court dinks, third-shot drops, resets.", skill_min: 3.0, skill_max: 5.0, capacity: 6 },
    { name: "IPTPA Skills Assessment Day", type: "social", description: "Get your IPTPA Player Skills Rating assessed by a certified assessor.", skill_min: null, skill_max: null, capacity: 12 },
  ];
  for (const e of events) await ensure("pickleball_events", { course_id: PC.id, name: e.name }, { course_id: PC.id, coach_id: owner, status: "published", starts_at: iso(today.getTime() + 7 * 864e5), location: "Court 1", ...e });
  console.log(`✓ ${events.length} clinics/events`);

  // ---- PLAYER: profile + IPTPA assessment + homework + lessons ----
  const { data: members } = await svc.from("course_memberships").select("student_id").eq("course_id", PC.id);
  let player = (members || []).map((m) => m.student_id).find((id) => id !== owner);
  let playerLogin = null;
  if (!player) { const s = await mkStudent("pb-player", "Demo Player", PC.id); player = s.id; playerLogin = s; }
  await ensure("pickleball_player_profiles", { course_id: PC.id, student_id: player }, { course_id: PC.id, student_id: player, goal: "competitive", goal_notes: "Wants to reach 3.5 and play in local tournaments.", years_played: 1, sports_background: "tennis", dupr: 3.0, skill_level: "3.0", dominant_hand: "right", start_date: day(-90) });
  // IPTPA Player Skills Rating — soft game is the development priority
  const scores = { serve: 3, return: 3, dink: 2.5, third_shot_drop: 2, drive: 3.5, volley_reset: 2.5, lob_overhead: 3, footwork: 3, court_positioning: 2.5, strategy: 2.5 };
  const { data: existingA } = await svc.from("pickleball_assessments").select("id").eq("course_id", PC.id).eq("player_id", player).limit(1);
  if (!existingA?.length) {
    await svc.from("pickleball_assessments").insert({ course_id: PC.id, player_id: player, coach_id: owner, type: "intake", scores, overall_level: 3.0, notes: "IPTPA Player Skills Rating (intake). Solid baseline at 3.0; the soft game — dinks, third-shot drop and transition resets — is the clear development priority." });
    // assign drills that target the weakest skills
    for (const dn of ["Cross-Court Dink Rally", "Third-Shot Drop Progression", "Reset from the Transition Zone"]) {
      await svc.from("pickleball_homework").insert({ course_id: PC.id, player_id: player, drill_id: drillIds[dn], assigned_by: owner, due_on: day(7), status: "assigned" });
    }
    await svc.from("pickleball_lessons").insert([
      { course_id: PC.id, player_id: player, coach_id: owner, program_id: progIds["Intermediate Development"], scheduled_at: iso(today.getTime() - 5 * 864e5), duration_min: 60, location: "Court 1", status: "recapped", plan_md: "Soft game: cross-court dinks + third-shot drop progression.", recap_md: "Dink consistency improved to ~15 in a row. Third-shot drop still floating long — assigned the drop progression as homework." },
      { course_id: PC.id, player_id: player, coach_id: owner, program_id: progIds["Intermediate Development"], scheduled_at: iso(today.getTime() + 2 * 864e5), duration_min: 60, location: "Court 1", status: "scheduled", plan_md: "Transition-zone resets + shot-selection decision drill." },
    ]);
  }
  console.log(`✓ player profile + IPTPA assessment + 3 homework + 2 lessons${playerLogin ? " (new player login below)" : ""}`);

  // ---- COACH: profile + IPTPA certs + development track (auto-steps) ----
  const { data: cmembers } = await svc.from("course_memberships").select("student_id").eq("course_id", CC.id);
  let coach = (cmembers || []).map((m) => m.student_id).find((id) => id !== owner);
  let coachLogin = null;
  if (!coach) { const s = await mkStudent("pb-coach", "Demo Coach", CC.id); coach = s.id; coachLogin = s; }
  await ensure("pickleball_coach_profiles", { course_id: CC.id, coach_id: coach }, { course_id: CC.id, coach_id: coach, years_played: 6, sports_background: "tennis, table tennis", bio: "Strong 4.0 player pursuing IPTPA Level I certification; mentoring under the head coach." });
  const { data: existingCert } = await svc.from("pickleball_certifications").select("id").eq("course_id", CC.id).eq("coach_id", coach).limit(1);
  if (!existingCert?.length) {
    await svc.from("pickleball_certifications").insert([
      { course_id: CC.id, coach_id: coach, name: "IPTPA Level I Certified Teaching Professional", issuing_body: "IPTPA", level: "Level I", earned_on: day(-120), expires_on: day(610), cert_no: "IPTPA-L1-2026-0142" },
      { course_id: CC.id, coach_id: coach, name: "CPR / First Aid", issuing_body: "American Red Cross", earned_on: day(-60), expires_on: day(670) },
    ]);
    // development track — manual done, a cert-backed step, an auto HOURS step (in progress), an auto SHADOW step (will auto-complete)
    const mk = async (row) => (await svc.from("pickleball_coach_devsteps").insert(row).select("id").single()).data.id;
    await mk({ course_id: CC.id, coach_id: coach, title: "Complete IPTPA Level I online modules", step_type: "manual", status: "done", completed_at: iso(today.getTime() - 130 * 864e5) });
    await mk({ course_id: CC.id, coach_id: coach, title: "Maintain current CPR / First Aid", step_type: "cert", status: "done", completed_at: iso(today.getTime() - 60 * 864e5) });
    await mk({ course_id: CC.id, coach_id: coach, title: "Log 100 supervised teaching hours", step_type: "hours", auto_threshold: 100, status: "open" });
    const shadowStep = await mk({ course_id: CC.id, coach_id: coach, title: "Complete 5 mentor-observed shadow sessions", step_type: "shadow", auto_threshold: 5, status: "open" });
    await mk({ course_id: CC.id, coach_id: coach, title: "Begin IPTPA Level II prerequisites", step_type: "manual", status: "open", due_on: day(90) });

    // hours log — ~64 of 100 (the hours step shows progress, stays open)
    const hours = [8, 6, 10, 7, 9, 6, 8, 10];
    for (let i = 0; i < hours.length; i++) await svc.from("pickleball_hours_log").insert({ course_id: CC.id, coach_id: coach, taught_on: day(-(i + 1) * 7), hours: hours[i], program_id: progIds["Coach Track — IPTPA Level I Prep"], num_players: 4, notes: "Group clinic" });
    // shadow logs — insert unsigned, then sign off (fires the recompute trigger -> auto-completes the 5-session step)
    const ids = [];
    for (let i = 0; i < 5; i++) { const { data } = await svc.from("pickleball_shadow_logs").insert({ course_id: CC.id, coach_id: coach, mentor_id: owner, shadow_date: day(-(i + 1) * 10), mentor_notes: "Observed group clinic; good court management.", signed_off: false }).select("id").single(); ids.push(data.id); }
    // signing off fires the AFTER UPDATE trigger -> pk_recompute_devsteps -> the
    // 5-session shadow step auto-completes.
    await svc.from("pickleball_shadow_logs").update({ signed_off: true, signed_off_at: iso(today) }).in("id", ids);
    // coach program qualifications + an evaluation
    await svc.from("pickleball_coach_programs").insert([
      { course_id: CC.id, coach_id: coach, program_id: progIds["Coach Track — IPTPA Level I Prep"], status: "cleared" },
      { course_id: CC.id, coach_id: coach, program_id: progIds["Coach Track — IPTPA Level II Prep"], status: "training" },
    ]);
    await svc.from("pickleball_coach_evaluations").insert({ course_id: CC.id, coach_id: coach, evaluator_id: owner, instruction: 4, communication: 4, safety: 5, retention: 3, notes: "Excellent safety habits and clear fundamentals. Work on lesson pacing and post-lesson follow-up to lift retention." });
  }
  const { data: doneStep } = await svc.from("pickleball_coach_devsteps").select("status, auto_completed").eq("course_id", CC.id).eq("coach_id", coach).eq("step_type", "shadow").maybeSingle();
  console.log(`✓ coach profile + 2 IPTPA certs + 5 dev steps + 64h logged + 5 shadow sessions + eval (shadow step: ${doneStep?.status}${doneStep?.auto_completed ? " auto" : ""})`);

  console.log("\n=== DONE — IPTPA demo content seeded ===");
  if (playerLogin) console.log(`PLAYER login: ${playerLogin.email} / ${playerLogin.password}`);
  if (coachLogin) console.log(`COACH login:  ${coachLogin.email} / ${coachLogin.password}`);
  if (!playerLogin && !coachLogin) console.log("(reused existing demo player/coach; logins from the earlier seed run.)");
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
