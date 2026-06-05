#!/usr/bin/env node
/**
 * concurrent-test-load.mjs
 *
 * Launch-readiness CONCURRENCY harness. Simulates N students taking the SAME
 * full DSAT practice test (dsat-nov-2023) AT THE SAME TIME, to surface
 * pooler-connection exhaustion, RLS-query latency, and submit-race problems
 * BEFORE real students hit the system on launch day.
 *
 * It runs against the REMOTE / prod Supabase project (whatever SUPABASE_URL
 * points to — same env contract as the clickthrough + smoke scripts) and it
 * SELF-CLEANS: every disposable student, course, module, membership and the
 * test runs they create are torn down in a finally block, even on failure.
 *
 * Flow (mirrors clickthrough-practice-test.mjs's RPC sequence):
 *   Phase 1 (serial, untimed): provision N students + a course per student
 *     with an enrolment + a module_items link to /test/<slug> (the course-scope
 *     rows the 0090 release path needs), and one shared admin proctor.
 *   Phase 2 (concurrent, timed): Promise.allSettled over all N students. Each
 *     signs in, start_test, answers up to K questions per module, advances
 *     through every module, and submits the final module. Per-student wall-clock
 *     + first error are recorded.
 *   Phase 3 (assert): count succeeded/failed; for a sample of winners, re-read
 *     a submitted module via get_test_module and confirm saved answers
 *     round-trip (mirrors how clickthrough verifies resume state).
 *   Phase 4 (always): cleanup ALL created ids.
 *
 * Usage:
 *   node --env-file-if-exists=../.env scripts/concurrent-test-load.mjs --n=15 --questions=8
 *   npm run loadtest -- --n=20            # once wired into package.json
 *
 * Args:
 *   --n=<int>          number of concurrent students (default 15)
 *   --questions=<int>  cap answers PER MODULE so a smoke run is fast (default 8;
 *                      we still advance/submit every module — full 98-question
 *                      completion is NOT required; the point is contention).
 *
 * Exit code 0 only if all N students succeeded.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

// ---------- Env ----------
const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const missing = [];
if (!URL) missing.push("SUPABASE_URL");
if (!ANON) missing.push("SUPABASE_ANON_KEY");
if (!SERVICE) missing.push("SUPABASE_SERVICE_KEY");
if (missing.length) {
  console.error("ERROR: missing env:", missing.join(", "));
  process.exit(2);
}

// ---------- Args ----------
function argInt(name, dflt) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const v = parseInt(hit.split("=")[1], 10);
  return Number.isFinite(v) && v > 0 ? v : dflt;
}
const N = argInt("n", 15);
const QCAP = argInt("questions", 8);

const SLUG = "dsat-nov-2023";
const TS = Date.now();
const TAG = `load-${TS}`;
const PW = "LoadTest!" + randomBytes(4).toString("hex");
const teacherEmail = `lt-admin-${TAG}@gmail.com`;

// ---------- Clients ----------
const service = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
function userClient() {
  return createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------- Logging ----------
function ok(label, extra = "") {
  console.log(`  ok:   ${label}${extra ? "  " + extra : ""}`);
}
function fail(label, detail = "") {
  console.log(`  fail: ${label}${detail ? "  " + detail : ""}`);
}
function info(label, detail = "") {
  console.log(`  ..    ${label}${detail ? "  " + detail : ""}`);
}
function step(label) {
  console.log(`\n=== ${label} ===`);
}

// ---------- Created-id ledger (drives cleanup) ----------
const ctx = {
  teacherId: null,
  students: [], // { idx, email, id, courseId }
};

async function createUser(email, role) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  const uid = data.user.id;
  if (role !== "student") {
    const { error: upErr } = await service
      .from("profiles")
      .update({ role })
      .eq("id", uid);
    if (upErr) throw new Error(`promote(${email}): ${upErr.message}`);
  }
  return uid;
}

async function signIn(email) {
  const c = userClient();
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return c;
}

// Build the per-student course scaffolding the 0090 release path needs:
// a course owned by the admin proctor, the student enrolled, and a
// module_items link pointing at /test/<slug>. Mirrors clickthrough setup.
async function provisionStudent(idx) {
  const email = `lt-s${idx}-${TAG}@gmail.com`;
  const id = await createUser(email, "student");

  const { data: courseRow, error: courseErr } = await service
    .from("courses")
    .insert({ name: `Load-${TAG}-${idx}`, teacher_id: ctx.teacherId })
    .select("id")
    .single();
  if (courseErr) throw new Error(`course[${idx}]: ${courseErr.message}`);
  const courseId = courseRow.id;

  const { error: memErr } = await service
    .from("course_memberships")
    .insert({ course_id: courseId, student_id: id });
  if (memErr) throw new Error(`enroll[${idx}]: ${memErr.message}`);

  const { data: modRow, error: modErr } = await service
    .from("course_modules")
    .insert({ course_id: courseId, name: "Practice Tests", position: 1 })
    .select("id")
    .single();
  if (modErr) throw new Error(`module[${idx}]: ${modErr.message}`);

  const { error: miErr } = await service
    .from("module_items")
    .insert({
      module_id: modRow.id,
      item_type: "link",
      title: "DSAT Nov 2023",
      url: `/test/${SLUG}`,
      position: 1,
    });
  if (miErr) throw new Error(`module_item[${idx}]: ${miErr.message}`);

  return { idx, email, id, courseId };
}

// ---------- Phase 2: one student's concurrent test-taking flow ----------
function pickAnswer(q) {
  return q.type === "grid" ? "1" : "A";
}

// Returns { ok, ms, error, runId, lastModulePos, lastModuleAnswers }
async function runStudent(stu) {
  const t0 = Date.now();
  const out = {
    idx: stu.idx,
    ok: false,
    ms: 0,
    error: null,
    runId: null,
    lastModulePos: null,
    lastModuleAnswers: null,
  };
  try {
    const client = await signIn(stu.email);

    const { data: start, error: startErr } = await client.rpc("start_test", {
      p_slug: SLUG,
    });
    if (startErr) throw new Error(`start_test: ${startErr.message}`);
    if (!start?.run_id || !Array.isArray(start.modules) || !start.modules.length) {
      throw new Error(`start_test bad shape: ${JSON.stringify(start)}`);
    }
    out.runId = start.run_id;

    const modules = start.modules.slice().sort((a, b) => a.position - b.position);
    for (const m of modules) {
      const { data: mod, error: mErr } = await client.rpc("get_test_module", {
        p_run_id: out.runId,
        p_position: m.position,
      });
      if (mErr) throw new Error(`get_test_module(${m.position}): ${mErr.message}`);
      if (!mod || !Array.isArray(mod.questions)) {
        throw new Error(`get_test_module(${m.position}) no questions[]`);
      }

      // Answer up to QCAP questions for this module (correctness of contention,
      // not of completion). submit_test_module accepts a partial answer map.
      const answers = {};
      for (const q of mod.questions.slice(0, QCAP)) {
        answers[q.id] = pickAnswer(q);
      }

      const { data: sub, error: subErr } = await client.rpc(
        "submit_test_module",
        { p_run_id: out.runId, p_position: m.position, p_answers: answers }
      );
      if (subErr) throw new Error(`submit_test_module(${m.position}): ${subErr.message}`);

      const isLast = m.position === modules[modules.length - 1].position;
      if (isLast) {
        if (sub?.finished !== true) {
          throw new Error(`final submit not finished: ${JSON.stringify(sub)}`);
        }
        out.lastModulePos = m.position;
        out.lastModuleAnswers = answers;
      } else if (sub?.next_module !== m.position + 1) {
        throw new Error(
          `submit(${m.position}) next_module=${sub?.next_module} (expected ${m.position + 1})`
        );
      }
    }
    out.ok = true;
  } catch (e) {
    out.error = e && e.message ? e.message : String(e);
  } finally {
    out.ms = Date.now() - t0;
  }
  return out;
}

// ---------- Phase 3: verify a sample's answers round-trip ----------
// Reads persisted rows straight from test_run_answers via the service client.
// (We deliberately do NOT use get_test_module here: with a small --questions cap
// each student completes every module, so the run is already `submitted` and the
// in-progress reader returns run_already_submitted. Reading the table directly
// verifies the concurrent writes actually landed, regardless of run state.)
async function verifySample(stu, runId, modPos, expectedAnswers) {
  try {
    const { data: rows, error } = await service
      .from("test_run_answers")
      .select("question_id, chosen")
      .eq("run_id", runId)
      .eq("module_position", modPos);
    if (error) return { ok: false, detail: `read test_run_answers: ${error.message}` };
    const saved = {};
    for (const r of rows || []) saved[r.question_id] = r.chosen;
    let mismatch = 0;
    for (const [qid, ans] of Object.entries(expectedAnswers)) {
      if (String(saved[qid] ?? "").trim() !== String(ans).trim()) mismatch++;
    }
    if (mismatch > 0) {
      return {
        ok: false,
        detail: `${mismatch}/${Object.keys(expectedAnswers).length} answers did not round-trip`,
      };
    }
    return { ok: true, detail: `${Object.keys(expectedAnswers).length} answers round-trip` };
  } catch (e) {
    return { ok: false, detail: e.message || String(e) };
  }
}

// ---------- Stats ----------
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))];
}

// ---------- Cleanup (id-driven, always runs) ----------
async function cleanup() {
  step("Cleanup");
  const tryDel = async (label, fn) => {
    try {
      await fn();
      ok(label);
    } catch (e) {
      info(`WARN ${label}`, e.message || String(e));
    }
  };

  // Delete each student's course first (test_runs/answers + memberships +
  // modules cascade from the course; the proctor FK is ON DELETE RESTRICT so
  // the course must go before the admin user).
  for (const s of ctx.students) {
    if (!s.courseId) continue;
    await tryDel(`course ${s.courseId} (student ${s.idx})`, async () => {
      // best-effort detach children that may not cascade
      await service.from("module_items").delete().eq("url", `/test/${SLUG}`)
        .in("module_id",
          (await service.from("course_modules").select("id").eq("course_id", s.courseId))
            .data?.map((r) => r.id) || []);
      await service.from("course_modules").delete().eq("course_id", s.courseId);
      await service.from("course_memberships").delete().eq("course_id", s.courseId);
      await service.from("assignments").delete().eq("course_id", s.courseId);
      const { error } = await service.from("courses").delete().eq("id", s.courseId);
      if (error) throw error;
    });
  }

  // Then the disposable users (cascades remove profiles, test_runs, answers).
  for (const s of ctx.students) {
    if (!s.id) continue;
    await tryDel(`student user ${s.idx} (${s.id})`, async () => {
      const { error } = await service.auth.admin.deleteUser(s.id);
      if (error) throw error;
    });
  }
  if (ctx.teacherId) {
    await tryDel(`admin proctor (${ctx.teacherId})`, async () => {
      const { error } = await service.auth.admin.deleteUser(ctx.teacherId);
      if (error) throw error;
    });
  }
}

// ---------- Main ----------
async function main() {
  console.log(`Concurrent test-load vs ${URL}`);
  console.log(`tag=${TAG} slug=${SLUG} N=${N} questions/module=${QCAP}`);
  if (N > 50) {
    console.log(
      `\n  WARNING: N=${N} > 50. The Supabase pooler has a limited connection\n` +
      `  count; very large N can saturate it and produce false failures that\n` +
      `  reflect the harness, not prod. Treat results above ~50 with care.\n`
    );
  }

  let exitCode = 2;
  try {
    // -------- Phase 1: provision (serial, untimed) --------
    step("Phase 1 — provision (serial)");
    ctx.teacherId = await createUser(teacherEmail, "admin");
    info("admin proctor", `${teacherEmail} id=${ctx.teacherId}`);
    for (let i = 0; i < N; i++) {
      const s = await provisionStudent(i);
      ctx.students.push(s);
    }
    ok(`provisioned ${ctx.students.length} students + courses`);

    // -------- Phase 2: concurrent test-taking (timed) --------
    step("Phase 2 — concurrent test-taking (timed)");
    const wallStart = Date.now();
    const settled = await Promise.allSettled(ctx.students.map((s) => runStudent(s)));
    const wallMs = Date.now() - wallStart;

    const runs = settled.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : {
            idx: ctx.students[i].idx,
            ok: false,
            ms: 0,
            error: `allSettled-rejected: ${r.reason?.message || r.reason}`,
            runId: null,
            lastModulePos: null,
            lastModuleAnswers: null,
          }
    );

    const succeeded = runs.filter((r) => r.ok);
    const failed = runs.filter((r) => !r.ok);
    ok(`wall-clock for all ${N} concurrent flows`, `${wallMs}ms`);
    info("succeeded", String(succeeded.length));
    info("failed", String(failed.length));

    // -------- Phase 3: verify a sample round-trips --------
    step("Phase 3 — verify sample round-trips");
    const sample = succeeded.slice(0, Math.min(3, succeeded.length));
    if (!sample.length) {
      fail("no successful runs to sample", "skipping round-trip verify");
    }
    for (const r of sample) {
      const stu = ctx.students.find((s) => s.idx === r.idx);
      const v = await verifySample(stu, r.runId, r.lastModulePos, r.lastModuleAnswers);
      if (v.ok) ok(`student ${r.idx} round-trip`, v.detail);
      else fail(`student ${r.idx} round-trip`, v.detail);
    }

    // -------- Final summary block --------
    const lats = runs.filter((r) => r.ms > 0).map((r) => r.ms).sort((a, b) => a - b);
    const p50 = percentile(lats, 50);
    const p95 = percentile(lats, 95);
    const max = lats.length ? lats[lats.length - 1] : 0;

    const errCounts = new Map();
    for (const r of failed) {
      const key = r.error || "<unknown>";
      errCounts.set(key, (errCounts.get(key) || 0) + 1);
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log("LOAD_RESULT");
    console.log(`  N (concurrent)   : ${N}`);
    console.log(`  questions/module : ${QCAP}`);
    console.log(`  succeeded        : ${succeeded.length}`);
    console.log(`  failed           : ${failed.length}`);
    console.log(`  wall-clock total : ${wallMs}ms`);
    console.log(`  latency p50      : ${p50}ms`);
    console.log(`  latency p95      : ${p95}ms`);
    console.log(`  latency max      : ${max}ms`);
    if (errCounts.size) {
      console.log(`  distinct errors  :`);
      for (const [msg, count] of [...errCounts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    [${count}x] ${msg}`);
      }
    } else {
      console.log(`  distinct errors  : none`);
    }
    console.log("=".repeat(60));

    exitCode = failed.length === 0 ? 0 : 1;
  } catch (e) {
    console.error("FATAL during run:", e.message || e);
    exitCode = 2;
  } finally {
    await cleanup();
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("FATAL:", err);
  // Best-effort cleanup even on an unexpected throw outside the try.
  cleanup().finally(() => process.exit(2));
});
