/**
 * calendar/components/ListView — the upcoming-events table (list mode).
 */
import { EmptyState } from "@/components";
import { DATE_FMT, TIME_FMT, type CalendarEvent } from "../helpers";

export interface ListViewProps {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

export function ListView({ events, onEventClick }: ListViewProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900">
        <EmptyState
          icon="check"
          title="No events due"
          body="Nothing due in the next 30 days."
        />
      </div>
    );
  }
  return (
    <div className="rounded-xl overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full md:min-w-[640px] text-sm">
        <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Date</th>
            <th className="px-3 py-2 text-left font-semibold hidden md:table-cell">
              Time
            </th>
            <th className="px-3 py-2 text-left font-semibold hidden md:table-cell">
              Type
            </th>
            <th className="px-3 py-2 text-left font-semibold">Title</th>
            <th className="px-3 py-2 text-left font-semibold hidden md:table-cell">
              Course
            </th>
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
              <td className="px-3 py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap hidden md:table-cell">
                {TIME_FMT.format(ev.due_at)}
              </td>
              <td className="px-3 py-2 hidden md:table-cell">
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
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden md:table-cell">
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
