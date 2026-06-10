/**
 * PacingPanel
 * ===========
 * A student-facing "time per question vs. the class" overview for the review
 * screen. Given each question's own time + the class average (from
 * `get_test_question_times`, migration 0143), it surfaces:
 *   • a one-line summary (your total time, the class's average total, and how
 *     many questions you ran notably slow on);
 *   • a compact per-question bar strip where height ∝ your time and colour
 *     encodes faster/slower-than-class, so a student can see at a glance where
 *     they bled time.
 * Renders nothing when no question has a usable class comparison — pacing is a
 * bonus, not a core part of the result.
 */
import { useMemo } from "react";
import type { QuestionTime, ResultQuestion } from "./types";

/** ms → "m:ss" (e.g. 95000 → "1:35", 42000 → "0:42"). Null/garbage → "—". */
export function fmtMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Classify a student's time on a question relative to the class average:
 *   fast  (ratio < 0.8) · even (0.8–1.3) · slow (> 1.3) · none (no comparison).
 * The amber/rose split inside "slow" is a display detail handled by toneClasses.
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

/** Bar/pill colours per tone, with the slow band further split amber→rose. */
function toneBarClass(yours: number | null, avg: number | null): string {
  const tone = paceTone(yours, avg);
  if (tone === "none") return "bg-slate-200 dark:bg-slate-700";
  if (tone === "fast") return "bg-emerald-400 dark:bg-emerald-500";
  if (tone === "even") return "bg-slate-300 dark:bg-slate-600";
  // slow: amber up to 2×, rose beyond.
  const r = yours! / avg!;
  return r > 2 ? "bg-rose-400 dark:bg-rose-500" : "bg-amber-400 dark:bg-amber-500";
}

export function PacingPanel({
  times,
  questions,
}: {
  times: QuestionTime[];
  questions: ResultQuestion[];
}): JSX.Element | null {
  const view = useMemo(() => {
    const byId = new Map(times.map((t) => [t.question_id, t]));
    // Walk questions in display order so the strip mirrors the review list.
    const rows = questions
      .map((q) => ({ q, t: byId.get(q.id) ?? null }))
      .filter((r): r is { q: ResultQuestion; t: QuestionTime } => r.t != null);

    const comparable = rows.filter((r) => r.t.class_n > 0 && r.t.class_avg_ms != null);
    if (comparable.length === 0) return null;

    let yourTotal = 0;
    let classTotal = 0;
    let slowCount = 0;
    let maxYours = 0;
    let maxN = 0;
    for (const r of rows) {
      const y = r.t.your_time_ms ?? 0;
      yourTotal += y;
      maxYours = Math.max(maxYours, y);
    }
    for (const r of comparable) {
      classTotal += r.t.class_avg_ms ?? 0;
      maxN = Math.max(maxN, r.t.class_n);
      // "notably slower" = your time > 1.5× the class average on that question.
      if ((r.t.your_time_ms ?? 0) > (r.t.class_avg_ms ?? 0) * 1.5) slowCount += 1;
    }
    return { rows, yourTotal, classTotal, slowCount, maxYours, maxN };
  }, [times, questions]);

  if (!view) return null;

  return (
    <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Pacing vs. your class
        </h2>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          averaged over {view.maxN} classmate{view.maxN === 1 ? "" : "s"}
        </span>
      </div>

      {/* Summary chips — same rounded ring aesthetic as the result hero. */}
      <div className="mt-4 flex flex-wrap gap-3">
        <Chip label="Your total time" value={fmtMs(view.yourTotal)} />
        <Chip label="Class avg total" value={fmtMs(view.classTotal)} />
        <Chip
          label="Slower than class"
          value={`${view.slowCount}`}
          hint={view.slowCount === 1 ? "question" : "questions"}
          tone={view.slowCount > 0 ? "warn" : "ok"}
        />
      </div>

      {/* Per-question strip: one bar per answered question, in order. */}
      <div className="mt-5">
        <div className="flex items-end gap-[3px]" style={{ height: 56 }}>
          {view.rows.map((r) => {
            const y = r.t.your_time_ms ?? 0;
            const pct = view.maxYours > 0 ? Math.max(6, (y / view.maxYours) * 100) : 6;
            return (
              <span
                key={r.q.id}
                className={`min-w-[3px] flex-1 rounded-sm ${toneBarClass(y, r.t.class_avg_ms)}`}
                style={{ height: `${pct}%` }}
                title={`Q${r.q.number}: you ${fmtMs(y)} · class ${fmtMs(r.t.class_avg_ms)}`}
              />
            );
          })}
        </div>
        {/* Legend — keep the colour meaning discoverable without a tooltip. */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
          <LegendDot className="bg-emerald-400 dark:bg-emerald-500" label="Faster" />
          <LegendDot className="bg-slate-300 dark:bg-slate-600" label="On pace" />
          <LegendDot className="bg-amber-400 dark:bg-amber-500" label="Slower" />
          <LegendDot className="bg-rose-400 dark:bg-rose-500" label="Much slower" />
        </div>
      </div>
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
  tone?: "neutral" | "ok" | "warn";
}) {
  const valueClass =
    tone === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "ok"
        ? "text-emerald-600 dark:text-emerald-400"
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

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}
