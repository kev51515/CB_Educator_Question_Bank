/**
 * NeedsAttentionPanel
 * ===================
 * Cross-course triage rail mounted at the top of the staff Dashboard.
 *
 * Three sections — To grade, Past due, New replies — each independently
 * loadable, independently collapsible, with persistence to localStorage so
 * Maya's per-section preferences survive reloads.
 *
 * If every section is empty AND not loading we render nothing (zero
 * height) so the dashboard isn't bloated with a "All caught up" wasted
 * card every morning. Per the spec.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useNeedsAttention,
  type NewReplyItem,
  type PastDueItem,
  type ToGradeItem,
} from "./useNeedsAttention";
import {
  courseAssignmentAttemptPath,
  courseAssignmentPath,
  courseDiscussionPath,
} from "../lib/routes";
import { Skeleton } from "../components/Skeleton";

// ─── localStorage persistence ─────────────────────────────────────────────

const STORAGE_KEY = "dashboard.attention.collapse";
const COURSE_FILTER_KEY = "dashboard.attention.courseFilter";

interface CollapseState {
  toGrade: boolean;
  pastDue: boolean;
  replies: boolean;
}

const DEFAULT_COLLAPSE: CollapseState = {
  toGrade: false,
  pastDue: false,
  replies: false,
};

function loadCollapse(): CollapseState {
  if (typeof window === "undefined") return DEFAULT_COLLAPSE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COLLAPSE;
    const parsed = JSON.parse(raw) as Partial<CollapseState>;
    return {
      toGrade: typeof parsed.toGrade === "boolean" ? parsed.toGrade : false,
      pastDue: typeof parsed.pastDue === "boolean" ? parsed.pastDue : false,
      replies: typeof parsed.replies === "boolean" ? parsed.replies : false,
    };
  } catch {
    return DEFAULT_COLLAPSE;
  }
}

function saveCollapse(state: CollapseState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (Safari private mode etc.) — silent.
  }
}

function loadCourseFilter(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COURSE_FILTER_KEY);
    if (!raw) return null;
    return raw;
  } catch {
    return null;
  }
}

function saveCourseFilter(courseShortCode: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (courseShortCode === null) {
      window.localStorage.removeItem(COURSE_FILTER_KEY);
    } else {
      window.localStorage.setItem(COURSE_FILTER_KEY, courseShortCode);
    }
  } catch {
    // silent
  }
}

// ─── Time-ago formatter ───────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 60) return seconds <= 5 ? "just now" : `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

function timeUntil(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = then - Date.now();
  const overdue = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  if (minutes < 60)
    return overdue ? `${minutes}m overdue` : `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48)
    return overdue ? `${hours}h overdue` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  return overdue ? `${days}d overdue` : `in ${days}d`;
}

// ─── Initial avatar ───────────────────────────────────────────────────────

function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const ch = trimmed[0];
  return (ch ?? "?").toUpperCase();
}

// ─── Tiny SVG icons ───────────────────────────────────────────────────────

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`transition-transform ${collapsed ? "-rotate-90" : "rotate-0"}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function RowChevron() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-slate-400 dark:text-slate-500"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={spinning ? "animate-spin" : ""}
    >
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <polyline points="16 8 21 8 21 3" />
      <polyline points="8 16 3 16 3 21" />
    </svg>
  );
}

// ─── Row primitives ───────────────────────────────────────────────────────

interface RowProps {
  initial: string;
  message: React.ReactNode;
  meta: string;
  onClick: () => void;
  ariaLabel: string;
  /** True when this row was just added via realtime — show a brief flash. */
  fresh?: boolean;
}

function AttentionRow({ initial, message, meta, onClick, ariaLabel, fresh }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={
        "w-full flex items-center gap-3 px-3 py-2.5 min-h-[40px] rounded-lg " +
        "bg-white/70 dark:bg-slate-900/40 " +
        "ring-1 ring-slate-200/60 dark:ring-slate-800 " +
        "hover:bg-white hover:ring-indigo-200 " +
        "dark:hover:bg-slate-900 dark:hover:ring-indigo-800 " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 " +
        "transition-colors text-left " +
        (fresh
          ? "ring-2 ring-indigo-400 motion-safe:animate-pulse bg-indigo-50/50 dark:bg-indigo-950/30"
          : "")
      }
    >
      <span
        aria-hidden
        className="
          shrink-0 inline-flex items-center justify-center
          w-8 h-8 rounded-full text-xs font-semibold
          bg-indigo-100 text-indigo-700
          dark:bg-indigo-900/60 dark:text-indigo-200
        "
      >
        {initial}
      </span>
      <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 truncate">
        {message}
      </span>
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {meta}
      </span>
      <RowChevron />
    </button>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-11 rounded-lg" />
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────

interface SectionProps {
  icon: string;
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
}

function Section({
  icon,
  label,
  count,
  collapsed,
  onToggle,
  loading,
  error,
  onRetry,
  children,
}: SectionProps) {
  const sectionId = `attention-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={sectionId}
        className="
          w-full flex items-center gap-2 min-h-[40px] px-1 py-1
          rounded-md
          text-left
          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
        "
      >
        <ChevronIcon collapsed={collapsed} />
        <span aria-hidden className="text-base leading-none">
          {icon}
        </span>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {label}
        </span>
        <span
          className="
            inline-flex items-center justify-center min-w-[1.5rem] px-1.5
            h-5 rounded-full text-xs font-medium
            bg-indigo-100 text-indigo-700
            dark:bg-indigo-900/60 dark:text-indigo-200
          "
        >
          {count}
        </span>
      </button>
      {!collapsed && (
        <div id={sectionId} className="pl-1">
          {loading ? (
            <SectionSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="
                flex items-center justify-between gap-2
                rounded-lg px-3 py-2 text-xs
                bg-rose-50 dark:bg-rose-950/40
                text-rose-700 dark:text-rose-300
                ring-1 ring-rose-200 dark:ring-rose-900
              "
            >
              <span className="truncate">Couldn't load: {error}</span>
              <button
                type="button"
                onClick={onRetry}
                className="
                  shrink-0 underline underline-offset-2
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded
                "
              >
                Retry
              </button>
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}

// ─── Empty state row ──────────────────────────────────────────────────────

function EmptySectionLine({ text }: { text: string }) {
  return (
    <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 italic">
      {text}
    </p>
  );
}

// ─── Course filter chip row ───────────────────────────────────────────────

interface CourseChipEntry {
  shortCode: string;
  name: string;
  count: number;
}

interface CourseChipRowProps {
  courses: CourseChipEntry[];
  totalCount: number;
  activeCourseId: string | null;
  onSelect: (shortCode: string | null) => void;
}

function CourseChipRow({
  courses,
  totalCount,
  activeCourseId,
  onSelect,
}: CourseChipRowProps) {
  const baseChip =
    "shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full " +
    "text-xs font-medium transition-colors " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
  const activeChip =
    "bg-indigo-600 text-white dark:bg-indigo-500 " +
    "hover:bg-indigo-700 dark:hover:bg-indigo-400";
  const inactiveChip =
    "bg-white/70 dark:bg-slate-900/40 " +
    "text-slate-700 dark:text-slate-200 " +
    "ring-1 ring-slate-200/80 dark:ring-slate-700 " +
    "hover:bg-white hover:ring-indigo-200 " +
    "dark:hover:bg-slate-900 dark:hover:ring-indigo-800";

  const countBadge = (active: boolean) =>
    "inline-flex items-center justify-center min-w-[1.25rem] px-1 " +
    "h-4 rounded-full text-[10px] font-semibold " +
    (active
      ? "bg-white/25 text-white"
      : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200");

  return (
    <div
      role="group"
      aria-label="Filter by course"
      className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1"
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={activeCourseId === null}
        className={`${baseChip} ${activeCourseId === null ? activeChip : inactiveChip}`}
      >
        <span>All courses</span>
        <span aria-hidden className={countBadge(activeCourseId === null)}>
          {totalCount}
        </span>
      </button>
      {courses.map((course) => {
        const active = activeCourseId === course.shortCode;
        return (
          <button
            key={course.shortCode}
            type="button"
            onClick={() => onSelect(course.shortCode)}
            aria-pressed={active}
            className={`${baseChip} ${active ? activeChip : inactiveChip}`}
            title={course.name}
          >
            <span className="truncate max-w-[10rem]">{course.name}</span>
            <span aria-hidden className={countBadge(active)}>
              {course.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────

interface NeedsAttentionPanelProps {
  teacherId: string;
}

const MAX_PER_SECTION = 5;

export function NeedsAttentionPanel({ teacherId }: NeedsAttentionPanelProps) {
  const navigate = useNavigate();
  const {
    toGrade,
    pastDue,
    replies,
    loadingToGrade,
    loadingPastDue,
    loadingReplies,
    errorToGrade,
    errorPastDue,
    errorReplies,
    refreshAll,
    refreshToGrade,
    refreshPastDue,
    refreshReplies,
    recentlyAddedToGrade,
    recentlyAddedReplies,
  } = useNeedsAttention(teacherId);

  const [collapse, setCollapse] = useState<CollapseState>(() => loadCollapse());
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(() =>
    loadCourseFilter(),
  );

  useEffect(() => {
    saveCollapse(collapse);
  }, [collapse]);

  useEffect(() => {
    saveCourseFilter(activeCourseId);
  }, [activeCourseId]);

  // ── Course list dedupe ──────────────────────────────────────────────────
  // Walk all three sections and produce a sorted list of unique courses,
  // each with a count of items present in this course across the three
  // sections. The chip row uses this; the filter applies client-side below.
  const courseEntries = useMemo<CourseChipEntry[]>(() => {
    const byCode = new Map<string, CourseChipEntry>();
    const bump = (shortCode: string, name: string) => {
      const existing = byCode.get(shortCode);
      if (existing) {
        byCode.set(shortCode, { ...existing, count: existing.count + 1 });
      } else {
        byCode.set(shortCode, { shortCode, name, count: 1 });
      }
    };
    for (const item of toGrade) bump(item.courseShortCode, item.courseName);
    for (const item of pastDue) bump(item.courseShortCode, item.courseName);
    for (const item of replies) bump(item.courseShortCode, item.courseName);
    return Array.from(byCode.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [toGrade, pastDue, replies]);

  // If the persisted filter points at a course no longer in the data, reset
  // to "All courses" silently. Prevents a sticky filter from hiding
  // everything indefinitely.
  useEffect(() => {
    if (activeCourseId === null) return;
    if (courseEntries.some((c) => c.shortCode === activeCourseId)) return;
    if (courseEntries.length === 0) return;
    setActiveCourseId(null);
  }, [activeCourseId, courseEntries]);

  // ── Apply filter ────────────────────────────────────────────────────────
  const filteredToGrade = useMemo(
    () =>
      activeCourseId === null
        ? toGrade
        : toGrade.filter((i) => i.courseShortCode === activeCourseId),
    [toGrade, activeCourseId],
  );
  const filteredPastDue = useMemo(
    () =>
      activeCourseId === null
        ? pastDue
        : pastDue.filter((i) => i.courseShortCode === activeCourseId),
    [pastDue, activeCourseId],
  );
  const filteredReplies = useMemo(
    () =>
      activeCourseId === null
        ? replies
        : replies.filter((i) => i.courseShortCode === activeCourseId),
    [replies, activeCourseId],
  );

  const totalCount =
    filteredToGrade.length + filteredPastDue.length + filteredReplies.length;
  const unfilteredTotalCount =
    toGrade.length + pastDue.length + replies.length;
  const anyLoading = loadingToGrade || loadingPastDue || loadingReplies;
  const anyError = !!(errorToGrade || errorPastDue || errorReplies);

  // All-empty AND not loading AND no error → render nothing. Applies to the
  // unfiltered total: if the teacher has nothing across all courses, we
  // shouldn't render a wasted card. If she filtered to a course with
  // nothing, we DO render — she explicitly asked for that course and
  // deserves to see the empty state per section.
  if (!anyLoading && !anyError && unfilteredTotalCount === 0) {
    return null;
  }

  const toggle = (key: keyof CollapseState) => () =>
    setCollapse((s) => ({ ...s, [key]: !s[key] }));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  }, [refreshAll]);

  const toGradeShown: ToGradeItem[] = useMemo(
    () => filteredToGrade.slice(0, MAX_PER_SECTION),
    [filteredToGrade],
  );
  const pastDueShown: PastDueItem[] = useMemo(
    () => filteredPastDue.slice(0, MAX_PER_SECTION),
    [filteredPastDue],
  );
  const repliesShown: NewReplyItem[] = useMemo(
    () => filteredReplies.slice(0, MAX_PER_SECTION),
    [filteredReplies],
  );

  return (
    <section
      aria-labelledby="needs-attention-heading"
      className="
        rounded-2xl border border-indigo-200 dark:border-indigo-900
        bg-indigo-50/40 dark:bg-indigo-950/20
        p-4 sm:p-5
        space-y-4
      "
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h2
            id="needs-attention-heading"
            className="text-sm font-semibold uppercase tracking-wide text-indigo-900 dark:text-indigo-200"
          >
            Needs your attention
          </h2>
          {totalCount > 0 && (
            <span
              aria-label={`${totalCount} items`}
              className="
                inline-flex items-center justify-center min-w-[1.5rem] px-1.5
                h-5 rounded-full text-xs font-semibold
                bg-indigo-600 text-white
                dark:bg-indigo-500
              "
            >
              {totalCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh"
          title="Refresh"
          className="
            inline-flex items-center justify-center
            w-9 h-9 rounded-md
            text-indigo-700 dark:text-indigo-300
            hover:bg-indigo-100 dark:hover:bg-indigo-900/40
            disabled:opacity-50 disabled:cursor-not-allowed
            focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            transition-colors
          "
        >
          <RefreshIcon spinning={refreshing} />
        </button>
      </header>

      {/* Course filter chips — only when ≥2 unique courses present */}
      {courseEntries.length >= 2 && (
        <CourseChipRow
          courses={courseEntries}
          totalCount={unfilteredTotalCount}
          activeCourseId={activeCourseId}
          onSelect={setActiveCourseId}
        />
      )}

      {/* To grade */}
      <Section
        icon="🎯"
        label="To grade"
        count={filteredToGrade.length}
        collapsed={collapse.toGrade}
        onToggle={toggle("toGrade")}
        loading={loadingToGrade}
        error={errorToGrade}
        onRetry={() => void refreshToGrade()}
      >
        {filteredToGrade.length === 0 ? (
          <EmptySectionLine text="All caught up here 🎉" />
        ) : (
          <div className="space-y-2">
            {toGradeShown.map((item) => {
              const scoreText =
                item.scorePercent === null
                  ? ""
                  : ` (${Math.round(item.scorePercent)}%)`;
              return (
                <AttentionRow
                  key={item.attemptId}
                  fresh={recentlyAddedToGrade.has(item.attemptId)}
                  initial={initialOf(item.studentName)}
                  ariaLabel={`Grade ${item.studentName}'s ${item.assignmentTitle} attempt`}
                  message={
                    <>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {item.studentName}
                      </span>{" "}
                      submitted{" "}
                      <span className="text-slate-500 dark:text-slate-400">
                        {item.courseName} · {item.assignmentTitle}
                        {scoreText}
                      </span>
                    </>
                  }
                  meta={timeAgo(item.submittedAt)}
                  onClick={() =>
                    navigate(
                      courseAssignmentAttemptPath(
                        item.courseShortCode,
                        item.assignmentShortCode,
                        item.attemptId,
                      ),
                    )
                  }
                />
              );
            })}
            {filteredToGrade.length > MAX_PER_SECTION && (
              <p className="px-3 pt-1 text-xs text-indigo-700 dark:text-indigo-300">
                + {filteredToGrade.length - MAX_PER_SECTION} more
              </p>
            )}
          </div>
        )}
      </Section>

      {/* Past due */}
      <Section
        icon="⏰"
        label="Past due"
        count={filteredPastDue.length}
        collapsed={collapse.pastDue}
        onToggle={toggle("pastDue")}
        loading={loadingPastDue}
        error={errorPastDue}
        onRetry={() => void refreshPastDue()}
      >
        {filteredPastDue.length === 0 ? (
          <EmptySectionLine text="All caught up here 🎉" />
        ) : (
          <div className="space-y-2">
            {pastDueShown.map((item) => (
              <AttentionRow
                key={item.assignmentId}
                initial={initialOf(item.courseName)}
                ariaLabel={`Open past-due assignment ${item.assignmentTitle}`}
                message={
                  <>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {item.assignmentTitle}
                    </span>{" "}
                    <span className="text-slate-500 dark:text-slate-400">
                      · {item.courseName}
                    </span>
                    <span
                      className="
                        ml-2 inline-flex items-center px-1.5 py-0.5
                        rounded text-[10px] font-medium uppercase tracking-wide
                        bg-amber-100 text-amber-800
                        dark:bg-amber-900/40 dark:text-amber-200
                      "
                    >
                      Past due
                    </span>
                  </>
                }
                meta={timeUntil(item.dueAt)}
                onClick={() =>
                  navigate(
                    courseAssignmentPath(
                      item.courseShortCode,
                      item.assignmentShortCode,
                    ),
                  )
                }
              />
            ))}
            {filteredPastDue.length > MAX_PER_SECTION && (
              <p className="px-3 pt-1 text-xs text-indigo-700 dark:text-indigo-300">
                + {filteredPastDue.length - MAX_PER_SECTION} more
              </p>
            )}
          </div>
        )}
      </Section>

      {/* New replies */}
      <Section
        icon="💬"
        label="New replies"
        count={filteredReplies.length}
        collapsed={collapse.replies}
        onToggle={toggle("replies")}
        loading={loadingReplies}
        error={errorReplies}
        onRetry={() => void refreshReplies()}
      >
        {filteredReplies.length === 0 ? (
          <EmptySectionLine text="All caught up here 🎉" />
        ) : (
          <div className="space-y-2">
            {repliesShown.map((item) => (
              <AttentionRow
                key={item.postId}
                fresh={recentlyAddedReplies.has(item.postId)}
                initial={initialOf(item.authorName)}
                ariaLabel={`Open discussion ${item.topicTitle}`}
                message={
                  <>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {item.authorName}
                    </span>{" "}
                    replied to{" "}
                    <span className="text-slate-500 dark:text-slate-400">
                      {item.topicTitle} · {item.courseName}
                    </span>
                  </>
                }
                meta={timeAgo(item.createdAt)}
                onClick={() =>
                  navigate(
                    courseDiscussionPath(
                      item.courseShortCode,
                      item.topicShortCode,
                    ),
                  )
                }
              />
            ))}
            {filteredReplies.length > MAX_PER_SECTION && (
              <p className="px-3 pt-1 text-xs text-indigo-700 dark:text-indigo-300">
                + {filteredReplies.length - MAX_PER_SECTION} more
              </p>
            )}
          </div>
        )}
      </Section>
    </section>
  );
}
