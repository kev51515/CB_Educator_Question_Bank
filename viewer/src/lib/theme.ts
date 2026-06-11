/**
 * theme — the UI theme layer of the redesign ("Ivy Ledger", June 2026).
 *
 * Two themes:
 *   'classic' — the pre-redesign look (system fonts, Tailwind slate, indigo).
 *               This is the DEFAULT, so shipping this module changes nothing
 *               visually until a user opts in.
 *   'ivy'     — Ivy Ledger: eggshell paper, navy-cast ink, Newsreader display
 *               serif, ceremonial gold. Spec: design-explorations/ivy-ledger/.
 *
 * Mechanism (same trick as the domain accent system, one level up): the
 * Tailwind `slate-*` and `ink-*` ramps resolve through `--slate-N` / `--ink-N`
 * CSS channel variables (see tailwind.config.js + index.css). `.theme-ivy` on
 * <html> swaps those variables — every existing utility class re-themes with
 * zero component edits. Fonts swap via `--font-ui` / `--font-display` /
 * `--font-passage` vars; the Ivy webfonts are code-split and only download
 * when the theme is first activated.
 *
 * Module-level external store (no React context) so non-React code (e.g.
 * DomainProvider's synchronous accent re-paint) can read the active theme
 * without provider-ordering concerns. Subscribe via useUiTheme().
 *
 * Rollback story: the git tag `pre-ivy-redesign` marks the last commit before
 * this layer existed; flipping a user back is just setUiTheme('classic').
 */
import { useSyncExternalStore } from "react";

export type UiTheme = "classic" | "ivy";

const STORAGE_KEY = "ui.theme";
const IVY_CLASS = "theme-ivy";

let current: UiTheme = "classic";
let fontsRequested = false;
const listeners = new Set<() => void>();

function isUiTheme(raw: unknown): raw is UiTheme {
  return raw === "classic" || raw === "ivy";
}

/** Lazy-load the Ivy webfont CSS (code-split; classic users never pay for it). */
function ensureIvyFonts(): void {
  if (fontsRequested) return;
  fontsRequested = true;
  void import("./ivyFonts");
}

function applyToDom(theme: UiTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(IVY_CLASS, theme === "ivy");
  if (theme === "ivy") ensureIvyFonts();
}

/** The active UI theme (safe to call from anywhere, including non-React code). */
export function getUiTheme(): UiTheme {
  return current;
}

/** Set + persist the UI theme and notify subscribers. */
export function setUiTheme(next: UiTheme): void {
  if (next === current) return;
  current = next;
  applyToDom(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // private mode / quota — non-fatal
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React hook: the active theme, re-rendering on change (cross-tab included). */
export function useUiTheme(): UiTheme {
  return useSyncExternalStore(subscribe, getUiTheme, () => "classic" as const);
}

/**
 * Boot: read the stored preference and apply it before first render. Called
 * once from main.tsx (import side effects are deliberately avoided so test
 * environments without a DOM can import this module safely).
 */
export function initUiTheme(): void {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  current = isUiTheme(stored) ? stored : "classic";
  applyToDom(current);
  // Cross-tab sync (mirrors useDarkMode's pattern).
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = isUiTheme(e.newValue) ? e.newValue : "classic";
    if (next !== current) {
      current = next;
      applyToDom(next);
      for (const fn of listeners) fn();
    }
  });
}
