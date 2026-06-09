/**
 * fulltest/skills — shared SAT skill-domain helpers
 * =================================================
 * One home for the things the Review heatmap, cross-class comparison, and the
 * student skill profile all need: the performance band palette, the official
 * College Board domain ordering, and section labels. Keeps the three surfaces
 * visually + semantically in lockstep (change a colour or a domain order once).
 */

export interface Band {
  /** fill colour */
  bg: string;
  /** legible text colour on that fill */
  fg: string;
}

/**
 * The app's standard 3-band performance palette (matches the Review sidebar
 * bars): emerald ≥70%, amber ≥40%, rose below. Text colour per band is chosen
 * for legibility on the fill — dark on amber, white on green/red.
 */
export const BANDS: { good: Band; mid: Band; bad: Band } = {
  good: { bg: "#10b981", fg: "#ffffff" }, // emerald-500
  mid: { bg: "#f59e0b", fg: "#1f2937" }, // amber-500 + slate-800 text
  bad: { bg: "#f43f5e", fg: "#ffffff" }, // rose-500
};

/** Band for a 0–100 percentage. */
export function band(pct: number): Band {
  return pct >= 70 ? BANDS.good : pct >= 40 ? BANDS.mid : BANDS.bad;
}

/** Hardest → easiest gradient (rose → amber → emerald) for legends. */
export const LEGEND_GRADIENT = `linear-gradient(to right, ${BANDS.bad.bg}, ${BANDS.mid.bg}, ${BANDS.good.bg})`;

/** Canonical domain display order within each section. */
export const DOMAIN_ORDER: Record<string, string[]> = {
  "reading-writing": [
    "Information and Ideas",
    "Craft and Structure",
    "Expression of Ideas",
    "Standard English Conventions",
  ],
  math: ["Algebra", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry"],
};

/** Sections in the order they appear on a test. */
export const SECTION_ORDER = ["reading-writing", "math"];

/** Reverse lookup: which section a domain belongs to (domains are section-exclusive).
 *  Lets surfaces that only have a domain name (e.g. the cross-test student report,
 *  whose RPC returns domains without a section) still group by section. */
const DOMAIN_TO_SECTION: Record<string, string> = Object.fromEntries(
  Object.entries(DOMAIN_ORDER).flatMap(([sec, doms]) => doms.map((d) => [d, sec])),
);
export function sectionForDomain(domain: string): string | null {
  return DOMAIN_TO_SECTION[domain] ?? null;
}

/** Human label for a section key. */
export function sectionLabel(s: string): string {
  return s === "reading-writing" ? "Reading & Writing" : s === "math" ? "Math" : s;
}

/** Sort a section's present domains into canonical order (unknown ones last). */
export function orderDomains(section: string, domains: Iterable<string>): string[] {
  const order = DOMAIN_ORDER[section] ?? [];
  return [...domains].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
}

/** Sort the present sections into canonical order (unknown ones last). */
export function orderSections(sections: Iterable<string>): string[] {
  const present = [...sections];
  return SECTION_ORDER.filter((s) => present.includes(s)).concat(
    present.filter((s) => !SECTION_ORDER.includes(s)),
  );
}

/** Rounded percentage, or null when nothing was attempted (no divide-by-zero). */
export function pctOf(correct: number, total: number): number | null {
  return total > 0 ? Math.round((correct / total) * 100) : null;
}

/** Whether an answer value is a plain MCQ choice letter (A–D) vs a typed/grid value. */
export function isChoiceLetter(value: string): boolean {
  return /^[A-D]$/.test(value);
}

// --- domain rollup grouping (shared by the course + system skill surfaces) ---

/** A flat per-domain tally as returned by the skill-mastery RPCs. */
export interface SkillDomainRow {
  section: string;
  domain: string;
  correct: number;
  total: number;
}
export interface SkillDomainStat extends SkillDomainRow {
  pct: number;
}
export interface SkillSectionGroup {
  section: string;
  domains: SkillDomainStat[];
}

/**
 * Group flat per-domain rows into canonical section → domain order with %s.
 * Shared so every "class/cohort skills" surface buckets identically.
 */
export function groupDomainRows(rows: SkillDomainRow[]): SkillSectionGroup[] {
  const bySection = new Map<string, Map<string, SkillDomainRow>>();
  for (const r of rows) {
    if (!bySection.has(r.section)) bySection.set(r.section, new Map());
    bySection.get(r.section)!.set(r.domain, r);
  }
  return orderSections(bySection.keys()).map((sec) => {
    const byName = bySection.get(sec)!;
    return {
      section: sec,
      domains: orderDomains(sec, byName.keys()).map((name) => {
        const r = byName.get(name)!;
        return { ...r, pct: pctOf(r.correct, r.total) ?? 0 };
      }),
    };
  });
}

/** The single weakest domain across grouped sections (lowest %), or null. */
export function weakestDomain(groups: SkillSectionGroup[]): SkillDomainStat | null {
  return groups
    .flatMap((g) => g.domains)
    .reduce<SkillDomainStat | null>((w, d) => (!w || d.pct < w.pct ? d : w), null);
}
