/**
 * AssignmentAttemptsView
 * ======================
 * Teacher-facing list of all student attempts on a single assignment.
 *
 * Wave 19+: now supports BULK GRADING. Submitted rows expose a selection
 * checkbox; the header row has a master "select all submitted" checkbox.
 * When ≥1 row is picked, a sticky-bottom action bar appears with an
 * "Apply feedback template" primary action that opens the BulkGradeModal.
 *
 * On apply, a single UPDATE goes out via PostgREST:
 *
 *   supabase.from('assignment_attempts')
 *     .update({ feedback_text, score_override?, graded_at?, grader_id })
 *     .in('id', selectedIds)
 *
 * The notification trigger (0059) will fire once per attempt whose
 * feedback_text flipped null→non-null OR score_override changed; the
 * null-guard means re-writes on already-graded attempts won't spam students.
 *
 * Optimistic UI: selected rows gray out + show "Applying…" while the request
 * is in flight; on success the table refetches via `useAssignmentAttempts.refresh`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAssignmentAttempts,
  type AssignmentAttempt,
} from "./useAssignmentAttempts";
import { SkeletonRows } from "../components/Skeleton";
import { BulkGradeModal, type BulkGradePatch } from "./BulkGradeModal";
import { useToast } from "../components/Toast";
import { useProfile } from "../lib/profile";
import { supabase } from "../lib/supabase";

type AttemptFilter = "all" | "ungraded" | "graded" | "in_progress";

type AttemptSort =
  | "submitted_desc"
  | "submitted_asc"
  | "name_asc"
  | "score_desc"
  | "score_asc";

interface AttemptsViewPrefs {
  filter: AttemptFilter;
  sort: AttemptSort;
}

const DEFAULT_PREFS: AttemptsViewPrefs = {
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

function loadPrefs(storageKey: string | null): AttemptsViewPrefs {
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

function isUngraded(a: AssignmentAttempt): boolean {
  return a.submitted_at !== null && a.graded_at === null;
}

function isGraded(a: AssignmentAttempt): boolean {
  return a.graded_at !== null;
}

function isInProgress(a: AssignmentAttempt): boolean {
  return a.submitted_at === null;
}

function effectiveScore(a: AssignmentAttempt): number | null {
  return a.score_override ?? a.score_percent;
}

function compareNullableNumberDesc(
  x: number | null,
  y: number | null,
): number {
  // NULLs sort last regardless of direction.
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return y - x;
}

function compareNullableNumberAsc(
  x: number | null,
  y: number | null,
): number {
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y;
}

function compareNullableTimestampDesc(
  x: string | null,
  y: string | null,
): number {
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return y.localeCompare(x);
}

function compareNullableTimestampAsc(
  x: string | null,
  y: string | null,
): number {
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x.localeCompare(y);
}

interface AssignmentAttemptsViewProps {
  assignmentId: string;
  assignmentTitle: string;
  onBack: () => void;
  /** Open the per-attempt drilldown view for a given attempt id. */
  onOpenDetail: (attemptId: string) => void;
}

function formatTimestamp(iso: string | null): string {
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

function formatScore(percent: number | null): string {
  if (percent === null) return "—";
  return `${percent.toFixed(0)}%`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong.";
}

export function AssignmentAttemptsView({
  assignmentId,
  assignmentTitle,
  onBack,
  onOpenDetail,
}: AssignmentAttemptsViewProps) {
  const { attempts, loading, error, refresh } =
    useAssignmentAttempts(assignmentId);
  const toast = useToast();
  const { profile } = useProfile();

  // Selection state — set of attempt ids. Only submitted attempts can be
  // selected (in-progress attempts have nothing to grade yet).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // While a bulk apply is in flight, gray out the affected rows and disable
  // further interaction. `applyingIds` is the snapshot of selectedIds at
  // submit time so a user who clears selection mid-flight still sees the
  // right rows greyed.
  const [applyingIds, setApplyingIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [bulkModalOpen, setBulkModalOpen] = useState<boolean>(false);
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);

  const submittedAttempts = useMemo(
    () => attempts.filter((a) => a.submitted_at !== null),
    [attempts],
  );
  const submittedCount = submittedAttempts.length;

  // Persistence key — scoped per (teacher, assignment) per CLAUDE.md rule 5.
  const storageKey = useMemo<string | null>(() => {
    if (!profile?.id || !assignmentId) return null;
    return `teacher.attemptsView:${profile.id}:${assignmentId}`;
  }, [profile?.id, assignmentId]);

  const [filter, setFilter] = useState<AttemptFilter>(
    () => loadPrefs(storageKey).filter,
  );
  const [sort, setSort] = useState<AttemptSort>(
    () => loadPrefs(storageKey).sort,
  );
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Re-hydrate when the storage key resolves (profile may load after mount).
  useEffect(() => {
    if (!storageKey) return;
    const prefs = loadPrefs(storageKey);
    setFilter(prefs.filter);
    setSort(prefs.sort);
  }, [storageKey]);

  // Persist on change.
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ filter, sort } satisfies AttemptsViewPrefs),
      );
    } catch {
      // Quota exceeded / private mode — silently ignore.
    }
  }, [storageKey, filter, sort]);

  // Bucket counts — always reflect the unfiltered set so the chip badges
  // tell the teacher "switching to X would show Y rows".
  const filterCounts = useMemo(() => {
    let ungraded = 0;
    let graded = 0;
    let inProgress = 0;
    for (const a of attempts) {
      if (isInProgress(a)) inProgress += 1;
      else if (isGraded(a)) graded += 1;
      else if (isUngraded(a)) ungraded += 1;
    }
    return {
      all: attempts.length,
      ungraded,
      graded,
      in_progress: inProgress,
    } as const;
  }, [attempts]);

  // Apply pill filter + name search, then sort.
  const visibleAttempts = useMemo<AssignmentAttempt[]>(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    const filtered = attempts.filter((a) => {
      if (filter === "ungraded" && !isUngraded(a)) return false;
      if (filter === "graded" && !isGraded(a)) return false;
      if (filter === "in_progress" && !isInProgress(a)) return false;
      if (normalizedQuery) {
        const name = (a.student_display_name ?? "").toLocaleLowerCase();
        if (!name.includes(normalizedQuery)) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    switch (sort) {
      case "submitted_desc":
        sorted.sort((x, y) =>
          compareNullableTimestampDesc(x.submitted_at, y.submitted_at),
        );
        break;
      case "submitted_asc":
        sorted.sort((x, y) =>
          compareNullableTimestampAsc(x.submitted_at, y.submitted_at),
        );
        break;
      case "name_asc":
        sorted.sort((x, y) => {
          const nx = x.student_display_name ?? "";
          const ny = y.student_display_name ?? "";
          // Empty names sort to end so we can still see "real" rows up top.
          if (!nx && !ny) return 0;
          if (!nx) return 1;
          if (!ny) return -1;
          return nx.localeCompare(ny, undefined, { sensitivity: "base" });
        });
        break;
      case "score_desc":
        sorted.sort((x, y) =>
          compareNullableNumberDesc(effectiveScore(x), effectiveScore(y)),
        );
        break;
      case "score_asc":
        sorted.sort((x, y) =>
          compareNullableNumberAsc(effectiveScore(x), effectiveScore(y)),
        );
        break;
    }
    return sorted;
  }, [attempts, filter, sort, searchQuery]);

  // Live-region announcement when the filtered count changes.
  const filterAnnouncement = useMemo(() => {
    if (filter === "all" && !searchQuery.trim()) {
      return `${visibleAttempts.length} attempt${visibleAttempts.length === 1 ? "" : "s"}.`;
    }
    return `${visibleAttempts.length} attempt${visibleAttempts.length === 1 ? "" : "s"} match the current filter.`;
  }, [visibleAttempts.length, filter, searchQuery]);

  // Visible submitted attempts — what the master checkbox operates on, so
  // "select all" follows the active filter rather than steamrolling rows
  // the teacher has filtered out of view.
  const visibleSubmittedAttempts = useMemo(
    () => visibleAttempts.filter((a) => a.submitted_at !== null),
    [visibleAttempts],
  );
  const visibleSubmittedCount = visibleSubmittedAttempts.length;

  // For master checkbox state: checked if every visible submitted attempt
  // is selected, indeterminate if some are.
  const allSubmittedSelected =
    visibleSubmittedCount > 0 &&
    visibleSubmittedAttempts.every((a) => selectedIds.has(a.id));
  const someSubmittedSelected =
    !allSubmittedSelected &&
    visibleSubmittedAttempts.some((a) => selectedIds.has(a.id));

  // Count of selected attempts that are already graded — surfaced in the
  // modal as a "feedback will be REPLACED" warning.
  const alreadyGradedSelected = useMemo(() => {
    let n = 0;
    for (const a of attempts) {
      if (!selectedIds.has(a.id)) continue;
      if (a.graded_at !== null) n += 1;
    }
    return n;
  }, [attempts, selectedIds]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllSubmitted = useCallback(() => {
    setSelectedIds((prev) => {
      // Operates on the visible (filtered) submitted set so the checkbox
      // mirrors what the teacher actually sees.
      const everySelected =
        visibleSubmittedAttempts.length > 0 &&
        visibleSubmittedAttempts.every((a) => prev.has(a.id));
      const next = new Set(prev);
      if (everySelected) {
        for (const a of visibleSubmittedAttempts) next.delete(a.id);
      } else {
        for (const a of visibleSubmittedAttempts) next.add(a.id);
      }
      return next;
    });
  }, [visibleSubmittedAttempts]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set<string>());
  }, []);

  const handleApply = useCallback(
    async (patch: BulkGradePatch): Promise<void> => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;

      setBulkBusy(true);
      setApplyingIds(new Set(ids));

      // Build the actual UPDATE payload. grader_id is stamped whenever we're
      // writing feedback or marking-as-graded — i.e. whenever the row is being
      // teacher-touched in a graded sense.
      const payload: Record<string, unknown> = { ...patch };
      const writesFeedback =
        patch.feedback_text !== undefined || patch.graded_at !== undefined;
      if (writesFeedback && profile?.id) {
        payload.grader_id = profile.id;
      }

      try {
        const { error: updError } = await supabase
          .from("assignment_attempts")
          .update(payload)
          .in("id", ids);

        if (updError) throw updError;

        toast.success(
          "Feedback applied",
          `${ids.length} attempt${ids.length === 1 ? "" : "s"} updated.`,
        );
        setBulkModalOpen(false);
        clearSelection();
        await refresh();
      } catch (err: unknown) {
        toast.error("Couldn't apply feedback", getErrorMessage(err));
      } finally {
        setBulkBusy(false);
        setApplyingIds(new Set<string>());
      }
    },
    [selectedIds, profile, toast, refresh, clearSelection],
  );

  const selectedCount = selectedIds.size;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <span aria-hidden>←</span> Back to assignments
        </button>

        <header className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-2">
          <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
            Attempts
          </p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {assignmentTitle}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {attempts.length} attempt{attempts.length === 1 ? "" : "s"} ·{" "}
            {submittedCount} submitted
          </p>
        </header>

        <section
          aria-labelledby="attempts-title"
          className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden"
        >
          <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="attempts-title"
                className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
              >
                Student attempts
              </h2>
              {attempts.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2">
                    <span className="sr-only">Search students</span>
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search student…"
                      aria-label="Search students"
                      className="min-h-[40px] w-56 rounded-lg bg-white dark:bg-slate-950/60 ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 motion-safe:transition-colors"
                    />
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Sort
                    </span>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value as AttemptSort)}
                      aria-label="Sort attempts"
                      className="min-h-[40px] rounded-lg bg-white dark:bg-slate-950/60 ring-1 ring-slate-200 dark:ring-slate-700 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 motion-safe:transition-colors"
                    >
                      <option value="submitted_desc">
                        Most recent submission
                      </option>
                      <option value="submitted_asc">Oldest submission</option>
                      <option value="name_asc">Student name (A–Z)</option>
                      <option value="score_desc">Highest score</option>
                      <option value="score_asc">Lowest score</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
            {attempts.length > 0 && (
              <div
                role="tablist"
                aria-label="Filter attempts by grading status"
                className="flex flex-wrap items-center gap-2"
              >
                {(
                  [
                    { key: "all", label: "All", count: filterCounts.all },
                    {
                      key: "ungraded",
                      label: "Ungraded",
                      count: filterCounts.ungraded,
                    },
                    {
                      key: "graded",
                      label: "Graded",
                      count: filterCounts.graded,
                    },
                    {
                      key: "in_progress",
                      label: "In progress",
                      count: filterCounts.in_progress,
                    },
                  ] as ReadonlyArray<{
                    key: AttemptFilter;
                    label: string;
                    count: number;
                  }>
                ).map((chip) => {
                  const active = filter === chip.key;
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setFilter(chip.key)}
                      className={
                        "inline-flex items-center gap-1.5 min-h-[40px] rounded-full px-3 py-1.5 text-xs font-semibold motion-safe:transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-slate-900 " +
                        (active
                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                          : "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/60 ring-1 ring-slate-200 dark:ring-slate-700")
                      }
                    >
                      <span>{chip.label}</span>
                      <span
                        className={
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums " +
                          (active
                            ? "bg-white/20 text-white"
                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700")
                        }
                        aria-hidden
                      >
                        {chip.count}
                      </span>
                      <span className="sr-only">{chip.count} attempts</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p aria-live="polite" className="sr-only">
              {filterAnnouncement}
            </p>
          </header>

          {loading ? (
            <div className="px-6 py-6">
              <SkeletonRows count={3} />
            </div>
          ) : error ? (
            <p
              role="alert"
              className="px-6 py-8 text-sm text-rose-600 dark:text-rose-400"
            >
              {error}
            </p>
          ) : attempts.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400">
              No attempts yet. Students will appear here once they start the
              assignment.
            </p>
          ) : visibleAttempts.length === 0 ? (
            <div className="px-6 py-10 text-center space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No attempts match this filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFilter("all");
                  setSearchQuery("");
                }}
                className="inline-flex items-center min-h-[40px] rounded-full bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-slate-900 motion-safe:transition-colors"
              >
                Show all
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/40 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium w-10">
                      {visibleSubmittedCount > 0 ? (
                        <label className="inline-flex items-center justify-center cursor-pointer">
                          <span className="sr-only">
                            Select all {visibleSubmittedCount} submitted attempts
                          </span>
                          <input
                            type="checkbox"
                            aria-label={`Select all ${visibleSubmittedCount} submitted attempts`}
                            checked={allSubmittedSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = someSubmittedSelected;
                            }}
                            onChange={toggleAllSubmitted}
                            disabled={bulkBusy}
                            className="h-4 w-4 rounded ring-1 ring-slate-300 dark:ring-slate-700 focus:ring-2 focus:ring-indigo-500"
                          />
                        </label>
                      ) : (
                        <span className="sr-only">Select</span>
                      )}
                    </th>
                    <th className="px-6 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        Student
                        {sort === "name_asc" && (
                          <span aria-hidden className="text-indigo-500">
                            ▾
                          </span>
                        )}
                      </span>
                    </th>
                    <th className="px-6 py-3 font-medium">Email</th>
                    <th className="px-6 py-3 font-medium">Started</th>
                    <th className="px-6 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        Submitted
                        {sort === "submitted_desc" && (
                          <span aria-hidden className="text-indigo-500">
                            ▾
                          </span>
                        )}
                        {sort === "submitted_asc" && (
                          <span aria-hidden className="text-indigo-500">
                            ▴
                          </span>
                        )}
                      </span>
                    </th>
                    <th className="px-6 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        Score
                        {sort === "score_desc" && (
                          <span aria-hidden className="text-indigo-500">
                            ▾
                          </span>
                        )}
                        {sort === "score_asc" && (
                          <span aria-hidden className="text-indigo-500">
                            ▴
                          </span>
                        )}
                      </span>
                    </th>
                    <th className="px-6 py-3 font-medium sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleAttempts.map((a) => {
                    const isSubmitted = a.submitted_at !== null;
                    const isSelected = selectedIds.has(a.id);
                    const isApplying = applyingIds.has(a.id);
                    return (
                      <tr
                        key={a.id}
                        className={
                          isApplying
                            ? "opacity-60 bg-slate-100/60 dark:bg-slate-800/40"
                            : isSelected
                              ? "bg-indigo-50/50 dark:bg-indigo-950/20"
                              : ""
                        }
                      >
                        <td className="px-4 py-3 align-middle">
                          {isSubmitted ? (
                            <label className="inline-flex items-center justify-center cursor-pointer min-h-[40px] min-w-[40px] -my-2">
                              <span className="sr-only">
                                Select {a.student_display_name ?? a.student_email}
                                &rsquo;s attempt
                              </span>
                              <input
                                type="checkbox"
                                aria-label={`Select ${a.student_display_name ?? a.student_email}'s attempt`}
                                checked={isSelected}
                                onChange={() => toggleOne(a.id)}
                                disabled={bulkBusy}
                                className="h-4 w-4 rounded ring-1 ring-slate-300 dark:ring-slate-700 focus:ring-2 focus:ring-indigo-500"
                              />
                            </label>
                          ) : (
                            <span aria-hidden className="text-slate-300">
                              ·
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-slate-900 dark:text-slate-100">
                          {a.student_display_name ?? (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-slate-600 dark:text-slate-300">
                          {a.student_email || "—"}
                        </td>
                        <td className="px-6 py-3 text-slate-500 dark:text-slate-400">
                          {formatTimestamp(a.started_at)}
                        </td>
                        <td className="px-6 py-3 text-slate-500 dark:text-slate-400">
                          {formatTimestamp(a.submitted_at)}
                        </td>
                        <td className="px-6 py-3 text-slate-900 dark:text-slate-100 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {formatScore(a.effective_score ?? a.score_percent)}
                            {a.score_override !== null &&
                              a.score_override !== a.score_percent && (
                                <span
                                  title={`Auto ${formatScore(a.score_percent)} · Teacher set ${formatScore(a.score_override)}`}
                                  aria-label="Teacher-adjusted score"
                                  className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5"
                                >
                                  Adjusted
                                </span>
                              )}
                            {isApplying && (
                              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Applying…
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right">
                          {isSubmitted ? (
                            <button
                              type="button"
                              onClick={() => onOpenDetail(a.id)}
                              disabled={bulkBusy}
                              className="rounded-md bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-900 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                            >
                              View
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Spacer so the sticky bulk bar doesn't cover the last row. */}
        {selectedCount > 0 && <div aria-hidden className="h-20" />}
      </div>

      {/* Sticky bulk-actions bar — mirrors the AssignmentsPage BulkActionsBar
       *  styling but with an action set specific to grading. We intentionally
       *  inline this rather than reuse BulkActionsBar (whose button labels
       *  are hardcoded to Archive/Unarchive/Delete). */}
      {selectedCount > 0 && (
        <div
          role="region"
          aria-label="Bulk grading actions"
          className="fixed bottom-4 left-0 right-0 z-40 px-3 pointer-events-none"
        >
          <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-indigo-300 dark:ring-indigo-700 shadow-xl px-4 py-2.5 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {selectedCount} selected
            </span>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => setBulkModalOpen(true)}
              className="min-h-[40px] rounded-full px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkBusy ? "Applying…" : "Apply feedback template"}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={bulkBusy}
              className="ml-auto min-h-[40px] text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {bulkModalOpen && (
        <BulkGradeModal
          selectedIds={Array.from(selectedIds)}
          alreadyGradedCount={alreadyGradedSelected}
          busy={bulkBusy}
          onClose={() => {
            if (!bulkBusy) setBulkModalOpen(false);
          }}
          onApply={handleApply}
        />
      )}
    </div>
  );
}
