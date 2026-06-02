/**
 * ScoreArc — inline SVG sparkline
 * ===============================
 * Tiny inline SVG sparkline of score_percent over time. No external chart
 * dep — keeps this lane self-contained while M13 picks a shared component.
 * Extracted from MockTestHistoryPage. No behavior change.
 */
import type { MockAttempt } from "./mockTestHistoryHelpers";

interface ScoreArcProps {
  /** Attempts in chronological order (oldest → newest). */
  attempts: MockAttempt[];
}

/**
 * Tiny inline SVG sparkline of score_percent over time. No external chart
 * dep — keeps this lane self-contained while M13 picks a shared component.
 */
export function ScoreArc({ attempts }: ScoreArcProps) {
  const width = 600;
  const height = 120;
  const padX = 16;
  const padY = 14;

  if (attempts.length === 0) return null;

  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  // X position per index (evenly spaced; single-point case lands centred).
  const xAt = (i: number): number => {
    if (attempts.length === 1) return width / 2;
    return padX + (i / (attempts.length - 1)) * innerW;
  };
  const yAt = (pct: number): number =>
    padY + innerH - (Math.max(0, Math.min(100, pct)) / 100) * innerH;

  const points = attempts.map((a, i) => ({
    x: xAt(i),
    y: yAt(a.scorePercent),
    pct: a.scorePercent,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  // Area beneath line, closed at the baseline.
  const baseline = padY + innerH;
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${baseline.toFixed(1)} L${points[0].x.toFixed(1)},${baseline.toFixed(1)} Z`;

  // Y-axis guide lines at 0/50/100.
  const guides = [0, 50, 100];

  return (
    <div
      className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-4"
      aria-label="Score history chart"
    >
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Score trend
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {attempts.length} attempt{attempts.length === 1 ? "" : "s"} · oldest → newest
        </p>
      </div>
      <svg
        role="img"
        aria-label={`Score percentages across ${attempts.length} attempts`}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-32"
      >
        <defs>
          <linearGradient id="scoreArcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        {guides.map((g) => (
          <line
            key={g}
            x1={padX}
            x2={width - padX}
            y1={yAt(g)}
            y2={yAt(g)}
            stroke="currentColor"
            className="text-slate-200 dark:text-slate-800"
            strokeWidth={1}
            strokeDasharray={g === 0 || g === 100 ? "0" : "3 3"}
          />
        ))}
        <path d={areaPath} fill="url(#scoreArcFill)" />
        <path
          d={linePath}
          fill="none"
          stroke="#4f46e5"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill="#4f46e5"
            stroke="#ffffff"
            strokeWidth={1.5}
          >
            <title>{`Attempt ${i + 1}: ${p.pct}%`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
