/**
 * calendar/components/DayPopover — the click-day detail panel (desktop popover
 * with viewport-flip / mobile bottom-sheet) plus its inner content list.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { FULL_DATE_FMT, TIME_FMT, type CalendarEvent } from "../helpers";

export interface DayPopoverProps {
  date: Date;
  events: CalendarEvent[];
  isMobile: boolean;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onEventClick: (event: CalendarEvent) => void;
}

/**
 * Click-day detail panel.
 *
 * Desktop: ~280px popover anchored beside the day cell with viewport-flip.
 * Mobile: full-width bottom sheet (much easier to tap).
 *
 * Renders as role="dialog" aria-modal="true" with useFocusTrap so Tab/Shift+Tab
 * cycle inside. Esc and outside click close. The popover only renders in
 * month view (the consumer gates the openDayKey state).
 */
export function DayPopover({
  date,
  events,
  isMobile,
  anchorRect,
  onClose,
  onEventClick,
}: DayPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const labelId = useMemo(
    () => `day-popover-label-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
    [date],
  );
  useFocusTrap(panelRef, true);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Desktop: position next to the day cell with viewport flip so the popover
  // doesn't clip at the right/bottom edges of the screen. Recompute on mount
  // and on window resize. We deliberately don't subscribe to scroll because
  // the click immediately closes any open popover that's far from the cursor.
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(
    null,
  );
  useEffect(() => {
    if (isMobile) {
      setCoords(null);
      return;
    }
    if (!anchorRect) return;
    const compute = () => {
      const popW = 280;
      const popH = Math.min(panelRef.current?.offsetHeight ?? 320, 480);
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Prefer right of cell, flip to left if it'd clip
      let left = anchorRect.right + margin;
      if (left + popW > vw - margin) {
        left = anchorRect.left - margin - popW;
      }
      if (left < margin) left = Math.max(margin, vw - margin - popW);
      // Prefer top-aligned with cell, flip up if it'd clip
      let top = anchorRect.top;
      if (top + popH > vh - margin) {
        top = Math.max(margin, vh - margin - popH);
      }
      if (top < margin) top = margin;
      setCoords({ left, top });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [anchorRect, isMobile]);

  if (!isMobile && !coords) {
    // Wait one tick so we don't flash an off-screen popover.
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-slate-900/30"
          aria-hidden="true"
          onClick={onClose}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          className="fixed z-50 opacity-0 pointer-events-none"
          style={{ left: -9999, top: -9999 }}
        >
          <DayPopoverContent
            date={date}
            events={events}
            labelId={labelId}
            onClose={onClose}
            onEventClick={onEventClick}
          />
        </div>
      </>
    );
  }

  if (isMobile) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 motion-safe:transition-opacity"
          aria-hidden="true"
          onClick={onClose}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] rounded-t-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-2xl flex flex-col motion-safe:transition-transform"
          onClick={(e) => e.stopPropagation()}
        >
          <DayPopoverContent
            date={date}
            events={events}
            labelId={labelId}
            onClose={onClose}
            onEventClick={onEventClick}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/30 motion-safe:transition-opacity"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="fixed z-50 w-[280px] max-h-[60vh] rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-xl flex flex-col motion-safe:transition-transform"
        style={{ left: coords!.left, top: coords!.top }}
        onClick={(e) => e.stopPropagation()}
      >
        <DayPopoverContent
          date={date}
          events={events}
          labelId={labelId}
          onClose={onClose}
          onEventClick={onEventClick}
        />
      </div>
    </>
  );
}

export interface DayPopoverContentProps {
  date: Date;
  events: CalendarEvent[];
  labelId: string;
  onClose: () => void;
  onEventClick: (event: CalendarEvent) => void;
}

export function DayPopoverContent({
  date,
  events,
  labelId,
  onClose,
  onEventClick,
}: DayPopoverContentProps) {
  return (
    <>
      <div className="flex items-start gap-2 px-4 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800">
        <h3
          id={labelId}
          className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex-1"
        >
          {FULL_DATE_FMT.format(date)}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close day view"
          data-autofocus
          className="rounded-md min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          ×
        </button>
      </div>
      <div className="overflow-y-auto p-2 flex flex-col gap-1">
        {events.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 px-2 py-3">
            Nothing due this day.
          </p>
        ) : (
          events.map((ev) => {
            const typeLabel =
              ev.kind === "assignment" ? "Assignment" : "Portfolio item";
            return (
              <button
                key={`${ev.kind}:${ev.id}`}
                type="button"
                onClick={() => {
                  onEventClick(ev);
                  onClose();
                }}
                aria-label={`${typeLabel}: ${ev.title} in ${ev.courseName} due ${TIME_FMT.format(ev.due_at)}`}
                className="text-left rounded-lg min-h-[40px] px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 focus:bg-slate-50 dark:focus:bg-slate-800/60 outline-none ring-1 ring-transparent focus:ring-indigo-400 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      ev.kind === "assignment"
                        ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                    }`}
                  >
                    {TIME_FMT.format(ev.due_at)}
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {ev.title}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {ev.courseName}
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
