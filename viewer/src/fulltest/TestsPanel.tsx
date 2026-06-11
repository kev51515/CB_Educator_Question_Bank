/**
 * TestsPanel
 * ==========
 * Landing-page section that lists the available full-length tests (the public
 * `tests` catalog) and, per test, whether the student has an in-progress run
 * (→ Resume) or a finished one (→ shows score / Retake). Picking a test routes
 * to the proctored runner at /test/:slug.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { testRunPath } from "@/lib/routes";
import {
  CATALOG_SELECT,
  deriveSections,
  formatTestDuration,
  SectionBadge,
  totalTimeSeconds,
} from "./testSections";
import type { Section, TestCatalogEntry } from "./types";

interface RunRow {
  test_id: string;
  status: string;
  score: number | null;
  total: number | null;
}

interface CatalogRow extends TestCatalogEntry {
  id: string;
}

interface RawTestRow {
  id: string;
  slug: string;
  ordinal: number;
  title: string;
  short_title: string | null;
  total_questions: number;
  test_modules: { section: Section; time_limit_seconds: number }[] | null;
}

export function TestsPanel() {
  const navigate = useNavigate();
  const [tests, setTests] = useState<CatalogRow[]>([]);
  const [runs, setRuns] = useState<Record<string, RunRow>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: testRows } = await supabase
        .from("tests")
        .select(`id,${CATALOG_SELECT}`)
        .order("ordinal", { ascending: true });
      if (!alive) return;
      const list = ((testRows ?? []) as unknown as RawTestRow[]).map((r) => ({
        id: r.id,
        slug: r.slug,
        ordinal: r.ordinal,
        title: r.title,
        short_title: r.short_title,
        total_questions: r.total_questions,
        sections: deriveSections(r.test_modules),
        module_count: r.test_modules?.length ?? 0,
        total_time_seconds: totalTimeSeconds(r.test_modules),
      })) as CatalogRow[];
      setTests(list);

      // Best run per test for the current user (in-progress wins for "Resume",
      // else the latest submitted for the score badge).
      const { data: runRows } = await supabase
        .from("test_runs")
        .select("test_id,status,score,total,started_at")
        .order("started_at", { ascending: false });
      if (!alive) return;
      const byTest: Record<string, RunRow> = {};
      for (const r of (runRows ?? []) as (RunRow & { started_at: string })[]) {
        const existing = byTest[r.test_id];
        if (!existing) byTest[r.test_id] = r;
        else if (existing.status !== "in_progress" && r.status === "in_progress") byTest[r.test_id] = r;
      }
      setRuns(byTest);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <section className="space-y-3">
        <PanelHeading />
        <div className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </section>
    );
  }

  if (tests.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="practice-tests-title">
      <PanelHeading />
      <ul className="space-y-2">
        {tests.map((t) => {
          const run = runs[t.id];
          const inProgress = run?.status === "in_progress";
          const submitted = run?.status === "submitted";
          return (
            <li key={t.slug}>
              <button
                type="button"
                onClick={() => navigate(testRunPath(t.slug))}
                className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {t.title}
                    </span>
                    <SectionBadge sections={t.sections} />
                  </div>
                  <div className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    {t.total_questions} questions · {t.module_count ?? "—"} timed{" "}
                    {t.module_count === 1 ? "module" : "modules"}
                    {formatTestDuration(t.total_time_seconds) && (
                      <> · ~{formatTestDuration(t.total_time_seconds)}</>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {submitted && run.score != null && run.total != null && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {run.score}/{run.total}
                    </span>
                  )}
                  <span className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white">
                    {inProgress ? "Resume" : submitted ? "Retake" : "Start"} →
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PanelHeading() {
  return (
    <h2
      id="practice-tests-title"
      className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
    >
      Official practice tests
    </h2>
  );
}
