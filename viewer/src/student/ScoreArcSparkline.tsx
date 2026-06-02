/**
 * ScoreArcSparkline
 * =================
 * Tiny inline SVG sparkline (no chart library) showing a student's SAT score
 * trajectory over their most recent attempts. Designed to live inside the
 * ScorePrediction card so Sophia sees direction-of-travel (e.g. "↑ 80 since
 * diagnostic") rather than just the latest predicted number.
 *
 * - Pure SVG, width 100% of parent, ~80px tall.
 * - X axis: ordinal position 1..N (no labels). Y axis: SAT total 400..1600.
 * - Midline at SAT 1000 as a slate-300 reference grid line.
 * - Polyline + circles; last point gets a larger emphasized dot.
 * - Each circle has an accessible <title> with "{date}: {score}".
 *
 * Animation: none by default. Any draw-on transition must be guarded behind
 * `motion-safe:` (per project rules).
 */
import type { ReactElement } from "react";

/** One trajectory point. `score` is a SAT-equivalent total in [400, 1600]. */
export interface SparklinePoint {
  /** ISO date string the attempt was submitted. */
  submittedAt: string;
  /** SAT-equivalent total score (already clamped to [400, 1600]). */
  score: number;
}

interface ScoreArcSparklineProps {
  points: ReadonlyArray<SparklinePoint>;
}

const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 80;
const PAD_X = 8;
const PAD_Y = 10;
const Y_MIN = 400;
const Y_MAX = 1600;
const Y_MIDLINE = 1000;

function projectX(index: number, total: number): number {
  if (total <= 1) return VIEW_WIDTH / 2;
  const range = VIEW_WIDTH - PAD_X * 2;
  return PAD_X + (index / (total - 1)) * range;
}

function projectY(score: number): number {
  const clamped = Math.max(Y_MIN, Math.min(Y_MAX, score));
  const range = VIEW_HEIGHT - PAD_Y * 2;
  // y inverted: high score → small y
  return PAD_Y + (1 - (clamped - Y_MIN) / (Y_MAX - Y_MIN)) * range;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function ScoreArcSparkline({
  points,
}: ScoreArcSparklineProps): ReactElement | null {
  if (points.length === 0) return null;

  const total = points.length;
  const coords = points.map((p, i) => ({
    x: projectX(i, total),
    y: projectY(p.score),
    point: p,
    isLast: i === total - 1,
  }));

  const pathD = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(" ");

  const midY = projectY(Y_MIDLINE);

  return (
    <svg
      role="img"
      aria-label={`SAT score trajectory across ${total} attempt${total === 1 ? "" : "s"}`}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      className="block w-full h-20"
    >
      {/* Reference midline (slate-300) at SAT 1000 */}
      <line
        x1={PAD_X}
        x2={VIEW_WIDTH - PAD_X}
        y1={midY}
        y2={midY}
        stroke="currentColor"
        strokeDasharray="4 4"
        strokeWidth={1}
        className="text-slate-300 dark:text-slate-700"
      />

      {/* Trajectory polyline (emerald-500) */}
      {total >= 2 && (
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-emerald-500"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Per-attempt dots with accessible tooltips */}
      {coords.map((c, i) => (
        <circle
          key={`${c.point.submittedAt}-${i}`}
          cx={c.x}
          cy={c.y}
          r={c.isLast ? 5 : 3.5}
          className={
            c.isLast
              ? "fill-emerald-600 dark:fill-emerald-400"
              : "fill-emerald-500 dark:fill-emerald-400/80"
          }
          stroke="white"
          strokeWidth={1.5}
        >
          <title>
            {formatDate(c.point.submittedAt)}: {c.point.score}
          </title>
        </circle>
      ))}
    </svg>
  );
}
