// ScoreTrajectoryCard
// ===================
// Self-contained student card: SAT scaled-score trajectory vs. a personal
// target. Fetches its own data — `list_my_test_runs` for the run list, then
// `getResult` per released run to derive an estimated 400–1600 scaled total
// (via scaledFromSectionScores), and `student_score_targets` for the goal.
//
// Honesty discipline: with <3 scored points we show a locked state, NEVER a
// projection. With >=3 we fit a simple least-squares line of total vs. days
// and label every number an estimate. Tailwind + slate + dark + Ivy-Ledger
// gold/navy accents. aliveRef async-guard per codebase convention.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { getResult } from "@/fulltest/api";
import { scaledFromSectionScores } from "@/fulltest/satScore";

interface ScorePoint {
  date: Date;
  total: number;
}
interface Target {
  target_score: number;
  test_date: string | null;
}

const MIN_POINTS = 3;
const DAY_MS = 86_400_000;

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

function clampScaled(n: number): number {
  return Math.max(400, Math.min(1600, Math.round(n)));
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Least-squares fit of y (total) over x (days since first test). */
function regress(pts: ScorePoint[]): { slope: number; intercept: number } {
  const t0 = pts[0].date.getTime();
  const xs = pts.map((p) => (p.date.getTime() - t0) / DAY_MS);
  const ys = pts.map((p) => p.total);
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}

function Sparkline({ pts, target }: { pts: ScorePoint[]; target: number | null }): JSX.Element {
  const w = 240;
  const h = 56;
  const pad = 4;
  const totals = pts.map((p) => p.total);
  const lo = Math.min(...totals, target ?? Infinity) - 20;
  const hi = Math.max(...totals, target ?? -Infinity) + 20;
  const span = Math.max(1, hi - lo);
  const t0 = pts[0].date.getTime();
  const tSpan = Math.max(1, pts[pts.length - 1].date.getTime() - t0);
  const x = (d: Date) => pad + ((d.getTime() - t0) / tSpan) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - 2 * pad);
  const poly = pts.map((p) => `${x(p.date).toFixed(1)},${y(p.total).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" role="img" aria-label="Score trajectory sparkline">
      {target != null ? (
        <line
          x1={pad}
          x2={w - pad}
          y1={y(target)}
          y2={y(target)}
          className="stroke-accent-500/60"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      ) : null}
      <polyline points={poly} fill="none" className="stroke-accent-600 dark:stroke-accent-400" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={x(p.date)} cy={y(p.total)} r={2.5} className="fill-accent-600 dark:fill-accent-400" />
      ))}
    </svg>
  );
}

export function ScoreTrajectoryCard({ className }: { className?: string }): JSX.Element | null {
  const toast = useToast();
  const aliveRef = useRef(true);

  const [loaded, setLoaded] = useState(false);
  const [pts, setPts] = useState<ScorePoint[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftScore, setDraftScore] = useState("");
  const [draftDate, setDraftDate] = useState("");

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [{ data: runs }, { data: tgt }] = await Promise.all([
        supabase.rpc("list_my_test_runs"),
        supabase.from("student_score_targets").select("target_score, test_date").maybeSingle(),
      ]);
      const rows = (runs ?? []) as Array<{ run_id: string; submitted_at: string | null; released: boolean }>;
      const scored = rows.filter((r) => r.released && r.submitted_at);
      const results = await Promise.all(
        scored.map(async (r) => {
          try {
            const res = await getResult(r.run_id);
            const total = scaledFromSectionScores(res.section_scores).total;
            return total != null ? { date: new Date(r.submitted_at as string), total } : null;
          } catch {
            return null;
          }
        }),
      );
      if (!aliveRef.current) return;
      const series = results
        .filter((p): p is ScorePoint => p !== null)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      setPts(series);
      setTarget((tgt as Target | null) ?? null);
    } catch {
      /* non-fatal — card hides on total failure */
    } finally {
      if (aliveRef.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    return () => {
      aliveRef.current = false;
    };
  }, [refresh]);

  async function saveTarget(): Promise<void> {
    const score = Number(draftScore);
    if (busy || !Number.isFinite(score) || score < 400 || score > 1600) {
      toast.error("Enter a target between 400 and 1600");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("set_score_target", {
      p_target_score: Math.round(score),
      p_test_date: draftDate || null,
    });
    if (!aliveRef.current) return;
    setBusy(false);
    if (error) {
      toast.error("Couldn't save your target", getErrorMessage(error, "Try again."));
      return;
    }
    setEditing(false);
    toast.success("Target saved");
    void refresh();
  }

  if (!loaded) return null;

  const card =
    "rounded-2xl ring-1 ring-accent-200/70 bg-gradient-to-br from-white to-accent-50/40 p-4 dark:from-slate-900 dark:to-slate-900 dark:ring-accent-900/50 " +
    (className ?? "");

  function openEditor(): void {
    setDraftScore(target ? String(target.target_score) : "");
    setDraftDate(target?.test_date ?? "");
    setEditing(true);
  }

  // --- Headline (>=3 points) ------------------------------------------------
  let headline: JSX.Element | null = null;
  if (pts.length >= MIN_POINTS) {
    const { slope, intercept } = regress(pts);
    const current = pts[pts.length - 1].total;
    const per30 = Math.round((slope * 30) / 10) * 10;
    const trend = per30 === 0 ? "flat" : `${per30 > 0 ? "+" : "−"}${Math.abs(per30)}/mo`;
    const t0 = pts[0].date.getTime();
    const testDate = target?.test_date ? new Date(target.test_date) : null;
    const hasFutureDate = testDate != null && !Number.isNaN(testDate.getTime()) && testDate.getTime() > Date.now();
    const projected = hasFutureDate
      ? clampScaled(intercept + slope * ((testDate.getTime() - t0) / DAY_MS))
      : current;
    const goal = target?.target_score ?? null;
    const onPace = goal == null || projected >= goal;
    headline = (
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
        <span className="font-semibold text-slate-900 dark:text-white">{current}</span> now ·{" "}
        <span className={per30 > 0 ? "text-emerald-600 dark:text-emerald-400" : per30 < 0 ? "text-rose-600 dark:text-rose-400" : ""}>
          {trend}
        </span>
        {goal != null ? (
          onPace ? (
            <>
              {" "}· on pace for{" "}
              <span className="font-semibold text-accent-700 dark:text-accent-300">{projected}</span>
              {hasFutureDate ? ` by ${fmtDate(testDate as Date)}` : ""}
            </>
          ) : (
            <>
              {" "}· tracking to{" "}
              <span className="font-semibold text-accent-700 dark:text-accent-300">{projected}</span> —{" "}
              <span className="text-rose-600 dark:text-rose-400">{goal - projected} below</span> your {goal} goal
            </>
          )
        ) : null}
        <span className="ml-1 text-xs text-slate-400">(estimate)</span>
      </p>
    );
  }

  return (
    <section className={card} aria-labelledby="trajectory-title">
      <div className="flex items-center justify-between gap-3">
        <h3 id="trajectory-title" className="text-sm font-semibold text-slate-900 dark:text-white">
          Score trajectory
        </h3>
        {!editing ? (
          <button
            type="button"
            onClick={openEditor}
            className="text-xs font-medium text-accent-600 underline-offset-2 hover:underline dark:text-accent-300"
          >
            {target ? "Edit target" : "Set target"}
          </button>
        ) : null}
      </div>

      {pts.length >= MIN_POINTS ? (
        <>
          {headline}
          <div className="mt-3">
            <Sparkline pts={pts} target={target?.target_score ?? null} />
          </div>
        </>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Take {MIN_POINTS} full practice tests to unlock your score trajectory.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {pts.length} of {MIN_POINTS} scored so far.
          </p>
          {target ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Your target:{" "}
              <span className="font-semibold text-accent-700 dark:text-accent-300">{target.target_score}</span>
              {target.test_date ? ` by ${fmtDate(new Date(target.test_date))}` : ""}
            </p>
          ) : null}
        </div>
      )}

      {editing ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700">
          <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
            Target score
            <input
              type="number"
              min={400}
              max={1600}
              step={10}
              value={draftScore}
              onChange={(e) => setDraftScore(e.target.value)}
              disabled={busy}
              className="mt-1 w-28 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              placeholder="1450"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
            Test date
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              disabled={busy}
              className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveTarget()}
              disabled={busy}
              className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-700 disabled:opacity-50 dark:bg-accent-700 dark:hover:bg-accent-600"
            >
              {busy ? "Saving…" : "Save target"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
