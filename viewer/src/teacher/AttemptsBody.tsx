import { Link } from "react-router-dom";
import { SkeletonRows } from "../components/Skeleton";
import { courseAssignmentAttemptPath } from "../lib/routes";
import type { StudentAttemptRow } from "./useStudentProfile";
import {
  attemptStatusLabel,
  formatRelative,
  formatScore,
} from "./studentProfileHelpers";

export function AttemptsBody({
  rows,
  loading,
  error,
  courseRef,
}: {
  rows: StudentAttemptRow[];
  loading: boolean;
  error: string | null;
  courseRef: string;
}): JSX.Element {
  if (loading) return <SkeletonRows count={3} rowClassName="h-10" />;
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
      >
        {error}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No attempts yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((row) => {
        const status = attemptStatusLabel(row);
        const score = formatScore(row.effective_score ?? row.score_percent);
        const isSubmitted = row.submitted_at !== null;
        const linkLabel = status.label === "Graded" ? "Review" : "Open";
        return (
          <li
            key={`${row.assignment_id}|${row.attempt_id}`}
            className="flex items-center gap-3 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {row.assignment_title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isSubmitted ? (
                  <>
                    Submitted{" "}
                    <time dateTime={row.submitted_at ?? undefined}>
                      {formatRelative(row.submitted_at)}
                    </time>
                  </>
                ) : (
                  <>
                    Started{" "}
                    <time dateTime={row.started_at ?? undefined}>
                      {formatRelative(row.started_at)}
                    </time>
                  </>
                )}
              </p>
            </div>
            <span
              className={`hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${status.toneClass}`}
            >
              {status.label}
            </span>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 w-12 text-right">
              {score}
            </span>
            <Link
              to={courseAssignmentAttemptPath(
                courseRef,
                row.assignment_id,
                row.attempt_id,
              )}
              className="inline-flex items-center justify-center rounded-md min-h-[40px] px-3 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {linkLabel}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
