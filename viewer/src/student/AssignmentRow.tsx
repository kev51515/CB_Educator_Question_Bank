import {
  type StudentAssignment,
  type StudentAssignmentAttempt,
} from "./useStudentAssignments";
import {
  SOURCE_LABELS,
  buildGradingIndicator,
  formatDue,
  formatTimeLimit,
} from "./assignmentsPanelHelpers";

interface AssignmentRowProps {
  assignment: StudentAssignment;
  tone: "todo" | "past-due" | "completed";
  /** To-do item due within ~24h — gets an amber "act now" accent. Ignored for
   *  past-due (already rose) and completed rows. */
  dueSoon?: boolean;
  onStart: () => void;
  onReview: (attempt: StudentAssignmentAttempt) => void;
}

export function AssignmentRow({
  assignment,
  tone,
  dueSoon = false,
  onStart,
  onReview,
}: AssignmentRowProps) {
  const attempt = assignment.my_attempt;
  const isCompleted = tone === "completed" && attempt?.submitted_at !== null;
  const gradingIndicator = buildGradingIndicator(attempt);
  const urgent = tone === "todo" && dueSoon;

  // Tone palettes: keep the structure constant, vary the accent. Past-due
  // (rose) wins; an imminent To-do gets an amber "act now" accent; else neutral.
  const accentRing =
    tone === "past-due"
      ? "ring-rose-200 dark:ring-rose-900"
      : urgent
        ? "ring-amber-300 dark:ring-amber-800"
        : "ring-slate-200 dark:ring-slate-800";
  const accentBg =
    tone === "past-due"
      ? "bg-rose-50/80 dark:bg-rose-950/30"
      : urgent
        ? "bg-amber-50/80 dark:bg-amber-950/20"
        : "bg-white/80 dark:bg-slate-900/60";
  const dueColor =
    tone === "past-due"
      ? "text-rose-600 dark:text-rose-400"
      : urgent
        ? "text-amber-700 dark:text-amber-400 font-medium"
        : "text-slate-500 dark:text-slate-400";

  return (
    <li
      className={`rounded-xl ${accentBg} ring-1 ${accentRing} px-4 py-3 flex items-start justify-between gap-3`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
          {assignment.title}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {assignment.class_name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span>{SOURCE_LABELS[assignment.source_id]}</span>
          <span aria-hidden>·</span>
          <span>{assignment.question_count} Q</span>
          <span aria-hidden>·</span>
          <span>{formatTimeLimit(assignment.time_limit_minutes)}</span>
          <span aria-hidden>·</span>
          <span className={dueColor}>{formatDue(assignment.due_at)}</span>
          {isCompleted && attempt?.score_percent !== null && attempt && (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                {Math.round(attempt.score_percent ?? 0)}%
              </span>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {gradingIndicator && (
          <span
            aria-label={gradingIndicator.ariaLabel}
            className={`inline-flex min-h-[24px] items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none ${gradingIndicator.className}`}
          >
            {gradingIndicator.label}
          </span>
        )}
        {isCompleted && attempt ? (
          <button
            type="button"
            onClick={() => onReview(attempt)}
            className="rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Review
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            className="rounded-md bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Start
          </button>
        )}
      </div>
    </li>
  );
}
