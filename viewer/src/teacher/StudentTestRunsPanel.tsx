/**
 * StudentTestRunsPanel
 * ====================
 * Teacher surface (inside StudentProfilePage) to review a student's submitted
 * full-length tests and control whether the student can see their results.
 *
 * Students never see scores/answers at the end of a test (0072 + FullTestApp);
 * the teacher dispenses them here:
 *   • lists the student's submitted runs (list_test_runs_for_student RPC),
 *   • a "Release to student" / "Released ✓" toggle per run (release_test_results),
 *   • "Review" opens the full ResultView for that run (get_test_result is
 *     staff-readable), including the student's eliminated choices.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
import { useToast } from "@/components/Toast";
import { SkeletonRows } from "@/components/Skeleton";
import { getResult } from "@/fulltest/api";
import { ResultView } from "@/fulltest/ResultView";
import { StatusPill, RowAction } from "@/fulltest/test-overview";
import { useEscapeKey } from "@/hooks";
import type { TestResult } from "@/fulltest/types";

interface TestRunRow {
  run_id: string;
  test_slug: string;
  test_title: string;
  score: number | null;
  total: number | null;
  duration_seconds: number | null;
  submitted_at: string | null;
  results_released_at: string | null;
}

interface StudentTestRunsPanelProps {
  studentId: string | null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "";
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

export function StudentTestRunsPanel({ studentId }: StudentTestRunsPanelProps) {
  const toast = useToast();
  const { profile } = useProfile();
  // Only the lead teacher (admin) may release results or grant retakes.
  const isAdmin = profile?.role === "admin";
  const [rows, setRows] = useState<TestRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retakeBusyId, setRetakeBusyId] = useState<string | null>(null);
  const [grantedSlugs, setGrantedSlugs] = useState<Set<string>>(new Set());

  // The run currently open in the full-screen review overlay.
  const [reviewing, setReviewing] = useState<{ row: TestRunRow; result: TestResult } | null>(null);
  useEscapeKey(() => setReviewing(null), reviewing !== null);
  const [reviewLoadingId, setReviewLoadingId] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!studentId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "list_test_runs_for_student",
        { p_student_id: studentId },
      );
      if (rpcError) {
        setError(rpcError.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as TestRunRow[]);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load test results."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onToggleRelease = async (row: TestRunRow): Promise<void> => {
    const next = row.results_released_at === null;
    setBusyId(row.run_id);
    try {
      const { error: rpcError } = await supabase.rpc("release_test_results", {
        p_run_id: row.run_id,
        p_released: next,
      });
      if (rpcError) {
        toast.error("Couldn't update", rpcError.message);
        return;
      }
      // Optimistic local update.
      setRows((prev) =>
        prev.map((r) =>
          r.run_id === row.run_id
            ? { ...r, results_released_at: next ? new Date().toISOString() : null }
            : r,
        ),
      );
      toast.success(
        next ? "Results released to student" : "Results hidden from student",
      );
    } catch (err: unknown) {
      toast.error("Couldn't update", getErrorMessage(err, "Try again."));
    } finally {
      setBusyId(null);
    }
  };

  const onReview = async (row: TestRunRow): Promise<void> => {
    setReviewLoadingId(row.run_id);
    try {
      const result = await getResult(row.run_id);
      setReviewing({ row, result });
    } catch (err: unknown) {
      toast.error("Couldn't load result", getErrorMessage(err, "Try again."));
    } finally {
      setReviewLoadingId(null);
    }
  };

  // Grant one more attempt: the student's next visit to this test starts a
  // fresh run (tests are one-attempt by default).
  const onAllowRetake = async (row: TestRunRow): Promise<void> => {
    setRetakeBusyId(row.run_id);
    try {
      const { error: rpcError } = await supabase.rpc("allow_test_retake", {
        p_student_id: studentId,
        p_slug: row.test_slug,
      });
      if (rpcError) {
        toast.error("Couldn't allow retake", rpcError.message);
        return;
      }
      setGrantedSlugs((prev) => new Set(prev).add(row.test_slug));
      toast.success("Retake allowed", `${row.test_title} — they can take it again.`);
    } catch (err: unknown) {
      toast.error("Couldn't allow retake", getErrorMessage(err, "Try again."));
    } finally {
      setRetakeBusyId(null);
    }
  };

  return (
    <section
      aria-labelledby="test-runs-title"
      className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden"
    >
      <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <h2
          id="test-runs-title"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
        >
          Full-length tests
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Students don't see results until you release them.
        </p>
        {!isAdmin && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            View only — only the lead teacher (admin) can release results or grant retakes.
          </p>
        )}
      </header>

      {loading ? (
        <div className="px-5 py-5">
          <SkeletonRows count={2} rowClassName="h-12" />
        </div>
      ) : error ? (
        <p role="alert" className="px-5 py-6 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
          No submitted full-length tests yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row) => {
            const released = row.results_released_at !== null;
            return (
              <li
                key={row.run_id}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {row.test_title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(row.submitted_at)}
                    {row.score != null && row.total != null && (
                      <>
                        {" · "}
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {row.score}/{row.total} correct
                        </span>
                      </>
                    )}
                    {row.duration_seconds != null && ` · ${formatDuration(row.duration_seconds)}`}
                  </p>
                </div>

                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  <StatusPill
                    tone={released ? "released" : "hidden"}
                    label={released ? "Released" : "Hidden"}
                  />

                  <RowAction
                    tone="primary"
                    onClick={() => void onReview(row)}
                    disabled={reviewLoadingId === row.run_id}
                  >
                    {reviewLoadingId === row.run_id ? "Loading…" : "Review"}
                  </RowAction>

                  {isAdmin && (
                    <RowAction
                      onClick={() => void onToggleRelease(row)}
                      disabled={busyId === row.run_id}
                      title={
                        released
                          ? "Hide this student's results again"
                          : "Let this student see their score and answer review"
                      }
                    >
                      {busyId === row.run_id
                        ? "Working…"
                        : released
                          ? "Hide results"
                          : "Release to student"}
                    </RowAction>
                  )}
                  {isAdmin &&
                    (grantedSlugs.has(row.test_slug) ? (
                      <StatusPill tone="released" label="Retake allowed" />
                    ) : (
                      <RowAction
                        onClick={() => void onAllowRetake(row)}
                        disabled={retakeBusyId === row.run_id}
                        title="Tests are one attempt by default. Grant one more."
                      >
                        {retakeBusyId === row.run_id ? "…" : "Allow retake"}
                      </RowAction>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {reviewing && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-white dark:bg-slate-950">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                Reviewing: {reviewing.row.test_title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {reviewing.row.results_released_at
                  ? "Released to student"
                  : "Hidden from student"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReviewing(null)}
              aria-label="Close review"
              className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ResultView result={reviewing.result} testTitle={reviewing.row.test_title} />
          </div>
        </div>
      )}
    </section>
  );
}
