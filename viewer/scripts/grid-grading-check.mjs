#!/usr/bin/env node
/**
 * grid-grading-check.mjs
 *
 * Regression guard for public._grade_answer on grid (student-produced response)
 * questions — the numeric-equivalence + repeating-decimal rules that the runner
 * grades student answers with. Runs a fixed battery of (key, student-entry,
 * expected) triples directly against the live function via psql and exits
 * non-zero on any mismatch.
 *
 * Why psql and not the supabase-js client: _grade_answer is an internal
 * (underscore-prefixed) function not exposed as a PostgREST RPC, and the only
 * grid questions reachable through submit_test_module are the live test's —
 * all of which happen to have terminating answers. Calling the function
 * directly lets us cover synthetic repeating-decimal keys (2/3, 1/3, …) that
 * no current test exercises but the grader must handle (College Board SPR
 * rule: any rounded/truncated decimal that fills the grid is accepted).
 *
 * Connection mirrors db-backup.mjs: SUPABASE_DB_URL, or SUPABASE_DB_PASSWORD +
 * the linked project's pooler host (supabase/.temp/pooler-url).
 *
 * Env: SUPABASE_URL (for project ref), plus SUPABASE_DB_URL or
 * SUPABASE_DB_PASSWORD. Read-only; creates nothing.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const URL = process.env.SUPABASE_URL ?? "";

function dbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const ref = URL.match(/https:\/\/([a-z0-9]+)\./)?.[1];
  const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  if (!ref || !pw) throw new Error("need SUPABASE_DB_URL, or SUPABASE_DB_PASSWORD + SUPABASE_URL + a linked pooler host");
  const poolerFile = join(process.cwd(), "..", "supabase", ".temp", "pooler-url");
  let host = null;
  if (existsSync(poolerFile)) host = readFileSync(poolerFile, "utf8").trim().match(/@([^:/]+)/)?.[1] ?? null;
  if (!host) throw new Error("pooler host not found (supabase/.temp/pooler-url); set SUPABASE_DB_URL");
  return `postgresql://postgres.${ref}:${pw}@${host}:5432/postgres`;
}

// (label, correct, accepted-json, chosen, expected) — `correct` NULL means the
// grid stores its canonical value in accepted[0], as the seed data does.
const CASES = [
  // exact / trailing-zero / decimal equivalence
  ["2.7 -> 2.70", null, '["2.7"]', "2.70", true],
  ["4.75 -> 4.750", null, '["4.75"]', "4.750", true],
  ["192.1 -> 192.10", null, '["192.1"]', "192.10", true],
  ["17 -> 17.00", null, '["17"]', "17.00", true],
  ["26 -> 0026 (leading zeros)", null, '["26"]', "0026", true],
  ['343 -> "  343  " (whitespace)', null, '["343"]', "  343  ", true],
  // negatives
  ["-23 -> -23.0", null, '["-23"]', "-23.0", true],
  ["-23 -> 23 (missing sign)", null, '["-23"]', "23", false],
  // fraction <-> decimal
  ["45/8 -> 5.625", null, '["45/8","5.625"]', "5.625", true],
  ["45/8 -> 90/16 (unreduced)", null, '["45/8","5.625"]', "90/16", true],
  ["1/8 -> .1250", null, '["1/8","0.125",".125"]', ".1250", true],
  ["8 -> 8/1", null, '["8"]', "8/1", true],
  // genuinely wrong
  ["4.75 -> 4.7", null, '["4.75"]', "4.7", false],
  ["5.625 -> 5.62", null, '["45/8","5.625"]', "5.62", false],
  ["1/8 -> 1/9", null, '["1/8","0.125"]', "1/9", false],
  // repeating-decimal: rounded/truncated entries that fill the grid -> accept
  ["2/3 -> .6667", null, '["2/3"]', ".6667", true],
  ["2/3 -> .6666", null, '["2/3"]', ".6666", true],
  ["2/3 -> 0.667", null, '["2/3"]', "0.667", true],
  ["1/3 -> .3333", null, '["1/3"]', ".3333", true],
  ["8/3 -> 2.667", null, '["8/3"]', "2.667", true],
  ["1/6 -> .1667", null, '["1/6"]', ".1667", true],
  // repeating-decimal: too few digits (doesn't fill the grid) -> reject
  ["2/3 -> 0.67 (too few)", null, '["2/3"]', "0.67", false],
  ["2/3 -> 0.7 (too few)", null, '["2/3"]', "0.7", false],
  ["1/3 -> 0.4 (wrong)", null, '["1/3"]', "0.4", false],
  // terminating-key guard: approximations of an exact answer stay wrong
  ["0.125 -> 0.1249 (near-miss)", null, '["1/8","0.125"]', "0.1249", false],
  ["4.75 -> 4.749", null, '["4.75"]', "4.749", false],
  // format gaps (correctly rejected; not valid SAT grid entries)
  ["decimal comma 4,75", null, '["4.75"]', "4,75", false],
  ["percent 12.5%", null, '["0.125"]', "12.5%", false],
  ["mixed number 5 5/8", null, '["45/8","5.625"]', "5 5/8", false],
];

function sqlLiteral(s) {
  return s === null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
}

function buildSql() {
  const rows = CASES.map(([label, correct, accepted, chosen, expect], i) =>
    `(${i}, ${sqlLiteral(label)}, ${sqlLiteral(correct)}, ${sqlLiteral(accepted)}::jsonb, ${sqlLiteral(chosen)}, ${expect})`
  ).join(",\n");
  return `
\\pset border 2
WITH cases(idx, label, correct, accepted, chosen, expect) AS (VALUES
${rows}
)
SELECT idx, label, chosen, expect AS sat_ok,
       public._grade_answer('grid', correct, accepted, chosen) AS engine,
       CASE WHEN public._grade_answer('grid', correct, accepted, chosen) = expect
            THEN 'ok' ELSE '<<< MISMATCH' END AS verdict
FROM cases ORDER BY idx;
`;
}

function main() {
  const url = dbUrl();
  const out = spawnSync("psql", [url, "-w", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: buildSql(),
    encoding: "utf8",
  });
  if (out.error) { console.error("psql not runnable:", out.error.message); process.exit(2); }
  process.stdout.write(out.stdout || "");
  if (out.stderr) process.stderr.write(out.stderr);
  if (out.status !== 0) { console.error("\npsql exited non-zero"); process.exit(2); }
  // Each data row prints its verdict; count rows and mismatches from the table.
  const okRows = (out.stdout.match(/\|\s*ok\s*\|/g) || []).length;
  const mismatches = (out.stdout.match(/<<< MISMATCH/g) || []).length;
  if (okRows + mismatches !== CASES.length) {
    console.error(`\nParsed ${okRows + mismatches} verdicts but expected ${CASES.length} — psql output unexpected`);
    process.exit(2);
  }
  console.log(`\n${mismatches === 0 ? "ALL GRID-GRADING CASES PASS" : mismatches + " MISMATCH(ES)"} (${CASES.length} cases)`);
  process.exit(mismatches > 0 ? 1 : 0);
}

main();
