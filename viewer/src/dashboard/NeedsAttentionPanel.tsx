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
  type AtRiskItem,
  type NewReplyItem,
  type PastDueItem,
  type ToGradeItem,
} from "./useNeedsAttention";
import {
  courseAssignmentAttemptPath,
  courseAssignmentPath,
  courseDiscussionPath,
} from "@/lib/routes";
import {
  type CollapseState,
  initialOf,
  loadCollapse,
  loadCourseFilter,
  saveCollapse,
  saveCourseFilter,
  timeAgo,
  timeUntil,
} from "./needsAttentionHelpers";
import {
  RefreshIcon,
  GradeIcon,
  PastDueIcon,
  RepliesIcon,
  AtRiskIcon,
} from "./needsAttentionIcons";
import { AttentionRow } from "./AttentionRow";
import { AtRiskRow } from "./AtRiskRow";
import { Section } from "./Section";
import { EmptySectionLine } from "./EmptySectionLine";
import { CourseChipRow, type CourseChipEntry } from "./CourseChipRow";

// ─── Main panel ───────────────────────────────────────────────────────────

interface NeedsAttentionPanelProps {
  teacherId: string;
  /**
   * Course ids in the active workspace (domain). Rows whose course isn't in
   * the set are dropped. `null` = no scoping yet (course list still loading).
   * The per-course chips inside the panel remain — they're course-level
   * filters within the workspace, not domain-level.
   */
  allowedCourseIds: Set<string> | null;
}

const MAX_PER_SECTION = 5;

export function NeedsAttentionPanel({
  teacherId,
  allowedCourseIds,
}: NeedsAttentionPanelProps) {
  const navigate = useNavigate();
  const {
    toGrade,
    pastDue,
    replies,
    atRisk,
    loadingToGrade,
    loadingPastDue,
    loadingReplies,
    loadingAtRisk,
    errorToGrade,
    errorPastDue,
    errorReplies,
    errorAtRisk,
    refreshAll,
    refreshToGrade,
    refreshPastDue,
    refreshReplies,
    refreshAtRisk,
    recentlyAddedToGrade,
    recentlyAddedReplies,
  } = useNeedsAttention(teacherId, allowedCourseIds);

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
  // At-risk items carry courseId/Name (no short_code), so when a course chip
  // is active we resolve its name from the chip entries and filter by that.
  const activeCourseName = useMemo(
    () =>
      activeCourseId === null
        ? null
        : courseEntries.find((c) => c.shortCode === activeCourseId)?.name ?? null,
    [activeCourseId, courseEntries],
  );
  const filteredAtRisk = useMemo(
    () =>
      activeCourseName === null
        ? atRisk
        : atRisk.filter((i) => i.courseName === activeCourseName),
    [atRisk, activeCourseName],
  );

  const totalCount =
    filteredAtRisk.length +
    filteredToGrade.length +
    filteredPastDue.length +
    filteredReplies.length;
  const unfilteredTotalCount =
    atRisk.length + toGrade.length + pastDue.length + replies.length;
  const anyLoading =
    loadingToGrade || loadingPastDue || loadingReplies || loadingAtRisk;
  const anyError = !!(errorToGrade || errorPastDue || errorReplies || errorAtRisk);

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

  const atRiskShown: AtRiskItem[] = useMemo(
    () => filteredAtRisk.slice(0, MAX_PER_SECTION),
    [filteredAtRisk],
  );
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

  // All-empty AND not loading AND no error → render nothing. Applies to the
  // unfiltered total: if the teacher has nothing across all courses, we
  // shouldn't render a wasted card. If she filtered to a course with nothing,
  // we DO render — she explicitly asked for that course and deserves to see
  // the empty state per section.
  //
  // IMPORTANT: this early return MUST stay below every hook call (the three
  // useMemos + useCallback above). When it sat higher, an empty dashboard
  // skipped those hooks and React threw "Rendered fewer hooks than expected".
  if (!anyLoading && !anyError && unfilteredTotalCount === 0) {
    return null;
  }

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
                h-5 rounded-full text-xs font-semibold tabular-nums
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

      {/* At-risk students — why + a one-click Nudge. Placed first: it's the
          most pedagogically valuable signal (struggling students), not just
          work waiting on the teacher. */}
      <Section
        icon={<AtRiskIcon />}
        label="At-risk students"
        count={filteredAtRisk.length}
        collapsed={collapse.atRisk}
        onToggle={toggle("atRisk")}
        loading={loadingAtRisk}
        error={errorAtRisk}
        onRetry={() => void refreshAtRisk()}
      >
        {filteredAtRisk.length === 0 ? (
          <EmptySectionLine text="No students flagged" />
        ) : (
          <div className="space-y-2">
            {atRiskShown.map((item) => (
              <AtRiskRow key={`${item.studentId}:${item.courseId}`} item={item} />
            ))}
            {filteredAtRisk.length > MAX_PER_SECTION && (
              <p className="px-3 pt-1 text-xs text-indigo-700 dark:text-indigo-300">
                + {filteredAtRisk.length - MAX_PER_SECTION} more
              </p>
            )}
          </div>
        )}
      </Section>

      {/* To grade */}
      <Section
        icon={<GradeIcon />}
        label="To grade"
        count={filteredToGrade.length}
        collapsed={collapse.toGrade}
        onToggle={toggle("toGrade")}
        loading={loadingToGrade}
        error={errorToGrade}
        onRetry={() => void refreshToGrade()}
      >
        {filteredToGrade.length === 0 ? (
          <EmptySectionLine text="All caught up here" />
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
        icon={<PastDueIcon />}
        label="Past due"
        count={filteredPastDue.length}
        collapsed={collapse.pastDue}
        onToggle={toggle("pastDue")}
        loading={loadingPastDue}
        error={errorPastDue}
        onRetry={() => void refreshPastDue()}
      >
        {filteredPastDue.length === 0 ? (
          <EmptySectionLine text="All caught up here" />
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
        icon={<RepliesIcon />}
        label="New replies"
        count={filteredReplies.length}
        collapsed={collapse.replies}
        onToggle={toggle("replies")}
        loading={loadingReplies}
        error={errorReplies}
        onRetry={() => void refreshReplies()}
      >
        {filteredReplies.length === 0 ? (
          <EmptySectionLine text="All caught up here" />
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
                    `${courseDiscussionPath(
                      item.courseShortCode,
                      item.topicShortCode,
                    )}#post-${item.postId}`,
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
