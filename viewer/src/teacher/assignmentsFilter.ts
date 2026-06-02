/**
 * assignmentsFilter
 * =================
 * Shared filter type + localStorage helpers for the teacher Assignments page.
 *
 * Extracted from AssignmentsPage.tsx so both the page and the toolbar can
 * reference the same `ArchiveFilter` union without circular imports.
 *
 * The filter is namespaced by (userId, classId) so two staff sharing a
 * browser profile don't clobber each other's preference.
 */
/**
 * Filter union. "recently-graded" surfaces assignments where ≥1 attempt
 * has been touched by a teacher in the last 7 days (graded_at OR feedback
 * changed). Backed by an embedded count in useAssignments.
 */
export type ArchiveFilter =
  | "active"
  | "archived"
  | "all"
  | "recently-graded";

/**
 * Namespace the filter key by user as well as class so two staff sharing a
 * browser profile don't clobber each other's preference. Mirrors
 * `collapseKey(userId, courseId)` in ModulesPage.
 */
export function filterKey(userId: string | null, classId: string): string {
  return `assignments-filter:${userId ?? "anon"}:${classId}`;
}

export function readFilter(key: string): ArchiveFilter {
  try {
    const raw = window.localStorage.getItem(key);
    if (
      raw === "active" ||
      raw === "archived" ||
      raw === "all" ||
      raw === "recently-graded"
    ) {
      return raw;
    }
  } catch {
    /* localStorage unavailable */
  }
  return "active";
}

/** Window for "Recently graded": last 7 days. */
export const RECENT_GRADING_WINDOW_DAYS = 7;
export function recentGradingCutoffIso(): string {
  const now = Date.now();
  const cutoff = now - RECENT_GRADING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return new Date(cutoff).toISOString();
}

export function writeFilter(key: string, value: ArchiveFilter): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
