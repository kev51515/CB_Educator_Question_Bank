/**
 * ClassSkillsView — "Skills" tab inside ClassLayout
 * =================================================
 * Class-wide, cross-test SAT skill mastery: per-domain %-correct aggregated over
 * every full-length test the class's enrolled students have taken (latest
 * attempt per student per test). Answers "where is this class weak overall?" —
 * the cross-test generalisation of the per-test Review heatmap/comparison.
 *
 * Reads the `course_skill_mastery` RPC (0123; course-scoped SECURITY DEFINER).
 * Reuses the shared skill palette/ordering (fulltest/skills.ts) and CSV helper
 * (lib/csv.ts) so it matches the other four skill surfaces. Renders nothing
 * heavy until loaded; shows an empty state until a class sits a full test.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { downloadCsv } from "@/lib/csv";
import { band, orderDomains, orderSections, pctOf, sectionLabel } from "@/fulltest/skills";
import { useClassContext } from "./classLayoutContext";

interface DomainRow {
  section: string;
  domain: string;
  correct: number;
  total: number;
}
interface Mastery {
  students: number;
  tests: number;
  attempts: number;
  domains: DomainRow[];
}

export function ClassSkillsView(): JSX.Element {
  const { cls } = useClassContext();
  const courseId = cls.id;
  const [data, setData] = useState<Mastery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const alive = { current: true };
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { data: res, error: err } = await supabase.rpc("course_skill_mastery", {
          p_course_id: courseId,
        });
        if (!alive.current) return;
        if (err) throw err;
        setData(res as Mastery);
      } catch (e) {
        if (alive.current) setError(e instanceof Error ? e.message : "Could not load class skills.");
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [courseId]);

  // Group the flat domain rows by section in canonical order, with %s.
  const grouped = useMemo(() => {
    const rows = data?.domains ?? [];
    const bySection = new Map<string, Map<string, DomainRow>>();
    for (const r of rows) {
      if (!bySection.has(r.section)) bySection.set(r.section, new Map());
      bySection.get(r.section)!.set(r.domain, r);
    }
    return orderSections(bySection.keys()).map((sec) => {
      const byName = bySection.get(sec)!;
      return {
        section: sec,
        domains: orderDomains(sec, byName.keys()).map((name) => {
          const r = byName.get(name)!;
          return { domain: name, correct: r.correct, total: r.total, pct: pctOf(r.correct, r.total) ?? 0 };
        }),
      };
    });
  }, [data]);

  const all = grouped.flatMap((g) => g.domains);
  const weakest = all.reduce<(typeof all)[number] | null>((w, d) => (!w || d.pct < w.pct ? d : w), null);

  const exportCsv = () => {
    const header = ["Section", "Domain", "% correct", "Correct", "Total"];
    const body = grouped.flatMap((g) =>
      g.domains.map((d) => [sectionLabel(g.section), d.domain, d.pct, d.correct, d.total]),
    );
    downloadCsv(`class-skills-${cls.short_code ?? courseId}.csv`, [header, ...body]);
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading class skills">
        <Skeleton className="h-8 w-64 rounded" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 rounded-lg" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900">
        {error}
      </p>
    );
  }
  if (all.length === 0) {
    return (
      <EmptyState
        icon="sparkles"
        title="No skill data yet"
        body="Once students in this class submit a full-length practice test, their per-skill mastery rolls up here."
      />
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Class skills
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Across {data!.tests} test{data!.tests === 1 ? "" : "s"} · {data!.students} student
            {data!.students === 1 ? "" : "s"} · latest attempt per test
            {weakest && (
              <>
                {" · "}weakest:{" "}
                <span
                  className="rounded px-1.5 py-0.5 font-semibold"
                  style={{ backgroundColor: band(weakest.pct).bg, color: band(weakest.pct).fg }}
                >
                  {weakest.domain} {weakest.pct}%
                </span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Export CSV
        </button>
      </div>

      {grouped.map((g) => (
        <div
          key={g.section}
          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {sectionLabel(g.section)}
          </h3>
          <div className="space-y-2.5">
            {g.domains.map((d) => (
              <div key={d.domain} className="flex items-center gap-3">
                <span className="w-48 shrink-0 truncate text-sm text-slate-700 dark:text-slate-200 sm:w-64">
                  {d.domain}
                </span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${d.pct}%`, backgroundColor: band(d.pct).bg }}
                  />
                </span>
                <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {d.correct}/{d.total} · {d.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
