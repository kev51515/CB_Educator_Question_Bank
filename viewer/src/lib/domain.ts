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
