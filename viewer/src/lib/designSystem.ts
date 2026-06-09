/**
 * Centralized design tokens for the OmniLMS viewer.
 *
 * ── Status ──
 * IDENTITY tokens (re-exported from designTokens.ts) are USED in production code.
 * The rest (DIFFICULTY, CONFIDENCE, STATUS, TYPE, SPACE, SURFACE, INTERACTIVE, Z)
 * are REFERENCE tokens: import them in new code for consistency. Existing
 * components may use equivalent inline Tailwind class strings; gradual migration
 * is encouraged but not enforced.
 *
 * To verify what's used: `grep -rn "from.*designSystem" src/`
 *
 * Architecture:
 *   - This file — semantic token reference
 *   - lib/designTokens.ts — focused IDENTITY entry (used)
 *   - tailwind.config.js — color palette + container queries
 *   - index.css — CSS variables for dark mode + a11y prefs
 */

export { IDENTITY, groupIdentity, type Identity } from "./designTokens";

/* ──────────────────────────────────────────────── Difficulty tones ──── */

/** Difficulty color mapping — used in chips, stripes, badges. */
export type DifficultyTone = "easy" | "medium" | "hard" | "unknown";

export const DIFFICULTY: Record<
  DifficultyTone,
  {
    /** Tailwind class for tinted chip background. */
    chipBg: string;
    /** Tailwind class for chip text color. */
    chipText: string;
    /** Tailwind class for a 2px left stripe on list rows. */
    stripe: string;
    /** Tailwind class for an inline dot / status text. */
    dotText: string;
  }
> = {
  easy:    { chipBg: "bg-emerald-50", chipText: "text-emerald-700", stripe: "bg-emerald-400", dotText: "text-emerald-600" },
  medium:  { chipBg: "bg-amber-50",   chipText: "text-amber-700",   stripe: "bg-amber-400",   dotText: "text-amber-600"   },
  hard:    { chipBg: "bg-rose-50",    chipText: "text-rose-700",    stripe: "bg-rose-400",    dotText: "text-rose-600"    },
  unknown: { chipBg: "bg-ink-100",    chipText: "text-ink-700",     stripe: "bg-ink-300",     dotText: "text-ink-500"     },
};

/** Normalize a raw difficulty string into a `DifficultyTone`. */
export function difficultyTone(difficulty: string): DifficultyTone {
  switch (difficulty) {
    case "Easy":
      return "easy";
    case "Medium":
      return "medium";
    case "Hard":
      return "hard";
    default:
      return "unknown";
  }
}

/* ──────────────────────────────────────────────── Confidence tones ──── */

/** Confidence rating color mapping (1=unsure, 2=okay, 3=confident).
 *
 * `chipBg` / `chipText` / `dot` are Tailwind class strings for DOM elements.
 * `hex` and `canvasFill` are raw color values for `<canvas>` or HTML-export
 * contexts where Tailwind classes don't apply. Use these tokens in new code
 * instead of inlining hex literals so confidence colors stay consistent. */
export const CONFIDENCE = {
  unsure:    { chipBg: "bg-rose-50",    chipText: "text-rose-700",    dot: "bg-rose-500",    hex: "#f43f5e", canvasFill: "#fb7185" },
  okay:      { chipBg: "bg-amber-50",   chipText: "text-amber-700",   dot: "bg-amber-500",   hex: "#f59e0b", canvasFill: "#fbbf24" },
  confident: { chipBg: "bg-emerald-50", chipText: "text-emerald-700", dot: "bg-emerald-500", hex: "#10b981", canvasFill: "#34d399" },
  unrated:   { chipBg: "bg-ink-100",    chipText: "text-ink-500",     dot: "bg-ink-300",     hex: "#e6e6ea", canvasFill: "#cbd5e1" },
} as const;

/* ──────────────────────────────────────────────── Status tones ──────── */

/** Status (bookmark / done / in-print-set) tones. */
export const STATUS = {
  bookmarked: { chipBg: "bg-amber-50",   chipText: "text-amber-700",   icon: "text-amber-500"   },
  done:       { chipBg: "bg-emerald-50", chipText: "text-emerald-700", icon: "text-emerald-600" },
  selected:   { chipBg: "bg-accent-50",  chipText: "text-accent-700",  icon: "text-accent-600"  },
} as const;

/* ──────────────────────────────────────────────── Typography scale ──── */

/** Typography scale. Lift these out so type stays consistent across components. */
export const TYPE = {
  /** "OmniLMS" app title */
  title:     "text-[14px] font-semibold tracking-tight",
  /** Question stem body */
  body:      "text-[14px] leading-relaxed",
  /** Question number "#42" */
  hero:      "text-[26px] font-semibold tracking-tight tabular-nums",
  /** Group headers in sidebar */
  groupHead: "text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500",
  /** Small descriptive text (WCAG AA compliant) */
  caption:   "text-[11px] text-ink-450 leading-snug",
  /** Hint text under controls (WCAG AA compliant) */
  hint:      "text-[10.5px] text-ink-450 leading-snug",
  /** Standard control label */
  label:     "text-[13px] text-ink-700",
  /** Compact label (sub-items) */
  labelSm:   "text-[12px] text-ink-700",
  /** Tabular numeric data */
  num:       "text-[12px] tabular-nums",
  /** Small monospace badge (e.g., SPR indicator, ID hashes) */
  badge:     "font-mono text-[10px] uppercase tracking-[0.12em]",
  /** Tiny ID hash display */
  idHash:    "font-mono text-[10.5px] text-ink-300",
} as const;

/* ──────────────────────────────────────────────── Spacing scale ─────── */

/** Spacing scale (Tailwind class names for consistency). */
export const SPACE = {
  cardPadding:    "p-4",
  modalPadding:   "p-7",
  sectionGap:     "mb-5",
  controlGap:     "mb-3",
  rowPadding:     "px-2.5 py-1",
  iconButtonSize: "w-7 h-7",
  dotSize:        "w-1.5 h-1.5",
} as const;

/* ──────────────────────────────────────────────── Surface treatments ── */

/** Surface treatments — composable Tailwind class strings. */
export const SURFACE = {
  card:    "bg-white border border-ink-200 rounded-xl shadow-card",
  modal:   "bg-white rounded-2xl shadow-modal border border-ink-100",
  panel:   "bg-ink-50/60 rounded-lg border border-ink-150",
  inset:   "bg-ink-50 rounded-lg border border-ink-200",
  pillBg:  "bg-ink-100",
  /** Backdrop behind modals — semi-transparent + blur */
  scrim:   "bg-ink-800/25 backdrop-blur-md",
  /** Backdrop for drawers (less blur, faster perceived) */
  scrimLight: "bg-ink-800/25 backdrop-blur-sm",
} as const;

/* ──────────────────────────────────────────────── Z-index scale ─────── */

/** Z-index scale. Use these consistently to predict stacking. */
export const Z = {
  /** Sticky headers / breadcrumb bars within scrollable content */
  sticky:    "z-[1]",
  /** Hover tooltips */
  tooltip:   "z-[5]",
  /** Toasts (always above modals so they're never lost) */
  toast:     "z-[40]",
  /** Default modal — most dialogs */
  modal:     "z-[20]",
  /** Full-screen overlay (Compare, Reading mode, Knowledge graph) */
  fullscreen: "z-[30]",
  /** Drawer (slide-out panels) */
  drawer:    "z-[25]",
  /** Print drawer / batch ops bar */
  contextBar: "z-[2]",
} as const;

/* ──────────────────────────────────────────────── Interactive states ── */

/** Focus, hover, pressed and button helpers. */
export const INTERACTIVE = {
  /** focus-ring class (defined in index.css) — 3px accent shadow on focus-visible */
  focusRing:       "focus-ring",
  hoverRow:        "hover:bg-ink-50",
  pressedRow:      "bg-accent-50/60",
  buttonPrimary:   "bg-accent-600 hover:bg-accent-700 text-white shadow-card",
  buttonSecondary: "border border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300",
  buttonGhost:     "text-ink-500 hover:text-ink-800 hover:bg-ink-100",
} as const;
