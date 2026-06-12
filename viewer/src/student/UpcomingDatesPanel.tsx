/**
 * UpcomingDatesPanel
 * ==================
 * Home-page strip of the student's next dated deadlines (assignments with a
 * due_at in the next 14 days), linking through to the full calendar at
 * /student/calendar. Reuses useStudentAssignments (its own instance — one
 * extra small RLS-scoped query alongside AssignmentsPanel's) rather than a
 * bespoke fetch, so due/submitted semantics can't drift between the panels.
 *
 * Rows show a relative day ("Today" / "Tomorrow" / "In 3 days"), the title,
 * and the course. Items due within 48h and not yet submitted get the amber
 * urgency tint; already-submitted items show a check so the list doubles as
 * reassurance, not just nagging.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/lib/routes";
import { useStudentAssignments, type StudentAssignment } from "./useStudentAssignments";
import { SkeletonRows } from "@/components/Skeleton";

const WINDOW_DAYS = 14;
const MAX_ROWS = 6;
const DUE_SOON_MS = 48 * 60 * 60 * 1000;

interface UpcomingItem {
  assignment: StudentAssignment;
  dueMs: number;
  submitted: boolean;
}

/** "Today" / "Tomorrow" / "In N days" / "Sat, Jun 14" for further-out dates. */
function relativeDay(dueMs: number, nowMs: number): string {
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const dayDiff = Math.round(
    (startOfDay(dueMs) - startOfDay(nowMs)) / (24 * 60 * 60 * 1000),
  );
  if (dayDiff <= 0) return "Today";
  if (dayDiff === 1) return "Tomorrow";
  if (dayDiff < 7) return `In ${dayDiff} days`;
  return new Date(dueMs).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function timeOfDay(dueMs: number): string {
  return new Date(dueMs).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function UpcomingDatesPanel() {
  const { assignments, loading, error } = useStudentAssignments();

  const items = useMemo<UpcomingItem[]>(() => {
    const nowMs = Date.now();
    const horizonMs = nowMs + WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return assignments
      .flatMap((assignment) => {
        if (!assignment.due_at) return [];
        const dueMs = Date.parse(assignment.due_at);
        if (!Number.isFinite(dueMs)) return [];
        if (dueMs < nowMs || dueMs > horizonMs) return [];
        return [
          {
            assignment,
            dueMs,
            submitted: assignment.my_attempt?.submitted_at != null,
          },
        ];
      })
      .sort((a, b) => a.dueMs - b.dueMs)
      .slice(0, MAX_ROWS);
  }, [assignments]);

  // Quiet panel: errors here are already surfaced by AssignmentsPanel (same
  // hook, same page) — duplicating the alert would double the noise.
  if (error) return null;

  const nowMs = Date.now();

  return (
    <section
      aria-labelledby="upcoming-dates-title"
      className="rounded-2xl bg-white/60 dark:bg-slate-900/40 ring-1 ring-slate-200 dark:ring-slate-800 shadow-card p-5"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2
          id="upcoming-dates-title"
          className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400"
        >
          Upcoming dates
        </h2>
        <Link
          to={ROUTES.STUDENT_CALENDAR}
          className="text-xs font-medium text-accent-700 dark:text-accent-300 hover:underline"
        >
          Open calendar
        </Link>
      </header>

      {loading ? (
        <SkeletonRows count={3} />
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nothing due in the next two weeks.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map(({ assignment, dueMs, submitted }) => {
            const dueSoon = !submitted && dueMs - nowMs <= DUE_SOON_MS;
            return (
              <li
                key={assignment.id}
                className="flex items-center gap-3 rounded-lg bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 px-3 py-2.5"
              >
                <span
                  className={[
                    "shrink-0 w-20 text-xs font-semibold tabular-nums",
                    dueSoon
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-slate-600 dark:text-slate-300",
                  ].join(" ")}
                >
                  {relativeDay(dueMs, nowMs)}
                  <span className="block text-[10px] font-normal text-slate-400 dark:text-slate-500">
                    {timeOfDay(dueMs)}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {assignment.title}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                    {assignment.class_name}
                  </span>
                </span>
                {submitted ? (
                  <span
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                    title="Submitted"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    Done
                  </span>
                ) : dueSoon ? (
                  <span className="shrink-0 rounded-full bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900">
                    Due soon
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
