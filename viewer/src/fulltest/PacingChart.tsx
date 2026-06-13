/**
 * PacingChart  +  PacingChartCard
 * ===============================
 * A teacher-facing pace line-graph: how ONE student's time on each question
 * tracks against the average pace of the FASTEST 25% and the SLOWEST 25% of
 * their classmates (from `get_test_pacing_cohort`, migration 0187).
 *
 *   • `PacingChart` is pure/presentational — give it ordered points and it
 *     draws a responsive SVG: a shaded class-spread band (fast→slow), a dashed
 *     class-average line, and the student's bold line on top, with module
 *     separators, a hover guide + tooltip, and a tabular-nums legend.
 *   • `PacingChartCard` is the data wrapper used on the Replay page and inside
 *     the Class heatmap: it fetches the cohort for a run, joins it onto the
 *     test's ordered questions, and renders the chart inside a card (with empty
 *     / insufficient-cohort states).
 *
 * Faster is LOWER on the chart (less time). A student point is tinted emerald
 * when they beat the fast group on that question, rose when they trail the slow
 * group, indigo in between. The fast/slow curves only draw with >= 4 classmates
 * (below that a quartile is a single noisy student) — otherwise just the
 * student's own pace shows with a short caveat.
 */
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/Skeleton";
import { getPacingCohort } from "./api";
import { fmtMs } from "./PacingPanel";
import type { PacingCohortRow } from "./types";

/** One question in test order, the chart's x-axis unit. */
export interface PacingQuestionRef {
  id: string;
  number: number;
  /** module POSITION (1..4) — drives the module separators + labels. */
  module: number;
  moduleLabel: string;
}

export interface PacingPoint {
  number: number;
  module: number;
  moduleLabel: string;
  yours: number | null;
  fast: number | null;
  slow: number | null;
  classAvg: number | null;
}

// --- SVG geometry (fixed viewBox, scales uniformly to the container width) ---
const VW = 1000;
const VH = 340;
const PAD = { top: 18, right: 18, bottom: 38, left: 52 } as const;
const PLOT = {
  x0: PAD.left,
  x1: VW - PAD.right,
  y0: PAD.top,
  y1: VH - PAD.bottom,
} as const;

// Reference cohort curves are deliberately LIGHT — they're context, not the
// headline. The student's own series (YOU_LIGHT, bold accent) owns the spotlight;
// saturated emerald/rose here used to out-shout the very line they frame.
const COLOR = {
  fast: "#6ee7b7", // emerald-300
  slow: "#fda4af", // rose-300
  avg: "#cbd5e1", // slate-300
  grid: "currentColor",
} as const;

// The student's own outlier dots need a touch more saturation than the faint
// reference curves to stay legible as a per-question status — but still quieter
// than the old -500s.
const DOT = {
  fast: "#34d399", // emerald-400
  slow: "#fb7185", // rose-400
} as const;

/** The student's own series follows the LIVE domain accent (navy under ivy,
 *  indigo classic, forest/bronze per vertical) — resolved through the CSS
 *  channel vars, so it re-themes with the rest of the app. var() doesn't
 *  resolve in SVG presentation attributes, so consumers apply it via style. */
const YOU_LIGHT = "rgb(var(--accent-600))";
const YOU_DARK_TIP = "rgb(var(--accent-400))"; // on the dark tooltip panel

/** Round a ms value up to a "nice" axis maximum (nearest 15s, floor 30s). */
function niceMaxMs(rawMax: number): number {
  const withHeadroom = Math.max(rawMax * 1.12, 30_000);
  return Math.ceil(withHeadroom / 15_000) * 15_000;
}

/** Split a series into contiguous runs of defined points → [ [x,y], … ][]. */
function segments(
  xs: number[],
  vals: Array<number | null>,
  yPix: (v: number) => number,
): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v == null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else {
      cur.push([xs[i], yPix(v)]);
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

const toPath = (pts: Array<[number, number]>): string =>
  pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");

export function PacingChart({
  points,
  classN,
  youLabel = "This student",
  onPick,
}: {
  points: PacingPoint[];
  classN: number;
  /** Series label for the viewer's own line — "You" on student surfaces. */
  youLabel?: string;
  /** When set, clicking a question's hover column fires with its index
   *  (the student report uses it to jump to that question's review card). */
  onPick?: (index: number) => void;
}): JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  const showBands = classN >= 4;

  const geo = useMemo(() => {
    const n = points.length;
    const xs = points.map((_, i) =>
      n <= 1 ? (PLOT.x0 + PLOT.x1) / 2 : PLOT.x0 + (i / (n - 1)) * (PLOT.x1 - PLOT.x0),
    );

    let rawMax = 0;
    for (const p of points) {
      rawMax = Math.max(rawMax, p.yours ?? 0, p.classAvg ?? 0);
      if (showBands) rawMax = Math.max(rawMax, p.fast ?? 0, p.slow ?? 0);
    }
    const maxMs = niceMaxMs(rawMax);
    const yPix = (v: number) => PLOT.y1 - (v / maxMs) * (PLOT.y1 - PLOT.y0);

    // Module separators: a tick between modules + a centered label per module.
    const mods: Array<{ label: string; start: number; end: number }> = [];
    for (let i = 0; i < points.length; i++) {
      const m = points[i].module;
      const last = mods[mods.length - 1];
      if (last && points[i - 1]?.module === m) last.end = i;
      else mods.push({ label: points[i].moduleLabel, start: i, end: i });
    }

    return { xs, maxMs, yPix, mods };
  }, [points, showBands]);

  const { xs, maxMs, yPix, mods } = geo;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxMs);

  const yourSeg = segments(xs, points.map((p) => p.yours), yPix);
  const fastSeg = showBands ? segments(xs, points.map((p) => p.fast), yPix) : [];
  const slowSeg = showBands ? segments(xs, points.map((p) => p.slow), yPix) : [];
  const avgSeg = segments(xs, points.map((p) => p.classAvg), yPix);

  // Shaded class-spread band: contiguous runs where BOTH fast & slow exist.
  const bandPaths = useMemo(() => {
    if (!showBands) return [];
    const runs: string[] = [];
    let top: Array<[number, number]> = []; // slow (more time, higher)
    let bot: Array<[number, number]> = []; // fast (less time, lower)
    const flush = () => {
      if (top.length >= 2) {
        const fwd = bot.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
        const back = [...top].reverse().map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
        runs.push(`M${bot[0][0].toFixed(1)} ${bot[0][1].toFixed(1)} ${fwd} ${back} Z`);
      }
      top = [];
      bot = [];
    };
    for (let i = 0; i < points.length; i++) {
      const f = points[i].fast;
      const s = points[i].slow;
      if (f != null && s != null) {
        bot.push([xs[i], yPix(f)]);
        top.push([xs[i], yPix(s)]);
      } else flush();
    }
    flush();
    return runs;
  }, [points, xs, yPix, showBands]);

  const hp = hover != null ? points[hover] : null;
  // Tooltip box geometry (clamped inside the plot).
  const tipW = 168;
  const tipX = hover != null ? Math.min(Math.max(xs[hover] - tipW / 2, PLOT.x0), PLOT.x1 - tipW) : 0;

  /** Student dot tint relative to the two bands. */
  const dotColor = (p: PacingPoint): string => {
    if (showBands && p.yours != null) {
      if (p.slow != null && p.yours > p.slow) return DOT.slow;
      if (p.fast != null && p.yours < p.fast) return DOT.fast;
    }
    return YOU_LIGHT;
  };

  return (
    <div className="select-none">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label={`Pace per question versus the fastest and slowest quartiles of ${classN} classmates`}
      >
        {/* y gridlines + labels */}
        <g className="text-slate-200 dark:text-slate-700">
          {yTicks.map((t) => (
            <line
              key={t}
              x1={PLOT.x0}
              x2={PLOT.x1}
              y1={yPix(t)}
              y2={yPix(t)}
              stroke={COLOR.grid}
              strokeWidth={1}
              strokeDasharray={t === 0 ? undefined : "3 4"}
            />
          ))}
        </g>
        <g className="fill-slate-400 dark:fill-slate-500" style={{ fontSize: 13 }}>
          {yTicks.map((t) => (
            <text key={t} x={PLOT.x0 - 8} y={yPix(t) + 4} textAnchor="end" className="tabular-nums">
              {t === 0 ? "0:00" : fmtMs(t)}
            </text>
          ))}
        </g>

        {/* module separators + labels */}
        <g>
          {mods.map((m, i) => {
            const sepX = i === 0 ? null : (xs[m.start] + xs[m.start - 1]) / 2;
            const cx = (xs[m.start] + xs[m.end]) / 2;
            return (
              <g key={`${m.label}-${i}`}>
                {sepX != null && (
                  <line
                    x1={sepX}
                    x2={sepX}
                    y1={PLOT.y0}
                    y2={PLOT.y1}
                    className="stroke-slate-300 dark:stroke-slate-600"
                    strokeWidth={1}
                    strokeDasharray="2 5"
                  />
                )}
                <text
                  x={cx}
                  y={VH - 14}
                  textAnchor="middle"
                  className="fill-slate-400 dark:fill-slate-500"
                  style={{ fontSize: 12.5, fontWeight: 600 }}
                >
                  {m.label}
                </text>
              </g>
            );
          })}
        </g>

        {/* class-spread band (fast → slow) */}
        {bandPaths.map((d, i) => (
          // Quiet neutral spread band — the fast/slow curves carry the color
          // voice; a rose-tinted band read as "everything is wrong" at a glance.
          <path
            key={i}
            d={d}
            className="text-slate-400 dark:text-slate-500"
            fill="currentColor"
            fillOpacity={0.12}
            stroke="none"
          />
        ))}

        {/* class average — thin dashed reference */}
        {avgSeg.map((seg, i) => (
          <path
            key={`avg-${i}`}
            d={toPath(seg)}
            fill="none"
            stroke={COLOR.avg}
            strokeWidth={1.5}
            strokeDasharray="5 5"
            strokeLinecap="round"
          />
        ))}

        {/* slow-25% curve — quiet reference */}
        {slowSeg.map((seg, i) => (
          <path key={`slow-${i}`} d={toPath(seg)} fill="none" stroke={COLOR.slow} strokeWidth={1.5} strokeOpacity={0.9} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {/* fast-25% curve — quiet reference */}
        {fastSeg.map((seg, i) => (
          <path key={`fast-${i}`} d={toPath(seg)} fill="none" stroke={COLOR.fast} strokeWidth={1.5} strokeOpacity={0.9} strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* student curve (bold, on top) */}
        {yourSeg.map((seg, i) => (
          <path key={`you-${i}`} d={toPath(seg)} fill="none" style={{ stroke: YOU_LIGHT }} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* hover guide */}
        {hover != null && (
          <line
            x1={xs[hover]}
            x2={xs[hover]}
            y1={PLOT.y0}
            y2={PLOT.y1}
            className="stroke-slate-400 dark:stroke-slate-500"
            strokeWidth={1}
          />
        )}

        {/* student dots */}
        {points.map((p, i) =>
          p.yours == null ? null : (
            <circle
              key={`d-${i}`}
              cx={xs[i]}
              cy={yPix(p.yours)}
              r={hover === i ? 4.5 : 2.6}
              style={{ fill: dotColor(p) }}
              stroke="#fff"
              strokeWidth={hover === i ? 1.5 : 0}
              className="dark:stroke-slate-900"
            />
          ),
        )}

        {/* in-SVG tooltip */}
        {hp && (
          <g pointerEvents="none">
            <rect
              x={tipX}
              y={PLOT.y0 + 4}
              width={tipW}
              height={hp.yours != null && showBands ? 92 : 50}
              rx={8}
              className="fill-slate-900/92 dark:fill-slate-800"
            />
            <text x={tipX + 12} y={PLOT.y0 + 24} className="fill-white" style={{ fontSize: 13, fontWeight: 700 }}>
              {hp.moduleLabel} · Q{hp.number}
            </text>
            <TipRow x={tipX + 12} y={PLOT.y0 + 42} color={YOU_DARK_TIP} label={youLabel === "This student" ? "Student" : youLabel} value={fmtMs(hp.yours)} />
            {showBands && (
              <>
                <TipRow x={tipX + 12} y={PLOT.y0 + 62} color={COLOR.fast} label="Fast 25%" value={fmtMs(hp.fast)} />
                <TipRow x={tipX + 12} y={PLOT.y0 + 82} color={COLOR.slow} label="Slow 25%" value={fmtMs(hp.slow)} />
              </>
            )}
          </g>
        )}

        {/* invisible hover hit-areas (one per question) */}
        {points.map((_, i) => {
          const half =
            points.length <= 1
              ? (PLOT.x1 - PLOT.x0) / 2
              : (PLOT.x1 - PLOT.x0) / (points.length - 1) / 2;
          return (
            <rect
              key={`h-${i}`}
              x={xs[i] - half}
              y={PLOT.y0}
              width={half * 2}
              height={PLOT.y1 - PLOT.y0}
              fill="transparent"
              className={onPick ? "cursor-pointer" : undefined}
              onMouseEnter={() => setHover(i)}
              onMouseMove={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onClick={onPick ? () => onPick(i) : undefined}
            />
          );
        })}
      </svg>

      {/* legend */}
      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <LegendLine color={YOU_LIGHT} label={youLabel} bold />
        {showBands && <LegendLine color={COLOR.fast} label="Fastest 25%" />}
        {showBands && <LegendLine color={COLOR.slow} label="Slowest 25%" />}
        <LegendLine color={COLOR.avg} label="Class avg" dashed />
        <span className="text-slate-400 dark:text-slate-500">Lower = quicker</span>
      </div>
    </div>
  );
}

function TipRow({
  x,
  y,
  color,
  label,
  value,
}: {
  x: number;
  y: number;
  color: string;
  label: string;
  value: string;
}): JSX.Element {
  return (
    <g>
      <rect x={x} y={y - 8} width={9} height={9} rx={2} style={{ fill: color }} />
      <text x={x + 15} y={y} className="fill-slate-200" style={{ fontSize: 12 }}>
        {label}
      </text>
      <text x={x + 144} y={y} textAnchor="end" className="fill-white tabular-nums" style={{ fontSize: 12, fontWeight: 600 }}>
        {value}
      </text>
    </g>
  );
}

function LegendLine({
  color,
  label,
  bold,
  dashed,
}: {
  color: string;
  label: string;
  bold?: boolean;
  dashed?: boolean;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="20" height="8" aria-hidden>
        <line
          x1={0}
          y1={4}
          x2={20}
          y2={4}
          style={{ stroke: color }}
          strokeWidth={bold ? 3 : 2}
          strokeDasharray={dashed ? "4 3" : undefined}
          strokeLinecap="round"
        />
      </svg>
      {label}
    </span>
  );
}

// --- data wrapper -----------------------------------------------------------

export function PacingChartCard({
  runId,
  questions,
  studentName,
}: {
  runId: string;
  questions: PacingQuestionRef[];
  studentName?: string | null;
}): JSX.Element {
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

  const { points, classN, hasYou } = useMemo(() => {
    const byId = new Map((rows ?? []).map((r) => [r.question_id, r]));
    const pts: PacingPoint[] = questions.map((q) => {
      const r = byId.get(q.id);
      return {
        number: q.number,
        module: q.module,
        moduleLabel: q.moduleLabel,
        yours: r?.your_time_ms ?? null,
        fast: r?.fast_avg_ms ?? null,
        slow: r?.slow_avg_ms ?? null,
        classAvg: r?.class_avg_ms ?? null,
      };
    });
    const cn = (rows ?? []).reduce((m, r) => Math.max(m, r.class_n), 0);
    return { points: pts, classN: cn, hasYou: pts.some((p) => p.yours != null) };
  }, [rows, questions]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Pace per question{studentName ? ` · ${studentName}` : ""}
        </h2>
        {!loading && !err && classN > 0 && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {classN >= 4
              ? `fast / slow = avg of the quickest & slowest 25% of ${classN} classmates`
              : `${classN} classmate${classN === 1 ? "" : "s"} so far`}
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-56 w-full rounded-lg" />
      ) : err ? (
        <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:ring-slate-800">
          Pacing data couldn&apos;t be loaded for this sitting.
        </p>
      ) : !hasYou ? (
        <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:ring-slate-800">
          No per-question timing was captured for this sitting — pacing records
          only while proctoring is on.
        </p>
      ) : (
        <>
          <PacingChart points={points} classN={classN} />
          {classN < 4 && (
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              The fastest / slowest-25% curves appear once at least 4 classmates
              in this course have submitted this test.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default PacingChartCard;
