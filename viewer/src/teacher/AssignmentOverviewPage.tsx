/**
 * AssignmentOverviewPage
 * ======================
 * Cohort Overview + live Monitor + results-release for one assignment — the
 * assignment analogue of the full-test /educator/tests/:slug overview.
 *
 * Mounted at /educator/courses/:courseId/assignments/:assignmentId/overview
 * (relative `assignments/:assignmentId/overview` inside ClassLayout's Routes).
 *
 * Data: useAssignmentRoster → assignment_roster_status (0209), polled live.
 * Actions: per-attempt + bulk results release (release_assignment_results /
 *   …_for_teacher), and a per-assignment "withhold results" toggle
 *   (assignments.withhold_results) which the student gate (Phase 3) honours.
 *
 * Honest limitation: assignment runners have no heartbeat, so "Monitor" shows
 * who is mid-attempt + elapsed time, not per-question position (full tests get
 * that from proctoring).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { SkeletonRows } from "@/components/Skeleton";
import { StatCard } from "@/fulltest/test-overview";
import {
  courseAssignmentPath,
  courseAssignmentAttemptPath,
} from "@/lib/routes";
import { useAssignmentRoster, type RosterRow } from "./useAssignmentRoster";

interface AssignmentMeta {
  id: string;
  title: string;
  course_id: string;
  kind: string;
  withhold_results: boolean;
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

type RowState = "submitted" | "in_progress" | "not_started";
function rowState(r: RosterRow): RowState {
  if (r.submitted_at) return "submitted";
  if (r.has_in_progress) return "in_progress";
  return "not_started";
}

function StatusPill({ state }: { state: RowState }): JSX.Element {
  const map: Record<RowState, { label: string; cls: string }> = {
    submitted: {
      label: "Submitted",
      cls: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
    },
    in_progress: {
      label: "In progress",
      cls: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
    },
    not_started: {
      label: "Not started",
      cls: "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
    },
  };
  const { label, cls } = map[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>
      {state === "in_progress" && (
        <span className="relative flex h-1.5 w-1.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
        </span>
      )}
      {label}
    </span>
  );
}

export function AssignmentOverviewPage(): JSX.Element {
  const { courseId, assignmentId } = useParams<{ courseId: string; assignmentId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [meta, setMeta] = useState<AssignmentMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busyAttempt, setBusyAttempt] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [withholdBusy, setWithholdBusy] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Resolve the assignment (param may be a short_code or a uuid).
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!assignmentId) return;
      setMetaLoading(true);
      const isShortCode = /^[A-Z0-9]{6}$/.test(assignmentId);
      const { data, error } = await supabase
        .from("assignments")
        .select("id, title, course_id, kind, withhold_results")
        .eq(isShortCode ? "short_code" : "id", assignmentId)
        .maybeSingle();
      if (!alive) return;
      if (error || !data) {
        setNotFound(true);
      } else {
        setMeta(data as AssignmentMeta);
      }
      setMetaLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [assignmentId]);

  const { rows, stats, loading: rosterLoading, refresh } = useAssignmentRoster(meta?.id ?? null);

  const detailPath = useMemo(
    () => (courseId && assignmentId ? courseAssignmentPath(courseId, assignmentId) : ""),
    [courseId, assignmentId],
  );

  const releaseOne = useCallback(
    async (row: RosterRow, released: boolean): Promise<void> => {
      if (!row.attempt_id) return;
      setBusyAttempt(row.attempt_id);
      try {
        const { error } = await supabase.rpc("release_assignment_results", {
          p_attempt_id: row.attempt_id,
          p_released: released,
        });
        if (error) {
          toast.error(released ? "Couldn't release" : "Couldn't hide", error.message);
          return;
        }
        toast.success(released ? "Released" : "Hidden", `${row.student_name ?? "Student"}`);
        refresh();
      } finally {
        if (aliveRef.current) setBusyAttempt(null);
      }
    },
    [toast, refresh],
  );

  const releaseAll = useCallback(
    async (released: boolean): Promise<void> => {
      if (!meta) return;
      setBulkBusy(true);
      try {
        const { data, error } = await supabase.rpc("release_assignment_results_for_teacher", {
          p_assignment_id: meta.id,
          p_released: released,
        });
        if (error) {
          toast.error("Couldn't update", error.message);
          return;
        }
        const n = (data as number) ?? 0;
        toast.success(
          released ? "Results released" : "Results hidden",
          n === 0 ? "Nothing to change" : `${n} student${n === 1 ? "" : "s"}`,
        );
        refresh();
      } finally {
        if (aliveRef.current) setBulkBusy(false);
      }
    },
    [meta, toast, refresh],
  );

  const toggleWithhold = useCallback(async (): Promise<void> => {
    if (!meta) return;
    const next = !meta.withhold_results;
    setWithholdBusy(true);
    try {
      const { error } = await supabase
        .from("assignments")
        .update({ withhold_results: next })
        .eq("id", meta.id);
      if (error) {
        toast.error("Couldn't update setting", error.message);
        return;
      }
      setMeta((m) => (m ? { ...m, withhold_results: next } : m));
      toast.success(
        next ? "Results withheld" : "Results auto-visible",
        next
          ? "Students see their score only once you release it"
          : "Students see their score as soon as they submit",
      );
    } finally {
      if (aliveRef.current) setWithholdBusy(false);
    }
  }, [meta, toast]);

  if (notFound) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">Assignment not found.</p>
      </div>
    );
  }

  const liveCount = stats.inProgress;
  const anyReleasable = rows.some((r) => r.submitted_at && r.results_released_at === null);
  const anyHideable = rows.some((r) => r.results_released_at !== null);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <button
          type="button"
          onClick={() => navigate(detailPath)}
          className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← Back to assignment
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {metaLoading ? "…" : meta?.title}
          </h1>
          {liveCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              {liveCount} working now
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Cohort overview, live monitor, and results release for this assignment.
        </p>
      </header>

      {/* Cohort stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Assigned" value={stats.assigned} loading={rosterLoading} />
        <StatCard label="Submitted" value={stats.submitted} loading={rosterLoading} tone="emerald" />
        <StatCard label="In progress" value={stats.inProgress} loading={rosterLoading} tone="indigo" />
        <StatCard
          label="Class average"
          value={stats.avg === null ? null : Math.round(stats.avg)}
          suffix={stats.avg === null ? undefined : "%"}
          loading={rosterLoading}
          sub={stats.top !== null ? `range ${Math.round(stats.low ?? 0)}–${Math.round(stats.top)}%` : undefined}
          ceremonial
        />
      </div>

      {/* Results-release controls */}
      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Results release</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {meta?.withhold_results
                ? "Withholding — students see their score only after you release it."
                : "Auto-visible — students see their score as soon as they submit."}{" "}
              {stats.submitted > 0 && (
                <span className="tabular-nums">
                  {stats.released}/{stats.submitted} released.
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleWithhold}
              disabled={withholdBusy || !meta}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {meta?.withhold_results ? "Stop withholding" : "Withhold results"}
            </button>
            <button
              type="button"
              onClick={() => void releaseAll(true)}
              disabled={bulkBusy || !anyReleasable}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              Release all
            </button>
            <button
              type="button"
              onClick={() => void releaseAll(false)}
              disabled={bulkBusy || !anyHideable}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Hide all
            </button>
          </div>
        </div>
      </section>

      {/* Roster table */}
      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        {rosterLoading && rows.length === 0 ? (
          <div className="p-4">
            <SkeletonRows count={5} rowClassName="h-10" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No students enrolled in this course yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium text-right">Score</th>
                <th className="px-4 py-2 font-medium">Results</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => {
                const state = rowState(r);
                const released = r.results_released_at !== null;
                return (
                  <tr key={r.student_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {r.student_name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill state={state} />
                      {state === "in_progress" && r.started_at && (
                        <span className="ml-2 text-xs tabular-nums text-slate-400">
                          {relTime(r.started_at)} elapsed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {r.effective_score === null ? "—" : `${Math.round(Number(r.effective_score))}%`}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.submitted_at ? (
                        released ? (
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Released</span>
                        ) : (
                          <span className="text-xs text-slate-400">Held</span>
                        )
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {r.attempt_id && r.submitted_at && (
                          <button
                            type="button"
                            onClick={() => void releaseOne(r, !released)}
                            disabled={busyAttempt === r.attempt_id}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            {released ? "Hide" : "Release"}
                          </button>
                        )}
                        {r.attempt_id && courseId && assignmentId && (
                          <Link
                            to={courseAssignmentAttemptPath(courseId, assignmentId, r.attempt_id)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
                          >
                            View
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
