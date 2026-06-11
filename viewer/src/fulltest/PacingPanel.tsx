/**
 * PacingPanel
 * ===========
 * The student-facing "your pace vs. the class" section of the test report.
 *
 * Data: `get_test_pacing_cohort` (0187) — per question, YOUR time plus the
 * average pace of the fastest-25% and slowest-25% of classmates (stable
 * cohorts over total time) and the whole-class average. That spread renders
 * as a quiet band per question with your line/dots on top, so you can see
 * exactly where you sit inside the class's fastest↔slowest range — the same
 * `PacingChart` the teacher Replay page uses, voiced for the student
 * ("You", domain-accent line, click a question to jump to its review card).
 *
 * Summary chips (your total / class avg / notably-slower count) are computed
 * over the COMPARABLE set — questions where both you and the class have a
 * time — so a partial sitting compares fairly.
 *
 * Renders a quiet placeholder (not nothing) only while loading; disappears
 * entirely when the sitting has no timing data at all — pacing is a bonus,
 * not a core part of the result.
 */
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/Skeleton";
import { getPacingCohort } from "./api";
import { PacingChart, type PacingPoint } from "./PacingChart";
import type { PacingCohortRow, ResultQuestion } from "./types";

/** ms → "m:ss" (e.g. 95000 → "1:35", 42000 → "0:42"). Null/garbage → "—". */
export function fmtMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Classify a student's time on a question relative to the class average:
 *   fast  (ratio < 0.8) · even (0.8–1.3) · slow (> 1.3) · none (no comparison).
 * Still consumed by ResultView's per-question PacePill.
 */
export function paceTone(
  yours: number | null,
  avg: number | null,
): "fast" | "even" | "slow" | "none" {
  if (yours == null || avg == null || avg <= 0) return "none";
  const r = yours / avg;
  if (r < 0.8) return "fast";
  if (r <= 1.3) return "even";
  return "slow";
}

export function PacingPanel({
  runId,
  questions,
}: {
  runId: string;
  questions: ResultQuestion[];
}): JSX.Element | null {
  const [rows, setRows] = useState<PacingCohortRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(false);
    getPacingCohort(runId)
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {
        if (alive) setErr(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [runId]);

  const view = useMemo(() => {
    const byId = new Map((rows ?? []).map((r) => [r.question_id, r]));

    // Chart x-axis follows the review list's display order. Module ordinal is
    // section-major (all R&W before Math, mirroring the sitting) so module
    // separators land between real module boundaries.
    const points: PacingPoint[] = questions.map((q) => {
      const r = byId.get(q.id);
      return {
        number: q.number,
        module: (q.section === "math" ? 100 : 0) + q.module_position,
        moduleLabel: `${q.section === "math" ? "Math" : "R&W"} M${q.module_position}`,
        yours: r?.your_time_ms ?? null,
        fast: r?.fast_avg_ms ?? null,
        slow: r?.slow_avg_ms ?? null,
        classAvg: r?.class_avg_ms ?? null,
      };
    });

    const classN = (rows ?? []).reduce((m, r) => Math.max(m, r.class_n), 0);
    const hasYou = points.some((p) => p.yours != null);

    // Fair head-to-head: totals over questions where BOTH sides have a time.
    let yourTotal = 0;
    let classTotal = 0;
    let slowCount = 0;
    let comparedCount = 0;
    for (const p of points) {
      if (p.yours == null || p.classAvg == null) continue;
      comparedCount += 1;
      yourTotal += p.yours;
      classTotal += p.classAvg;
      if (p.yours > p.classAvg * 1.5) slowCount += 1;
    }

    return { points, classN, hasYou, yourTotal, classTotal, slowCount, comparedCount };
  }, [rows, questions]);

  // No timing at all for this sitting (and not still loading / errored):
  // pacing is an embellishment — vanish rather than apologize.
  if (!loading && !err && !view.hasYou) return null;
  if (err) return null;

  const onPick = (index: number): void => {
    const q = questions[index];
    if (!q) return;
    document
      .getElementById(`result-q-${q.id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Pacing vs. your class
        </h2>
        {!loading && view.comparedCount > 0 && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {view.comparedCount} question{view.comparedCount === 1 ? "" : "s"} you both did
            {view.classN > 0 && ` · ${view.classN} classmate${view.classN === 1 ? "" : "s"}`}
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-4 space-y-4">
          <div className="flex gap-3">
            <Skeleton className="h-16 w-32 rounded-xl" />
            <Skeleton className="h-16 w-32 rounded-xl" />
            <Skeleton className="h-16 w-40 rounded-xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : (
        <>
          {/* Summary chips over the comparable set. Outlier-only color: the
              slower-than-class count tints amber only when it's > 0. */}
          {view.comparedCount > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Chip label="Your time" value={fmtMs(view.yourTotal)} />
              <Chip label="Class avg" value={fmtMs(view.classTotal)} />
              <Chip
                label="Slower than class"
                value={`${view.slowCount}`}
                hint={view.slowCount === 1 ? "question" : "questions"}
                tone={view.slowCount > 0 ? "warn" : "neutral"}
              />
            </div>
          )}

          {/* The band chart: class fastest↔slowest spread per question, the
              dashed class average, and your line on top. Click = jump to that
              question's review card below. */}
          <div className="mt-5">
            <PacingChart
              points={view.points}
              classN={view.classN}
              youLabel="You"
              onPick={onPick}
            />
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              {view.classN >= 4
                ? "The shaded band spans your class's fastest and slowest quartiles — click any question to jump to its review."
                : "The class band appears once at least 4 classmates have submitted this test — click any question to jump to its review."}
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/** A summary stat chip echoing the result hero's chip look (light variant). */
function Chip({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warn";
}) {
  const valueClass =
    tone === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : "text-slate-800 dark:text-slate-100";
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-2.5 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</span>
        {hint && <span className="text-xs text-slate-400 dark:text-slate-500">{hint}</span>}
      </div>
    </div>
  );
}
