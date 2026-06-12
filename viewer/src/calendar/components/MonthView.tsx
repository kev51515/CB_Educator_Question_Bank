/**
 * calendar/components/MonthView — the month grid: a day MonthCell (which lists
 * EventChips + opens the DayPopover) and the MonthView that lays out the grid.
 */
import { useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks";
import {
  buildMonthGrid,
  isSameDay,
  FULL_DATE_FMT,
  WEEKDAY_FMT,
  type CalendarEvent,
} from "../helpers";
import { EventChip } from "./EventChip";
import { DayPopover } from "./DayPopover";

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
      <div className="sm:min-w-[560px]">
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
