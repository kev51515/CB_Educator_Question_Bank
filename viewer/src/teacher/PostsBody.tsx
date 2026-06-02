import { Link } from "react-router-dom";
import { SkeletonRows } from "../components/Skeleton";
import { courseDiscussionPath } from "../lib/routes";
import type { StudentDiscussionPostRow } from "./useStudentProfile";
import { formatRelative, previewBody } from "./studentProfileHelpers";

export function PostsBody({
  rows,
  loading,
  error,
  courseRef,
}: {
  rows: StudentDiscussionPostRow[];
  loading: boolean;
  error: string | null;
  courseRef: string;
}): JSX.Element {
  if (loading) return <SkeletonRows count={3} rowClassName="h-12" />;
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
        No posts yet in this course.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((row) => (
        <li key={row.post_id} className="py-3">
          <Link
            to={courseDiscussionPath(
              courseRef,
              row.topic_short_code ?? row.topic_id,
            )}
            className="block rounded-md p-2 -m-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {row.topic_title}
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
              {previewBody(row.body)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              <time dateTime={row.created_at}>
                {formatRelative(row.created_at)}
              </time>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
