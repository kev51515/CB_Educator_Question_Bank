/**
 * testSections
 * ============
 * Helpers for describing a full-length test's *section composition* so educators
 * can see — before assigning a test to a course — whether it covers Reading &
 * Writing, Math, or both. A test is a set of `test_modules`, each tagged
 * `section` ('reading-writing' | 'math'); not every seeded test is a full
 * 4-module SAT (some are RW-only, some Math-only), so the old hardcoded
 * "4 timed modules" copy was misleading.
 */
import type { Section } from "./types";

/** PostgREST select that pulls the catalog columns plus each test's module sections. */
export const CATALOG_SELECT =
  "slug,ordinal,title,short_title,total_questions,test_modules(section)";

const ORDER: Section[] = ["reading-writing", "math"];

/** Unique sections present across a test's modules, in canonical order (RW, then Math). */
export function deriveSections(
  modules: ReadonlyArray<{ section: Section }> | null | undefined,
): Section[] {
  const present = new Set((modules ?? []).map((m) => m.section));
  return ORDER.filter((s) => present.has(s));
}

export interface SectionSummary {
  /** Full label, e.g. "Reading & Writing + Math". */
  label: string;
  /** Compact label for tight chips/option text, e.g. "R&W + Math". */
  short: string;
  /** Tailwind tone classes (bg/text/ring, incl. dark variants). */
  tone: string;
}

const FULL: SectionSummary = {
  label: "Reading & Writing + Math",
  short: "R&W + Math",
  tone: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-900",
};
const RW_ONLY: SectionSummary = {
  label: "Reading & Writing only",
  short: "R&W only",
  tone: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900",
};
const MATH_ONLY: SectionSummary = {
  label: "Math only",
  short: "Math only",
  tone: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
};

/** Map a test's sections to a human label + tone. Empty → null (caller hides the badge). */
export function sectionSummary(
  sections: ReadonlyArray<Section> | null | undefined,
): SectionSummary | null {
  const hasRW = !!sections?.includes("reading-writing");
  const hasMath = !!sections?.includes("math");
  if (hasRW && hasMath) return FULL;
  if (hasMath) return MATH_ONLY;
  if (hasRW) return RW_ONLY;
  return null;
}

/** A pill showing a test's section composition. Renders nothing if unknown. */
export function SectionBadge({
  sections,
  className = "",
}: {
  sections: ReadonlyArray<Section> | null | undefined;
  className?: string;
}): JSX.Element | null {
  const summary = sectionSummary(sections);
  if (!summary) return null;
  return (
    <span
      title={summary.label}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${summary.tone} ${className}`}
    >
      {summary.label}
    </span>
  );
}
