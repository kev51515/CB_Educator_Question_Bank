/**
 * JourneySpine
 * ============
 * C1 "ledger spine" student layout (docs/JOURNEY_VIEW.md, v2/v3 decision):
 * unit cards hung on a progress-thermometer rail (solid behind you, dotted
 * ahead) with per-unit medallions (green check = complete, navy ring =
 * current, gray number = ahead), seal-count chips in unit headers, and the
 * course's final full-length test promoted to a navy summit card at the
 * end of the trail.
 *
 * Cell behavior (popover, stamp, tooltips) is shared with the flat grid
 * via UnitCells. The educator aggregate view keeps JourneyGrid.
 */
import type { ReactNode } from "react";
import type { Journey, JourneyCell, JourneyUnit } from "./buildJourney";
import { UnitCells, formatUnlockDate } from "./JourneyGrid";

interface JourneySpineProps {
  journey: Journey;
  onOpenCell?: (cell: JourneyCell) => void;
  popover?: (cell: JourneyCell, close: () => void) => ReactNode;
  hasPopover?: (cell: JourneyCell) => boolean;
  justSealed?: Set<string>;
}

/** A unit is "complete" when every trackable cell is submitted-or-better. */
function isComplete(u: JourneyUnit): boolean {
  return u.trackableCount > 0 && u.doneCount >= u.trackableCount;
}

function Medallion({
  unit,
  index,
}: {
  unit: JourneyUnit;
  index: number;
}): JSX.Element {
  const complete = isComplete(unit);
  const current = unit.upNext;
  const pct =
    unit.trackableCount > 0
      ? Math.min(1, unit.doneCount / unit.trackableCount)
      : 0;
  // Completion ring: r=25 in a 54-box → circumference ≈ 157.
  const C = 157;
  const ringColor = complete
    ? "stroke-emerald-700 dark:stroke-emerald-500"
    : "stroke-indigo-600 dark:stroke-indigo-500";
  return (
    <span
      aria-hidden
      className={`absolute -left-[58px] top-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-white dark:bg-slate-900 shadow-sm text-sm font-bold ${
        complete
          ? "border-[1.5px] border-emerald-700 dark:border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/40"
          : current
            ? "border-2 border-indigo-600 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300"
            : "border-[1.5px] border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500"
      }`}
    >
      {pct > 0 && !complete && (
        <svg
          viewBox="0 0 54 54"
          className="absolute -inset-[5px] h-[54px] w-[54px] -rotate-90"
        >
          <circle
            cx="27"
            cy="27"
            r="25"
            fill="none"
            strokeWidth="2.5"
            className={ringColor}
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct)}
            strokeLinecap="round"
          />
        </svg>
      )}
      {complete ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 12.5 9.5 18 20 6.5" />
        </svg>
      ) : (
        index + 1
      )}
    </span>
  );
}

export function JourneySpine({
  journey,
  onOpenCell,
  popover,
  hasPopover,
  justSealed,
}: JourneySpineProps): JSX.Element {
  // Promote the LAST full-test cell of the course to the summit card; it is
  // removed from its unit's row so it doesn't render twice. Module-subset
  // test links (?m=…) keep their per-week placement — only the final full
  // rehearsal becomes the summit.
  let summit: JourneyCell | null = null;
  for (let i = journey.units.length - 1; i >= 0 && !summit; i--) {
    const cells = journey.units[i].cells;
    for (let j = cells.length - 1; j >= 0; j--) {
      if (cells[j].kind === "fulltest" && !cells[j].url?.includes("?m=")) {
        summit = cells[j];
        break;
      }
    }
  }
  const units = summit
    ? journey.units
        .map((u) => {
          const cells = u.cells.filter((c) => c.id !== summit?.id);
          // Recompute unit tallies without the promoted cell so the
          // medallion ring + n/n meta stay accurate.
          const trackable = cells.filter((c) => c.kind !== "resource");
          return {
            unit: {
              ...u,
              cells,
              trackableCount: trackable.length,
              doneCount: trackable.filter(
                (c) => c.state !== "not_started" && c.state !== "locked",
              ).length,
              // If the unit's up-next cell WAS the promoted summit, the
              // badge would point at nothing — keep it only when a visible
              // cell carries it.
              upNext: u.upNext && cells.some((c) => c.current),
            },
            hadCells: u.cells.length > 0,
          };
        })
        // Drop a unit only when its SOLE content was the promoted summit;
        // genuinely empty published modules keep their "coming soon" card.
        .filter((x) => x.unit.cells.length > 0 || !x.hadCells)
        .map((x) => x.unit)
    : journey.units;

  // Thermometer fill: fraction of stages fully complete (capped at the
  // current stage so a skipped-ahead unit doesn't overfill the rail).
  const stageCount = units.length + (summit ? 1 : 0);
  let filled = 0;
  for (const u of units) {
    if (isComplete(u)) filled += 1;
    else break;
  }
  const fillPct = stageCount > 1 ? (filled / stageCount) * 100 : 0;

  return (
    <div className="relative pl-[58px]">
      {/* rail: dotted ahead, solid navy behind */}
      <span
        aria-hidden
        className="absolute left-[21px] top-5 bottom-10 w-0.5"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, rgb(var(--slate-300)) 0 4px, transparent 4px 10px)",
        }}
      >
        <span
          className="absolute left-0 top-0 w-0.5 rounded bg-indigo-600 dark:bg-indigo-500 motion-safe:transition-[height]"
          style={{ height: `${fillPct}%` }}
        />
      </span>

      {units.map((u, i) => {
        const sealCount = u.cells.filter((c) => c.state === "sealed").length;
        return (
          <section
            key={u.id}
            aria-label={u.name}
            className="relative mb-4"
          >
            <Medallion unit={u} index={i} />
            <div
              className={`rounded-2xl bg-white dark:bg-slate-900 ring-1 shadow-card px-5 py-4 ${
                u.upNext
                  ? "ring-indigo-300 dark:ring-indigo-800"
                  : "ring-slate-200 dark:ring-slate-800"
              } ${u.locked ? "opacity-60" : ""}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                  {u.name}
                </h3>
                {u.upNext && (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 2l1.7 4.6L18 8.3l-4.3 1.7L12 14.6l-1.7-4.6L6 8.3l4.3-1.7L12 2Z" />
                    </svg>
                    Up next for you
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-2 text-[11.5px] tabular-nums text-slate-500 dark:text-slate-400">
                  {sealCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 dark:text-amber-300">
                      <span aria-hidden className="h-2 w-2 rounded-full journey-seal border" />
                      {sealCount} seal{sealCount === 1 ? "" : "s"}
                    </span>
                  )}
                  {u.trackableCount > 0 && (
                    <>
                      {u.doneCount}/{u.trackableCount}
                      {u.possible > 0 && (
                        <>
                          {" · "}
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {u.earned}
                          </span>
                          /{u.possible} pts
                        </>
                      )}
                    </>
                  )}
                </span>
              </div>

              {u.locked && (
                <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="4" y="11" width="16" height="9" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  Unlocks {formatUnlockDate(u.opensAt)}
                </p>
              )}

              {u.cells.length === 0 ? (
                <p className="mt-2 text-xs italic text-slate-400 dark:text-slate-500">
                  Content coming soon.
                </p>
              ) : (
                <UnitCells
                  cells={u.cells}
                  onOpenCell={onOpenCell}
                  popover={popover}
                  hasPopover={hasPopover}
                  justSealed={justSealed}
                />
              )}
            </div>
          </section>
        );
      })}

      {summit && (
        <section aria-label="Summit" className="relative">
          <span
            aria-hidden
            className="absolute -left-[58px] top-2.5 flex h-11 w-11 items-center justify-center rounded-xl border-[1.5px] border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 shadow-sm"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 21V4 M4 4h12l-2.5 4L16 12H4" />
            </svg>
          </span>
          <button
            type="button"
            disabled={summit.state === "locked"}
            onClick={() => onOpenCell?.(summit as JourneyCell)}
            className="result-hero w-full rounded-2xl bg-gradient-to-br from-slate-800 to-indigo-900 px-5 py-4 text-left shadow-card motion-safe:transition-transform hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="page-title text-[16px] font-semibold text-white">
                Summit — {summit.title}
              </h3>
              <span className="ml-auto">
                {summit.state === "done" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M4 12.5 9.5 18 20 6.5" />
                    </svg>
                    Submitted
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white/85">
                    {summit.state === "locked" ? "Locked" : "Ready when you are"}
                  </span>
                )}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/75">
              Full-length practice test ·{" "}
              <span className="font-semibold text-amber-300">
                the real rehearsal
              </span>
            </p>
          </button>
        </section>
      )}
    </div>
  );
}
