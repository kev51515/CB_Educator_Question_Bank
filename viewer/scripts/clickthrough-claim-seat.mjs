#!/usr/bin/env node
/**
 * clickthrough-claim-seat.mjs — end-to-end check of migration 0095
 * (claim_student_seat + decide_seat_claim_request).
 *
 * Bootstraps a disposable teacher + course + pre-created managed seat ("Bob"),
 * then walks the real student journeys:
 *   1. First claim of "XXXXXX-01" → status 'claimed'; the seat now signs in with
 *      the student's own email+password; teacher-owned name is preserved.
 *   2. Second claim (different email) → status 'pending' + a seat_claim_requests
 *      row the teacher can read + a teacher notification.
 *   3. Teacher APPROVES → seat sign-in resets to the new email+password; the old
 *      email no longer works (credential recovery, same profile/work).
 *   4. A further request DENIED → requester can't sign in; approved one still can.
 *
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY (root .env).
 * Self-cleans all created auth users + course on the way out.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const missing = [];
if (!SUPABASE_URL) missing.push("SUPABASE_URL");
if (!SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY");
if (!SUPABASE_SERVICE_KEY) missing.push("SUPABASE_SERVICE_KEY");
if (missing.length) {
  console.error(`ERROR: missing required env vars: ${missing.join(", ")}`);
  process.exit(2);
}

const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
function makeUserClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const TS = Date.now();
const PASSWORD = "Smoke!" + randomBytes(4).toString("hex");
const teacherEmail = `claim-teacher-${TS}@example.com`;
const BOB1 = `claim-bob1-${TS}@example.com`;
const BOB2 = `claim-bob2-${TS}@example.com`;
const BOB3 = `claim-bob3-${TS}@example.com`;
const BOB_PW1 = "bobpass-" + randomBytes(3).toString("hex");
const BOB_PW2 = "bobpass-" + randomBytes(3).toString("hex");
const BOB_PW3 = "bobpass-" + randomBytes(3).toString("hex");

const ctx = {
  teacherId: null,
  courseId: null,
  seatId: null,
  loginCode: null,
  anonIds: [],
};
const results = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function step(name, fn) {
  const t0 = Date.now();
  process.stdout.write(`\n▶ ${name} ... `);
  try {
    const note = await fn();
    const ms = Date.now() - t0;
    results.push({ name, status: "PASS", ms, note: note || null });
    process.stdout.write(`PASS (${ms}ms)${note ? ` — ${note}` : ""}`);
  } catch (err) {
    const ms = Date.now() - t0;
    results.push({ name, status: "FAIL", ms, note: err.message });
    process.stdout.write(`FAIL (${ms}ms) — ${err.message}`);
  }
}

async function signInAnon() {
  const c = makeUserClient();
  const { data, error } = await c.auth.signInAnonymously();
  if (error) throw new Error(`signInAnonymously: ${error.message}`);
  ctx.anonIds.push(data.user.id);
  return c;
}
async function claim(client, code, email, pw) {
  const { data, error } = await client.rpc("claim_student_seat", {
    p_code: code,
    p_email: email,
    p_password: pw,
  });
  if (error) throw new Error(`claim_student_seat: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return row;
}
async function canSignIn(email, pw) {
  const c = makeUserClient();
  const { error } = await c.auth.signInWithPassword({ email, password: pw });
  return !error;
}

async function run() {
  await step("bootstrap teacher + course", async () => {
    const { data: created, error } = await service.auth.admin.createUser({
      email: teacherEmail,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Claim Teacher" },
    });
    if (error) throw new Error(`createUser(teacher): ${error.message}`);
    ctx.teacherId = created.user.id;
    const { error: roleErr } = await service
      .from("profiles")
      .update({ role: "teacher" })
      .eq("id", ctx.teacherId);
    if (roleErr) throw new Error(`promote teacher: ${roleErr.message}`);

    const { data: course, error: cErr } = await service
      .from("courses")
      .insert({
        teacher_id: ctx.teacherId,
        name: `Claim Smoke ${TS}`,
        join_code: `CLM${randomBytes(2).toString("hex").toUpperCase()}`,
      })
      .select("id, short_code")
      .single();
    if (cErr) throw new Error(`insert course: ${cErr.message}`);
    ctx.courseId = course.id;
    return `course=${course.id.slice(0, 8)} short=${course.short_code}`;
  });

  await step("teacher pre-creates seat 'Bob'", async () => {
    const tc = makeUserClient();
    const { error: siErr } = await tc.auth.signInWithPassword({
      email: teacherEmail,
      password: PASSWORD,
    });
    if (siErr) throw new Error(`teacher signin: ${siErr.message}`);
    const { data, error } = await tc.rpc("admin_create_student", {
      p_course_id: ctx.courseId,
      p_display_name: "Bob",
      p_password: "temp-" + randomBytes(3).toString("hex"),
    });
    if (error) throw new Error(`admin_create_student: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    ctx.seatId = row.student_id;
    ctx.loginCode = row.login_code;
    assert(/^[A-HJ-NP-Z2-9]{6}-\d{2,}$/.test(ctx.loginCode), `bad login_code ${ctx.loginCode}`);
    return `seat=${ctx.seatId.slice(0, 8)} code=${ctx.loginCode}`;
  });

  await step("first claim → 'claimed'", async () => {
    const c = await signInAnon();
    const row = await claim(c, ctx.loginCode, BOB1, BOB_PW1);
    assert(row && row.status === "claimed", `expected claimed, got ${JSON.stringify(row)}`);
    assert((row.login_email || "").toLowerCase() === BOB1, `login_email=${row.login_email}`);
    return `status=claimed email=${row.login_email}`;
  });

  await step("claimed seat signs in; name preserved; claimed_at set", async () => {
    const c = makeUserClient();
    const { error } = await c.auth.signInWithPassword({ email: BOB1, password: BOB_PW1 });
    if (error) throw new Error(`sign in as claimed seat: ${error.message}`);
    const { data: prof, error: pErr } = await service
      .from("profiles")
      .select("display_name, email, claimed_at, managed")
      .eq("id", ctx.seatId)
      .single();
    if (pErr) throw new Error(`profile read: ${pErr.message}`);
    assert(prof.display_name === "Bob", `name changed to ${prof.display_name}`);
    assert((prof.email || "").toLowerCase() === BOB1, `profile email=${prof.email}`);
    assert(prof.claimed_at != null, "claimed_at not set");
    assert(prof.managed === true, "managed flipped off");
    return "name=Bob, email swapped, claimed_at set";
  });

  await step("second claim → 'pending' + request row + teacher notified", async () => {
    const c = await signInAnon();
    const row = await claim(c, ctx.loginCode, BOB2, BOB_PW2);
    assert(row && row.status === "pending", `expected pending, got ${JSON.stringify(row)}`);
    const { data: reqs, error } = await service
      .from("seat_claim_requests")
      .select("id, status, requested_email")
      .eq("seat_id", ctx.seatId)
      .eq("status", "pending");
    if (error) throw new Error(`req read: ${error.message}`);
    assert(reqs.length === 1, `expected 1 pending req, got ${reqs.length}`);
    assert((reqs[0].requested_email || "").toLowerCase() === BOB2, `req email=${reqs[0].requested_email}`);
    const { data: notes } = await service
      .from("notifications")
      .select("id")
      .eq("recipient_id", ctx.teacherId)
      .eq("kind", "seat_claim_request");
    assert(notes && notes.length >= 1, "teacher notification missing");
    return `pending req=${reqs[0].id.slice(0, 8)}, teacher notified`;
  });

  await step("teacher rejects unauthorized decide (other teacher)", async () => {
    // A fresh anon (non-teacher) must NOT be able to decide.
    const { data: reqs } = await service
      .from("seat_claim_requests")
      .select("id")
      .eq("seat_id", ctx.seatId)
      .eq("status", "pending")
      .single();
    const c = await signInAnon();
    const { error } = await c.rpc("decide_seat_claim_request", {
      p_request_id: reqs.id,
      p_approve: true,
    });
    assert(error != null, "non-teacher was allowed to decide");
    assert(/not_authorized/i.test(error.message), `unexpected error ${error.message}`);
    return "non-teacher decide blocked (not_authorized)";
  });

  await step("teacher APPROVES → credentials reset to BOB2", async () => {
    const tc = makeUserClient();
    await tc.auth.signInWithPassword({ email: teacherEmail, password: PASSWORD });
    const { data: reqs } = await service
      .from("seat_claim_requests")
      .select("id")
      .eq("seat_id", ctx.seatId)
      .eq("status", "pending")
      .single();
    const { data, error } = await tc.rpc("decide_seat_claim_request", {
      p_request_id: reqs.id,
      p_approve: true,
    });
    if (error) throw new Error(`decide(approve): ${error.message}`);
    assert(data === "approved", `expected approved, got ${data}`);
    assert(await canSignIn(BOB2, BOB_PW2), "BOB2 cannot sign in after approve");
    assert(!(await canSignIn(BOB1, BOB_PW1)), "BOB1 still signs in after email change");
    return "BOB2 active, BOB1 retired";
  });

  await step("further request DENIED → requester locked out, BOB2 intact", async () => {
    const c = await signInAnon();
    const row = await claim(c, ctx.loginCode, BOB3, BOB_PW3);
    assert(row.status === "pending", `expected pending, got ${row.status}`);
    const tc = makeUserClient();
    await tc.auth.signInWithPassword({ email: teacherEmail, password: PASSWORD });
    const { data: reqs } = await service
      .from("seat_claim_requests")
      .select("id")
      .eq("seat_id", ctx.seatId)
      .eq("status", "pending")
      .single();
    const { data, error } = await tc.rpc("decide_seat_claim_request", {
      p_request_id: reqs.id,
      p_approve: false,
    });
    if (error) throw new Error(`decide(deny): ${error.message}`);
    assert(data === "denied", `expected denied, got ${data}`);
    assert(!(await canSignIn(BOB3, BOB_PW3)), "BOB3 signs in despite denial");
    assert(await canSignIn(BOB2, BOB_PW2), "BOB2 broke after a denial");
    return "BOB3 denied, BOB2 still active";
  });

  await step("cleanup", async () => {
    await service.from("seat_claim_requests").delete().eq("seat_id", ctx.seatId);
    await service.from("notifications").delete().eq("recipient_id", ctx.teacherId);
    if (ctx.courseId) await service.from("courses").delete().eq("id", ctx.courseId);
    const toDelete = [ctx.seatId, ctx.teacherId, ...ctx.anonIds].filter(Boolean);
    for (const id of toDelete) {
      try {
        await service.auth.admin.deleteUser(id);
      } catch {
        /* best effort */
      }
    }
    return `removed ${toDelete.length} users + course`;
  });
}

run().then(() => {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log("\n\n========== CLAIM_SEAT_RESULT ==========");
  for (const r of results) {
    console.log(`[${r.status}] ${r.name}  (${r.ms}ms)${r.note ? `\n         ${r.note}` : ""}`);
  }
  console.log("---------------------------------------");
  console.log(`TOTAL: ${results.length}  PASS: ${pass}  FAIL: ${fail}`);
  console.log("=======================================");
  process.exit(fail > 0 ? 1 : 0);
});
