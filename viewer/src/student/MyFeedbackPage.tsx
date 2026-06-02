/**
 * MyFeedbackPage
 * ==============
 * Student-facing paginated history of every teacher-graded / teacher-
 * commented assignment attempt. Destination for the "View all" link in
 * RecentFeedbackWidget on the AreaSelector landing.
 *
 * Source: same `useRecentFeedback` hook the widget uses, called with
 * `limit: PAGE_SIZE`. "Load more" bumps the active limit by PAGE_SIZE and
 * re-fetches — simple offset pagination, no cursor. Volumes per student
 * (typically <100 graded attempts over a course) do not warrant anything
 * fancier.
 *
 * Per-row body: shows the *full* feedback up to TRUNCATE_AT chars. If the
 * feedback is longer, a "Show more" toggle expands the row in place. State
 * lives in a Set<attemptId> in this component — no localStorage; expansion
 * resets on navigation by design (a destination link does not need to
 * remember a transient view choice).
 *
 * Empty state: full-page EmptyState with no CTA. There is nothing the
 * student can *do* to populate this page — only their teacher can grade an
 * attempt — so we don't bait them with a button that goes nowhere. The
 * widget's silent-collapse policy doesn't apply here because Sophia
 * clicked "View all" knowing the destination might be empty; silence
 * would feel broken.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState, Skeleton, useToast } from "../components";
import { useStudentSession } from "../auth/session";
import { ROUTES, assignmentReviewPath } from "../lib/routes";
import {
  useRecentFeedback,
  type RecentFeedbackItem,
} from "./useRecentFeedback";

const PAGE_SIZE = 25;
const TRUNCATE_AT = 300;

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  const minute = 1000 * 60;
  const hour = minute * 60;
  const day = hour * 24;
  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.round(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.round(diffMs / hour)}h ago`;
  const days = Math.round(diffMs / day);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

interface ScorePillProps {
  score: number | null;
}

/**
 * Color-banded score pill. Matches the widget's bands exactly so the same
 * attempt looks identical on the landing card and on this history surface.
 */
function ScorePill({ score }: ScorePillProps) {
  if (score === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700">
        Ungraded
      </span>
    );
  }
  const rounded = Math.round(score);
  let palette: string;
  if (rounded >= 80) {
    palette =
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800";
  } else if (rounded >= 70) {
    palette =
      "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800";
  } else if (rounded >= 50) {
    palette =
      "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800";
  } else {
    palette =
      "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800";
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${palette}`}
      aria-label={`Score ${rounded} percent`}
    >
      {rounded}%
    </span>
  );
}

interface FeedbackRowProps {
  item: RecentFeedbackItem;
  expanded: boolean;
  onToggleExpand: (attemptId: string) => void;
  onOpen: (item: RecentFeedbackItem) => void;
}

function FeedbackRow({
  item,
  expanded,
  onToggleExpand,
  onOpen,
}: FeedbackRowProps) {
  const hasFeedback = item.feedbackText !== null;
  const icon = hasFeedback ? "✏️" : "✓";
  const timeAgo = formatTimeAgo(item.gradedAt);
  const grader = item.graderDisplayName ?? "your teacher";
  const meta = timeAgo
    ? `Graded ${timeAgo} by ${grader}`
    : `Graded by ${grader}`;

  const feedbackText = item.feedbackText;
  const isLong = feedbackText !== null && feedbackText.length > TRUNCATE_AT;
  const displayedFeedback =
    feedbackText === null
      ? null
      : isLong && !expanded
        ? `${feedbackText.slice(0, TRUNCATE_AT).trimEnd()}…`
        : feedbackText;

  const ariaLabel = `Open feedback for ${item.assignmentTitle}${
    item.courseName ? ` from ${item.courseName}` : ""
  }`;

  return (
    <div className="rounded-xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-white dark:hover:bg-slate-900 transition">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="w-full min-h-[40px] flex items-start gap-3 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-slate-950 rounded-xl"
        aria-label={ariaLabel}
      >
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 text-sm"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {item.courseName && (
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700">
                {item.courseName}
              </span>
            )}
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {item.assignmentTitle}
            </span>
            <ScorePill score={item.effectiveScore} />
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {meta}
          </div>
          {displayedFeedback !== null && (
            <div className="mt-2 whitespace-pre-wrap text-sm italic text-slate-600 dark:text-slate-300">
              “{displayedFeedback}”
            </div>
          )}
        </div>
        <span
          aria-hidden
          className="self-center text-lg text-indigo-600 dark:text-indigo-400"
        >
          →
        </span>
      </button>
      {isLong && (
        <div className="px-4 pb-3 -mt-1">
          <button
            type="button"
            onClick={(e) => {
              // Don't trip the row-open handler — this lives in a sibling
              // <div>, but defensive stopPropagation keeps the intent
              // explicit if the markup ever shifts.
              e.stopPropagation();
              onToggleExpand(item.attemptId);
            }}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded min-h-[28px] px-1"
            aria-expanded={expanded}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────

export function MyFeedbackPage() {
  const navigate = useNavigate();
  const { session } = useStudentSession();
  const toast = useToast();

  const studentId = session?.userId ?? null;
  const { items, loading, error, hasMore, loadMore } = useRecentFeedback(
    studentId,
    { limit: PAGE_SIZE },
  );

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpand = useCallback((attemptId: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(attemptId)) next.delete(attemptId);
      else next.add(attemptId);
      return next;
    });
  }, []);

  const handleOpen = useCallback(
    (item: RecentFeedbackItem): void => {
      if (!item.assignmentId || !item.attemptId) {
        toast.error("Can't open this attempt — missing identifier.");
        return;
      }
      navigate(assignmentReviewPath(item.assignmentId, item.attemptId));
    },
    [navigate, toast],
  );

  const handleLoadMore = useCallback(async (): Promise<void> => {
    try {
      await loadMore(PAGE_SIZE);
    } catch {
      toast.error("Couldn't load more feedback. Try again in a moment.");
    }
  }, [loadMore, toast]);

  const showEmptyState = useMemo(
    () => !loading && !error && items.length === 0,
    [loading, error, items.length],
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
              Feedback
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">
              Feedback history
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Every assignment your teacher has graded or commented on.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(ROUTES.HOME)}
            className="rounded-lg min-h-[40px] px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Back to home"
          >
            ← Back
          </button>
        </header>

        {/* Loading: 4 skeleton rows mirroring the row shape. */}
        {loading && items.length === 0 && (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* Error: same defensive copy as the rest of the student surfaces. */}
        {!loading && error && (
          <div className="rounded-2xl ring-1 ring-rose-200 dark:ring-rose-900 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-700 dark:text-rose-300">
            Couldn't load your feedback history: {error}
          </div>
        )}

        {/* Empty */}
        {showEmptyState && (
          <EmptyState
            framed
            icon="pencil"
            title="Nothing here yet"
            body="When a teacher grades or comments on an assignment, it shows up here."
          />
        )}

        {/* Loaded */}
        {items.length > 0 && (
          <>
            <ul
              className="space-y-2"
              aria-label="Feedback history"
            >
              {items.map((item) => (
                <li key={item.attemptId}>
                  <FeedbackRow
                    item={item}
                    expanded={expanded.has(item.attemptId)}
                    onToggleExpand={toggleExpand}
                    onOpen={handleOpen}
                  />
                </li>
              ))}
            </ul>

            <div className="flex flex-col items-center gap-2 pt-2">
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleLoadMore();
                  }}
                  disabled={loading}
                  className="rounded-lg min-h-[40px] bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 px-4 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-slate-950 disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label="Load more feedback"
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  You've reached the end of your feedback history.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
