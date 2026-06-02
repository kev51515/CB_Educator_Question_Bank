/**
 * RecentFeedbackWidget
 * ====================
 * Student-side card that surfaces the 5 most recent graded / commented
 * assignment attempts. Rendered on the AreaSelector landing between the
 * weak-skills CTA and the progress section so a freshly-graded item is
 * visually proximal to the student's score / mastery trends.
 *
 * Behaviors:
 *   • Skeleton loading state (2 rows).
 *   • If the hook returns zero items, the widget renders nothing at all
 *     (silence > nag). No "Nothing here yet" empty state.
 *   • Each row is a button → navigates to the existing per-attempt review
 *     surface at /assignment/:id/review/:attemptId.
 *   • Score pill colored by band: emerald ≥80, indigo 70-79, amber 50-69,
 *     rose <50 (slate when no score).
 *   • Feedback preview is the first ~120 chars, single-line truncated,
 *     italicized slate-500/slate-400.
 */
import { useNavigate } from "react-router-dom";
import { useRecentFeedback, type RecentFeedbackItem } from "./useRecentFeedback";
import { SkeletonRows } from "../components/Skeleton";
import { assignmentReviewPath } from "../lib/routes";

interface RecentFeedbackWidgetProps {
  studentId: string | null;
}

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
  onOpen: (item: RecentFeedbackItem) => void;
}

function FeedbackRow({ item, onOpen }: FeedbackRowProps) {
  const hasFeedback = item.feedbackPreview !== null;
  const icon = hasFeedback ? "✏️" : "✓";
  const timeAgo = formatTimeAgo(item.gradedAt);
  const grader = item.graderDisplayName ?? "your teacher";
  const meta = timeAgo
    ? `Graded ${timeAgo} by ${grader}`
    : `Graded by ${grader}`;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="w-full min-h-[40px] flex items-start gap-3 rounded-xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-white dark:hover:bg-slate-900 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-slate-950 transition"
      aria-label={`Review feedback on ${item.assignmentTitle}`}
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
        {item.feedbackPreview && (
          <div className="mt-1 truncate text-xs italic text-slate-500 dark:text-slate-400">
            “{item.feedbackPreview}”
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
  );
}

export function RecentFeedbackWidget({ studentId }: RecentFeedbackWidgetProps) {
  const navigate = useNavigate();
  const { items, loading } = useRecentFeedback(studentId);

  // Empty-state policy: render nothing. Sophia's home should not be a wall
  // of "nothing to see here" cards.
  if (!loading && items.length === 0) {
    return null;
  }

  const handleOpen = (item: RecentFeedbackItem): void => {
    if (!item.assignmentId || !item.attemptId) return;
    navigate(assignmentReviewPath(item.assignmentId, item.attemptId));
  };

  return (
    <section
      aria-labelledby="recent-feedback-title"
      className="rounded-2xl bg-white/70 dark:bg-slate-900/50 ring-1 ring-slate-200 dark:ring-slate-800 p-4"
    >
      <header className="mb-3 flex items-center gap-2">
        <h2
          id="recent-feedback-title"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
        >
          Recent feedback
        </h2>
        {!loading && items.length > 0 && (
          <span
            className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800"
            aria-label={`${items.length} recent`}
          >
            {items.length}
          </span>
        )}
      </header>
      {loading ? (
        <SkeletonRows count={2} rowClassName="h-16" />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.attemptId}>
              <FeedbackRow item={item} onOpen={handleOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
