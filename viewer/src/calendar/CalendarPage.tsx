/**
 * CalendarPage
 * ============
 * Cross-course calendar showing assignment + portfolio_item due dates for
 * every course the signed-in staff member can see (RLS handles scoping —
 * no explicit course filter needed here).
 *
 * Two views:
 *   • Month — standard 7-col grid (Sun–Sat) with up to 3 chips per day.
 *   • List  — flat table of the next 30 days.
 *
 * Native Date + Intl only, zero new deps.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  courseAssignmentPath,
  coursePortfolioPath,
} from "../lib/routes";
import { Skeleton, SkeletonRows } from "../components/Skeleton";

type EventKind = "assignment" | "portfolio";

interface CalendarEvent {
  kind: EventKind;
  id: string;
  title: string;
  due_at: Date;
  courseName: string;
  courseId: string;
}

interface AssignmentRow {
  id: string;
  short_code: string;
  title: string | null;
  due_at: string | null;
  course_id: string;
  courses:
    | { name: string | null; short_code: string }
    | { name: string | null; short_code: string }[]
    | null;
}

interface PortfolioTemplate {
  course_id: string;
  courses:
    | { name: string | null; short_code: string }
    | { name: string | null; short_code: string }[]
    | null;
}

interface PortfolioRow {
  id: string;
  title: string | null;
  due_at: string | null;
  portfolio_templates: PortfolioTemplate | PortfolioTemplate[] | null;
}

type ViewMode = "month" | "list";

// View mode persists globally — not per-course — because the Calendar surface
// itself is global. Wrapping in try/catch protects against Safari private mode
// throwing on localStorage access.
const CALENDAR_VIEW_KEY = "calendar-view";

function readCalendarView(): ViewMode {
  try {
    const raw = window.localStorage.getItem(CALENDAR_VIEW_KEY);
    if (raw === "month" || raw === "list") return raw;
  } catch {
    /* localStorage unavailable (Safari private mode, quota, etc.) */
  }
  return "month";
}

function writeCalendarView(value: ViewMode): void {
  try {
    window.localStorage.setItem(CALENDAR_VIEW_KEY, value);
  } catch {
    /* ignore */
  }
}

const MONTH_FMT = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});

const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: "short" });

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/** Normalize Supabase's "one or many" relation shape into a single record. */
function pickOne<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Build a rectangular grid covering the entire month plus leading days from
 * the previous month and trailing days from the next month so each row has
 * exactly 7 cells. */
function buildMonthGrid(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const last = endOfMonth(anchor);
  const leading = first.getDay(); // 0 = Sun
  const totalDays = leading + last.getDate();
  const trailing = (7 - (totalDays % 7)) % 7;
  const cells: Date[] = [];
  const gridStart = addDays(first, -leading);
  const totalCells = totalDays + trailing;
  for (let i = 0; i < totalCells; i += 1) {
    cells.push(addDays(gridStart, i));
  }
  return cells;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

interface MonthHeaderProps {
  anchor: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  todayDisabled: boolean;
}

function MonthHeader({
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

interface ShortcutsPopoverProps {
  open: boolean;
  onClose: () => void;
}

function ShortcutsPopover({ open, onClose }: ShortcutsPopoverProps) {
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

interface EventChipProps {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
}

function EventChip({ event, onClick }: EventChipProps) {
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

interface MonthCellProps {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

function MonthCell({
  date,
  inMonth,
  isToday,
  events,
  onEventClick,
}: MonthCellProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(0, 3);
  const hidden = events.length - visible.length;

  return (
    <div
      className={`min-h-[96px] bg-white dark:bg-slate-900 p-1.5 flex flex-col gap-1 ${
        inMonth ? "" : "opacity-50"
      } ${isToday ? "ring-2 ring-indigo-500 ring-inset" : ""}`}
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

interface MonthViewProps {
  anchor: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

function MonthView({ anchor, events, onEventClick }: MonthViewProps) {
  const cells = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const today = useMemo(() => new Date(), []);
  // Bucket events by yyyy-mm-dd key.
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
            />
          );
        })}
      </div>
      </div>
    </div>
  );
}

interface ListViewProps {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

function ListView({ events, onEventClick }: ListViewProps) {
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

/** True when the active element is a typing surface (so we don't hijack ←/T/etc.
 * while the user is filling out a form somewhere on the page). */
function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function CalendarPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>(() => readCalendarView());
  useEffect(() => {
    writeCalendarView(view);
  }, [view]);
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState<boolean>(false);

  // "Today" is meaningful only when we're not already viewing today's month.
  // List view always shows the next 30 days, so the concept doesn't apply
  // there — disable in list view as a hint that the action is a no-op.
  const todayDisabled = useMemo(() => {
    if (view !== "month") return true;
    const today = startOfMonth(new Date());
    return (
      anchor.getFullYear() === today.getFullYear() &&
      anchor.getMonth() === today.getMonth()
    );
  }, [view, anchor]);

  // Keyboard shortcuts. Active only while the calendar surface is mounted
  // (window listener attached/detached with this component), gated on the
  // active element NOT being a typing surface and no modifier keys being
  // held (so ⌘←, Ctrl+T, etc. continue to behave as native browser
  // shortcuts). View-mode is preserved across month nav by design — we
  // only mutate `anchor` in ←/→/T handlers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1));
          break;
        case "t":
        case "T":
          e.preventDefault();
          setAnchor(startOfMonth(new Date()));
          break;
        case "m":
        case "M":
          e.preventDefault();
          setView("month");
          break;
        case "l":
        case "L":
          e.preventDefault();
          setView("list");
          break;
        case "?":
          e.preventDefault();
          setShortcutsOpen((v) => !v);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Compute the [start, end] fetch window. Month view fetches its month; list
  // view fetches the next 30 days. The query is just bounded — both views
  // render whatever's in `events`.
  const range = useMemo(() => {
    if (view === "month") {
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    }
    const today = startOfDay(new Date());
    return { start: today, end: addDays(today, 30) };
  }, [view, anchor]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async (): Promise<void> => {
      try {
        const startIso = range.start.toISOString();
        const endIso = range.end.toISOString();

        const [asnRes, portRes] = await Promise.all([
          supabase
            .from("assignments")
            .select("id, short_code, title, due_at, course_id, courses(name, short_code)")
            .not("due_at", "is", null)
            .gte("due_at", startIso)
            .lte("due_at", endIso)
            .order("due_at", { ascending: true }),
          supabase
            .from("portfolio_items")
            .select(
              "id, title, due_at, portfolio_templates!inner(course_id, courses(name))",
            )
            .not("due_at", "is", null)
            .gte("due_at", startIso)
            .lte("due_at", endIso)
            .order("due_at", { ascending: true }),
        ]);

        if (asnRes.error) throw asnRes.error;
        if (portRes.error) throw portRes.error;

        const asnRows = (asnRes.data ?? []) as AssignmentRow[];
        const portRows = (portRes.data ?? []) as PortfolioRow[];

        const fromAsn: CalendarEvent[] = asnRows
          .filter((r): r is AssignmentRow & { due_at: string } =>
            typeof r.due_at === "string",
          )
          .map((r) => {
            const course = pickOne(r.courses);
            return {
              kind: "assignment" as const,
              // Prefer the short URL slug for navigation; fall back to UUID.
              id: r.short_code ?? r.id,
              title: r.title ?? "Untitled assignment",
              due_at: new Date(r.due_at),
              courseName: course?.name ?? "—",
              courseId: course?.short_code ?? r.course_id,
            };
          });

        const fromPort: CalendarEvent[] = portRows
          .filter((r): r is PortfolioRow & { due_at: string } =>
            typeof r.due_at === "string",
          )
          .map((r) => {
            const tpl = pickOne(r.portfolio_templates);
            const course = pickOne(tpl?.courses ?? null);
            return {
              kind: "portfolio" as const,
              id: r.id,
              title: r.title ?? "Untitled portfolio item",
              due_at: new Date(r.due_at),
              courseName: course?.name ?? "—",
              courseId: course?.short_code ?? tpl?.course_id ?? "",
            };
          })
          .filter((ev) => ev.courseId !== "");

        const merged = [...fromAsn, ...fromPort].sort(
          (a, b) => a.due_at.getTime() - b.due_at.getTime(),
        );

        if (!cancelled) setEvents(merged);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load calendar.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [range.start, range.end]);

  const handleEventClick = (event: CalendarEvent) => {
    if (event.kind === "assignment") {
      navigate(courseAssignmentPath(event.courseId, event.id));
    } else {
      navigate(coursePortfolioPath(event.courseId));
    }
  };

  return (
    <div className="px-4 md:px-8 py-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Calendar
        </h1>
        <div className="ml-auto relative">
          <button
            type="button"
            onClick={() => setShortcutsOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={shortcutsOpen}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            className="rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 text-sm min-h-[40px] px-3 py-1 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
          >
            <span className="font-mono text-xs">?</span>
            <span className="hidden sm:inline">Shortcuts</span>
          </button>
          <ShortcutsPopover
            open={shortcutsOpen}
            onClose={() => setShortcutsOpen(false)}
          />
        </div>
        <div
          className="inline-flex rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden text-sm"
          role="tablist"
          aria-label="Calendar view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "month"}
            onClick={() => setView("month")}
            className={`px-3 py-1.5 font-medium transition-colors ${
              view === "month"
                ? "bg-indigo-600 text-white"
                : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            Month
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "list"}
            onClick={() => setView("list")}
            className={`px-3 py-1.5 font-medium transition-colors ${
              view === "list"
                ? "bg-indigo-600 text-white"
                : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            List
          </button>
        </div>
      </div>

      {view === "month" && (
        <MonthHeader
          anchor={anchor}
          onPrev={() =>
            setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1))
          }
          onNext={() =>
            setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1))
          }
          onToday={() => setAnchor(startOfMonth(new Date()))}
          todayDisabled={todayDisabled}
        />
      )}

      {loading && (
        view === "month" ? (
          <div className="rounded-xl overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800 p-2 space-y-2 bg-white dark:bg-slate-900">
            <Skeleton className="h-6 w-full rounded" />
            <SkeletonRows count={5} rowClassName="h-20" />
          </div>
        ) : (
          <SkeletonRows count={6} rowClassName="h-10" />
        )
      )}
      {error && (
        <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 text-rose-700 dark:text-rose-200 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {!loading && !error && view === "month" && (
        <MonthView
          anchor={anchor}
          events={events}
          onEventClick={handleEventClick}
        />
      )}
      {!loading && !error && view === "list" && (
        <ListView events={events} onEventClick={handleEventClick} />
      )}
    </div>
  );
}
