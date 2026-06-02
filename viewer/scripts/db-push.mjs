#!/usr/bin/env node
/**
 * db-push.mjs — thin wrapper so `npm run db:push` never needs the DB password
 * typed inline. Reads SUPABASE_DB_PASSWORD (loaded from the gitignored root
 * .env via --env-file-if-exists) and runs `supabase db push` from the repo
 * root (where supabase/config.toml lives). Any extra args are forwarded, e.g.
 *   npm run db:push -- --include-all
 *   npm run db:push -- --dry-run
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pw = process.env.SUPABASE_DB_PASSWORD;
if (!pw) {
  console.error("db-push: SUPABASE_DB_PASSWORD not set (expected in root .env). Aborting.");
  process.exit(2);
}

const extra = process.argv.slice(2);
const res = spawnSync("supabase", ["db", "push", "-p", pw, ...extra], {
  cwd: repoRoot,
  stdio: "inherit",
});
process.exit(res.status ?? 1);
