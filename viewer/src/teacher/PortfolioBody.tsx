import { Link } from "react-router-dom";
import { SkeletonRows } from "../components/Skeleton";
import { coursePortfolioPath } from "../lib/routes";
import type { StudentPortfolioSubmissionRow } from "./useStudentProfile";
import { formatRelative } from "./studentProfileHelpers";

export function PortfolioBody({
  rows,
  loading,
  error,
  courseRef,
}: {
  rows: StudentPortfolioSubmissionRow[];
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
        No portfolio submissions yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((row) => (
        <li
          key={row.submission_id}
          className="flex items-center gap-3 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {row.item_title}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {row.submitted_at ? (
                <>
                  Submitted{" "}
                  <time dateTime={row.submitted_at}>
                    {formatRelative(row.submitted_at)}
                  </time>
                </>
              ) : (
                "Not submitted yet"
              )}
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 capitalize">
            {row.status.replace(/_/g, " ")}
          </span>
          {row.has_feedback && (
            <span
              title="Has teacher feedback"
              className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium"
            >
              Feedback
            </span>
          )}
          <Link
            to={`${coursePortfolioPath(courseRef)}?submission=${encodeURIComponent(row.submission_id)}`}
            className="inline-flex items-center justify-center rounded-md min-h-[40px] px-3 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Open
          </Link>
        </li>
      ))}
    </ul>
  );
}
