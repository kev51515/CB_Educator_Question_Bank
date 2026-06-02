/**
 * AssignmentsPanel
 * ================
 * Student-facing panel that surfaces assignments grouped by status:
 *   • To do      — not yet attempted, opens_at <= now
 *   • Past due   — due_at < now and not yet submitted (rose accent)
 *   • Completed  — submitted_at is non-null
 *
 * Wires "Start" / "Review" buttons via the `onStart` / `onReview` callbacks.
 * The actual mock-test runner integration happens wherever this panel is
 * mounted (e.g., AreaSelector) — the panel itself only emits intents.
 *
 * Filter + sort pills (Wave 21D+):
 *   Above the list, students can pivot the panel by a single filter chip
 *   (All / Past due / Due soon / Submitted / Graded) and a sort dropdown
 *   (Due asc/desc, Recently assigned, Course name). Selections persist to
 *   localStorage per user. When a non-default sort is active, the groupings
 *   collapse into a single flat list so the chosen order is honored end to
 *   end. Otherwise the original "To do / Past due / Completed" sections are
 *   preserved.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  useStudentAssignments,
  type StudentAssignment,
  type StudentAssignmentAttempt,
} from "./useStudentAssignments";
import { SkeletonRows } from "../components/Skeleton";

interface AssignmentsPanelProps {
  /** Bump to force a refetch — same pattern as MyClassesPanel. */
  refreshToken?: number;
  onStart: (assignment: StudentAssignment) => void;
  onReview: (
    assignment: StudentAssignment,
    attempt: StudentAssignmentAttempt,
  ) => void;
}

interface AssignmentRowProps {
  assignment: StudentAssignment;
  tone: "todo" | "past-due" | "completed";
  onStart: () => void;
  onReview: (attempt: StudentAssignmentAttempt) => void;
}

const SOURCE_LABELS: Record<StudentAssignment["source_id"], string> = {
  cb: "CB",
  sat: "SAT",
  mixed: "Mixed",
};

// ---------------------------------------------------------------------------
// Filter + sort vocabulary
// ---------------------------------------------------------------------------

type FilterKey =
  | "all"
  | "past_due"
  | "due_soon"
  | "submitted"
  | "graded";

type SortKey =
  | "due_asc"
  | "due_desc"
  | "recent"
  | "course";

interface ViewState {
  filter: FilterKey;
  sort: SortKey;
}

const DEFAULT_VIEW: ViewState = { filter: "all", sort: "due_asc" };

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All",
  past_due: "Past due",
  due_soon: "Due soon",
  submitted: "Submitted",
  graded: "Graded",
};

const FILTER_ORDER: FilterKey[] = [
  "all",
  "past_due",
  "due_soon",
  "submitted",
  "graded",
];

const SORT_LABELS: Record<SortKey, string> = {
  due_asc: "Due (earliest)",
  due_desc: "Due (latest)",
  recent: "Recently assigned",
  course: "Course name",
};

const SORT_ORDER: SortKey[] = ["due_asc", "due_desc", "recent", "course"];

const DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;

const VIEW_STORAGE_PREFIX = "student.assignmentsPanel.view:";

function viewStorageKey(userId: string): string {
  return `${VIEW_STORAGE_PREFIX}${userId}`;
}

function isFilterKey(v: unknown): v is FilterKey {
  return (
    v === "all" ||
    v === "past_due" ||
    v === "due_soon" ||
    v === "submitted" ||
    v === "graded"
  );
}

function isSortKey(v: unknown): v is SortKey {
  return (
    v === "due_asc" ||
    v === "due_desc" ||
    v === "recent" ||
    v === "course"
  );
}

function readView(userId: string | null): ViewState {
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

function writeView(userId: string | null, view: ViewState): void {
  if (!userId) return;
  try {
    localStorage.setItem(viewStorageKey(userId), JSON.stringify(view));
  } catch {
    // Quota / privacy mode — silently ignore.
  }
}

function formatTimeLimit(minutes: number): string {
  if (minutes <= 0) return "Untimed";
  return `${minutes} min`;
}

function formatTimeAgo(iso: string | null): string {
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

function formatDue(iso: string | null): string {
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

interface GradingIndicator {
  label: string;
  ariaLabel: string;
  className: string;
}

/**
 * Derive a "Graded" / "Feedback" pill for the most-recent submitted attempt.
 * Returns null when there is nothing teacher-authored to surface, or when the
 * attempt is still in-progress / not yet started.
 */
function buildGradingIndicator(
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

function AssignmentRow({
  assignment,
  tone,
  onStart,
  onReview,
}: AssignmentRowProps) {
  const attempt = assignment.my_attempt;
  const isCompleted = tone === "completed" && attempt?.submitted_at !== null;
  const gradingIndicator = buildGradingIndicator(attempt);

  // Tone palettes: keep the structure constant, vary the accent.
  const accentRing =
    tone === "past-due"
      ? "ring-rose-200 dark:ring-rose-900"
      : "ring-slate-200 dark:ring-slate-800";
  const accentBg =
    tone === "past-due"
      ? "bg-rose-50/80 dark:bg-rose-950/30"
      : "bg-white/80 dark:bg-slate-900/60";
  const dueColor =
    tone === "past-due"
      ? "text-rose-600 dark:text-rose-400"
      : "text-slate-500 dark:text-slate-400";

  return (
    <li
      className={`rounded-xl ${accentBg} ring-1 ${accentRing} px-4 py-3 flex items-start justify-between gap-3`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
          {assignment.title}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {assignment.class_name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span>{SOURCE_LABELS[assignment.source_id]}</span>
          <span aria-hidden>·</span>
          <span>{assignment.question_count} Q</span>
          <span aria-hidden>·</span>
          <span>{formatTimeLimit(assignment.time_limit_minutes)}</span>
          <span aria-hidden>·</span>
          <span className={dueColor}>{formatDue(assignment.due_at)}</span>
          {isCompleted && attempt?.score_percent !== null && attempt && (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                {Math.round(attempt.score_percent ?? 0)}%
              </span>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {gradingIndicator && (
          <span
            aria-label={gradingIndicator.ariaLabel}
            className={`inline-flex min-h-[24px] items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none ${gradingIndicator.className}`}
          >
            {gradingIndicator.label}
          </span>
        )}
        {isCompleted && attempt ? (
          <button
            type="button"
            onClick={() => onReview(attempt)}
            className="rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Review
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            className="rounded-md bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Start
          </button>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Predicates + helpers
// ---------------------------------------------------------------------------

function isOpen(a: StudentAssignment, now: number): boolean {
  const opensAt = new Date(a.opens_at).getTime();
  return !Number.isFinite(opensAt) || opensAt <= now;
}

function isSubmitted(a: StudentAssignment): boolean {
  return a.my_attempt !== null && a.my_attempt.submitted_at !== null;
}

function isGraded(a: StudentAssignment): boolean {
  const att = a.my_attempt;
  if (!att || att.submitted_at === null) return false;
  // Spec: graded requires both score (graded_at) AND feedback_text non-null.
  return att.graded_at != null && att.feedback_text != null;
}

function isPastDue(a: StudentAssignment, now: number): boolean {
  if (isSubmitted(a)) return false; // Submitted takes precedence.
  if (!a.due_at) return false;
  const dueMs = new Date(a.due_at).getTime();
  if (!Number.isFinite(dueMs)) return false;
  return dueMs < now;
}

function isDueSoon(a: StudentAssignment, now: number): boolean {
  if (isSubmitted(a)) return false;
  if (!a.due_at) return false;
  const dueMs = new Date(a.due_at).getTime();
  if (!Number.isFinite(dueMs)) return false;
  return dueMs >= now && dueMs <= now + DUE_SOON_MS;
}

function matchesFilter(
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

function compareAssignments(
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

interface CategorisedAssignments {
  todo: StudentAssignment[];
  pastDue: StudentAssignment[];
  completed: StudentAssignment[];
}

function categorise(
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

function toneForAssignment(
  a: StudentAssignment,
  now: number,
): "todo" | "past-due" | "completed" {
  if (isSubmitted(a)) return "completed";
  if (isPastDue(a, now)) return "past-due";
  return "todo";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AssignmentsPanel({
  refreshToken,
  onStart,
  onReview,
}: AssignmentsPanelProps) {
  const { assignments, loading, error, refresh } = useStudentAssignments();

  useEffect(() => {
    if (refreshToken === undefined) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  // Resolve the current user id once so we can scope localStorage per-account.
  // A null userId disables persistence (anonymous sessions just use defaults).
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        const uid = data.user?.id ?? null;
        setUserId(uid);
        setView(readView(uid));
        hydratedRef.current = true;
      } catch {
        if (!cancelled) {
          hydratedRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist view state changes (but only after hydration to avoid stomping
  // saved state with defaults on first render).
  useEffect(() => {
    if (!hydratedRef.current) return;
    writeView(userId, view);
  }, [userId, view]);

  // Pre-compute `now` once per render so all predicates share the same anchor.
  const now = Date.now();

  // Filter counts power the trailing "(N)" labels on each chip. We always
  // compute against the full open-assignment set so the counts don't drift
  // when a non-"all" filter is active.
  const counts = useMemo<Record<FilterKey, number>>(() => {
    const c: Record<FilterKey, number> = {
      all: 0,
      past_due: 0,
      due_soon: 0,
      submitted: 0,
      graded: 0,
    };
    for (const a of assignments) {
      if (!isOpen(a, now)) continue;
      c.all += 1;
      if (isPastDue(a, now)) c.past_due += 1;
      if (isDueSoon(a, now)) c.due_soon += 1;
      if (isSubmitted(a)) c.submitted += 1;
      if (isGraded(a)) c.graded += 1;
    }
    return c;
  }, [assignments, now]);

  // Apply filter, then sort. When sort is "due_asc" (the default) we preserve
  // the original "To do / Past due / Completed" grouping. Any other sort
  // flattens — grouping by status would fight the chosen order.
  const filtered = useMemo(() => {
    return assignments
      .filter((a) => isOpen(a, now))
      .filter((a) => matchesFilter(a, view.filter, now));
  }, [assignments, view.filter, now]);

  const preserveGrouping = view.sort === "due_asc" && view.filter === "all";

  const flatSorted = useMemo(() => {
    if (preserveGrouping) return [];
    return [...filtered].sort((a, b) => compareAssignments(a, b, view.sort));
  }, [filtered, view.sort, preserveGrouping]);

  const grouped = useMemo(() => {
    if (!preserveGrouping) return null;
    return categorise(filtered, now);
  }, [filtered, preserveGrouping, now]);

  const totalOpen = counts.all;
  const hasAnyAssignments = assignments.length > 0;

  // Accessibility: a polite live region announces filter changes. Use the
  // active-chip label + the visible count so screen readers know what's now
  // displayed without yelling at the user on every keystroke elsewhere.
  const liveMessage = useMemo(() => {
    const label = FILTER_LABELS[view.filter];
    const count = counts[view.filter];
    return `${label}: ${count} ${count === 1 ? "assignment" : "assignments"}`;
  }, [view.filter, counts]);

  const handleFilterChange = (next: FilterKey) => {
    setView((prev) => ({ ...prev, filter: next }));
  };

  const handleSortChange = (next: SortKey) => {
    setView((prev) => ({ ...prev, sort: next }));
  };

  const resetFilter = () => handleFilterChange("all");

  // Sort indicator chevron — points down for descending-style sorts, up
  // for ascending. Recently-assigned is implicitly descending (newest first).
  const sortChevron = view.sort === "due_asc" || view.sort === "course" ? "▲" : "▼";

  return (
    <section
      aria-labelledby="my-assignments-title"
      className="rounded-2xl bg-white/60 dark:bg-slate-900/40 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-4"
    >
      <header className="flex items-baseline justify-between">
        <h3
          id="my-assignments-title"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
        >
          My assignments
        </h3>
        {hasAnyAssignments && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {totalOpen} total
          </span>
        )}
      </header>

      {/* Filter + sort toolbar — render only when there's something to triage. */}
      {!loading && !error && hasAnyAssignments && (
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div
            role="tablist"
            aria-label="Filter assignments"
            className="flex flex-wrap items-center gap-1.5"
          >
            {FILTER_ORDER.map((key) => {
              const isActive = view.filter === key;
              const count = counts[key];
              const base =
                "inline-flex items-center min-h-[40px] rounded-full text-xs font-medium px-3 py-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";
              const active =
                "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700";
              const inactive =
                "bg-slate-100 text-slate-600 hover:border-indigo-400 hover:text-indigo-700 border border-transparent dark:bg-slate-800/70 dark:text-slate-300 dark:hover:text-indigo-300";
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="my-assignments-results"
                  onClick={() => handleFilterChange(key)}
                  className={`${base} ${isActive ? active : inactive}`}
                >
                  <span>{FILTER_LABELS[key]}</span>
                  <span
                    className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="sr-only">Sort assignments</span>
            <span aria-hidden className="select-none">
              {sortChevron}
            </span>
            <select
              aria-label="Sort assignments"
              value={view.sort}
              onChange={(e) => {
                const next = e.target.value;
                if (isSortKey(next)) handleSortChange(next);
              }}
              className="min-h-[40px] rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {SORT_ORDER.map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Live region for filter changes — sr-only, polite. */}
      <div aria-live="polite" className="sr-only">
        {hasAnyAssignments ? liveMessage : ""}
      </div>

      {loading ? (
        <SkeletonRows count={4} />
      ) : error ? (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : !hasAnyAssignments ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No assignments yet. They'll show up here when your teacher posts one.
        </p>
      ) : filtered.length === 0 ? (
        <div
          id="my-assignments-results"
          className="rounded-xl bg-slate-50/80 dark:bg-slate-900/40 ring-1 ring-slate-200 dark:ring-slate-800 px-4 py-6 text-center space-y-2"
        >
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No assignments match this filter
          </p>
          <button
            type="button"
            onClick={resetFilter}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-md min-h-[40px] px-3 py-2"
          >
            Show all
          </button>
        </div>
      ) : preserveGrouping && grouped ? (
        <div id="my-assignments-results" className="space-y-5">
          {grouped.todo.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                To do · {grouped.todo.length}
              </p>
              <ul className="space-y-2">
                {grouped.todo.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    assignment={a}
                    tone="todo"
                    onStart={() => onStart(a)}
                    onReview={(attempt) => onReview(a, attempt)}
                  />
                ))}
              </ul>
            </div>
          )}

          {grouped.pastDue.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                Past due · {grouped.pastDue.length}
              </p>
              <ul className="space-y-2">
                {grouped.pastDue.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    assignment={a}
                    tone="past-due"
                    onStart={() => onStart(a)}
                    onReview={(attempt) => onReview(a, attempt)}
                  />
                ))}
              </ul>
            </div>
          )}

          {grouped.completed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Completed · {grouped.completed.length}
              </p>
              <ul className="space-y-2">
                {grouped.completed.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    assignment={a}
                    tone="completed"
                    onStart={() => onStart(a)}
                    onReview={(attempt) => onReview(a, attempt)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <ul id="my-assignments-results" className="space-y-2">
          {flatSorted.map((a) => (
            <AssignmentRow
              key={a.id}
              assignment={a}
              tone={toneForAssignment(a, now)}
              onStart={() => onStart(a)}
              onReview={(attempt) => onReview(a, attempt)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
