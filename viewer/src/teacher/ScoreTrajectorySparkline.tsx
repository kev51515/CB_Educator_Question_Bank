import {
  bandClass,
  bandFillClass,
  formatRelative,
  formatSparkDate,
  projectSparkX,
  projectSparkY,
  SPARK_H,
  SPARK_PAD_X,
  SPARK_W,
  type TrajectoryPoint,
} from "./studentProfileHelpers";

interface ScoreTrajectorySparklineProps {
  points: ReadonlyArray<TrajectoryPoint>;
  /** ISO of the most recent point — surfaced in the caption beneath the chart. */
  latestAt: string;
}

export function ScoreTrajectorySparkline({
  points,
  latestAt,
}: ScoreTrajectorySparklineProps): JSX.Element | null {
  if (points.length === 0) return null;

  // Single-point case: render a dot + helper copy, skip the chart.
  if (points.length === 1) {
    const only = points[0];
    return (
      <div className="mt-3 max-w-[280px]">
        <div className="flex items-center gap-2">
          <svg
            width={SPARK_W}
            height={SPARK_H}
            viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
            className="block"
            aria-hidden
          >
            {/* gridlines */}
            <line
              x1={SPARK_PAD_X}
              x2={SPARK_W - SPARK_PAD_X}
              y1={projectSparkY(0)}
              y2={projectSparkY(0)}
              stroke="currentColor"
              strokeWidth={1}
              className="text-slate-200 dark:text-slate-700"
            />
            <line
              x1={SPARK_PAD_X}
              x2={SPARK_W - SPARK_PAD_X}
              y1={projectSparkY(50)}
              y2={projectSparkY(50)}
              stroke="currentColor"
              strokeDasharray="3 4"
              strokeWidth={1}
              className="text-slate-200 dark:text-slate-700"
            />
            <line
              x1={SPARK_PAD_X}
              x2={SPARK_W - SPARK_PAD_X}
              y1={projectSparkY(100)}
              y2={projectSparkY(100)}
              stroke="currentColor"
              strokeWidth={1}
              className="text-slate-200 dark:text-slate-700"
            />
            <circle
              cx={projectSparkX(0, 1)}
              cy={projectSparkY(only.y)}
              r={4}
              className={bandFillClass(only.y)}
              stroke="white"
              strokeWidth={1.5}
            >
              <title>
                {formatSparkDate(only.date)}: {Math.round(only.y)}%
              </title>
            </circle>
          </svg>
        </div>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Only one data point — need 2 attempts to see a trajectory
        </p>
      </div>
    );
  }

  const last = points[points.length - 1];
  const lineColor = bandClass(last.y);

  const pathD = points
    .map((p, i) => {
      const x = projectSparkX(p.x, points.length).toFixed(2);
      const y = projectSparkY(p.y).toFixed(2);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="mt-3 max-w-[280px]">
      <svg
        role="img"
        aria-label={`Score trajectory across the last ${points.length} graded attempts`}
        width={SPARK_W}
        height={SPARK_H}
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        className="block motion-safe:transition-opacity"
      >
        {/* Subtle gridlines at 0%, 50%, 100% */}
        <line
          x1={SPARK_PAD_X}
          x2={SPARK_W - SPARK_PAD_X}
          y1={projectSparkY(100)}
          y2={projectSparkY(100)}
          stroke="currentColor"
          strokeWidth={1}
          className="text-slate-200 dark:text-slate-700"
        />
        <line
          x1={SPARK_PAD_X}
          x2={SPARK_W - SPARK_PAD_X}
          y1={projectSparkY(50)}
          y2={projectSparkY(50)}
          stroke="currentColor"
          strokeDasharray="3 4"
          strokeWidth={1}
          className="text-slate-200 dark:text-slate-700"
        />
        <line
          x1={SPARK_PAD_X}
          x2={SPARK_W - SPARK_PAD_X}
          y1={projectSparkY(0)}
          y2={projectSparkY(0)}
          stroke="currentColor"
          strokeWidth={1}
          className="text-slate-200 dark:text-slate-700"
        />

        {/* Trajectory polyline, colored by the latest point's band */}
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={lineColor}
          vectorEffect="non-scaling-stroke"
        />

        {/* Per-attempt dots with accessible tooltips */}
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          const cx = projectSparkX(p.x, points.length);
          const cy = projectSparkY(p.y);
          return (
            <circle
              key={`${p.date}-${i}`}
              cx={cx}
              cy={cy}
              r={isLast ? 4 : 2.5}
              className={
                isLast ? bandFillClass(p.y) : "fill-slate-400 dark:fill-slate-500"
              }
              stroke="white"
              strokeWidth={1.25}
            >
              <title>
                {formatSparkDate(p.date)}: {Math.round(p.y)}%
              </title>
            </circle>
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
        Last {points.length} attempt{points.length === 1 ? "" : "s"} · most recent{" "}
        <time dateTime={latestAt}>{formatRelative(latestAt)}</time>
      </p>
    </div>
  );
}
