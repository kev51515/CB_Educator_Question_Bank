/**
 * playwright.role.config.ts — REAL-AUTH role-routing config
 * =========================================================
 * A dedicated Playwright config for `e2e/role-routing.spec.ts` that boots the
 * dev server WITHOUT `VITE_E2E_BYPASS_AUTH`, so the spec exercises a genuine
 * Supabase login and the lazy role chunks (StaffRoutesTree / StudentRoutesTree)
 * actually load + route. The default `playwright.config.ts` sets the bypass
 * flag and would short-circuit `AuthGate` to `E2EBypassShell` — that's why this
 * lives in its own file rather than as an extra project.
 *
 * Run with:
 *   npx playwright test --config=playwright.role.config.ts
 *
 * Port 9100 (the default config uses 9000) so both can coexist if needed.
 *
 * Env wiring:
 *   - The APP (browser) reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from
 *     viewer/.env.local automatically (Vite). Those MUST point at the same
 *     Supabase project the admin client targets.
 *   - The TEST PROCESS (Node) needs SUPABASE_URL + SUPABASE_SERVICE_KEY to mint
 *     and delete users. Those live in the repo-root ../.env. We parse that file
 *     here (no dotenv dependency required) and copy the keys into process.env so
 *     they're available both to this config and to the spec's admin client.
 */
import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- Load repo-root ../.env into process.env (minimal dotenv parse) ---------
// Mirrors how the scripts run with `--env-file-if-exists=../.env`. Only sets
// keys that aren't already present, so an explicit env override still wins.
function loadRootEnv() {
  // Playwright runs from the viewer/ dir, so the repo-root env is ../.env.
  // (ESM module scope has no __dirname.)
  const envPath = resolve(process.cwd(), "..", ".env");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    // No ../.env — rely on whatever is already in the environment.
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding single or double quotes if present.
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadRootEnv();

const PORT = 9100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // ONLY the role-routing spec — every other e2e spec assumes the auth bypass.
  testMatch: /role-routing\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Real login + lazy-chunk fetch + Supabase round-trips need headroom.
  timeout: 60_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // NOTE: deliberately NO `env: { VITE_E2E_BYPASS_AUTH }` here — that's the
    // whole point. The app runs its real AuthGate against live Supabase.
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
