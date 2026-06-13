#!/usr/bin/env node
/**
 * _add-class28a-students.mjs  (WRITE — prod auth)
 *
 * Provisions the 11 Pacific American students for course "'28 Class A"
 * (short_code PG7XBY, owned by Kevin Yao / kevyao@gmail.com).
 *
 * Mirrors admin_create_student (0150) exactly, but driven by the service-role
 * admin API so each seat is created with the student's REAL @pacificamerican.org
 * email up-front (no synthetic @students.local → rewrite round-trip):
 *   1. auth.admin.createUser({ email, password, email_confirm:true })  (+ identity)
 *   2. profiles  → display_name, managed=true, role='student', unique login_code
 *   3. course_memberships → roster_code = login_code, roster_seq = max(live)+1
 *   4. audit_events → actor = course teacher, action 'student.create'
 *
 * Login code = 6 DISTINCT uppercase letters from A–Z minus I/L/O/Q
 * (alphabet ABCDEFGHJKMNPRSTUVWXYZ), the same generator as 0150. It is the
 * student's primary credential (passwordless code login); the password is a
 * generated fallback, printed once below.
 *
 * Idempotent: a student whose email already exists is skipped.
 * Dry run by default; pass --apply to write.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");

const COURSE_SHORT_CODE = "PG7XBY"; // '28 Class A
const ALPHABET = "ABCDEFGHJKMNPRSTUVWXYZ"; // A–Z minus I, L, O, Q (matches 0150)

// Display name → real login email. Order = roster order.
const STUDENTS = [
  ["Alfonso Tsao", "alfonsotsao@pacificamerican.org"],
  ["Derek Hsiao", "derekhsiao@pacificamerican.org"],
  ["Katherine Yu", "katherineyu@pacificamerican.org"],
  ["Kirby Ko", "kirbyko@pacificamerican.org"],
  ["Monica Lin", "monicalin@pacificamerican.org"],
  ["Owen Liao", "owenliao@pacificamerican.org"],
  ["Roselyn Lee", "roselynlee@pacificamerican.org"],
  ["Sunnie Hsu", "sunniehsu@pacificamerican.org"],
  ["Tyrone Chuan", "tyronechuan@pacificamerican.org"],
  ["Victor Lu", "victorlu@pacificamerican.org"],
  ["Jin Fu", "jinfu@pacificamerican.org"],
];

function genPassword() {
  // 10 chars, alnum, avoids ambiguous 0/O/1/l/I
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPRSTUVWXYZ23456789";
  let p = "";
  for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

function genCode(taken) {
  for (let attempt = 0; attempt < 5000; attempt++) {
    const letters = ALPHABET.split("");
    // pick 6 distinct, shuffled
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    const code = letters.slice(0, 6).join("");
    if (!taken.has(code)) { taken.add(code); return code; }
  }
  throw new Error("could not generate a unique login code");
}

console.log(APPLY ? "=== APPLYING (writing to prod) ===" : "=== DRY RUN (pass --apply to write) ===");

// Resolve course + owner
const { data: course, error: ce } = await db
  .from("courses")
  .select("id, name, teacher_id, deleted_at")
  .eq("short_code", COURSE_SHORT_CODE)
  .single();
if (ce || !course) { console.error(`✗ course ${COURSE_SHORT_CODE} not found: ${ce?.message}`); process.exit(1); }
if (course.deleted_at) { console.error(`✗ course ${course.name} is in trash — aborting`); process.exit(1); }
console.log(`Course: ${course.name}  (id ${course.id})  teacher ${course.teacher_id}\n`);

// Preload taken login codes + current max roster_seq for this course
const { data: codeRows } = await db.from("profiles").select("login_code").not("login_code", "is", null);
const takenCodes = new Set((codeRows || []).map((r) => r.login_code));
const { data: memRows } = await db
  .from("course_memberships")
  .select("roster_seq")
  .eq("course_id", course.id)
  .order("roster_seq", { ascending: false });
let nextSeq = (memRows?.[0]?.roster_seq ?? 0) + 1;

const results = [];
let created = 0, skipped = 0, errors = 0;

for (const [name, email] of STUDENTS) {
  // Idempotency: if a profile with this email already exists, PROMOTE it to a
  // managed seat (fill name/code/managed where missing) and ensure enrollment,
  // rather than create a duplicate auth user.
  const { data: existing } = await db
    .from("profiles")
    .select("id, display_name, login_code, managed")
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    const code = existing.login_code || genCode(takenCodes);
    const { data: mem } = await db
      .from("course_memberships")
      .select("id").eq("course_id", course.id).eq("student_id", existing.id).maybeSingle();
    const needsPromote = !existing.managed || !existing.login_code || !existing.display_name;
    console.log(`• ${name.padEnd(16)} ${email.padEnd(40)} exists → promote=${needsPromote} code ${code}${mem ? " (enrolled)" : " (enrolling)"}`);
    if (APPLY) {
      if (needsPromote) {
        await db.from("profiles").update({
          display_name: existing.display_name || name,
          login_code: code,
          managed: true,
          role: "student",
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      }
      if (!mem) {
        const seq = nextSeq++;
        await db.from("course_memberships").insert({ course_id: course.id, student_id: existing.id, roster_code: code, roster_seq: seq });
      }
    }
    results.push({ name, email, code, password: "(existing account — password unchanged)" });
    skipped++; continue;
  }

  const code = genCode(takenCodes);
  const password = genPassword();
  const seq = nextSeq++;

  if (!APPLY) {
    console.log(`+ ${name.padEnd(16)} ${email.padEnd(40)} code ${code}  seq ${seq}`);
    results.push({ name, email, code, password: "(dry-run)" });
    continue;
  }

  // 1. Create the auth user with the real email + confirmed.
  const { data: cu, error: e1 } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name, role: "student" },
  });
  if (e1 || !cu?.user) { console.error(`✗ ${name}: createUser — ${e1?.message}`); errors++; continue; }
  const uid = cu.user.id;

  // 2. Promote profile to a managed seat (trigger already inserted the base row).
  const { error: e2 } = await db.from("profiles")
    .update({ display_name: name, login_code: code, managed: true, role: "student", updated_at: new Date().toISOString() })
    .eq("id", uid);
  if (e2) { console.error(`✗ ${name}: profile update — ${e2.message}`); errors++; continue; }

  // 3. Enroll.
  const { error: e3 } = await db.from("course_memberships")
    .insert({ course_id: course.id, student_id: uid, roster_code: code, roster_seq: seq });
  if (e3) { console.error(`✗ ${name}: enroll — ${e3.message}`); errors++; continue; }

  // 4. Audit (actor = course teacher, matching the RPC's contract).
  await db.from("audit_events").insert({
    actor_id: course.teacher_id,
    action: "student.create",
    target_kind: "profile",
    target_id: uid,
    details: { course_id: course.id, roster_code: code, via: "_add-class28a-students.mjs" },
  });

  console.log(`✓ ${name.padEnd(16)} ${email.padEnd(40)} code ${code}  seq ${seq}`);
  results.push({ name, email, code, password });
  created++;
}

console.log(`\n=== ${APPLY ? "DONE" : "DRY RUN"}: ${created} created, ${skipped} skipped, ${errors} errors ===`);
if (APPLY && results.length) {
  console.log("\n=== HAND-OUT (login code is the primary credential) ===");
  console.log("Name              Login code   Email                                    Password");
  for (const r of results) console.log(`${r.name.padEnd(17)} ${r.code.padEnd(12)} ${r.email.padEnd(40)} ${r.password}`);
}
if (errors) process.exit(1);
