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
import { supabase } from "@/lib/supabase";
import {
  useStudentAssignments,
  type StudentAssignment,
  type StudentAssignmentAttempt,
} from "./useStudentAssignments";
import { SkeletonRows } from "@/components/Skeleton";
import { AssignmentRow } from "./AssignmentRow";
import {
  DEFAULT_VIEW,
  FILTER_LABELS,
  FILTER_ORDER,
  SORT_LABELS,
  SORT_ORDER,
  categorise,
  compareAssignments,
  isDueSoon,
  isGraded,
  isOpen,
  isPastDue,
  isSortKey,
  isSubmitted,
  matchesFilter,
  readView,
  toneForAssignment,
  writeView,
  type FilterKey,
  type SortKey,
  type ViewState,
} from "./assignmentsPanelHelpers";

interface AssignmentsPanelProps {
  /** Bump to force a refetch — same pattern as MyClassesPanel. */
  refreshToken?: number;
  onStart: (assignment: StudentAssignment) => void;
  onReview: (
    assignment: StudentAssignment,
    attempt: StudentAssignmentAttempt,
  ) => void;
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
