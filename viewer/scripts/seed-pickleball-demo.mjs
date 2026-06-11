#!/usr/bin/env node
/**
 * seed-pickleball-demo.mjs
 *
 * Sets up a testable pickleball environment on the live DB:
 *   - sets kevyao@gmail.com's domain to 'coaching' (Coach chrome by default)
 *   - creates a demo Player course + Coach course owned by kevyao (with a
 *     program each + a lesson/profile so surfaces aren't empty)
 *   - creates a disposable demo PLAYER (student) enrolled in the Player course
 *     so the student/player side can be tested, and prints its login.
 *
 * Idempotent-ish: re-uses demo courses by name if they already exist.
 * Run: cd viewer && node --env-file=../.env scripts/seed-pickleball-demo.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE) { console.error("missing SUPABASE_URL / SUPABASE_SERVICE_KEY"); process.exit(2); }
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const OWNER_EMAIL = "kevyao@gmail.com";
const PLAYER_NAME = "Pickleball Demo — Players";
const COACH_NAME = "Pickleball Demo — Coaches";

async function getCourse(name, owner, type) {
  const { data } = await svc.from("courses").select("id, short_code").eq("name", name).eq("teacher_id", owner).maybeSingle();
  if (data) return data;
  const { data: ins, error } = await svc.from("courses").insert({ name, teacher_id: owner, course_type: type }).select("id, short_code").single();
  if (error) throw new Error(`course ${name}: ${error.message}`);
  return ins;
}
async function ensureProgram(courseId, name) {
  const { data } = await svc.from("pickleball_programs").select("id").eq("course_id", courseId).eq("name", name).maybeSingle();
  if (data) return data.id;
  const { data: ins, error } = await svc.from("pickleball_programs").insert({ course_id: courseId, name }).select("id").single();
  if (error) throw new Error(`program: ${error.message}`);
  return ins.id;
}

async function main() {
  // 1) owner + domain
  const { data: owner, error: oe } = await svc.from("profiles").select("id, role, domain").eq("email", OWNER_EMAIL).single();
  if (oe) throw new Error(`owner lookup: ${oe.message}`);
  await svc.from("profiles").update({ domain: "coaching" }).eq("id", owner.id);
  console.log(`✓ ${OWNER_EMAIL}: role=${owner.role}, domain -> coaching`);

  // 2) demo courses + programs
  const pc = await getCourse(PLAYER_NAME, owner.id, "pickleball_player");
  const cc = await getCourse(COACH_NAME, owner.id, "pickleball_coach");
  const prog = await ensureProgram(pc.id, "Newbie");
  await ensureProgram(pc.id, "Level Up");
  await ensureProgram(cc.id, "Coach Track");
  console.log(`✓ Player course ${pc.short_code} (id ${pc.id})  +  Coach course ${cc.short_code} (id ${cc.id})`);

  // 3) disposable demo PLAYER enrolled in the player course
  const tag = randomBytes(3).toString("hex");
  const email = `pb-player-${tag}@gmail.com`;
  const password = "PbPlayer!" + randomBytes(4).toString("hex");
  const { data: u, error: ue } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (ue) throw new Error(`createUser: ${ue.message}`);
  const pid = u.user.id;
  await svc.from("profiles").update({ display_name: "Demo Player" }).eq("id", pid);
  await svc.from("course_memberships").insert({ course_id: pc.id, student_id: pid });
  // a player profile + an upcoming lesson so the player surfaces show data
  await svc.from("pickleball_player_profiles").insert({ course_id: pc.id, student_id: pid, goal: "fitness", dupr: 3.0, years_played: 1 });
  await svc.from("pickleball_lessons").insert({ course_id: pc.id, player_id: pid, coach_id: owner.id, program_id: prog, scheduled_at: new Date(Date.now() + 2 * 864e5).toISOString(), status: "scheduled", plan_md: "Warm up, then dink consistency drills." });
  console.log(`✓ Demo player enrolled in ${pc.short_code}`);

  console.log("\n=== TEST LOGINS ===");
  console.log(`COACH/ADMIN side: sign in as ${OWNER_EMAIL} (admin). Domain defaults to Coach (orange). Open either demo course to see the pickleball tabs.`);
  console.log(`PLAYER side:      ${email}  /  ${password}   (enrolled in "${PLAYER_NAME}")`);
  console.log("\n(Player login is disposable — re-run to mint a fresh one.)");
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
