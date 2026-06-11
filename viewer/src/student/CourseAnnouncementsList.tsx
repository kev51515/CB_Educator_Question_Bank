/**
 * CourseAnnouncementsList
 * =======================
 * Compact list of the 10 most recent announcements across every course the
 * signed-in student is enrolled in. Used by AreaSelector as the "Recent
 * announcements" widget above "My courses".
 *
 * Pinned-first, then newest. Each row shows course name, title, a short
 * snippet, and a relative date.
 *
 * Unread indicator (Round 36-style, client-side, no DB):
 *   - Key: `student.announcements.lastVisit:${userId}` (ISO string).
 *   - Snapshot the stored timestamp once on mount (so the indicator stays
 *     stable while the user is looking at the list).
 *   - When announcements have loaded, write the current ISO back to storage
 *     — next visit then sees only newer announcements as unread.
 *   - Missing storage → all announcements are unread (new device).
 *   - Corrupt/quota errors → fail silently, no indicators.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudentAnnouncements } from "./useStudentAnnouncements";
import { useStudentSession } from "@/auth/session";
import { SkeletonRows } from "@/components/Skeleton";

const LAST_VISIT_PREFIX = "student.announcements.lastVisit:";

function lastVisitKey(userId: string): string {
  return `${LAST_VISIT_PREFIX}${userId}`;
}

function readLastVisit(userId: string): string | null {
  try {
    const raw = localStorage.getItem(lastVisitKey(userId));
    if (!raw) return null;
    // Validate it parses as a real date — guard against corruption.
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? raw : null;
  } catch {
    return null;
  }
}

function writeLastVisit(userId: string, iso: string): void {
  try {
    localStorage.setItem(lastVisitKey(userId), iso);
  } catch {
    // Quota / disabled storage — fail silently.
  }
}

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
  const { session } = useStudentSession();
  const userId = session?.userId ?? null;

  // Snapshot the previous lastVisit once per user — locked for this mount so
  // the indicator does not flicker mid-session as we update storage.
  const [lastVisitSnapshot, setLastVisitSnapshot] = useState<string | null>(
    () => (userId ? readLastVisit(userId) : null),
  );
  const snapshotUserRef = useRef<string | null>(null);

  // Refresh snapshot when the signed-in user changes (e.g., re-login).
  useEffect(() => {
    if (!userId) return;
    if (snapshotUserRef.current === userId) return;
    snapshotUserRef.current = userId;
    setLastVisitSnapshot(readLastVisit(userId));
  }, [userId]);

  // After the announcements have loaded, mark this visit — next mount will
  // then see only newer rows as unread.
  const wroteForUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    if (loading || error) return;
    if (wroteForUserRef.current === userId) return;
    wroteForUserRef.current = userId;
    writeLastVisit(userId, new Date().toISOString());
  }, [userId, loading, error, announcements.length]);

  const unreadIds = useMemo(() => {
    if (!userId) return new Set<string>();
    const cutoff = lastVisitSnapshot
      ? new Date(lastVisitSnapshot).getTime()
      : null;
    const ids = new Set<string>();
    for (const a of announcements) {
      const created = new Date(a.created_at).getTime();
      if (!Number.isFinite(created)) continue;
      if (cutoff === null || created > cutoff) {
        ids.add(a.id);
      }
    }
    return ids;
  }, [announcements, lastVisitSnapshot, userId]);

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
            {unreadIds.size > 0 ? (
              <>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                  {unreadIds.size} new
                </span>
                <span aria-hidden> · </span>
                {announcements.length} latest
              </>
            ) : (
              <>{announcements.length} latest</>
            )}
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
        <div className="rounded-2xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-dashed ring-slate-300 dark:ring-slate-700 px-6 py-10 text-center">
          <div
            aria-hidden
            className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M3 11l18-8-8 18-2-8-8-2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            No announcements from your courses yet.
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Check back later — your teacher will post updates here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {announcements.map((a) => {
            const isUnread = unreadIds.has(a.id);
            return (
              <li
                key={a.id}
                className={[
                  "rounded-2xl bg-white/85 dark:bg-slate-900/70 ring-1 ring-slate-200 dark:ring-slate-800 p-4 shadow-sm",
                  "motion-safe:transition-colors",
                  isUnread
                    ? "bg-accent-600/[0.05] dark:bg-accent-400/[0.10]"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isUnread && (
                        <svg
                          aria-hidden="true"
                          focusable="false"
                          viewBox="0 0 8 8"
                          className="h-2 w-2 flex-none text-indigo-500 dark:text-indigo-400"
                        >
                          <title>Unread</title>
                          <circle cx="4" cy="4" r="4" fill="currentColor" />
                        </svg>
                      )}
                      {isUnread && (
                        <span className="sr-only">Unread announcement.</span>
                      )}
                      <h3
                        className={[
                          "text-sm truncate",
                          isUnread
                            ? "font-bold text-slate-900 dark:text-slate-50"
                            : "font-semibold text-slate-900 dark:text-slate-100",
                        ].join(" ")}
                      >
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
            );
          })}
        </ul>
      )}
    </section>
  );
}
