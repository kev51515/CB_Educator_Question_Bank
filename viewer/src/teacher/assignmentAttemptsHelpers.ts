import { type AssignmentAttempt } from "./useAssignmentAttempts";

export type AttemptFilter = "all" | "ungraded" | "graded" | "in_progress";

export type AttemptSort =
  | "submitted_desc"
  | "submitted_asc"
  | "name_asc"
  | "score_desc"
  | "score_asc";

export interface AttemptsViewPrefs {
  filter: AttemptFilter;
  sort: AttemptSort;
}

export const DEFAULT_PREFS: AttemptsViewPrefs = {
  filter: "all",
  sort: "submitted_desc",
};

const FILTER_VALUES: ReadonlySet<AttemptFilter> = new Set<AttemptFilter>([
  "all",
  "ungraded",
  "graded",
  "in_progress",
]);

const SORT_VALUES: ReadonlySet<AttemptSort> = new Set<AttemptSort>([
  "submitted_desc",
  "submitted_asc",
  "name_asc",
  "score_desc",
  "score_asc",
]);

export function loadPrefs(storageKey: string | null): AttemptsViewPrefs {
  if (!storageKey || typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFS;
    const obj = parsed as Record<string, unknown>;
    const filter =
      typeof obj.filter === "string" && FILTER_VALUES.has(obj.filter as AttemptFilter)
        ? (obj.filter as AttemptFilter)
        : DEFAULT_PREFS.filter;
    const sort =
      typeof obj.sort === "string" && SORT_VALUES.has(obj.sort as AttemptSort)
        ? (obj.sort as AttemptSort)
        : DEFAULT_PREFS.sort;
    return { filter, sort };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function isUngraded(a: AssignmentAttempt): boolean {
  return a.submitted_at !== null && a.graded_at === null;
}

export function isGraded(a: AssignmentAttempt): boolean {
  return a.graded_at !== null;
}

export function isInProgress(a: AssignmentAttempt): boolean {
  return a.submitted_at === null;
}

export function effectiveScore(a: AssignmentAttempt): number | null {
  return a.score_override ?? a.score_percent;
}

export function compareNullableNumberDesc(
  x: number | null,
  y: number | null,
): number {
  // NULLs sort last regardless of direction.
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return y - x;
}

export function compareNullableNumberAsc(
  x: number | null,
  y: number | null,
): number {
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y;
}

export function compareNullableTimestampDesc(
  x: string | null,
  y: string | null,
): number {
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return y.localeCompare(x);
}

export function compareNullableTimestampAsc(
  x: string | null,
  y: string | null,
): number {
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x.localeCompare(y);
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatScore(percent: number | null): string {
  if (percent === null) return "—";
  return `${percent.toFixed(0)}%`;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong.";
}
