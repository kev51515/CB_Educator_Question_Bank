/**
 * pickleballSkills — the fixed app-level taxonomy of the 10 pickleball skills a
 * coach assesses for a player. This is the SINGLE SOURCE OF TRUTH shared by the
 * teacher Assessments panel and the student Progress card. Assessment rows store
 * per-skill scores in a jsonb object keyed by `slug` (a value drawn from
 * SKILL_LEVELS, e.g. "3.5"), so these slugs are a stable contract — adding a new
 * skill is additive; renaming an existing slug would orphan stored scores.
 *
 * Levels follow the USA Pickleball / DUPR-style 2.0–5.5 self-rating ladder in
 * half-step increments.
 */

export interface PickleballSkill {
  /** Stable jsonb key. Never rename — stored assessment scores key off this. */
  slug: string;
  /** Human-facing label shown in the UI. */
  label: string;
}

export const PICKLEBALL_SKILLS = [
  { slug: "serve", label: "Serve" },
  { slug: "return", label: "Return" },
  { slug: "dink", label: "Dink" },
  { slug: "third_shot_drop", label: "Third-Shot Drop" },
  { slug: "drive", label: "Drive" },
  { slug: "volley_reset", label: "Volley / Reset" },
  { slug: "lob_overhead", label: "Lob / Overhead" },
  { slug: "footwork", label: "Footwork" },
  { slug: "court_positioning", label: "Court Positioning" },
  { slug: "strategy", label: "Strategy / Shot Selection" },
] as const satisfies ReadonlyArray<PickleballSkill>;

/** Union of the 10 valid skill slugs. */
export type SkillSlug = (typeof PICKLEBALL_SKILLS)[number]["slug"];

/**
 * The discrete skill-level ladder (2.0 → 5.5, half-step). Coaches grade each
 * skill on this scale; stored in jsonb as the stringified number.
 */
export const SKILL_LEVELS = [
  "2.0",
  "2.5",
  "3.0",
  "3.5",
  "4.0",
  "4.5",
  "5.0",
  "5.5",
] as const;

/** Union of the valid skill-level strings. */
export type SkillLevel = (typeof SKILL_LEVELS)[number];

/** Lookup label for a slug (falls back to the slug itself if unknown). */
export function skillLabel(slug: string): string {
  return PICKLEBALL_SKILLS.find((s) => s.slug === slug)?.label ?? slug;
}
