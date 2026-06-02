/**
 * Shared Playwright fixtures.
 *
 * The viewer is wrapped by `AuthGate`. We do NOT mock Supabase auth here —
 * `playwright.config.ts` boots the dev server with `VITE_E2E_BYPASS_AUTH=1`,
 * which causes `AuthGate` to short-circuit and render the bank directly.
 * This file just re-exports `test` / `expect` so specs import from one place
 * (handy if we ever do need to layer fixtures on later).
 */
export { test, expect } from "@playwright/test";
