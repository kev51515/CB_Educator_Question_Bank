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
import { supabase } from "@/lib/supabase";
import {
  courseAssignmentPath,
  coursePortfolioPath,
  assignmentTakePath,
  studentCoursePath,
} from "@/lib/routes";
import { useProfile } from "@/lib/profile";
import { Skeleton, SkeletonRows } from "@/components/Skeleton";
import {
  ListView,
  MonthHeader,
  MonthView,
  ShortcutsPopover,
} from "./components";
import {
  addDays,
  endOfMonth,
  isTypingTarget,
  pickOne,
  readCalendarView,
  startOfDay,
  startOfMonth,
  writeCalendarView,
  type AssignmentRow,
  type CalendarEvent,
  type PortfolioRow,
  type ViewMode,
} from "./helpers";

export function CalendarPage() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  // CalendarPage renders under both /educator/calendar and /student/calendar.
  // The due-date data is RLS-scoped per role; only the click-through target
  // differs (students don't have the educator course-management routes).
  const isStudent = profile?.role === "student";
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
      navigate(
        isStudent
          ? assignmentTakePath(event.id)
          : courseAssignmentPath(event.courseId, event.id),
      );
    } else {
      // No student portfolio route; land them on the course (the `:short` route
      // accepts a course UUID too).
      navigate(
        isStudent
          ? studentCoursePath(event.courseId)
          : coursePortfolioPath(event.courseId),
      );
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="page-title text-2xl font-semibold text-slate-900 dark:text-slate-100">
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
      <div className="ivy-rule" aria-hidden="true" />

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
