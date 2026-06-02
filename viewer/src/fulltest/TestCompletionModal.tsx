/**
 * TestCompletionModal
 * ===================
 * Teacher per-test class overview: who has taken a full-length test, their
 * score, and whether results are released — with bulk + per-student release.
 *
 * Opened from the Full-Test catalog ("Results"). Lists one row per student
 * (the caller's students; admins see all) via list_test_completion, supports
 * "Release all"/"Hide all" (release_test_results_for_teacher) and per-row
 * release + Review (ResultView, including eliminated choices).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toast";
import { useFocusTrap } from "../hooks";
import { SkeletonRows } from "../components/Skeleton";
import { getResult } from "./api";
import { ResultView } from "./ResultView";
import type { TestResult } from "./types";

interface CompletionRow {
  run_id: string;
  student_id: string;
  student_name: string | null;
  score: number | null;
  total: number | null;
  submitted_at: string | null;
  results_released_at: string | null;
}

interface TestCompletionModalProps {
  slug: string;
  title: string;
  onClose: () => void;
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

export function TestCompletionModal({ slug, title, onClose }: TestCompletionModalProps) {
  const toast = useToast();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);
  const [rows, setRows] = useState<CompletionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{ row: CompletionRow; result: TestResult } | null>(null);
  const [reviewLoadingId, setReviewLoadingId] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("list_test_completion", {
        p_slug: slug,
      });
      if (rpcError) {
        setError(rpcError.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as CompletionRow[]);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load completion."));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const releasedCount = rows.filter((r) => r.results_released_at !== null).length;
  const allReleased = rows.length > 0 && releasedCount === rows.length;

  const onBulk = async (released: boolean): Promise<void> => {
    setBulkBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "release_test_results_for_teacher",
        { p_slug: slug, p_released: released },
      );
      if (rpcError) {
        toast.error("Couldn't update", rpcError.message);
        return;
      }
      toast.success(
        released ? `Released ${data} result${data === 1 ? "" : "s"}` : "Results hidden",
      );
      await refresh();
    } catch (err: unknown) {
      toast.error("Couldn't update", getErrorMessage(err, "Try again."));
    } finally {
      setBulkBusy(false);
    }
  };

  const onToggleRow = async (row: CompletionRow): Promise<void> => {
    const next = row.results_released_at === null;
    setRowBusy(row.run_id);
    try {
      const { error: rpcError } = await supabase.rpc("release_test_results", {
        p_run_id: row.run_id,
        p_released: next,
      });
      if (rpcError) {
        toast.error("Couldn't update", rpcError.message);
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.run_id === row.run_id
            ? { ...r, results_released_at: next ? new Date().toISOString() : null }
            : r,
        ),
      );
    } catch (err: unknown) {
      toast.error("Couldn't update", getErrorMessage(err, "Try again."));
    } finally {
      setRowBusy(null);
    }
  };

  const onReview = async (row: CompletionRow): Promise<void> => {
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — results`}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={bulkBusy ? undefined : onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
              {title}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {rows.length} student{rows.length === 1 ? "" : "s"} submitted ·{" "}
              {releasedCount} released
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] -mt-1 -mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex-none"
          >
            ✕
          </button>
        </header>

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void onBulk(true)}
              disabled={bulkBusy || allReleased}
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
            >
              {bulkBusy ? "Working…" : "Release all to students"}
            </button>
            <button
              type="button"
              onClick={() => void onBulk(false)}
              disabled={bulkBusy || releasedCount === 0}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Hide all
            </button>
          </div>
        )}

        {loading ? (
          <SkeletonRows count={3} rowClassName="h-11" />
        ) : error ? (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No students have submitted this test yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
            {rows.map((row) => {
              const released = row.results_released_at !== null;
              return (
                <li key={row.run_id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {row.student_name ?? "Student"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(row.submitted_at)}
                      {row.score != null && row.total != null && ` · ${row.score}/${row.total}`}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                      released
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
                        : "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                    }`}
                  >
                    {released ? "Released" : "Hidden"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void onReview(row)}
                    disabled={reviewLoadingId === row.run_id}
                    className="rounded-md min-h-[32px] px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-60"
                  >
                    {reviewLoadingId === row.run_id ? "…" : "Review"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onToggleRow(row)}
                    disabled={rowBusy === row.run_id}
                    className="rounded-md min-h-[32px] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
                  >
                    {rowBusy === row.run_id ? "…" : released ? "Hide" : "Release"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {reviewing && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-white dark:bg-slate-950" onClick={(e) => e.stopPropagation()}>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {reviewing.row.student_name ?? "Student"} — {title}
            </p>
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
            <ResultView result={reviewing.result} testTitle={title} />
          </div>
        </div>
      )}
    </div>
  );
}
