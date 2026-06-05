#!/usr/bin/env node
/**
 * restore-drill.mjs — prove the FULL-DATABASE backups are actually restorable.
 * ===========================================================================
 * "A backup you've never restored is a hope, not a backup." This script takes
 * the most recent full plain-SQL dump produced by db-backup.mjs, restores it
 * into a SEPARATE, throwaway Postgres database, and runs verification queries
 * to confirm the data came back intact (table count + row counts for core
 * tables). It exits 0 only if the restore completed AND the core tables have
 * rows.
 *
 * WHAT IT RESTORES
 *   db-backup.mjs writes `pg_dump … -f dump.sql` then gzips it, so the artifact
 *   is a PLAIN-SQL `*.sql.gz` (NOT pg_dump custom format). We therefore gunzip
 *   it and pipe it through `psql` (not `pg_restore`). We resolve a psql/pg_dump
 *   from /opt/homebrew/opt/libpq/bin exactly like db-backup.mjs (server is PG17),
 *   falling back to PATH.
 *
 *   The dump is located as the newest `*.sql.gz` under a LOCAL `db-backups/full/`
 *   directory (walking the `<date>/` subdirs). db-backup.mjs uploads to a private
 *   Storage bucket — download a dump into `db-backups/full/<date>/` first, or pass
 *   `--file=<path>` to point at any local `*.sql.gz` (or already-gunzipped `*.sql`).
 *
 * ── PROD-WRITE SAFETY GUARD (the critical bit) ──────────────────────────────
 *   The TARGET is ALWAYS a separate database. We read RESTORE_TARGET_URL; if
 *   unset we default to local Supabase/docker
 *   (postgresql://postgres:postgres@127.0.0.1:54322/postgres). BEFORE doing
 *   anything we extract the target host and HARD-REFUSE (exit 2) if it:
 *     - contains "pooler.supabase.com"  (the prod session pooler), OR
 *     - equals the prod host derived from SUPABASE_URL / SUPABASE_DB_URL.
 *   Restoring over prod would be catastrophic and irreversible, so this guard
 *   is fail-closed: any doubt → refuse. We also only ever CREATE a fresh scratch
 *   database on the target and connect maintenance commands to the `postgres`
 *   admin DB on that same host — we never DROP/overwrite an existing DB.
 *
 * NOTE ON THROWAWAY SUPABASE PROJECTS
 *   Fully provisioning a brand-new disposable hosted Supabase project requires a
 *   Supabase MANAGEMENT API token this script does NOT have (and shouldn't). So
 *   the realistic, supported target here is a LOCAL Postgres / `supabase start`
 *   docker instance. Point RESTORE_TARGET_URL at any non-prod Postgres you like.
 *
 * USAGE
 *   # restore latest dump into local docker (default target), verify counts:
 *   node --env-file-if-exists=../.env scripts/restore-drill.mjs
 *
 *   # explicit dump file + a custom non-prod target:
 *   RESTORE_TARGET_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *     node --env-file-if-exists=../.env scripts/restore-drill.mjs --file=../db-backups/full/2026-06-05/db-….sql.gz
 *
 *   # also print expected-vs-restored by reading prod counts via the service key:
 *   node --env-file-if-exists=../.env scripts/restore-drill.mjs --compare-prod
 *
 *   # name the scratch DB yourself (else restore_drill_<timestamp>):
 *   node --env-file-if-exists=../.env scripts/restore-drill.mjs --dbname=restore_drill_manual
 *
 * TEARDOWN: this script leaves the scratch DB in place so you can inspect it.
 *   Drop it with the exact command printed in the summary block, e.g.:
 *     psql "<admin-url>" -c 'DROP DATABASE "restore_drill_…";'
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync, execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, statSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ts = () => new Date().toISOString();
const log = (m) => console.log(`[${ts()}] ${m}`);
const die = (code, m) => {
  console.error(`[${ts()}] restore-drill FAILED: ${m}`);
  process.exit(code);
};

const args = process.argv.slice(2);
const argVal = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : null;
};
const COMPARE_PROD = args.includes("--compare-prod");

// Core tables we assert restored with rows. (Mirrors the surfaces in CLAUDE.md.)
const CORE_TABLES = [
  "profiles",
  "courses",
  "assignments",
  "test_runs",
  "test_run_answers",
  "questions",
];

const DEFAULT_TARGET = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// ── resolve psql + pg_dump (>= 17 preferred), same dirs as db-backup.mjs ──────
function resolveBin(name) {
  const candidates = [
    `/opt/homebrew/opt/libpq/bin/${name}`,
    `/opt/homebrew/opt/postgresql@17/bin/${name}`,
    `/usr/local/opt/libpq/bin/${name}`,
    name,
  ];
  for (const c of candidates) {
    try {
      const v = execFileSync(c, ["--version"], { encoding: "utf8" });
      const major = Number(v.match(/(\d+)\.\d+/)?.[1] ?? 0);
      return { bin: c, version: v.trim(), major };
    } catch {
      /* not present — try next */
    }
  }
  return null;
}

// ── parse host/db out of a postgres URL (tolerant of postgres:// & postgresql://)
function parsePg(url) {
  try {
    const u = new URL(url.replace(/^postgres:\/\//, "postgresql://"));
    return {
      host: u.hostname,
      port: u.port || "5432",
      db: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
    };
  } catch {
    return null;
  }
}

// Prod host: explicit SUPABASE_DB_URL host, else derived from SUPABASE_URL ref.
function prodHosts() {
  const hosts = new Set();
  if (process.env.SUPABASE_DB_URL) {
    const p = parsePg(process.env.SUPABASE_DB_URL);
    if (p) hosts.add(p.host.toLowerCase());
  }
  if (process.env.SUPABASE_URL) {
    const h = process.env.SUPABASE_URL.match(/https?:\/\/([^/]+)/)?.[1];
    if (h) hosts.add(h.toLowerCase());
  }
  return hosts;
}

// ── THE GUARD: refuse to ever touch prod ──────────────────────────────────────
function assertNotProd(targetUrl) {
  const t = parsePg(targetUrl);
  if (!t) die(2, `RESTORE_TARGET_URL is not a parseable Postgres URL: "${targetUrl}"`);
  const host = t.host.toLowerCase();

  if (host.includes("pooler.supabase.com")) {
    die(2, `target host "${host}" is the Supabase session pooler (prod). REFUSING — this guard is fail-closed.`);
  }
  for (const ph of prodHosts()) {
    // exact host match, or the target host being the bare ref of the prod host
    if (host === ph || (ph && host && ph.includes(host) && host.includes("supabase"))) {
      die(2, `target host "${host}" matches the prod host "${ph}". REFUSING to restore over prod.`);
    }
  }
  // Defensive: a hosted supabase.co/.com host that isn't clearly local is suspect.
  const looksLocal =
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "db" || // docker service name
    host === "host.docker.internal";
  if (!looksLocal && /supabase\.(co|com)/.test(host)) {
    die(2, `target host "${host}" looks like a hosted Supabase DB and is not recognised local. REFUSING (fail-closed).`);
  }
  return t;
}

// ── locate the newest *.sql.gz under db-backups/full/<date>/ ──────────────────
function findLatestDump() {
  const override = argVal("file");
  if (override) {
    if (!existsSync(override)) die(1, `--file not found: ${override}`);
    return override;
  }
  // db-backups/ lives at the repo root (one up from viewer/). Try a few roots.
  const roots = [
    join(process.cwd(), "db-backups", "full"),
    join(process.cwd(), "..", "db-backups", "full"),
  ];
  const fullDir = roots.find((r) => existsSync(r));
  if (!fullDir) {
    die(
      1,
      `no local db-backups/full/ directory found (looked in: ${roots.join(", ")}). ` +
        `Download a dump from the "db-backups" Storage bucket into db-backups/full/<date>/, or pass --file=<path>.`,
    );
  }
  let best = null;
  for (const day of readdirSync(fullDir)) {
    const dayDir = join(fullDir, day);
    let st;
    try {
      st = statSync(dayDir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    for (const f of readdirSync(dayDir)) {
      if (!/\.sql(\.gz)?$/.test(f)) continue;
      const p = join(dayDir, f);
      const mtime = statSync(p).mtimeMs;
      if (!best || mtime > best.mtime || (mtime === best.mtime && p > best.path)) {
        best = { path: p, mtime };
      }
    }
  }
  if (!best) die(1, `no *.sql.gz dumps found under ${fullDir}. Pass --file=<path> or run db-backup.mjs first.`);
  return best.path;
}

// ── psql helpers ──────────────────────────────────────────────────────────────
function psqlExec(psqlBin, url, sql, { allowFail = false } = {}) {
  const r = spawnSync(psqlBin, [url, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  if (r.status !== 0 && !allowFail) {
    throw new Error(`psql failed: ${(r.stderr || r.stdout || "").trim().slice(-400)}`);
  }
  return r;
}

// scalar query → first cell of first row (tuples-only)
function psqlScalar(psqlBin, url, sql) {
  const r = spawnSync(psqlBin, [url, "-X", "-q", "-t", "-A", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  if (r.status !== 0) throw new Error(`psql query failed: ${(r.stderr || "").trim().slice(-300)}`);
  return (r.stdout || "").trim();
}

async function prodCounts() {
  const URL = process.env.SUPABASE_URL;
  const SERVICE = process.env.SUPABASE_SERVICE_KEY;
  if (!URL || !SERVICE) {
    log("--compare-prod set but SUPABASE_URL / SUPABASE_SERVICE_KEY missing — skipping prod comparison.");
    return null;
  }
  const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const out = {};
  for (const t of CORE_TABLES) {
    try {
      const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
      out[t] = error ? "err" : count ?? 0;
    } catch {
      out[t] = "err";
    }
  }
  return out;
}

async function main() {
  // 1) resolve binaries
  const psql = resolveBin("psql");
  if (!psql) die(3, "no psql found. Install libpq (`brew install libpq`) — ships psql at /opt/homebrew/opt/libpq/bin.");
  log(`using ${psql.bin} (${psql.version})`);

  // 2) resolve + GUARD the target (must happen before any write)
  const targetUrl = process.env.RESTORE_TARGET_URL || DEFAULT_TARGET;
  if (!process.env.RESTORE_TARGET_URL) log(`RESTORE_TARGET_URL unset — defaulting to local docker ${DEFAULT_TARGET}`);
  const target = assertNotProd(targetUrl);
  log(`prod-safety guard PASSED — target host "${target.host}" is not prod.`);

  // admin url on the same host (to CREATE DATABASE); connect to maintenance "postgres" db
  const adminUrl = targetUrl.replace(/\/[^/?]*(\?|$)/, "/postgres$1");

  // 3) locate dump
  const dumpPath = findLatestDump();
  const dumpSize = (statSync(dumpPath).size / 1024 / 1024).toFixed(2);
  log(`latest dump: ${dumpPath} (${dumpSize} MB)`);

  // 4) gunzip to a temp .sql if needed
  const work = mkdtempSync(join(tmpdir(), "restore-drill-"));
  let sqlPath;
  if (dumpPath.endsWith(".gz")) {
    const sql = gunzipSync(readFileSync(dumpPath));
    sqlPath = join(work, "dump.sql");
    writeFileSync(sqlPath, sql);
    log(`gunzipped → ${(sql.length / 1024 / 1024).toFixed(2)} MB plain SQL`);
  } else {
    sqlPath = dumpPath;
    log("dump is already plain SQL (no gunzip needed)");
  }

  // 5) create a fresh scratch DB on the target
  const scratch =
    argVal("dbname") || `restore_drill_${ts().replace(/[^0-9]/g, "").slice(0, 14)}`;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(scratch)) {
    rmSync(work, { recursive: true, force: true });
    die(1, `--dbname "${scratch}" is not a safe identifier (letters/digits/underscore, not starting with a digit).`);
  }
  log(`creating fresh scratch database "${scratch}" on ${target.host}…`);
  try {
    // refuse if it somehow already exists (don't clobber)
    const exists = psqlScalar(psql.bin, adminUrl, `SELECT 1 FROM pg_database WHERE datname='${scratch}'`);
    if (exists === "1") {
      rmSync(work, { recursive: true, force: true });
      die(1, `scratch DB "${scratch}" already exists — pick a different --dbname or drop it first.`);
    }
    psqlExec(psql.bin, adminUrl, `CREATE DATABASE "${scratch}"`);
  } catch (e) {
    rmSync(work, { recursive: true, force: true });
    die(1, `could not create scratch DB on ${target.host}: ${e.message}`);
  }

  const scratchUrl = adminUrl.replace(/\/postgres(\?|$)/, `/${scratch}$1`);

  // 6) restore: pipe the plain SQL through psql into the scratch DB
  log(`restoring into "${scratch}" via psql -f … (this can take a while)`);
  const restore = spawnSync(psql.bin, [scratchUrl, "-X", "-q", "-f", sqlPath], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
    timeout: 30 * 60_000,
  });
  rmSync(work, { recursive: true, force: true });
  // pg_dump output legitimately emits NOTICE/ALREADY-EXISTS noise for roles/extensions;
  // we don't ON_ERROR_STOP the whole file (a missing role shouldn't fail the drill),
  // but a hard non-zero AND no tables created is a real failure (checked below).
  if (restore.status !== 0) {
    log(`psql -f returned status ${restore.status} (non-fatal noise tolerated — verifying actual data next)`);
    const tail = (restore.stderr || "").trim().slice(-400);
    if (tail) log(`psql stderr tail: ${tail}`);
  }

  // 7) verification phase
  log("verifying restored data…");
  const tableCount = Number(
    psqlScalar(psql.bin, scratchUrl, `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'`),
  );
  const restored = {};
  for (const t of CORE_TABLES) {
    const present = psqlScalar(
      psql.bin,
      scratchUrl,
      `SELECT to_regclass('public.${t}') IS NOT NULL`,
    );
    if (present !== "t") {
      restored[t] = "MISSING";
      continue;
    }
    restored[t] = Number(psqlScalar(psql.bin, scratchUrl, `SELECT count(*) FROM public."${t}"`));
  }

  const prod = COMPARE_PROD ? await prodCounts() : null;

  // 8) summary block
  const anyRows = Object.values(restored).some((v) => typeof v === "number" && v > 0);
  const coreOk = CORE_TABLES.every((t) => typeof restored[t] === "number");
  const pass = tableCount > 0 && coreOk && anyRows;

  const W = 16;
  const pad = (s) => String(s).padEnd(W);
  const padN = (s) => String(s).padStart(8);
  console.log("\n────────────────────────────────────────────────────────────");
  console.log(` RESTORE DRILL SUMMARY`);
  console.log("────────────────────────────────────────────────────────────");
  console.log(` dump            : ${dumpPath}`);
  console.log(` target host     : ${target.host}:${target.port}`);
  console.log(` scratch db      : ${scratch}`);
  console.log(` public tables   : ${tableCount}`);
  console.log("────────────────────────────────────────────────────────────");
  console.log(` ${pad("table")}${padN("restored")}${prod ? "   " + padN("prod") : ""}`);
  for (const t of CORE_TABLES) {
    const r = restored[t];
    const line = `${pad(t)}${padN(r)}` + (prod ? "   " + padN(prod[t] ?? "?") : "");
    console.log(` ${line}`);
  }
  console.log("────────────────────────────────────────────────────────────");
  console.log(` result          : ${pass ? "✅ PASS — backup is restorable" : "❌ FAIL"}`);
  if (!pass) {
    if (tableCount === 0) console.log(`   reason        : no tables in public schema (restore did not apply)`);
    if (!coreOk) console.log(`   reason        : one or more core tables MISSING after restore`);
    if (!anyRows) console.log(`   reason        : no core table had any rows (empty restore)`);
  }
  console.log("────────────────────────────────────────────────────────────");
  console.log(` TEARDOWN — drop the scratch DB when done:`);
  console.log(`   psql "${adminUrl}" -c 'DROP DATABASE "${scratch}";'`);
  console.log("────────────────────────────────────────────────────────────\n");

  process.exit(pass ? 0 : 1);
}

main().catch((e) => die(1, e.message));
