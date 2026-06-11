/**
 * StudentTestResultsPanel
 * =======================
 * Student-facing list of their submitted full-length tests (AreaSelector).
 * Results stay hidden until the teacher releases them:
 *   • released → "View results" opens the full ResultView (get_test_result is
 *     allowed for the owner once released).
 *   • not released → a muted "Awaiting teacher review" badge.
 *
 * Renders nothing when the student has no submitted tests (silence > clutter).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { getResult } from "@/fulltest/api";
import { ResultView } from "@/fulltest/ResultView";
import { useEscapeKey } from "@/hooks";
import type { TestResult } from "@/fulltest/types";

interface MyRunRow {
  run_id: string;
  test_slug: string;
  test_title: string;
  submitted_at: string | null;
  released: boolean;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export function StudentTestResultsPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<MyRunRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [viewing, setViewing] = useState<{ row: MyRunRow; result: TestResult } | null>(null);
  useEscapeKey(() => setViewing(null), viewing !== null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const { data, error } = await supabase.rpc("list_my_test_runs");
      if (!error) setRows((data ?? []) as MyRunRow[]);
    } catch {
      /* non-fatal — panel just stays empty */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onView = async (row: MyRunRow): Promise<void> => {
    setLoadingId(row.run_id);
    try {
      const result = await getResult(row.run_id);
      setViewing({ row, result });
    } catch (err: unknown) {
      toast.error("Couldn't load results", getErrorMessage(err, "Try again later."));
    } finally {
      setLoadingId(null);
    }
  };

  // Nothing to show until loaded + at least one submitted test.
  if (!loaded || rows.length === 0) return null;

  return (
    <section
      aria-labelledby="my-tests-title"
      className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-700"
    >
      <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <h2
          id="my-tests-title"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
        >
          Your test results
        </h2>
      </header>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((row) => (
          <li key={row.run_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {row.test_title}
              </p>
              {row.submitted_at && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Submitted {formatDate(row.submitted_at)}
                </p>
              )}
            </div>
            {row.released ? (
              <button
                type="button"
                onClick={() => void onView(row)}
                disabled={loadingId === row.run_id}
                className="rounded-lg min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 disabled:opacity-60"
              >
                {loadingId === row.run_id ? "Loading…" : "View results"}
              </button>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-700">
                Awaiting teacher review
              </span>
            )}
          </li>
        ))}
      </ul>

      {viewing && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-white dark:bg-slate-950">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {viewing.row.test_title}
            </p>
            <button
              type="button"
              onClick={() => setViewing(null)}
              aria-label="Close results"
              className="rounded-lg inline-flex items-center justify-center min-h-[40px] min-w-[40px] text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ResultView result={viewing.result} testTitle={viewing.row.test_title} />
          </div>
        </div>
      )}
    </section>
  );
}
