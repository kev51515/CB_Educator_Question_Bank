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
import { useTestCatalogActivity } from "./useTestCatalogActivity";
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
const VIEW_KEY = "staff.fulltest.catalog.view";
const KIND_ORDER: SectionKind[] = ["full", "rw", "math"];

/** Top-level view: every test, or only those with a live sitting right now. */
type CatalogView = "all" | "live";

function readFilter(): CatalogFilter {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    if (v === "all" || v === "full" || v === "rw" || v === "math") return v;
  } catch {
    /* ignore */
  }
  return "all";
}

function readView(): CatalogView {
  try {
    return localStorage.getItem(VIEW_KEY) === "live" ? "live" : "all";
  } catch {
    return "all";
  }
}

export function FullTestCatalog() {
  const { tests, loading } = useFullTests();
  const { activity } = useTestCatalogActivity();
  const [resultsFor, setResultsFor] = useState<TestCatalogEntry | null>(null);
  const [monitorFor, setMonitorFor] = useState<TestCatalogEntry | null>(null);
  const [assignFor, setAssignFor] = useState<TestCatalogEntry | null>(null);
  const [filter, setFilterState] = useState<CatalogFilter>(readFilter);
  const [view, setViewState] = useState<CatalogView>(readView);

  const setFilter = (f: CatalogFilter): void => {
    setFilterState(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {
      /* ignore */
    }
  };

  const setView = (v: CatalogView): void => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  // Total students mid-sitting across the whole catalog — drives the "Live now"
  // toggle badge and the summary line.
  const liveTotals = useMemo(() => {
    let students = 0;
    let testsLive = 0;
    for (const t of tests) {
      const n = activity.get(t.slug)?.liveNow ?? 0;
      if (n > 0) {
        students += n;
        testsLive += 1;
      }
    }
    return { students, testsLive };
  }, [tests, activity]);

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

  // "Live now" only makes sense while something is live; if the view is stuck on
  // "live" but nothing's running, fall back to "all" so the page isn't empty.
  const effectiveView: CatalogView =
    view === "live" && liveTotals.testsLive === 0 ? "all" : view;

  const filtered = useMemo(() => {
    const bySection =
      effectiveFilter === "all"
        ? tests
        : tests.filter((t) => sectionKind(t.sections) === effectiveFilter);
    const byView =
      effectiveView === "live"
        ? bySection.filter((t) => (activity.get(t.slug)?.liveNow ?? 0) > 0)
        : bySection;
    // Surface live sittings first so activity is easy to spot, then keep the
    // catalog's natural ordinal order within each group.
    return [...byView].sort((a, b) => {
      const la = activity.get(a.slug)?.liveNow ?? 0;
      const lb = activity.get(b.slug)?.liveNow ?? 0;
      if ((lb > 0 ? 1 : 0) !== (la > 0 ? 1 : 0)) return (lb > 0 ? 1 : 0) - (la > 0 ? 1 : 0);
      return a.ordinal - b.ordinal;
    });
  }, [tests, effectiveFilter, effectiveView, activity]);

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

      {/* View switch: every test vs. only those with a live sitting right now. */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Catalog view"
          className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800"
        >
          {(["all", "live"] as CatalogView[]).map((v) => {
            const active = effectiveView === v;
            const isLive = v === "live";
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={active}
                className={
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 " +
                  (active
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200")
                }
              >
                {isLive && (
                  <span className="relative flex h-2 w-2" aria-hidden>
                    {liveTotals.students > 0 && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span
                      className={
                        "relative inline-flex h-2 w-2 rounded-full " +
                        (liveTotals.students > 0 ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")
                      }
                    />
                  </span>
                )}
                {isLive ? "Live now" : "All tests"}
                {isLive && liveTotals.students > 0 && (
                  <span className="rounded-full bg-emerald-100 px-1.5 text-xs font-semibold tabular-nums text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {liveTotals.students}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {liveTotals.students > 0 ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {liveTotals.students} student{liveTotals.students === 1 ? "" : "s"} testing
            live across {liveTotals.testsLive} test{liveTotals.testsLive === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            No live sittings right now
          </span>
        )}
      </div>

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
        {filtered.map((t) => {
          const act = activity.get(t.slug);
          const liveNow = act?.liveNow ?? 0;
          const assignedCourses = act?.assignedCourses ?? 0;
          return (
          <article
            key={t.slug}
            className={
              "flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md dark:bg-slate-900 " +
              (liveNow > 0
                ? "border-emerald-300 ring-1 ring-emerald-200 dark:border-emerald-800 dark:ring-emerald-900/60"
                : "border-slate-200 dark:border-slate-800")
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                    Full-length test
                  </span>
                  <SectionBadge sections={t.sections} />
                  {liveNow > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <span className="relative flex h-1.5 w-1.5" aria-hidden>
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      </span>
                      {liveNow} live
                    </span>
                  ) : assignedCourses > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Assigned · {assignedCourses}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                      Not assigned
                    </span>
                  )}
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
            <p className="mt-1 text-sm tabular-nums text-slate-500 dark:text-slate-400">
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
              {liveNow > 0 ? (
                <button
                  type="button"
                  onClick={() => setMonitorFor(t)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3.5 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                >
                  <span className="relative flex h-2 w-2" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Monitor {liveNow} live
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title={
                    assignedCourses > 0
                      ? "No one is taking this test right now. Monitor lights up while students are mid-sitting."
                      : "Assign this test to a course first — Monitor lights up while students are mid-sitting."
                  }
                  className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-400 dark:border-slate-700 dark:text-slate-600"
                >
                  <span className="inline-flex h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />
                  Monitor
                </button>
              )}
              <button
                type="button"
                onClick={() => setResultsFor(t)}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Results &amp; release
              </button>
            </div>
          </article>
          );
        })}
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
