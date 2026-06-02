/**
 * AssignmentsPanel
 * ================
 * Student-facing panel that surfaces assignments grouped by status:
 *   • To do      — not yet attempted, opens_at <= now
 *   • Past due   — due_at < now and not yet submitted (rose accent)
 *   • Completed  — submitted_at is non-null
 *
 * Wires "Start" / "Review" buttons via the `onStart` / `onReview` callbacks.
 * The actual mock-test runner integration happens wherever this panel is
 * mounted (e.g., AreaSelector) — the panel itself only emits intents.
 */
import { useEffect } from "react";
import {
  useStudentAssignments,
  type StudentAssignment,
  type StudentAssignmentAttempt,
} from "./useStudentAssignments";
import { SkeletonRows } from "../components/Skeleton";

interface AssignmentsPanelProps {
  /** Bump to force a refetch — same pattern as MyClassesPanel. */
  refreshToken?: number;
  onStart: (assignment: StudentAssignment) => void;
  onReview: (
    assignment: StudentAssignment,
    attempt: StudentAssignmentAttempt,
  ) => void;
}

interface AssignmentRowProps {
  assignment: StudentAssignment;
  tone: "todo" | "past-due" | "completed";
  onStart: () => void;
  onReview: (attempt: StudentAssignmentAttempt) => void;
}

const SOURCE_LABELS: Record<StudentAssignment["source_id"], string> = {
  cb: "CB",
  sat: "SAT",
  mixed: "Mixed",
};

function formatTimeLimit(minutes: number): string {
  if (minutes <= 0) return "Untimed";
  return `${minutes} min`;
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

function formatDue(iso: string | null): string {
  if (!iso) return "No due date";
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return "No due date";
  const now = Date.now();
  const diffMs = due.getTime() - now;
  const dayMs = 1000 * 60 * 60 * 24;
  const diffDays = Math.round(diffMs / dayMs);
  if (diffDays === 0) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) return "Due now";
    if (diffHours > 0) return `Due in ${diffHours}h`;
    return `Due ${Math.abs(diffHours)}h ago`;
  }
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays === -1) return "Due yesterday";
  if (diffDays > 1) return `Due in ${diffDays} days`;
  return `Due ${Math.abs(diffDays)} days ago`;
}

interface GradingIndicator {
  label: string;
  ariaLabel: string;
  className: string;
}

/**
 * Derive a "Graded" / "Feedback" pill for the most-recent submitted attempt.
 * Returns null when there is nothing teacher-authored to surface, or when the
 * attempt is still in-progress / not yet started.
 */
function buildGradingIndicator(
  attempt: StudentAssignmentAttempt | null,
): GradingIndicator | null {
  if (!attempt || attempt.submitted_at === null) return null;
  const hasFeedback = attempt.feedback_text != null;
  const hasGrade = attempt.graded_at != null;
  if (!hasFeedback && !hasGrade) return null;

  const timeAgo = hasGrade ? formatTimeAgo(attempt.graded_at ?? null) : "";

  if (hasGrade && hasFeedback) {
    return {
      label: timeAgo ? `Graded ${timeAgo} · Feedback` : "Graded · Feedback",
      ariaLabel: "Teacher has graded this attempt and left written feedback.",
      className:
        "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    };
  }
  if (hasFeedback) {
    return {
      label: "Feedback",
      ariaLabel: "Teacher has left written feedback on this attempt.",
      className:
        "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    };
  }
  return {
    label: timeAgo ? `Graded ${timeAgo}` : "Graded",
    ariaLabel: "Teacher has graded this attempt.",
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  };
}

function AssignmentRow({
  assignment,
  tone,
  onStart,
  onReview,
}: AssignmentRowProps) {
  const attempt = assignment.my_attempt;
  const isCompleted = tone === "completed" && attempt?.submitted_at !== null;
  const gradingIndicator = buildGradingIndicator(attempt);

  // Tone palettes: keep the structure constant, vary the accent.
  const accentRing =
    tone === "past-due"
      ? "ring-rose-200 dark:ring-rose-900"
      : "ring-slate-200 dark:ring-slate-800";
  const accentBg =
    tone === "past-due"
      ? "bg-rose-50/80 dark:bg-rose-950/30"
      : "bg-white/80 dark:bg-slate-900/60";
  const dueColor =
    tone === "past-due"
      ? "text-rose-600 dark:text-rose-400"
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

function categorise(
  assignments: StudentAssignment[],
): {
  todo: StudentAssignment[];
  pastDue: StudentAssignment[];
  completed: StudentAssignment[];
} {
  const now = Date.now();
  const todo: StudentAssignment[] = [];
  const pastDue: StudentAssignment[] = [];
  const completed: StudentAssignment[] = [];

  for (const a of assignments) {
    const opensAt = new Date(a.opens_at).getTime();
    if (Number.isFinite(opensAt) && opensAt > now) {
      // Not yet open — skip in MVP. Could surface in an "Upcoming" group later.
      continue;
    }
    const attempt = a.my_attempt;
    if (attempt && attempt.submitted_at !== null) {
      completed.push(a);
      continue;
    }
    const due = a.due_at ? new Date(a.due_at).getTime() : null;
    if (due !== null && due < now) {
      pastDue.push(a);
    } else {
      todo.push(a);
    }
  }
  return { todo, pastDue, completed };
}

export function AssignmentsPanel({
  refreshToken,
  onStart,
  onReview,
}: AssignmentsPanelProps) {
  const { assignments, loading, error, refresh } = useStudentAssignments();

  useEffect(() => {
    if (refreshToken === undefined) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const { todo, pastDue, completed } = categorise(assignments);

  return (
    <section
      aria-labelledby="my-assignments-title"
      className="rounded-2xl bg-white/60 dark:bg-slate-900/40 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-4"
    >
      <header className="flex items-baseline justify-between">
        <h3
          id="my-assignments-title"
          className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
        >
          My assignments
        </h3>
        {assignments.length > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {assignments.length} total
          </span>
        )}
      </header>

      {loading ? (
        <SkeletonRows count={4} />
      ) : error ? (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : assignments.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No assignments yet. They'll show up here when your teacher posts one.
        </p>
      ) : (
        <div className="space-y-5">
          {todo.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                To do · {todo.length}
              </p>
              <ul className="space-y-2">
                {todo.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    assignment={a}
                    tone="todo"
                    onStart={() => onStart(a)}
                    onReview={(attempt) => onReview(a, attempt)}
                  />
                ))}
              </ul>
            </div>
          )}

          {pastDue.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                Past due · {pastDue.length}
              </p>
              <ul className="space-y-2">
                {pastDue.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    assignment={a}
                    tone="past-due"
                    onStart={() => onStart(a)}
                    onReview={(attempt) => onReview(a, attempt)}
                  />
                ))}
              </ul>
            </div>
          )}

          {completed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Completed · {completed.length}
              </p>
              <ul className="space-y-2">
                {completed.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    assignment={a}
                    tone="completed"
                    onStart={() => onStart(a)}
                    onReview={(attempt) => onReview(a, attempt)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
