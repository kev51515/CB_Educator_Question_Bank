/**
 * CourseAnnouncementsList
 * =======================
 * Compact list of the 10 most recent announcements across every course the
 * signed-in student is enrolled in. Used by AreaSelector as the "Recent
 * announcements" widget above "My courses".
 *
 * Pinned-first, then newest. Each row shows course name, title, a short
 * snippet, and a relative date.
 */
import { useStudentAnnouncements } from "./useStudentAnnouncements";
import { SkeletonRows } from "../components/Skeleton";

function formatRelative(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = then.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);

  if (abs < 60_000) return "just now";
  try {
    const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (abs < 3_600_000) return fmt.format(minutes, "minute");
    if (abs < 86_400_000) return fmt.format(hours, "hour");
    if (abs < 30 * 86_400_000) return fmt.format(days, "day");
    return then.toLocaleDateString();
  } catch {
    return then.toLocaleString();
  }
}

export function CourseAnnouncementsList() {
  const { announcements, loading, error } = useStudentAnnouncements();

  return (
    <section aria-labelledby="recent-announcements-title" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2
          id="recent-announcements-title"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
        >
          Recent announcements
        </h2>
        {announcements.length > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {announcements.length} latest
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-2">
          <SkeletonRows count={4} />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      ) : announcements.length === 0 ? (
        <div className="rounded-2xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-dashed ring-slate-300 dark:ring-slate-700 px-6 py-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No announcements from your courses yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {announcements.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {a.title}
                    </h3>
                    {a.pinned && (
                      <span className="rounded-full bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900">
                        Pinned
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {a.course_name && (
                      <>
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          {a.course_name}
                        </span>
                        <span aria-hidden> · </span>
                      </>
                    )}
                    <time dateTime={a.created_at}>
                      {formatRelative(a.created_at)}
                    </time>
                  </p>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 line-clamp-3 whitespace-pre-wrap">
                    {a.body}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
