/**
 * calendar/components/EventChip — the small clickable event pill rendered inside
 * a month cell. The shared leaf used by MonthCell.
 */
import { TIME_FMT, truncate, type CalendarEvent } from "../helpers";

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
