/**
 * routeViews
 * ==========
 * Small `<Route element={...}>` wrappers that bridge the URL-based router
 * (declared in `AuthGate.tsx`) to the existing screen components. These
 * exist because most of the underlying components (AssignmentRunner,
 * StudentAttemptReview, MockTestApp) were originally written to take their
 * inputs as React props rather than reading from the URL — these wrappers
 * pull `useParams()` / `useNavigate()` and forward what's needed.
 *
 * Keep the wrappers thin: routing concerns only. Any data-fetching or
 * business logic belongs in the wrapped component or its hooks.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Skeleton, SkeletonRows } from "@/components";
import { ROUTES, assignmentReviewPath } from "../lib/routes";
import { MockTestApp } from "../mocktest";
import { AssignmentRunner } from "../student/AssignmentRunner";
import { StudentAttemptReview } from "../student/StudentAttemptReview";
import type {
  StudentAssignment,
  StudentAssignmentAttempt,
} from "../student";
import type { AssignmentDifficultyMix, AssignmentSourceId } from "../teacher/useAssignments";

// --- Shared bits ----------------------------------------------------------

/**
 * Skeleton matching the AssignmentRunner shape: a top header bar, a question
 * card body, and four answer-choice rows. Used while we load the assignment
 * row over the network so the layout doesn't pop in.
 */
function AssignmentRunnerSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading assignment"
      className="min-h-screen bg-slate-50 dark:bg-slate-950"
    >
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 flex items-center gap-3">
        <Skeleton className="h-6 w-32 rounded" />
        <div className="flex-1" />
        <Skeleton className="h-6 w-20 rounded" />
      </div>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-3">
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
        </div>
        <SkeletonRows count={4} rowClassName="h-12" />
      </div>
    </div>
  );
}

/**
 * Minimal full-screen skeleton for transient session/account loading states.
 * Just enough shimmer to signal "loading" without claiming a specific layout.
 */
function FullScreenSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-6"
    >
      <div className="max-w-3xl mx-auto">
        <SkeletonRows count={6} rowClassName="h-12" />
      </div>
    </div>
  );
}

function CenteredError({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-4 text-center">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Something went wrong
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// --- PracticeRoute --------------------------------------------------------

/**
 * Mounts the legacy question-bank viewer. The viewer's main App is passed
 * down from `main.tsx` through AuthGate as `children`; PracticeRoute just
 * forwards them so the bank renders inside the router.
 */
export function PracticeRoute({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// --- MockTestRoute --------------------------------------------------------

/**
 * Free-practice mock test (no assignment context). On exit, navigate the
 * student back to the area selector at /.
 */
export function MockTestRoute({ userId }: { userId: string }) {
  const navigate = useNavigate();
  return (
    <MockTestApp
      userId={userId}
      onExit={() => navigate(ROUTES.HOME)}
    />
  );
}

// --- AssignmentTakeRoute --------------------------------------------------

interface AssignmentTakeRouteProps {
  studentId: string;
}

interface AssignmentRow {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  source_id: string;
  question_count: number;
  time_limit_minutes: number;
  difficulty_mix: string;
  due_at: string | null;
  opens_at: string;
  created_at: string;
  courses: { name: string } | null;
  assignment_attempts: {
    id: string;
    started_at: string;
    submitted_at: string | null;
    score_percent: number | null;
    correct_count: number | null;
    total_questions: number | null;
  }[];
}

function isSourceId(value: string): value is AssignmentSourceId {
  return value === "cb" || value === "sat" || value === "mixed";
}

function isDifficultyMix(value: string): value is AssignmentDifficultyMix {
  return (
    value === "easy" || value === "medium" || value === "hard" || value === "any"
  );
}

function rowToAssignment(row: AssignmentRow): StudentAssignment {
  const attempt = row.assignment_attempts?.[0] ?? null;
  const myAttempt: StudentAssignmentAttempt | null = attempt
    ? {
        id: attempt.id,
        started_at: attempt.started_at,
        submitted_at: attempt.submitted_at,
        score_percent:
          attempt.score_percent === null ? null : Number(attempt.score_percent),
        correct_count: attempt.correct_count,
        total_questions: attempt.total_questions,
      }
    : null;
  return {
    id: row.id,
    course_id: row.course_id,
    class_name: row.courses?.name ?? "",
    title: row.title,
    description: row.description,
    source_id: isSourceId(row.source_id) ? row.source_id : "cb",
    question_count: row.question_count,
    time_limit_minutes: row.time_limit_minutes,
    difficulty_mix: isDifficultyMix(row.difficulty_mix)
      ? row.difficulty_mix
      : "any",
    due_at: row.due_at,
    opens_at: row.opens_at,
    created_at: row.created_at,
    my_attempt: myAttempt,
  };
}

/**
 * Loads the assignment by `:assignmentId` from the URL, then mounts
 * AssignmentRunner. We keep the load here (rather than threading the
 * StudentAssignment through props) so the route is self-sufficient — a
 * student can deep-link / refresh and we'll re-fetch.
 */
export function AssignmentTakeRoute({ studentId }: AssignmentTakeRouteProps) {
  const params = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const assignmentId = params.assignmentId ?? "";

  const [assignment, setAssignment] = useState<StudentAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from("assignments")
          .select(
            "id, course_id, title, description, source_id, question_count, time_limit_minutes, difficulty_mix, due_at, opens_at, created_at, archived, courses:courses!assignments_course_id_fkey(name), assignment_attempts(id, started_at, submitted_at, score_percent, correct_count, total_questions)",
          )
          .eq("id", assignmentId)
          .maybeSingle();
        if (cancelled) return;
        if (queryError) {
          setError(queryError.message);
          setLoading(false);
          return;
        }
        if (!data) {
          setError("Assignment not found.");
          setLoading(false);
          return;
        }
        setAssignment(rowToAssignment(data as unknown as AssignmentRow));
        setLoading(false);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load assignment.");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  if (loading) return <AssignmentRunnerSkeleton />;
  if (error || !assignment) {
    return (
      <CenteredError
        message={error ?? "Assignment not found."}
        onBack={() => navigate(ROUTES.HOME)}
      />
    );
  }
  if (!studentId) {
    return <FullScreenSkeleton />;
  }

  return (
    <AssignmentRunner
      assignment={assignment}
      studentId={studentId}
      onExit={() => navigate(ROUTES.HOME)}
      onAlreadySubmitted={(attemptId) =>
        navigate(assignmentReviewPath(assignment.id, attemptId), {
          replace: true,
        })
      }
    />
  );
}

// --- AssignmentReviewRoute -----------------------------------------------

/**
 * Mounts the read-only review of a submitted assignment attempt.
 */
export function AssignmentReviewRoute() {
  const params = useParams<{ assignmentId: string; attemptId: string }>();
  const navigate = useNavigate();
  const attemptId = params.attemptId ?? "";
  if (!attemptId) {
    return (
      <CenteredError
        message="Missing attempt ID."
        onBack={() => navigate(ROUTES.HOME)}
      />
    );
  }
  return (
    <StudentAttemptReview
      attemptId={attemptId}
      onExit={() => navigate(ROUTES.HOME)}
    />
  );
}

// --- ClassLayout ---------------------------------------------------------

/**
 * Per-class teacher/admin layout. The real implementation lives in
 * `teacher/ClassLayout.tsx` — it owns its own nested <Routes> for the
 * tabs (Overview / Roster / Assignments / Announcements / Materials /
 * Settings) plus the per-assignment + per-attempt drilldowns. We re-export
 * here so AuthGate's existing import keeps working without churn.
 */
export { ClassLayout } from "../teacher/ClassLayout";
