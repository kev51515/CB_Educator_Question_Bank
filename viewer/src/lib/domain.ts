/**
 * domain — the product-vertical lens of the LMS.
 *
 * A "domain" groups the three verticals the platform serves:
 *
 *   'academic'   — classic SAT-prep teaching        (course_type 'class')
 *   'counseling' — college / career counseling       (course_type 'counseling')
 *   'coaching'   — pickleball coaching               (course_type
 *                  'pickleball_player' | 'pickleball_coach')
 *
 * The domain drives front-end VOCABULARY (Teacher / Counselor / Coach) and
 * ACCENT THEMING (indigo / emerald / orange). It is stored as a per-user
 * preference on `profiles.domain` (migration 0171) and is independent of
 * `profiles.role` — a single user can switch their active domain freely.
 *
 * This module is pure data + helpers (no React, no Supabase) so it can be
 * imported from anywhere — providers, components, the migration-mirroring
 * vocabulary canon, etc.
 */

export type Domain = "academic" | "counseling" | "coaching";

/** Ordered list of all domains (drives the switcher menu order). */
export const DOMAINS: readonly Domain[] = ["academic", "counseling", "coaching"];

/**
 * Map a raw `course_type` string to the domain it belongs to. Unknown /
 * null course types fall back to 'academic' (the historical default), matching
 * `normalizeCourseType` in useTeacherClasses.
 */
export function domainOf(courseType: string | null | undefined): Domain {
  switch (courseType) {
    case "counseling":
      return "counseling";
    case "pickleball_player":
    case "pickleball_coach":
      return "coaching";
    case "class":
    default:
      return "academic";
  }
}

/** The educator's title in a given domain. */
export function educatorLabel(domain: Domain): string {
  switch (domain) {
    case "counseling":
      return "Counselor";
    case "coaching":
      return "Coach";
    case "academic":
    default:
      return "Teacher";
  }
}

/**
 * The student-side label for a given `course_type`. This is finer-grained than
 * the domain (the coaching domain has two distinct student labels), so it keys
 * off course_type directly rather than the rolled-up domain.
 *
 *   class             → 'Student'
 *   counseling        → 'Advisee'
 *   pickleball_player → 'Player'
 *   pickleball_coach  → 'Coach-in-training'
 */
export function studentLabel(courseType: string | null | undefined): string {
  switch (courseType) {
    case "counseling":
      return "Advisee";
    case "pickleball_player":
      return "Player";
    case "pickleball_coach":
      return "Coach-in-training";
    case "class":
    default:
      return "Student";
  }
}

/**
 * Per-domain vocabulary bundle. `homeNoun` is the domain's display name used
 * where no specific course context exists (e.g. the staff header chip when the
 * user isn't inside a course).
 */
export const DOMAIN_VOCAB: Record<
  Domain,
  { educatorLabel: string; homeNoun: string }
> = {
  academic: { educatorLabel: "Teacher", homeNoun: "Academics" },
  counseling: { educatorLabel: "Counselor", homeNoun: "Counseling" },
  coaching: { educatorLabel: "Coach", homeNoun: "Coaching" },
};

/**
 * Per-domain accent color ramp, written as the `--accent-50`…`--accent-950` CSS
 * custom properties by `DomainProvider`. Tailwind's `accent` color maps to
 * these vars (see tailwind.config.js), so `accent-600` / `accent-50` re-theme
 * live when the active domain changes.
 *
 * Values are Tailwind's standard hex ramps:
 *   academic   = indigo
 *   counseling = emerald
 *   coaching   = orange
 */
export const DOMAIN_ACCENT: Record<Domain, Record<string, string>> = {
  // Tailwind `indigo`
  academic: {
    "50": "#eef2ff",
    "100": "#e0e7ff",
    "200": "#c7d2fe",
    "300": "#a5b4fc",
    "400": "#818cf8",
    "500": "#6366f1",
    "600": "#4f46e5",
    "700": "#4338ca",
    "800": "#3730a3",
    "900": "#312e81",
    "950": "#1e1b4b",
  },
  // Tailwind `emerald`
  counseling: {
    "50": "#ecfdf5",
    "100": "#d1fae5",
    "200": "#a7f3d0",
    "300": "#6ee7b7",
    "400": "#34d399",
    "500": "#10b981",
    "600": "#059669",
    "700": "#047857",
    "800": "#065f46",
    "900": "#064e3b",
    "950": "#022c22",
  },
  // Tailwind `orange`
  coaching: {
    "50": "#fff7ed",
    "100": "#ffedd5",
    "200": "#fed7aa",
    "300": "#fdba74",
    "400": "#fb923c",
    "500": "#f97316",
    "600": "#ea580c",
    "700": "#c2410c",
    "800": "#9a3412",
    "900": "#7c2d12",
    "950": "#431407",
  },
};

/**
 * Ivy Ledger accent ramps (active when the 'ivy' UI theme is on — see
 * lib/theme.ts). Same domain triad, re-voiced for the collegiate identity:
 *   academic   = navy   (#24407E at 600 — the brand accent)
 *   counseling = forest (#2E6B4F at 600)
 *   coaching   = bronze (#B05A14 at 600)
 * Hue spacing keeps the triad CVD-legible; 600/700 are the text/hover grades
 * used by most components (mirroring how the classic ramps are consumed).
 */
export const IVY_DOMAIN_ACCENT: Record<Domain, Record<string, string>> = {
  academic: {
    "50": "#f2f5fb",
    "100": "#e3e9f5",
    "200": "#c5d1ea",
    "300": "#9fb2d9",
    "400": "#6e89c0",
    "500": "#4763a3",
    "600": "#24407e",
    "700": "#1a2f61",
    "800": "#14254c",
    "900": "#101d3b",
    "950": "#0a1428",
  },
  counseling: {
    "50": "#f0f7f3",
    "100": "#dceee4",
    "200": "#b9dcc9",
    "300": "#8cc4a8",
    "400": "#5fa983",
    "500": "#3f8a67",
    "600": "#2e6b4f",
    "700": "#25573f",
    "800": "#1e4634",
    "900": "#173627",
    "950": "#0e241a",
  },
  coaching: {
    "50": "#fbf4ec",
    "100": "#f6e6d3",
    "200": "#ebcca4",
    "300": "#e0ae71",
    "400": "#e0954b",
    "500": "#dd7a28",
    "600": "#b05a14",
    "700": "#8e4910",
    "800": "#713a0e",
    "900": "#5a2f0d",
    "950": "#3a1d07",
  },
};

/** The accent ramp for a (theme, domain) pair. */
export function accentRampFor(
  theme: "classic" | "ivy",
  domain: Domain,
): Record<string, string> {
  return theme === "ivy" ? IVY_DOMAIN_ACCENT[domain] : DOMAIN_ACCENT[domain];
}

/** The accent ramp stops, in order — used by the provider to set CSS vars. */
export const ACCENT_STOPS: readonly string[] = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
];
