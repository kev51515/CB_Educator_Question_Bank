#!/usr/bin/env node
/**
 * db-backup.mjs — independent FULL-DATABASE backup → private Storage bucket.
 * =========================================================================
 * A complete pg_dump (schema + data) of the Supabase Postgres, gzipped and
 * uploaded to the private `db-backups` bucket. This is the periodic/daily
 * disaster-recovery copy YOU control, on top of Supabase Pro's managed backups
 * + PITR. (For the during-a-test, every-5-min copy of live answers, use
 * live-test-backup.mjs instead — it's lighter and far more frequent.)
 *
 * Toolchain notes (why this works where `supabase db dump` didn't):
 *   - The server is PostgreSQL 17; a PG15 pg_dump REFUSES it. We resolve a
 *     pg_dump >= 17 (Homebrew `libpq` ships 17.x at
 *     /opt/homebrew/opt/libpq/bin/pg_dump) and call it DIRECTLY.
 *   - `supabase db dump` hangs at "Dumping schemas…" over the pooler; the native
 *     pg_dump connects to the same session pooler fine.
 *
 * Connection: SUPABASE_DB_URL if set, else built from the linked project's
 * pooler host (supabase/.temp/pooler-url) + SUPABASE_DB_PASSWORD.
 *
 * Run:  node --env-file-if-exists=../.env scripts/db-backup.mjs
 * Restore:  download, gunzip, `psql "<db-url>" -f db-<ts>.sql`
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync, execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { readFileSync, existsSync, mkdtempSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE) {
  console.error("db-backup: missing SUPABASE_URL / SUPABASE_SERVICE_KEY (root ../.env).");
  process.exit(2);
}
const BUCKET = "db-backups";
const PREFIX = "full";
const RETENTION_DAYS = 30;
const ts = () => new Date().toISOString();
const log = (m) => console.log(`[${ts()}] ${m}`);

// --- resolve a pg_dump whose major version is >= 17 (server is PG17) --------
function resolvePgDump() {
  const candidates = [
    "/opt/homebrew/opt/libpq/bin/pg_dump",
    "/opt/homebrew/opt/postgresql@17/bin/pg_dump",
    "/usr/local/opt/libpq/bin/pg_dump",
    "pg_dump",
  ];
  for (const c of candidates) {
    try {
      const v = execFileSync(c, ["--version"], { encoding: "utf8" });
      const major = Number(v.match(/(\d+)\.\d+/)?.[1] ?? 0);
      if (major >= 17) return { bin: c, version: v.trim() };
    } catch {
      /* not present — try next */
    }
  }
  return null;
}

// --- build the DB connection URL --------------------------------------------
function dbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const ref = URL.match(/https:\/\/([a-z0-9]+)\./)?.[1];
  const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  if (!ref || !pw) throw new Error("need SUPABASE_DB_URL, or SUPABASE_DB_PASSWORD + a linked project pooler host");
  // Prefer the linked project's pooler host (region-correct).
  const poolerFile = join(process.cwd(), "..", "supabase", ".temp", "pooler-url");
  let host = null;
  if (existsSync(poolerFile)) {
    host = readFileSync(poolerFile, "utf8").trim().match(/@([^:/]+)/)?.[1] ?? null;
  }
  if (!host) throw new Error("pooler host not found (supabase/.temp/pooler-url); set SUPABASE_DB_URL");
  return `postgresql://postgres.${ref}:${pw}@${host}:5432/postgres`;
}

const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function ensureBucket() {
  const { data: buckets, error } = await sb.storage.listBuckets();
  if (error) throw new Error(`listBuckets: ${error.message}`);
  if (!buckets.some((b) => b.name === BUCKET)) {
    const { error: cErr } = await sb.storage.createBucket(BUCKET, { public: false });
    if (cErr && !/already exists/i.test(cErr.message)) throw new Error(`createBucket: ${cErr.message}`);
    log(`created private bucket "${BUCKET}"`);
  }
}

async function pruneOld() {
  try {
    const { data: days } = await sb.storage.from(BUCKET).list(PREFIX, { limit: 1000 });
    if (!days) return;
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString().slice(0, 10);
    for (const d of days) {
      if (d.name < cutoff) {
        const { data: files } = await sb.storage.from(BUCKET).list(`${PREFIX}/${d.name}`, { limit: 1000 });
        if (files?.length) {
          await sb.storage.from(BUCKET).remove(files.map((f) => `${PREFIX}/${d.name}/${f.name}`));
          log(`pruned ${files.length} backup(s) from ${d.name} (older than ${RETENTION_DAYS}d)`);
        }
      }
    }
  } catch (e) {
    log(`prune warning: ${e.message}`);
  }
}

async function main() {
  const pg = resolvePgDump();
  if (!pg) {
    console.error(
      "db-backup: no pg_dump >= 17 found. Install one, e.g. `brew install libpq` " +
        "(ships pg_dump 17 at /opt/homebrew/opt/libpq/bin/pg_dump).",
    );
    process.exit(3);
  }
  log(`using ${pg.bin} (${pg.version})`);
  await ensureBucket();

  const url = dbUrl();
  const dir = mkdtempSync(join(tmpdir(), "dbbk-"));
  const sqlPath = join(dir, "dump.sql");
  log("pg_dump running (schema + data) — this can take a few minutes over the pooler…");
  const r = spawnSync(
    pg.bin,
    [url, "--no-owner", "--no-privileges", "-f", sqlPath],
    { encoding: "utf8", timeout: 20 * 60_000, maxBuffer: 1 << 26 },
  );
  if (r.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`pg_dump failed (status ${r.status}): ${(r.stderr || "").slice(-400)}`);
  }

  const raw = readFileSync(sqlPath);
  const gz = gzipSync(raw);
  const day = ts().slice(0, 10);
  const path = `${PREFIX}/${day}/db-${ts().replace(/[:.]/g, "-")}.sql.gz`;
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, gz, { contentType: "application/gzip", upsert: false });
  rmSync(dir, { recursive: true, force: true });
  if (upErr) throw new Error(`upload: ${upErr.message}`);

  log(
    `backup: ${(raw.length / 1024 / 1024).toFixed(2)} MB sql → ${(gz.length / 1024 / 1024).toFixed(2)} MB gz ` +
      `→ ${BUCKET}/${path}`,
  );
  await pruneOld();
}

main().catch((e) => {
  console.error(`[${ts()}] db-backup FAILED: ${e.message}`);
  process.exit(1);
});
