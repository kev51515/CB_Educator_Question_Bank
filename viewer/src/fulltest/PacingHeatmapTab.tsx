/**
 * PacingHeatmapTab
 * ================
 * The "Pacing" tab inside the Class heatmap modal. Lets the teacher pick a
 * student from the class roster and see their per-question pace line-graph
 * against the fastest/slowest 25% of the class (PacingChartCard, migration
 * 0187). Roster comes from `test_roster_status` (the same RPC the test overview
 * uses); only students with a SUBMITTED run (run_id != null) can be charted.
 *
 * Self-contained: owns its roster fetch + selected-student state so the parent
 * heatmap stays presentational.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/Skeleton";
import { PacingChartCard, type PacingQuestionRef } from "./PacingChart";
import type { RosterRow } from "./test-overview/helpers";

interface ChartableStudent {
  runId: string;
  name: string;
}

export function PacingHeatmapTab({
  slug,
  courseId,
  moduleRange,
  questions,
}: {
  slug: string;
  courseId: string | null;
  moduleRange: { first: number; last: number } | null;
  questions: PacingQuestionRef[];
}): JSX.Element {
  const [roster, setRoster] = useState<ChartableStudent[] | null>(null);
  const [err, setErr] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRoster(null);
    setErr(false);
    supabase
      .rpc("test_roster_status", {
        p_slug: slug,
        p_first: moduleRange?.first ?? null,
        p_last: moduleRange?.last ?? null,
      })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setErr(true);
          return;
        }
        const rows = (data ?? []) as RosterRow[];
        const seen = new Set<string>();
        const chartable: ChartableStudent[] = [];
        for (const r of rows) {
          if (!r.run_id) continue;
          if (courseId && r.course_id !== courseId) continue;
          if (seen.has(r.student_id)) continue;
          seen.add(r.student_id);
          chartable.push({ runId: r.run_id, name: r.student_name ?? "Student" });
        }
        chartable.sort((a, b) => a.name.localeCompare(b.name));
        setRoster(chartable);
        setSelected((cur) => cur ?? chartable[0]?.runId ?? null);
      });
    return () => {
      alive = false;
    };
  }, [slug, courseId, moduleRange]);

  const selectedStudent = useMemo(
    () => roster?.find((s) => s.runId === selected) ?? null,
    [roster, selected],
  );

  if (err) {
    return (
      <p className="rounded-xl bg-slate-50 px-6 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:ring-slate-800">
        The class roster couldn&apos;t be loaded, so pacing isn&apos;t available right now.
      </p>
    );
  }

  if (roster == null) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (roster.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 px-6 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:ring-slate-800">
        No submitted sittings yet — pacing fills in once students in this class
        submit the test.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="pacing-student"
          className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
        >
          Student
        </label>
        <select
          id="pacing-student"
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          {roster.map((s) => (
            <option key={s.runId} value={s.runId}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          {roster.length} student{roster.length === 1 ? "" : "s"} with a submitted sitting
        </span>
      </div>

      {selected && (
        <PacingChartCard
          key={selected}
          runId={selected}
          questions={questions}
          studentName={selectedStudent?.name ?? null}
        />
      )}
    </div>
  );
}

export default PacingHeatmapTab;
