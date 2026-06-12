/**
 * JourneyGrid
 * ===========
 * Khan-structure mastery grid (docs/JOURNEY_VIEW.md): units as rows of
 * state-colored cells with a legend, per-unit mastery points, and an
 * "up next" band. Purely presentational — callers build units via
 * buildJourney() and handle cell navigation in onOpenCell.
 *
 * Skinned with the app's own tokens (accent channel + slate scale + the
 * global .journey-seal gold), so it reads native in ivy AND classic, light
 * and dark — per the decision record, Khan's structure, our skin.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { JourneyCell, JourneyUnit } from "./buildJourney";
import { MASTERY_LABEL, type MasteryState } from "./mastery";

interface JourneyGridProps {
  units: JourneyUnit[];
  onOpenCell?: (cell: JourneyCell) => void;
  /** Educator class-aggregate mode — adjusts tooltip + meta copy. */
  aggregate?: boolean;
  /**
   * Anchored cell-detail popover (decision 1A/2A, docs/JOURNEY_VIEW.md).
   * When provided, clicking a trackable (non-resource) cell opens the
   * rendered content anchored under the cell instead of navigating;
   * resource cells keep direct navigation. Esc / click-away closes.
   */
  popover?: (cell: JourneyCell, close: () => void) => ReactNode;
  /**
   * Per-cell opt-out: return false to skip the popover and navigate
   * directly (e.g. educator full-test cells → per-test overview).
   */
  hasPopover?: (cell: JourneyCell) => boolean;
  /** Cell ids that just crossed the seal threshold — plays the gold stamp. */
  justSealed?: Set<string>;
}

const POPOVER_WIDTH = 312;

interface OpenPopover {
  cellId: string;
  left: number;
  top: number;
}

/** Fill classes per mastery state (border supplied by the base class). */
export const STATE_CLASS: Record<MasteryState, string> = {
  sealed: "journey-seal text-white",
  proficient:
    "bg-indigo-600 border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 text-white",
  done: "bg-indigo-600 border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 text-white",
  attempted:
    "bg-indigo-200 border-indigo-300 dark:bg-indigo-900 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300",
  not_started:
    "bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-600 text-slate-400 dark:text-slate-500",
  locked:
    "bg-slate-100 border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-300 dark:text-slate-600",
};

function CellGlyph({ cell }: { cell: JourneyCell }): JSX.Element | null {
  const stroke = "currentColor";
  if (cell.kind === "test" || cell.kind === "fulltest") {
    // Star — Practice Test (assignment or full-length link).
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3l2.7 5.6 6.1.7-4.6 4.2 1.3 6L12 16.6 6.5 19.5l1.3-6L3.2 9.3l6.1-.7L12 3Z" />
      </svg>
    );
  }
  if (cell.kind === "resource") {
    // Side-trail link glyph.
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L11 5M14 11a5 5 0 0 0-7.07 0L5 12.93a5 5 0 0 0 7.07 7.07L13 19" />
      </svg>
    );
  }
  // Question Set cells: a check when submitted-or-better, empty otherwise.
  if (cell.state === "sealed" || cell.state === "proficient" || cell.state === "done") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 12.5 9.5 18 20 6.5" />
      </svg>
    );
  }
  return null;
}

function cellTooltip(cell: JourneyCell, aggregate: boolean): string {
  const parts: string[] = [cell.title];
  if (cell.kind === "resource") {
    parts.push("Resource");
  } else if (aggregate && cell.kind === "fulltest") {
    parts.push("Full-length test — open for cohort stats");
  } else if (aggregate && cell.aggregate) {
    const a = cell.aggregate;
    parts.push(`${a.submitted}/${a.total} submitted`);
    if (a.sealed > 0) parts.push(`${a.sealed} sealed`);
    if (cell.score !== null) parts.push(`class avg ${Math.round(cell.score)}%`);
  } else {
    parts.push(MASTERY_LABEL[cell.state]);
    if (cell.score !== null) parts.push(`${Math.round(cell.score)}%`);
    if (cell.possible > 0) parts.push(`${cell.earned}/${cell.possible} pts`);
    if (cell.state === "attempted") parts.push("retake to upgrade");
  }
  return parts.join(" · ");
}

export function formatUnlockDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function LegendSwatch({
  className,
  label,
}: {
  className: string;
  label: string;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
      <span aria-hidden className={`h-3.5 w-3.5 rounded border ${className}`} />
      {label}
    </span>
  );
}

export function JourneyLegend(): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-hidden>
      <LegendSwatch className={STATE_CLASS.sealed} label="Sealed · 80%+" />
      <LegendSwatch className={STATE_CLASS.proficient} label="Proficient · 60–79%" />
      <LegendSwatch className={STATE_CLASS.attempted} label="Attempted" />
      <LegendSwatch className={STATE_CLASS.not_started} label="Not started" />
      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded border border-slate-300 dark:border-slate-600 text-slate-500">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l2.7 5.6 6.1.7-4.6 4.2 1.3 6L12 16.6 6.5 19.5l1.3-6L3.2 9.3l6.1-.7L12 3Z" />
          </svg>
        </span>
        Practice Test
      </span>
    </div>
  );
}

/**
 * One unit's interactive cells row + its anchored popover. Owns the popover
 * state so both layouts (flat grid + ledger spine) share identical behavior.
 * Renders a position:relative wrapper; the popover anchors within it.
 */
export interface UnitCellsProps {
  cells: JourneyCell[];
  onOpenCell?: (cell: JourneyCell) => void;
  aggregate?: boolean;
  popover?: (cell: JourneyCell, close: () => void) => ReactNode;
  hasPopover?: (cell: JourneyCell) => boolean;
  justSealed?: Set<string>;
}

export function UnitCells({
  cells,
  onOpenCell,
  aggregate = false,
  popover,
  hasPopover,
  justSealed,
}: UnitCellsProps): JSX.Element {
  const [open, setOpen] = useState<OpenPopover | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback((): void => setOpen(null), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: PointerEvent): void => {
      const node = popoverRef.current;
      if (node && e.target instanceof Node && !node.contains(e.target)) {
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  const onCellClick = (
    cell: JourneyCell,
    e: React.MouseEvent<HTMLButtonElement>,
  ): void => {
    // Resource cells (or no/opted-out popover) keep direct navigation.
    if (!popover || cell.kind === "resource" || hasPopover?.(cell) === false) {
      onOpenCell?.(cell);
      return;
    }
    if (open?.cellId === cell.id) {
      close();
      return;
    }
    const btn = e.currentTarget;
    const wrap = wrapRef.current;
    const maxLeft = Math.max(
      8,
      (wrap?.clientWidth ?? POPOVER_WIDTH + 48) - POPOVER_WIDTH - 20,
    );
    setOpen({
      cellId: cell.id,
      left: Math.min(btn.offsetLeft, maxLeft),
      top: btn.offsetTop + btn.offsetHeight + 10,
    });
  };

  return (
    <div ref={wrapRef} className="relative mt-3 flex flex-wrap gap-2">
      {cells.map((cell) => {
        const tip = cellTooltip(cell, aggregate);
        const isLocked = cell.state === "locked";
        return (
          <button
            key={cell.id}
            type="button"
            disabled={isLocked || (!onOpenCell && !popover)}
            title={tip}
            aria-label={tip}
            aria-expanded={popover ? open?.cellId === cell.id : undefined}
            onClick={(e) => onCellClick(cell, e)}
            className={`relative inline-flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-md border-2 motion-safe:transition-transform ${
              STATE_CLASS[cell.state]
            } ${
              isLocked
                ? "cursor-not-allowed"
                : "hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            } ${
              cell.current
                ? "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900"
                : ""
            } ${justSealed?.has(cell.id) ? "journey-stamp" : ""}`}
          >
            <CellGlyph cell={cell} />
          </button>
        );
      })}

      {popover &&
        open &&
        (() => {
          const cell = cells.find((c) => c.id === open.cellId);
          if (!cell) return null;
          return (
            <div
              ref={popoverRef}
              role="dialog"
              aria-label={cell.title}
              style={{ left: open.left, top: open.top, width: POPOVER_WIDTH }}
              className="absolute z-20 rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-600 shadow-xl p-4 motion-safe:animate-[journey-pop_.18s_ease-out]"
            >
              {popover(cell, close)}
            </div>
          );
        })()}
    </div>
  );
}

export function JourneyGrid({
  units,
  onOpenCell,
  aggregate = false,
  popover,
  hasPopover,
  justSealed,
}: JourneyGridProps): JSX.Element {
  return (
    // NB: no overflow-hidden here — the anchored popover extends past its
    // section. First/last sections round their own corners so the upNext
    // band background still respects the card radius.
    <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-card">
      {units.map((u, i) => (
        <section
          key={u.id}
          aria-label={u.name}
          className={`relative px-5 py-4 ${i > 0 ? "border-t border-slate-100 dark:border-slate-800" : ""} ${
            u.upNext ? "bg-indigo-50/60 dark:bg-indigo-950/30" : ""
          } ${i === 0 ? "rounded-t-2xl" : ""} ${
            i === units.length - 1 ? "rounded-b-2xl" : ""
          }`}
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
                {aggregate ? "Up next for the class" : "Up next for you"}
              </span>
            )}
            <span className="ml-auto text-[11.5px] tabular-nums text-slate-500 dark:text-slate-400">
              {u.trackableCount > 0 && !aggregate && (
                <>
                  {u.doneCount}/{u.trackableCount} done
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
              aggregate={aggregate}
              popover={popover}
              hasPopover={hasPopover}
              justSealed={justSealed}
            />
          )}
        </section>
      ))}
    </div>
  );
}
