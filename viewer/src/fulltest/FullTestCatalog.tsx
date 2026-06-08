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
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { testRunPath, testReviewPath, testOverviewPath } from "@/lib/routes";
import { TestCompletionModal } from "./TestCompletionModal";
import { TestMonitorModal } from "./TestMonitorModal";
import { AssignTestModal } from "./AssignTestModal";
import { useFullTests } from "./useFullTests";
import {
  SectionBadge,
  formatTestDuration,
  sectionKind,
  SECTION_KIND_LABEL,
  type SectionKind,
} from "./testSections";
import type { TestCatalogEntry } from "./types";

type CatalogFilter = "all" | SectionKind;
const FILTER_KEY = "staff.fulltest.catalog.filter";
const KIND_ORDER: SectionKind[] = ["full", "rw", "math"];

function readFilter(): CatalogFilter {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    if (v === "all" || v === "full" || v === "rw" || v === "math") return v;
  } catch {
    /* ignore */
  }
  return "all";
}

export function FullTestCatalog() {
  const { tests, loading } = useFullTests();
  const [resultsFor, setResultsFor] = useState<TestCatalogEntry | null>(null);
  const [monitorFor, setMonitorFor] = useState<TestCatalogEntry | null>(null);
  const [assignFor, setAssignFor] = useState<TestCatalogEntry | null>(null);
  const [filter, setFilterState] = useState<CatalogFilter>(readFilter);

  const setFilter = (f: CatalogFilter): void => {
    setFilterState(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {
      /* ignore */
    }
  };

  // Which composition kinds actually exist — drives whether (and which) filter
  // chips render. A homogeneous catalog (all full) shows no filter row.
  const kindsPresent = useMemo(() => {
    const set = new Set<SectionKind>();
    for (const t of tests) {
      const k = sectionKind(t.sections);
      if (k) set.add(k);
    }
    return KIND_ORDER.filter((k) => set.has(k));
  }, [tests]);

  const effectiveFilter: CatalogFilter =
    filter !== "all" && !kindsPresent.includes(filter) ? "all" : filter;

  const filtered = useMemo(
    () =>
      effectiveFilter === "all"
        ? tests
        : tests.filter((t) => sectionKind(t.sections) === effectiveFilter),
    [tests, effectiveFilter],
  );

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
        Proctored, Bluebook-style tests — timed modules, server-graded, with an
        estimated score (full SAT for R&W + Math tests; a section score for
        single-section ones). Check the composition and review the answer key
        before assigning.
      </p>

      {kindsPresent.length > 1 && (
        <div
          role="group"
          aria-label="Filter tests by section"
          className="flex flex-wrap items-center gap-1.5"
        >
          {(["all", ...kindsPresent] as CatalogFilter[]).map((f) => {
            const active = effectiveFilter === f;
            const label = f === "all" ? "All" : SECTION_KIND_LABEL[f];
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={active}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 " +
                  (active
                    ? "bg-indigo-600 text-white ring-1 ring-indigo-600"
                    : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-200")
                }
              >
                {label}
              </button>
            );
          })}
          <span className="ml-auto text-xs tabular-nums text-slate-400 dark:text-slate-500">
            {filtered.length} of {tests.length}
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No tests match this filter.
          </p>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="mt-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Show all tests
          </button>
        </div>
      ) : (
      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((t) => (
          <article
            key={t.slug}
            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                    Full-length test
                  </span>
                  <SectionBadge sections={t.sections} />
                </div>
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
              {t.total_questions} questions · {t.module_count ?? "—"} timed{" "}
              {t.module_count === 1 ? "module" : "modules"}
              {formatTestDuration(t.total_time_seconds) && (
                <> · ~{formatTestDuration(t.total_time_seconds)}</>
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to={testReviewPath(t.slug)}
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Review Mode
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
      )}

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
          sections={assignFor.sections}
          onClose={() => setAssignFor(null)}
        />
      )}
    </div>
  );
}
