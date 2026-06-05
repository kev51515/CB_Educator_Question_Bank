#!/usr/bin/env node
/**
 * live-test-backup.mjs — frequent, independent backup of LIVE test data.
 * =====================================================================
 * Daily backups aren't enough while students are sitting a test: a sitting can
 * span an hour and you don't want to lose more than a few minutes of recorded
 * answers. This snapshots the *active* test-session rows
 * (`test_runs` + `test_run_answers` for in-progress / just-finished runs) every
 * few minutes and uploads a gzipped JSON copy to a private Supabase Storage
 * bucket you control — an off-database copy on top of Supabase Pro's
 * point-in-time recovery.
 *
 * It's deliberately LIGHTWEIGHT (only live rows, via the service key + the REST
 * API — no pg_dump, no DB-version coupling) and a cheap no-op when no test is in
 * session, so you can just leave it running during a test window (you're at the
 * machine proctoring anyway).
 *
 * Run:
 *   # loop forever, snapshot every 5 min (default):
 *   node --env-file-if-exists=../.env scripts/live-test-backup.mjs
 *   # single snapshot (for a cron line that fires every 5 minutes):
 *   node --env-file-if-exists=../.env scripts/live-test-backup.mjs --once
 *   # custom cadence:
 *   node --env-file-if-exists=../.env scripts/live-test-backup.mjs --interval=3
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (root ../.env). Bucket auto-created.
 *
 * Restore: download a snapshot, gunzip, and re-insert the `test_runs` /
 * `test_run_answers` arrays with the service key (they carry their own ids).
 */
import { createClient } from "@supabase/supabase-js";
import { gzipSync } from "node:zlib";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE) {
  console.error("live-test-backup: missing SUPABASE_URL / SUPABASE_SERVICE_KEY (root ../.env).");
  process.exit(2);
}

const BUCKET = "db-backups";
const PREFIX = "live-tests";
// "Active" window: in-progress runs, plus runs submitted in the last few hours
// so a just-finished sitting's final answers are still captured.
const RECENT_SUBMIT_HOURS = 4;
const RETENTION_DAYS = 21; // prune live snapshots older than this

const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const intervalArg = args.find((a) => a.startsWith("--interval="));
const INTERVAL_MIN = intervalArg ? Math.max(1, Number(intervalArg.split("=")[1]) || 5) : 5;

const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
const ts = () => new Date().toISOString();
const log = (m) => console.log(`[${ts()}] ${m}`);

async function ensureBucket() {
  const { data: buckets, error } = await sb.storage.listBuckets();
  if (error) throw new Error(`listBuckets: ${error.message}`);
  if (!buckets.some((b) => b.name === BUCKET)) {
    const { error: cErr } = await sb.storage.createBucket(BUCKET, { public: false });
    if (cErr && !/already exists/i.test(cErr.message)) throw new Error(`createBucket: ${cErr.message}`);
    log(`created private bucket "${BUCKET}"`);
  }
}

async function snapshotOnce() {
  const since = new Date(Date.now() - RECENT_SUBMIT_HOURS * 3600_000).toISOString();

  // Active runs = in-progress OR recently submitted.
  const { data: runs, error: runErr } = await sb
    .from("test_runs")
    .select("*")
    .or(`status.eq.in_progress,submitted_at.gte.${since}`);
  if (runErr) throw new Error(`select test_runs: ${runErr.message}`);

  if (!runs || runs.length === 0) {
    log("no active/recent test runs — nothing to snapshot.");
    return { skipped: true };
  }

  const runIds = runs.map((r) => r.id);
  // Fetch answers for those runs (chunked to stay within URL limits).
  const answers = [];
  for (let i = 0; i < runIds.length; i += 100) {
    const chunk = runIds.slice(i, i + 100);
    const { data, error } = await sb
      .from("test_run_answers")
      .select("*")
      .in("run_id", chunk);
    if (error) throw new Error(`select test_run_answers: ${error.message}`);
    answers.push(...(data ?? []));
  }

  const inProgress = runs.filter((r) => r.status === "in_progress").length;
  const snapshot = {
    captured_at: ts(),
    window: { recent_submit_hours: RECENT_SUBMIT_HOURS, since },
    counts: { runs: runs.length, in_progress: inProgress, answers: answers.length },
    test_runs: runs,
    test_run_answers: answers,
  };

  const body = gzipSync(Buffer.from(JSON.stringify(snapshot)));
  const day = ts().slice(0, 10);
  const path = `${PREFIX}/${day}/snapshot-${ts().replace(/[:.]/g, "-")}.json.gz`;
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, body, { contentType: "application/gzip", upsert: false });
  if (upErr) throw new Error(`upload: ${upErr.message}`);

  log(
    `snapshot: ${runs.length} run(s) [${inProgress} in-progress] + ${answers.length} answer(s) ` +
      `→ ${BUCKET}/${path} (${(body.length / 1024).toFixed(1)} KB gz)`,
  );
  return { skipped: false, path };
}

async function pruneOld() {
  // Best-effort: delete day-folders older than RETENTION_DAYS.
  try {
    const { data: days } = await sb.storage.from(BUCKET).list(PREFIX, { limit: 1000 });
    if (!days) return;
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString().slice(0, 10);
    for (const d of days) {
      if (d.name < cutoff) {
        const { data: files } = await sb.storage.from(BUCKET).list(`${PREFIX}/${d.name}`, { limit: 1000 });
        if (files?.length) {
          await sb.storage.from(BUCKET).remove(files.map((f) => `${PREFIX}/${d.name}/${f.name}`));
          log(`pruned ${files.length} snapshot(s) from ${d.name} (older than ${RETENTION_DAYS}d)`);
        }
      }
    }
  } catch (e) {
    log(`prune warning: ${e.message}`);
  }
}

async function cycle() {
  try {
    const r = await snapshotOnce();
    if (!r.skipped) await pruneOld();
  } catch (e) {
    log(`ERROR (continuing): ${e.message}`);
  }
}

await ensureBucket();
if (ONCE) {
  await cycle();
} else {
  log(`live-test-backup running — snapshot every ${INTERVAL_MIN} min. Ctrl-C to stop.`);
  await cycle();
  setInterval(cycle, INTERVAL_MIN * 60_000);
}
