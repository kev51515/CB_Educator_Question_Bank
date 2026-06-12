/**
 * calendar/components/chrome — the month header (prev/next/today) and the
 * keyboard-shortcuts popover. Extracted verbatim from the old components.tsx.
 */
import { useEffect } from "react";
import { MONTH_FMT } from "../helpers";

export interface MonthHeaderProps {
  anchor: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  todayDisabled: boolean;
}

export function MonthHeader({
  anchor,
  onPrev,
  onNext,
  onToday,
  todayDisabled,
}: MonthHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        {MONTH_FMT.format(anchor)}
      </h2>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          className="rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 text-sm min-h-[40px] min-w-[40px] px-2 py-1 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          aria-label="Previous month"
          title="Previous month (←)"
        >
          ←
        </button>
        <button
          type="button"
          onClick={onToday}
          disabled={todayDisabled}
          className="rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 text-sm min-h-[40px] px-3 py-1 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
          title={todayDisabled ? "Already viewing this month" : "Today (T)"}
        >
          Today
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 text-sm min-h-[40px] min-w-[40px] px-2 py-1 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          aria-label="Next month"
          title="Next month (→)"
        >
          →
        </button>
      </div>
    </div>
  );
}

export interface ShortcutsPopoverProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsPopover({ open, onClose }: ShortcutsPopoverProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Click-outside backdrop (invisible) */}
      <div
        className="fixed inset-0 z-40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="false"
        aria-label="Keyboard shortcuts"
        className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-lg p-4 motion-safe:transition-opacity motion-safe:duration-150"
      >
        <div className="flex items-start gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex-1">
            Keyboard shortcuts
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ×
          </button>
        </div>
        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-600 dark:text-slate-400">
              Previous / next month
            </dt>
            <dd className="flex items-center gap-1">
              <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700">
                ←
              </kbd>
              <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700">
                →
              </kbd>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-600 dark:text-slate-400">Today</dt>
            <dd>
              <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700">
                T
              </kbd>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-600 dark:text-slate-400">
              Month / List view
            </dt>
            <dd className="flex items-center gap-1">
              <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700">
                M
              </kbd>
              <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700">
                L
              </kbd>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-600 dark:text-slate-400">
              Close this panel
            </dt>
            <dd>
              <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700">
                Esc
              </kbd>
            </dd>
          </div>
        </dl>
      </div>
    </>
  );
}
