import {
  type StudentAssignment,
  type StudentAssignmentAttempt,
} from "./useStudentAssignments";

export const SOURCE_LABELS: Record<StudentAssignment["source_id"], string> = {
  cb: "CB",
  sat: "SAT",
  mixed: "Mixed",
};

// ---------------------------------------------------------------------------
// Filter + sort vocabulary
// ---------------------------------------------------------------------------

export type FilterKey =
  | "all"
  | "past_due"
  | "due_soon"
  | "submitted"
  | "graded";

export type SortKey =
  | "due_asc"
  | "due_desc"
  | "recent"
  | "course";

export interface ViewState {
  filter: FilterKey;
  sort: SortKey;
}

export const DEFAULT_VIEW: ViewState = { filter: "all", sort: "due_asc" };

export const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All",
  past_due: "Past due",
  due_soon: "Due soon",
  submitted: "Submitted",
  graded: "Graded",
};

export const FILTER_ORDER: FilterKey[] = [
  "all",
  "past_due",
  "due_soon",
  "submitted",
  "graded",
];

export const SORT_LABELS: Record<SortKey, string> = {
  due_asc: "Due (earliest)",
  due_desc: "Due (latest)",
  recent: "Recently assigned",
  course: "Course name",
};

export const SORT_ORDER: SortKey[] = ["due_asc", "due_desc", "recent", "course"];

const DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;
/** Tighter "act now" window than the 7-day `isDueSoon` filter — drives the
 *  amber urgency accent on To-do rows. */
const DUE_IMMINENT_MS = 24 * 60 * 60 * 1000;

const VIEW_STORAGE_PREFIX = "student.assignmentsPanel.view:";

function viewStorageKey(userId: string): string {
  return `${VIEW_STORAGE_PREFIX}${userId}`;
}

export function isFilterKey(v: unknown): v is FilterKey {
  return (
    v === "all" ||
    v === "past_due" ||
    v === "due_soon" ||
    v === "submitted" ||
    v === "graded"
  );
}

export function isSortKey(v: unknown): v is SortKey {
  return (
    v === "due_asc" ||
    v === "due_desc" ||
    v === "recent" ||
    v === "course"
  );
}

export function readView(userId: string | null): ViewState {
  if (!userId) return DEFAULT_VIEW;
  try {
    const raw = localStorage.getItem(viewStorageKey(userId));
    if (!raw) return DEFAULT_VIEW;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      isFilterKey((parsed as { filter?: unknown }).filter) &&
      isSortKey((parsed as { sort?: unknown }).sort)
    ) {
      return {
        filter: (parsed as { filter: FilterKey }).filter,
        sort: (parsed as { sort: SortKey }).sort,
      };
    }
  } catch {
    // Corrupted entry — fall through to default.
  }
  return DEFAULT_VIEW;
}

export function writeView(userId: string | null, view: ViewState): void {
  if (!userId) return;
  try {
    localStorage.setItem(viewStorageKey(userId), JSON.stringify(view));
  } catch {
    // Quota / privacy mode — silently ignore.
  }
}

export function formatTimeLimit(minutes: number): string {
  if (minutes <= 0) return "Untimed";
  return `${minutes} min`;
}

export function formatTimeAgo(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  const minute = 1000 * 60;
  const hour = minute * 60;
  const day = hour * 24;
  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.round(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.round(diffMs / hour)}h ago`;
  const days = Math.round(diffMs / day);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function formatDue(iso: string | null): string {
  if (!iso) return "No due date";
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return "No due date";
  const now = Date.now();
  const diffMs = due.getTime() - now;
  const dayMs = 1000 * 60 * 60 * 24;
  const diffDays = Math.round(diffMs / dayMs);
  if (diffDays === 0) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) return "Due now";
    if (diffHours > 0) return `Due in ${diffHours}h`;
    return `Due ${Math.abs(diffHours)}h ago`;
  }
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays === -1) return "Due yesterday";
  if (diffDays > 1) return `Due in ${diffDays} days`;
  return `Due ${Math.abs(diffDays)} days ago`;
}

export interface GradingIndicator {
  label: string;
  ariaLabel: string;
  className: string;
}

/**
 * Derive a "Graded" / "Feedback" pill for the most-recent submitted attempt.
 * Returns null when there is nothing teacher-authored to surface, or when the
 * attempt is still in-progress / not yet started.
 */
export function buildGradingIndicator(
  attempt: StudentAssignmentAttempt | null,
): GradingIndicator | null {
  if (!attempt || attempt.submitted_at === null) return null;
  const hasFeedback = attempt.feedback_text != null;
  const hasGrade = attempt.graded_at != null;
  if (!hasFeedback && !hasGrade) return null;

  const timeAgo = hasGrade ? formatTimeAgo(attempt.graded_at ?? null) : "";

  if (hasGrade && hasFeedback) {
    return {
      label: timeAgo ? `Graded ${timeAgo} · Feedback` : "Graded · Feedback",
      ariaLabel: "Teacher has graded this attempt and left written feedback.",
      className:
        "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    };
  }
  if (hasFeedback) {
    return {
      label: "Feedback",
      ariaLabel: "Teacher has left written feedback on this attempt.",
      className:
        "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    };
  }
  return {
    label: timeAgo ? `Graded ${timeAgo}` : "Graded",
    ariaLabel: "Teacher has graded this attempt.",
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  };
}

// ---------------------------------------------------------------------------
// Predicates + helpers
// ---------------------------------------------------------------------------

export function isOpen(a: StudentAssignment, now: number): boolean {
  const opensAt = new Date(a.opens_at).getTime();
  return !Number.isFinite(opensAt) || opensAt <= now;
}

export function isSubmitted(a: StudentAssignment): boolean {
  return a.my_attempt !== null && a.my_attempt.submitted_at !== null;
}

export function isGraded(a: StudentAssignment): boolean {
  const att = a.my_attempt;
  if (!att || att.submitted_at === null) return false;
  // Spec: graded requires both score (graded_at) AND feedback_text non-null.
  return att.graded_at != null && att.feedback_text != null;
}

export function isPastDue(a: StudentAssignment, now: number): boolean {
  if (isSubmitted(a)) return false; // Submitted takes precedence.
  if (!a.due_at) return false;
  const dueMs = new Date(a.due_at).getTime();
  if (!Number.isFinite(dueMs)) return false;
  return dueMs < now;
}

export function isDueSoon(a: StudentAssignment, now: number): boolean {
  if (isSubmitted(a)) return false;
  if (!a.due_at) return false;
  const dueMs = new Date(a.due_at).getTime();
  if (!Number.isFinite(dueMs)) return false;
  return dueMs >= now && dueMs <= now + DUE_SOON_MS;
}

/** Due within the next 24h and not yet submitted — the "act now" urgency band
 *  that warrants an amber accent on a To-do row. */
export function isDueImminent(a: StudentAssignment, now: number): boolean {
  if (isSubmitted(a)) return false;
  if (!a.due_at) return false;
  const dueMs = new Date(a.due_at).getTime();
  if (!Number.isFinite(dueMs)) return false;
  return dueMs >= now && dueMs <= now + DUE_IMMINENT_MS;
}

export function matchesFilter(
  a: StudentAssignment,
  filter: FilterKey,
  now: number,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "past_due":
      return isPastDue(a, now);
    case "due_soon":
      return isDueSoon(a, now);
    case "submitted":
      return isSubmitted(a);
    case "graded":
      return isGraded(a);
  }
}

function dueMsForSort(a: StudentAssignment, fallback: number): number {
  if (!a.due_at) return fallback;
  const t = new Date(a.due_at).getTime();
  return Number.isFinite(t) ? t : fallback;
}

export function compareAssignments(
  a: StudentAssignment,
  b: StudentAssignment,
  sort: SortKey,
): number {
  switch (sort) {
    case "due_asc": {
      // Items with no due_at sink to the bottom.
      const av = dueMsForSort(a, Number.POSITIVE_INFINITY);
      const bv = dueMsForSort(b, Number.POSITIVE_INFINITY);
      if (av !== bv) return av - bv;
      return a.title.localeCompare(b.title);
    }
    case "due_desc": {
      const av = dueMsForSort(a, Number.NEGATIVE_INFINITY);
      const bv = dueMsForSort(b, Number.NEGATIVE_INFINITY);
      if (av !== bv) return bv - av;
      return a.title.localeCompare(b.title);
    }
    case "recent": {
      const av = Date.parse(a.created_at) || 0;
      const bv = Date.parse(b.created_at) || 0;
      if (av !== bv) return bv - av;
      return a.title.localeCompare(b.title);
    }
    case "course": {
      const cmp = a.class_name.localeCompare(b.class_name);
      if (cmp !== 0) return cmp;
      return a.title.localeCompare(b.title);
    }
  }
}

export interface CategorisedAssignments {
  todo: StudentAssignment[];
  pastDue: StudentAssignment[];
  completed: StudentAssignment[];
}

export function categorise(
  assignments: StudentAssignment[],
  now: number,
): CategorisedAssignments {
  const todo: StudentAssignment[] = [];
  const pastDue: StudentAssignment[] = [];
  const completed: StudentAssignment[] = [];

  for (const a of assignments) {
    if (!isOpen(a, now)) continue; // Not yet open — skip in MVP.
    if (isSubmitted(a)) {
      completed.push(a);
      continue;
    }
    if (isPastDue(a, now)) {
      pastDue.push(a);
    } else {
      todo.push(a);
    }
  }
  return { todo, pastDue, completed };
}

export function toneForAssignment(
  a: StudentAssignment,
  now: number,
): "todo" | "past-due" | "completed" {
  if (isSubmitted(a)) return "completed";
  if (isPastDue(a, now)) return "past-due";
  return "todo";
}
