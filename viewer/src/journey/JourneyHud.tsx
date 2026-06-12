/**
 * JourneyHud
 * ==========
 * Mastery points + level header for the student Journey view
 * (docs/JOURNEY_VIEW.md). Course-scoped, display-only: points/levels are
 * derived in mastery.ts from best effective scores — nothing is stored.
 */
import { levelFor } from "./mastery";

interface JourneyHudProps {
  earned: number;
  possible: number;
  /** Freshly earned points since last visit — rises in beside the bar. */
  delta?: number;
}

export function JourneyHud({
  earned,
  possible,
  delta = 0,
}: JourneyHudProps): JSX.Element {
  const lvl = levelFor(earned);
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-card px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <div>
        <p className="ceremonial text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 leading-none">
          {earned.toLocaleString()}
        </p>
        <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Mastery pts
          {possible > 0 && (
            <span className="normal-case font-medium tracking-normal">
              {" "}
              · of {possible.toLocaleString()} possible
            </span>
          )}
        </p>
      </div>
      <div className="min-w-[180px] flex-1">
        <div className="flex items-baseline justify-between text-[11px] font-semibold">
          <span className="text-indigo-700 dark:text-indigo-300">
            Level {lvl.level} · {lvl.name}
          </span>
          <span className="font-medium text-slate-500 dark:text-slate-400 tabular-nums">
            {lvl.nextAt === null
              ? "Top level"
              : `${(lvl.nextAt - earned).toLocaleString()} to Level ${lvl.level + 1}`}
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={lvl.progressPct}
          aria-label={`Level ${lvl.level} progress`}
        >
          <div
            className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 motion-safe:transition-[width]"
            style={{ width: `${lvl.progressPct}%` }}
          />
        </div>
      </div>
      {delta > 0 && (
        <span className="journey-rise text-xs font-bold text-amber-700 dark:text-amber-400 tabular-nums">
          +{delta.toLocaleString()} pts
        </span>
      )}
    </div>
  );
}
