/**
 * calendar/components
 * ===================
 * The Calendar view sub-components (month header, shortcuts popover, event
 * chip, day popover + content, month cell, month view, list view). Extracted
 * verbatim from CalendarPage; consumed by the page via the barrel.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  buildMonthGrid,
  isSameDay,
  truncate,
  MONTH_FMT,
  WEEKDAY_FMT,
  DATE_FMT,
  FULL_DATE_FMT,
  TIME_FMT,
  type CalendarEvent,
} from "./helpers";
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
            className="rounded-md min-h-[28px] min-w-[28px] inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
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

export interface EventChipProps {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
}

export function EventChip({ event, onClick }: EventChipProps) {
  const color =
    event.kind === "assignment"
      ? "bg-indigo-100 text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-200 dark:hover:bg-indigo-900"
      : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-900";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
      title={`${event.title} — ${event.courseName} (${TIME_FMT.format(event.due_at)})`}
      className={`block w-full text-left truncate rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${color}`}
    >
      {truncate(event.title, 14)}
    </button>
  );
}

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
          className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] rounded-t-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 border-l-4 border-l-indigo-500 shadow-2xl flex flex-col motion-safe:transition-transform"
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
        className="fixed z-50 w-[280px] max-h-[60vh] rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 border-l-4 border-l-indigo-500 shadow-xl flex flex-col motion-safe:transition-transform"
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
          className="rounded-md min-h-[32px] min-w-[32px] inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
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

export interface MonthCellProps {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDayClick: (date: Date, rect: DOMRect) => void;
}

export function MonthCell({
  date,
  inMonth,
  isToday,
  events,
  onEventClick,
  onDayClick,
}: MonthCellProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(0, 3);
  const hidden = events.length - visible.length;
  const cellRef = useRef<HTMLDivElement>(null);
  const hasEvents = events.length > 0;

  const handleCellClick = () => {
    if (!hasEvents) return;
    const rect = cellRef.current?.getBoundingClientRect();
    if (rect) onDayClick(date, rect);
  };

  return (
    <div
      ref={cellRef}
      onClick={handleCellClick}
      onKeyDown={(e) => {
        if (!hasEvents) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCellClick();
        }
      }}
      role={hasEvents ? "button" : undefined}
      tabIndex={hasEvents ? 0 : undefined}
      aria-label={
        hasEvents
          ? `View ${events.length} event${events.length === 1 ? "" : "s"} on ${FULL_DATE_FMT.format(date)}`
          : undefined
      }
      className={`min-h-[96px] bg-white dark:bg-slate-900 p-1.5 flex flex-col gap-1 outline-none ${
        inMonth ? "" : "opacity-50"
      } ${isToday ? "ring-2 ring-indigo-500 ring-inset" : ""} ${
        hasEvents
          ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 focus-visible:ring-2 focus-visible:ring-indigo-400"
          : ""
      }`}
    >
      <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
        {date.getDate()}
      </div>
      <div className="flex flex-col gap-0.5">
        {visible.map((ev) => (
          <EventChip
            key={`${ev.kind}:${ev.id}`}
            event={ev}
            onClick={onEventClick}
          />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
            className="text-[11px] text-slate-500 dark:text-slate-400 hover:underline text-left"
          >
            +{hidden} more
          </button>
        )}
      </div>
    </div>
  );
}

export interface MonthViewProps {
  anchor: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

export function MonthView({ anchor, events, onEventClick }: MonthViewProps) {
  const cells = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const today = useMemo(() => new Date(), []);
  // Bucket events by yyyy-mm-dd key. For multi-day spans (start/end on
  // different days) we include the event in every covered day.
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const k = `${ev.due_at.getFullYear()}-${ev.due_at.getMonth()}-${ev.due_at.getDate()}`;
      const arr = map.get(k);
      if (arr) {
        arr.push(ev);
      } else {
        map.set(k, [ev]);
      }
    }
    return map;
  }, [events]);

  // Weekday header row uses the first 7 grid cells so locale formatting "just
  // works" (Mon-first locales still get Sun-first columns; trade-off is fine).
  const weekdays = useMemo(() => cells.slice(0, 7), [cells]);

  // Click-day popover state. We hold the anchor element's bounding rect at
  // open time so the popover knows where to dock. Only one open at a time.
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [openDayRect, setOpenDayRect] = useState<DOMRect | null>(null);
  const [openDayDate, setOpenDayDate] = useState<Date | null>(null);

  // Mobile renders the popover as a bottom sheet instead of an absolute
  // positioned popover (much easier to tap with a thumb).
  const isMobile = useMediaQuery("(max-width: 640px)");

  const handleDayClick = (date: Date, rect: DOMRect) => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    setOpenDayKey(key);
    setOpenDayDate(date);
    setOpenDayRect(rect);
  };

  const handleClose = () => {
    setOpenDayKey(null);
    setOpenDayDate(null);
    setOpenDayRect(null);
  };

  const openDayEvents = openDayKey ? byDay.get(openDayKey) ?? [] : [];

  return (
    <div className="rounded-xl overflow-hidden overflow-x-auto ring-1 ring-slate-200 dark:ring-slate-800">
      <div className="min-w-[560px]">
      <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-900">
        {weekdays.map((d) => (
          <div
            key={d.toISOString()}
            className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-center border-b border-slate-200 dark:border-slate-800"
          >
            {WEEKDAY_FMT.format(d)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800">
        {cells.map((d) => {
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayEvents = byDay.get(key) ?? [];
          return (
            <MonthCell
              key={d.toISOString()}
              date={d}
              inMonth={d.getMonth() === anchor.getMonth()}
              isToday={isSameDay(d, today)}
              events={dayEvents}
              onEventClick={onEventClick}
              onDayClick={handleDayClick}
            />
          );
        })}
      </div>
      </div>
      {openDayKey && openDayDate && (
        <DayPopover
          date={openDayDate}
          events={openDayEvents}
          isMobile={isMobile}
          anchorRect={openDayRect}
          onClose={handleClose}
          onEventClick={onEventClick}
        />
      )}
    </div>
  );
}

export interface ListViewProps {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

export function ListView({ events, onEventClick }: ListViewProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500 dark:text-slate-400 text-center">
        Nothing due in the next 30 days.
      </div>
    );
  }
  return (
    <div className="rounded-xl overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Date</th>
            <th className="px-3 py-2 text-left font-semibold">Time</th>
            <th className="px-3 py-2 text-left font-semibold">Type</th>
            <th className="px-3 py-2 text-left font-semibold">Title</th>
            <th className="px-3 py-2 text-left font-semibold">Course</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <tr
              key={`${ev.kind}:${ev.id}`}
              className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
              onClick={() => onEventClick(ev)}
            >
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {DATE_FMT.format(ev.due_at)}
              </td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {TIME_FMT.format(ev.due_at)}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    ev.kind === "assignment"
                      ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200"
                      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                  }`}
                >
                  {ev.kind === "assignment" ? "Assignment" : "Portfolio"}
                </span>
              </td>
              <td className="px-3 py-2 text-slate-900 dark:text-slate-100 font-medium">
                {ev.title}
              </td>
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                {ev.courseName}
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </div>
  );
}

