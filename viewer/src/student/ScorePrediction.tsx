/**
 * ScorePrediction
 * ===============
 * Predicted SAT total based on the calling student's submitted assignment
 * scores. Calls the `predict_my_sat_score` RPC (see migration 0024).
 *
 * This is intentionally a crude linear v1: predicted_total = 400 + avg% * 12,
 * clamped to [400, 1600]. Real SAT scoring has adaptive Module 2 + raw-to-
 * scaled lookup tables we don't model here — surface the method label so a
 * student can interpret the number for what it is.
 *
 * Self-contained: no props, supabase singleton, auth via RPC.
 */
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Skeleton } from "../components/Skeleton";
import { ScoreArcSparkline, type SparklinePoint } from "./ScoreArcSparkline";

interface PredictionPayload {
  has_data: boolean;
  message?: string;
  samples?: number;
  samples_rw?: number;
  samples_math?: number;
  avg_percent?: number;
  avg_percent_rw?: number;
  avg_percent_math?: number;
  section_rw?: number;
  section_math?: number;
  predicted_total?: number;
  confidence?: "low" | "medium" | "high";
  method?: string;
  note?: string;
}

/**
 * Map a raw correct/total pair to a SAT-equivalent total using the same crude
 * linear v1 the `predict_my_sat_score` RPC uses (400 + avg% * 12), clamped
 * to [400, 1600]. Returns null when total is missing/0.
 */
function rawToSatTotal(
  score: number | null,
  total: number | null,
): number | null {
  if (score === null || total === null || total <= 0) return null;
  const pct = (score / total) * 100;
  const raw = 400 + pct * 12;
  const rounded = Math.round(raw / 10) * 10;
  return Math.max(400, Math.min(1600, rounded));
}

/**
 * Map an assignment_attempts row (which already has score_percent) to a SAT
 * total via the same formula.
 */
function percentToSatTotal(percent: number | null): number | null {
  if (percent === null) return null;
  const raw = 400 + percent * 12;
  const rounded = Math.round(raw / 10) * 10;
  return Math.max(400, Math.min(1600, rounded));
}

interface TestAttemptRow {
  submitted_at: string | null;
  score: number | null;
  total: number | null;
}

interface MockAssignmentAttemptRow {
  submitted_at: string | null;
  score_percent: number | null;
  assignments: { kind: string | null } | { kind: string | null }[] | null;
}

/**
 * Load chronologically-ordered SAT-equivalent score points for the trajectory.
 *
 * Primary source: `test_attempts` (free-mode mocks — the strongest signal of
 * end-to-end SAT performance). Fallback: `assignment_attempts` where the
 * parent assignment.kind = 'mocktest' (teacher-assigned mock tests).
 *
 * Returns at most the 10 most-recent submitted attempts (asc by date).
 */
async function loadTrajectoryPoints(): Promise<SparklinePoint[]> {
  const { data: testData, error: testErr } = await supabase
    .from("test_attempts")
    .select("submitted_at, score, total")
    .not("submitted_at", "is", null)
    .not("score", "is", null)
    .not("total", "is", null)
    .order("submitted_at", { ascending: true })
    .limit(10);

  if (!testErr && testData && testData.length > 0) {
    const rows = testData as TestAttemptRow[];
    const pts: SparklinePoint[] = [];
    for (const r of rows) {
      const sat = rawToSatTotal(r.score, r.total);
      if (sat !== null && r.submitted_at) {
        pts.push({ submittedAt: r.submitted_at, score: sat });
      }
    }
    if (pts.length > 0) return pts;
  }

  // Fallback: teacher-assigned mock-test attempts.
  const { data: assnData, error: assnErr } = await supabase
    .from("assignment_attempts")
    .select("submitted_at, score_percent, assignments!inner(kind)")
    .eq("assignments.kind", "mocktest")
    .not("submitted_at", "is", null)
    .not("score_percent", "is", null)
    .order("submitted_at", { ascending: true })
    .limit(10);

  if (!assnErr && assnData && assnData.length > 0) {
    const rows = assnData as MockAssignmentAttemptRow[];
    const pts: SparklinePoint[] = [];
    for (const r of rows) {
      const sat = percentToSatTotal(r.score_percent);
      if (sat !== null && r.submitted_at) {
        pts.push({ submittedAt: r.submitted_at, score: sat });
      }
    }
    return pts;
  }

  return [];
}

interface DeltaResult {
  delta: number;
  label: string;
  toneClass: string;
}

function describeDelta(points: ReadonlyArray<SparklinePoint>): DeltaResult | null {
  if (points.length < 2) return null;
  const first = points[0].score;
  const last = points[points.length - 1].score;
  const delta = last - first;
  if (delta > 0) {
    return {
      delta,
      label: `↑ ${delta} since diagnostic`,
      toneClass:
        "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 ring-emerald-200 dark:ring-emerald-800",
    };
  }
  if (delta < 0) {
    return {
      delta,
      label: `↓ ${Math.abs(delta)} since diagnostic`,
      toneClass:
        "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 ring-rose-200 dark:ring-rose-800",
    };
  }
  return {
    delta: 0,
    label: "= no change since diagnostic",
    toneClass:
      "text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/60 ring-slate-200 dark:ring-slate-700",
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load predicted score.";
}

function confidenceLabel(c: PredictionPayload["confidence"]): string {
  if (c === "high") return "High confidence";
  if (c === "medium") return "Medium confidence";
  return "Low confidence";
}

function confidenceClasses(c: PredictionPayload["confidence"]): string {
  if (c === "high") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  }
  if (c === "medium") {
    return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300";
  }
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
}

export function ScorePrediction() {
  const [payload, setPayload] = useState<PredictionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trajectory, setTrajectory] = useState<SparklinePoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        // Fire prediction RPC + trajectory query in parallel — independent
        // sources, no need to serialize.
        const [predictionRes, trajectoryRes] = await Promise.all([
          supabase.rpc("predict_my_sat_score"),
          loadTrajectoryPoints().catch((): SparklinePoint[] => []),
        ]);
        if (cancelled) return;
        if (predictionRes.error) {
          setPayload(null);
          setError(predictionRes.error.message);
          return;
        }
        setPayload(
          (predictionRes.data ?? null) as PredictionPayload | null,
        );
        setTrajectory(trajectoryRes);
      } catch (err: unknown) {
        if (cancelled) return;
        setPayload(null);
        setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const delta = describeDelta(trajectory);

  return (
    <section
      aria-labelledby="score-prediction-title"
      className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-700 p-5 shadow-sm"
    >
      <h3
        id="score-prediction-title"
        className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200"
      >
        Predicted SAT score
      </h3>

      {loading && (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-12 w-32 rounded" />
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-3 w-3/4 rounded" />
        </div>
      )}

      {!loading && error && (
        <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {!loading && !error && payload && !payload.has_data && (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          {payload.message ??
            "Submit at least one assignment to see a predicted score."}
        </p>
      )}

      {!loading && !error && payload && payload.has_data && (
        <div className="mt-4">
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {payload.predicted_total ?? "—"}
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              / 1600
            </span>
          </div>
          <div className="mt-2">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${confidenceClasses(payload.confidence)}`}
            >
              {confidenceLabel(payload.confidence)}
            </span>
          </div>
          {payload.section_rw && payload.section_math && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 tabular-nums">
              R&amp;W: {payload.section_rw} · Math: {payload.section_math}
            </p>
          )}

          {/* Trajectory arc + delta callout */}
          <div className="mt-4">
            {trajectory.length >= 2 && delta && (
              <div className="mb-1 flex items-center justify-between gap-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 tabular-nums ${delta.toneClass}`}
                >
                  {delta.label}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                  {trajectory.length} attempt
                  {trajectory.length === 1 ? "" : "s"}
                </span>
              </div>
            )}
            {trajectory.length >= 2 ? (
              <div className="text-emerald-500">
                <ScoreArcSparkline points={trajectory} />
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {trajectory.length === 1
                  ? "No arc yet — take a second mock to see your trajectory."
                  : "Take a mock test to start tracking your score trajectory."}
              </p>
            )}
          </div>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Based on {payload.samples ?? 0} submitted assignment
            {payload.samples === 1 ? "" : "s"} at avg{" "}
            {payload.avg_percent ?? payload.avg_percent_rw ?? payload.avg_percent_math ?? 0}%.
            Method: {payload.method ?? "linear-v1"}.
          </p>
        </div>
      )}
    </section>
  );
}
