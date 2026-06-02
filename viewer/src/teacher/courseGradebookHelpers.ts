/**
 * courseGradebookHelpers
 * ======================
 * Pure helpers, constants, and types extracted from CourseGradebook.tsx.
 * Pure extraction — no behavior change; the main component imports these.
 */

export interface RosterRow {
  student_id: string;
  profiles: {
    display_name: string | null;
    email: string;
  } | null;
}

export interface AssignmentRow {
  id: string;
  title: string;
  created_at: string;
  /** ISO timestamp; nullable when teacher hasn't set a due date. */
  due_at: string | null;
}

export interface AttemptRow {
  id: string;
  assignment_id: string;
  student_id: string;
  status: string | null;
  score_percent: number | null;
  /** Teacher-set override (mig 0053). When non-null the cell prefers this
   *  and shows an "Adjusted" badge so Maya can see at a glance which
   *  scores were touched. */
  score_override: number | null;
  submitted_at: string | null;
}

export interface Student {
  student_id: string;
  display_name: string;
  email: string;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function truncateTitle(title: string, max = 20): string {
  if (title.length <= max) return title;
  return `${title.slice(0, max)}…`;
}

export function scoreToneClass(score: number): string {
  if (score >= 90)
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
  if (score >= 70)
    return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200";
  if (score >= 50)
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200";
}

export const NEUTRAL_CELL =
  "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";

export interface Cell {
  kind: "missing" | "draft" | "score";
  score?: number;
  /** True when score_override was the source of `score`. Drives the visual
   *  "Adjusted" badge on the cell. */
  adjusted?: boolean;
}

export function effectiveOf(attempt: AttemptRow): { value: number | null; adjusted: boolean } {
  if (attempt.score_override !== null && attempt.score_override !== undefined) {
    return { value: attempt.score_override, adjusted: true };
  }
  if (attempt.score_percent !== null && attempt.score_percent !== undefined) {
    return { value: attempt.score_percent, adjusted: false };
  }
  return { value: null, adjusted: false };
}

export function pickCell(attempt: AttemptRow | undefined): Cell {
  if (!attempt) return { kind: "missing" };
  const { value, adjusted } = effectiveOf(attempt);
  // "submitted" / completed-ish states with a numeric score render as score
  if (
    value !== null &&
    (attempt.status === "submitted" ||
      attempt.status === "graded" ||
      attempt.status === "completed" ||
      attempt.submitted_at !== null)
  ) {
    return { kind: "score", score: value, adjusted };
  }
  // numeric score with no submitted flag: still treat as score (defensive)
  if (
    value !== null &&
    attempt.status !== "in_progress" &&
    attempt.status !== "draft"
  ) {
    return { kind: "score", score: value, adjusted };
  }
  return { kind: "draft" };
}

export function renderCellText(cell: Cell): string {
  if (cell.kind === "missing") return "—";
  if (cell.kind === "draft") return "draft";
  return `${Math.round(cell.score ?? 0)}%`;
}

export function cellToneClass(cell: Cell): string {
  if (cell.kind === "score") return scoreToneClass(cell.score ?? 0);
  return NEUTRAL_CELL;
}

export function todayStamp(): string {
  // ISO-style yyyy-mm-dd for sortable, parser-friendly filenames.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format a percent score with one decimal of precision, no trailing `%`,
 *  so a downstream spreadsheet/script can parse it as a number. */
export function formatScoreCell(value: number): string {
  // Round to 1 decimal; strip a trailing `.0` so 87.0 → "87" but 87.5 → "87.5".
  const rounded = Math.round(value * 10) / 10;
  const s = rounded.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export type SortKey = "name" | "average";
export type SortDir = "asc" | "desc";

export interface GradebookSortState {
  key: SortKey;
  dir: SortDir;
}

export const sortStorageKey = (courseId: string): string =>
  `gradebook-sort:${courseId}`;

export function readSort(courseId: string): GradebookSortState {
  try {
    const raw = window.localStorage.getItem(sortStorageKey(courseId));
    if (!raw) return { key: "name", dir: "asc" };
    const parsed = JSON.parse(raw) as Partial<GradebookSortState>;
    const key: SortKey = parsed.key === "average" ? "average" : "name";
    const dir: SortDir = parsed.dir === "desc" ? "desc" : "asc";
    return { key, dir };
  } catch {
    return { key: "name", dir: "asc" };
  }
}

export function writeSort(courseId: string, state: GradebookSortState): void {
  try {
    window.localStorage.setItem(
      sortStorageKey(courseId),
      JSON.stringify(state),
    );
  } catch {
    // ignore (private mode, quota)
  }
}

/**
 * "Behind" filter for the gradebook. A row is kept if it matches the
 * predicate against at least one of the visible assignments:
 *   - all     → keep every row (no-op)
 *   - missing → has at least one assignment with no attempt AND past due
 *   - late    → has at least one submitted attempt whose submitted_at is
 *               after the assignment's due_at
 *   - ungraded→ has at least one draft / in-progress attempt with no score
 */
export type GradebookFilter = "all" | "missing" | "late" | "ungraded";

export const FILTER_LABELS: Record<GradebookFilter, string> = {
  all: "All",
  missing: "Missing only",
  late: "Late",
  ungraded: "Ungraded",
};

export const filterStorageKey = (courseId: string): string =>
  `gradebook.filter.${courseId}`;

export function readFilter(courseId: string): GradebookFilter {
  try {
    const raw = window.localStorage.getItem(filterStorageKey(courseId));
    if (raw === "missing" || raw === "late" || raw === "ungraded" || raw === "all") {
      return raw;
    }
    return "all";
  } catch {
    return "all";
  }
}

export function writeFilter(courseId: string, value: GradebookFilter): void {
  try {
    window.localStorage.setItem(filterStorageKey(courseId), value);
  } catch {
    // ignore
  }
}
