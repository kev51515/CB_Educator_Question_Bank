#!/usr/bin/env node
/**
 * smoke-all.mjs — runs every smoke suite in sequence and prints a unified
 * summary. Exits non-zero if any suite fails so CI (or a teacher hitting
 * `npm run smoke` locally) gets a clean signal.
 *
 * Each suite expects the same three env vars (SUPABASE_URL,
 * SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY). They are validated here once so
 * a missing var fails fast instead of mid-suite.
 *
 * Suites are kept as separate processes (not require()'d) so a crash in one
 * doesn't take down the others — useful when iterating on a single suite.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_KEY",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`smoke-all: missing env ${key}`);
    process.exit(2);
  }
}

const SUITES = [
  { name: "e2e",           script: "smoke-e2e.mjs" },
  { name: "features",      script: "smoke-features.mjs" },
  { name: "modules",       script: "smoke-modules.mjs" },
  { name: "qbank",         script: "smoke-qbank.mjs" },
  { name: "cascade",       script: "smoke-cascade.mjs" },
  { name: "grading",       script: "smoke-grading.mjs" },
  { name: "announcements", script: "smoke-announcements.mjs" },
  { name: "skills",        script: "smoke-skills.mjs" },
];

const results = [];
let anyFailed = false;
const t0 = Date.now();

for (const suite of SUITES) {
  process.stdout.write(`\n━━ ${suite.name} ${"━".repeat(50 - suite.name.length)}\n`);
  const start = Date.now();
  const out = spawnSync("node", [join(HERE, suite.script)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    encoding: "utf8",
  });
  const took = ((Date.now() - start) / 1000).toFixed(1);
  process.stdout.write(out.stdout);
  if (out.stderr) process.stderr.write(out.stderr);
  // Parse the suite's own TOTAL line for the summary.
  const totalLine =
    out.stdout
      .split("\n")
      .reverse()
      .find((l) => /^TOTAL:/.test(l)) ?? "TOTAL: ?  PASS: ?  FAIL: ?";
  const failed = out.status !== 0;
  if (failed) anyFailed = true;
  results.push({
    name: suite.name,
    totalLine,
    failed,
    seconds: took,
  });
}

const totalSec = ((Date.now() - t0) / 1000).toFixed(1);

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║  smoke-all summary                                       ║");
console.log("╠══════════════════════════════════════════════════════════╣");
for (const r of results) {
  const status = r.failed ? "✗" : "✓";
  console.log(
    `║  ${status} ${r.name.padEnd(10)} ${r.totalLine.padEnd(38)} ${r.seconds.padStart(5)}s  ║`,
  );
}
console.log("╠══════════════════════════════════════════════════════════╣");
const overall = anyFailed ? "FAILED — see suite output above" : "ALL GREEN";
console.log(`║  ${overall.padEnd(50)} ${totalSec.padStart(5)}s  ║`);
console.log("╚══════════════════════════════════════════════════════════╝");

process.exit(anyFailed ? 1 : 0);
