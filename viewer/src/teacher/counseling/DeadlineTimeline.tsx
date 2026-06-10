/**
 * DeadlineTimeline
 * ================
 * A presentational chronological timeline of counseling deadlines — college
 * application due dates and counseling task due dates — grouped by month, with
 * an urgency countdown chip per item (reusing deadlineUrgency from
 * collegeAppHelpers). Used by both the per-student timeline and the caseload-
 * wide timeline; it takes already-fetched items and just renders them.
 *
 * Counseling's core pain is staying ahead of due dates, so this gives a "what's
 * coming, in order" read that a flat list can't.
 */
import { useMemo } from "react";
import { deadlineUrgency } from "./collegeAppHelpers";

export interface TimelineItem {
  /** Stable key (prefix by source, e.g. `c-<id>` / `t-<id>`). */
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Primary label (college name, or task title). */
  title: string;
  /** Secondary label (plan, student name, "Task", …). */
  sublabel?: string;
  kind: "college" | "task";
  /** Completed/submitted — de-emphasized in the rail. */
  done?: boolean;
}

function monthKey(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "Undated";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function KindIcon({ kind }: { kind: TimelineItem["kind"] }) {
  if (kind === "college") {
    return (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3 2 8l10 5 10-5z" />
        <path d="M6 10.5V16c0 1.1 2.7 3 6 3s6-1.9 6-3v-5.5" />
      </svg>
    );
  }
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 11 3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

export function DeadlineTimeline({
  items,
  emptyHint = "No upcoming deadlines.",
}: {
  items: TimelineItem[];
  emptyHint?: string;
}): JSX.Element {
  // Sort ascending by date, then group into month buckets preserving order.
  const groups = useMemo(() => {
    const sorted = [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const out: { month: string; rows: TimelineItem[] }[] = [];
    for (const it of sorted) {
      const m = monthKey(it.date);
      const last = out[out.length - 1];
      if (last && last.month === m) last.rows.push(it);
      else out.push({ month: m, rows: [it] });
    }
    return out;
  }, [items]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">{emptyHint}</p>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.month} className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {g.month}
          </h4>
          <ol className="relative ml-2 space-y-2 border-l border-slate-200 dark:border-slate-800 pl-4">
            {g.rows.map((it) => {
              const urgency = deadlineUrgency(it.date);
              return (
                <li key={it.id} className="relative">
                  <span
                    className={`absolute -left-[21px] top-2 inline-flex h-3 w-3 items-center justify-center rounded-full ring-2 ring-white dark:ring-slate-900 ${
                      it.done
                        ? "bg-slate-300 dark:bg-slate-600"
                        : it.kind === "college"
                          ? "bg-indigo-500"
                          : "bg-emerald-500"
                    }`}
                    aria-hidden
                  />
                  <div
                    className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 px-3 py-2 ${
                      it.done ? "opacity-60" : ""
                    }`}
                  >
                    <span className="text-slate-400 dark:text-slate-500">
                      <KindIcon kind={it.kind} />
                    </span>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                      {dayLabel(it.date)}
                    </span>
                    <span
                      className={`text-sm font-medium text-slate-900 dark:text-slate-100 ${
                        it.done ? "line-through" : ""
                      }`}
                    >
                      {it.title}
                    </span>
                    {it.sublabel && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {it.sublabel}
                      </span>
                    )}
                    {!it.done && urgency && (
                      <span
                        className={`ml-auto inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${urgency.className}`}
                      >
                        {urgency.label}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
