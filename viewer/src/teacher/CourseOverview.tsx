/**
 * CourseOverview
 * ==============
 * The "/overview" tab inside ClassLayout — the teacher's landing surface
 * for a single course. Replaces the previous join-code-only ClassOverview
 * with a Canvas-style dashboard: roster snapshot, assignment health,
 * weekly activity, average grade, and a row of quick-action shortcuts.
 *
 * Loads all sections through `useCourseOverview` (one shot, five parallel
 * Supabase queries). On error we still render the page chrome + an inline
 * alert so the teacher has somewhere to retry from instead of a blank screen.
 *
 * The page intentionally does NOT own the persistent header — ClassLayout
 * already paints course name + short_code badge + kebab actions above us.
 * We re-show the short_code as a small pill at the top of the page body so
 * deeplinked screenshots still have context, and we own a single "Refresh"
 * button (debounced via a busy flag).
 */
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useClassContext } from "./classLayoutContext";
import { ClassSkillsSummaryCard } from "./ClassSkillsSummaryCard";
import { useProfile } from "@/lib/profile";
import { canAccessQuestionBank } from "@/lib/access";
import { useCourseOverview, type RecentPost } from "./useCourseOverview";
import { Skeleton, SkeletonCard } from "@/components/Skeleton";
import {
  courseAnnouncementsPath,
  courseAssignmentsPath,
  courseDiscussionPath,
  courseDiscussionsPath,
  courseGradesPath,
  coursePeoplePath,
} from "@/lib/routes";

const REFRESH_DEBOUNCE_MS = 600;

function formatRelative(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;
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

/** Color band for the big average-grade number. Mirrors the gradebook palette
 *  so a teacher's mental model of "this number is amber" stays consistent. */
function scoreBandClass(avg: number | null): string {
  if (avg === null) return "text-slate-400 dark:text-slate-500";
  if (avg >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (avg >= 70) return "text-indigo-600 dark:text-indigo-400";
  if (avg >= 55) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

interface CardProps {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Shared card chrome. Uses the same ring + radius vocabulary as the rest of
 * the teacher console so the Overview blends with the surrounding tabs.
 */
function Card({ title, children, footer }: CardProps) {
  return (
    <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-sm">
      <h2 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
      {footer ? (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/70">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

interface StatProps {
  label: string;
  value: string | number;
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
        {value}
      </span>
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

interface PillProps {
  tone: "amber" | "rose" | "indigo" | "emerald" | "slate";
  children: React.ReactNode;
}

const PILL_TONE: Record<PillProps["tone"], string> = {
  amber:
    "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-900",
  rose:
    "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-900",
  indigo:
    "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-900",
  emerald:
    "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900",
  slate:
    "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700",
};

function Pill({ tone, children }: PillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

interface QuickActionProps {
  label: string;
  to: string;
  tone?: "primary" | "secondary";
}

function QuickAction({ label, to, tone = "secondary" }: QuickActionProps) {
  const base =
    "inline-flex items-center justify-center min-h-[40px] rounded-lg px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
  const styles =
    tone === "primary"
      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
      : "bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-300";
  return (
    <Link to={to} className={`${base} ${styles}`}>
      {label}
    </Link>
  );
}

function RecentPostRow({
  post,
  courseShortCode,
}: {
  post: RecentPost;
  courseShortCode: string;
}) {
  return (
    <li className="border-b border-slate-100 dark:border-slate-800/70 last:border-0">
      <Link
        to={courseDiscussionPath(courseShortCode, post.topicId)}
        className="flex items-start gap-2 py-1.5 -mx-1 px-1 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-800 dark:text-slate-200 truncate">
            <span className="font-medium">{post.authorName}</span>{" "}
            <span className="text-slate-500 dark:text-slate-400">
              in {post.topicTitle}
            </span>
          </p>
          <time
            dateTime={post.createdAt}
            className="text-[11px] text-slate-500 dark:text-slate-400"
          >
            {formatRelative(post.createdAt)}
          </time>
        </div>
      </Link>
    </li>
  );
}

export function CourseOverview() {
  const { cls } = useClassContext();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const canQbank = canAccessQuestionBank(profile?.email);
  const { data, loading, error, refresh } = useCourseOverview(cls.id);

  // Refresh debounce: don't let a frantic clicker fan-out 10 concurrent
  // refetches. We track an in-flight flag and a "cool-off" timeout that
  // re-enables the button after REFRESH_DEBOUNCE_MS even if the network
  // request resolved earlier.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      window.setTimeout(() => setRefreshing(false), REFRESH_DEBOUNCE_MS);
    }
  }, [refresh, refreshing]);

  const peoplePath = useMemo(
    () => coursePeoplePath(cls.short_code),
    [cls.short_code],
  );
  const assignmentsPath = useMemo(
    () => courseAssignmentsPath(cls.short_code),
    [cls.short_code],
  );
  const announcementsPath = useMemo(
    () => courseAnnouncementsPath(cls.short_code),
    [cls.short_code],
  );
  const discussionsPath = useMemo(
    () => courseDiscussionsPath(cls.short_code),
    [cls.short_code],
  );
  const gradesPath = useMemo(
    () => courseGradesPath(cls.short_code),
    [cls.short_code],
  );

  return (
    <div className="space-y-6">
      {/* Page header — course name + short_code badge sits above us in the
          ClassLayout chrome, so this strip is just a context recap + Refresh. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
            {cls.name}
          </h1>
          <span className="rounded-md bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
            {cls.short_code}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            void onRefresh();
          }}
          disabled={refreshing}
          className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Class skills focus areas — self-hides until the class has test data. */}
      {canQbank && <ClassSkillsSummaryCard />}

      {/* Body grid. 1-col mobile / 2-col tablet / 3-col desktop matches the
          Modules page bar; cards reflow naturally on resize. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !data ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : data ? (
          <>
            {/* ── Card 1: Roster ───────────────────────────────────── */}
            <Card
              title="Roster"
              footer={
                <Link
                  to={peoplePath}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  View roster →
                </Link>
              }
            >
              <div className="flex items-baseline gap-3">
                <Stat
                  label={
                    data.studentCount === 1 ? "student enrolled" : "students enrolled"
                  }
                  value={data.studentCount}
                />
              </div>
              {data.newEnrollmentsLast7Days > 0 && (
                <Pill tone="emerald">
                  +{data.newEnrollmentsLast7Days} this week
                </Pill>
              )}
            </Card>

            {/* ── Card 2: Assignments ──────────────────────────────── */}
            <Card
              title="Assignments"
              footer={
                <Link
                  to={assignmentsPath}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  View assignments →
                </Link>
              }
            >
              <Stat
                label={
                  data.activeAssignmentCount === 1
                    ? "active assignment"
                    : "active assignments"
                }
                value={data.activeAssignmentCount}
              />
              <div className="flex flex-wrap gap-1.5">
                {data.upcomingDueCount > 0 && (
                  <Pill tone="amber">
                    {data.upcomingDueCount} due in 7 days
                  </Pill>
                )}
                {data.overdueWithMissingSubmissions > 0 && (
                  <Pill tone="rose">
                    {data.overdueWithMissingSubmissions} overdue · missing subs
                  </Pill>
                )}
                {data.upcomingDueCount === 0 &&
                  data.overdueWithMissingSubmissions === 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      No urgent dues
                    </span>
                  )}
              </div>
            </Card>

            {/* ── Card 3: Recent activity ──────────────────────────── */}
            <Card
              title="Recent activity (7d)"
              footer={
                <Link
                  to={discussionsPath}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  View discussions →
                </Link>
              }
            >
              <div className="grid grid-cols-3 gap-2">
                <Stat label="attempts" value={data.attemptsLast7} />
                <Stat label="submissions" value={data.submissionsLast7} />
                <Stat label="new replies" value={data.newReplies} />
              </div>
              {data.recentPosts.length > 0 ? (
                <ul className="mt-2">
                  {data.recentPosts.map((p) => (
                    <RecentPostRow
                      key={p.id}
                      post={p}
                      courseShortCode={cls.short_code}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  No discussion posts this week.
                </p>
              )}
            </Card>

            {/* ── Card 4: Average grade ────────────────────────────── */}
            <Card
              title="Average grade (30d)"
              footer={
                <Link
                  to={gradesPath}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Open gradebook →
                </Link>
              }
            >
              <div className="flex items-baseline gap-3">
                <span
                  className={`text-4xl font-bold tabular-nums ${scoreBandClass(
                    data.avgEffectiveScore30Days,
                  )}`}
                >
                  {data.avgEffectiveScore30Days === null
                    ? "—"
                    : `${data.avgEffectiveScore30Days.toFixed(0)}%`}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  avg score
                </span>
              </div>
              {data.ungradedCount > 0 && (
                <button
                  type="button"
                  onClick={() => navigate(gradesPath)}
                  className="inline-flex items-center"
                >
                  <Pill tone="amber">
                    {data.ungradedCount} ungraded · review
                  </Pill>
                </button>
              )}
            </Card>

            {/* ── Card 5: Quick actions ────────────────────────────── */}
            <Card title="Quick actions">
              <div className="flex flex-wrap gap-2">
                <QuickAction
                  label="+ Assignment"
                  to={assignmentsPath}
                  tone="primary"
                />
                <QuickAction label="+ Announcement" to={announcementsPath} />
                <QuickAction label="+ Discussion topic" to={discussionsPath} />
                <QuickAction label="View gradebook" to={gradesPath} />
                <QuickAction label="View roster" to={peoplePath} />
              </div>
            </Card>
          </>
        ) : (
          // Error-with-no-data branch — the alert above already explains.
          // We still want the page to feel intentionally empty, not broken.
          <div className="sm:col-span-2 lg:col-span-3 rounded-2xl ring-1 ring-dashed ring-slate-300 dark:ring-slate-700 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Nothing to show right now. Try Refresh.
          </div>
        )}
      </div>

      {loading && data && (
        // Subtle "refreshing" hint when we already have data — the cards
        // keep showing the previous values rather than blinking to skeletons.
        <div className="flex items-center justify-center">
          <Skeleton className="h-1 w-24 rounded-full" />
        </div>
      )}
    </div>
  );
}
