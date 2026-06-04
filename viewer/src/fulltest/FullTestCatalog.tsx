/**
 * FullTestCatalog
 * ===============
 * The "Full-Test" tab body on the unified Practice page (QuestionBankPage).
 * Lists every full-length proctored test (the `tests` table — e.g. the Nov-2023
 * DSAT). This is the canonical home for full tests; the legacy `mocktest`
 * assignment kind is retired (archived, no longer created from the UI).
 *
 * Embeddable (no page chrome): renders a heading + a responsive grid of test
 * cards. Each card links to the staff answer-key review (`/tests/:slug/review`)
 * and a student-style preview (`/test/:slug`).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { testRunPath, testReviewPath, testOverviewPath } from "@/lib/routes";
import { TestCompletionModal } from "./TestCompletionModal";
import { TestMonitorModal } from "./TestMonitorModal";
import { AssignTestModal } from "./AssignTestModal";
import type { TestCatalogEntry } from "./types";

export function FullTestCatalog() {
  const [tests, setTests] = useState<TestCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [resultsFor, setResultsFor] = useState<TestCatalogEntry | null>(null);
  const [monitorFor, setMonitorFor] = useState<TestCatalogEntry | null>(null);
  const [assignFor, setAssignFor] = useState<TestCatalogEntry | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("tests")
        .select("slug,ordinal,title,short_title,total_questions")
        .order("ordinal", { ascending: true });
      if (!alive) return;
      setTests((data ?? []) as TestCatalogEntry[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            aria-busy="true"
            className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900"
          />
        ))}
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          No full-length tests yet
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Full-length tests (e.g. a Digital SAT form) are seeded via migration and
          appear here once added.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Full-length, proctored, Bluebook-style tests — timed modules, server-graded,
        with an estimated SAT score. Review the answer key before assigning.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {tests.map((t) => (
          <article
            key={t.slug}
            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                  Full-length test
                </span>
                <h3 className="mt-2 truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                  <Link
                    to={testOverviewPath(t.slug)}
                    className="rounded transition hover:text-indigo-700 dark:hover:text-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    {t.title}
                  </Link>
                </h3>
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t.total_questions} questions · 4 timed modules
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to={testReviewPath(t.slug)}
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Review answer key
              </Link>
              <Link
                to={testRunPath(t.slug)}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Preview
              </Link>
              <button
                type="button"
                onClick={() => setAssignFor(t)}
                className="rounded-lg border border-indigo-300 px-3.5 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
              >
                Assign to course
              </button>
              <button
                type="button"
                onClick={() => setMonitorFor(t)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3.5 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
              >
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Monitor
              </button>
              <button
                type="button"
                onClick={() => setResultsFor(t)}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Results &amp; release
              </button>
            </div>
          </article>
        ))}
      </div>

      {resultsFor && (
        <TestCompletionModal
          slug={resultsFor.slug}
          title={resultsFor.title}
          onClose={() => setResultsFor(null)}
        />
      )}
      {monitorFor && (
        <TestMonitorModal
          slug={monitorFor.slug}
          title={monitorFor.title}
          onClose={() => setMonitorFor(null)}
        />
      )}
      {assignFor && (
        <AssignTestModal
          slug={assignFor.slug}
          title={assignFor.title}
          onClose={() => setAssignFor(null)}
        />
      )}
    </div>
  );
}
