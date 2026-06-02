/**
 * AreaSelector
 * ============
 * Post sign-in landing page for students. Two area cards (Question Bank vs.
 * Full Mock Test), an Assignments section, then "My courses". Picking an
 * area or an assignment navigates to the corresponding URL — the router
 * handles mounting the right surface.
 *
 * Previously this component owned an internal `view: 'none' | 'running' |
 * 'review'` state machine for assignments. Now those branches are real
 * routes (`/assignment/:id/take`, `/assignment/:id/review/:attemptId`),
 * so this component is a pure landing page: it reads session data, renders
 * the cards/panels, and emits navigations.
 *
 * Also: `onPick`/`onSignOut`/`studentName` props were removed. The component
 * reads its own session via `useStudentSession()` and signs out / navigates
 * directly. AuthGate no longer threads these as props.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStudentSession } from "./session";
import { ShortcutHelpOverlay } from "../components/ShortcutHelpOverlay";

/**
 * Returns true when focus is currently in an editable surface (input,
 * textarea, select, or contenteditable). Used to suppress the `?` shortcut
 * while the user is typing.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
import {
  AssignmentsPanel,
  CourseAnnouncementsList,
  JoinClassModal,
  MyClassesPanel,
  RecentFeedbackWidget,
  ScorePrediction,
  SkillHeatmap,
} from "../student";
import type {
  StudentAssignment,
  StudentAssignmentAttempt,
} from "../student";
import { assignmentReviewPath, assignmentTakePath } from "../lib/routes";

export function AreaSelector() {
  const navigate = useNavigate();
  // We need the student id to scope assignment_attempts inserts / lookups,
  // and the display name for the welcome header. useStudentSession is cheap
  // (it's just a hook around the supabase session) and ensures we never
  // end up with a stale or mismatched id.
  const { session, signOut } = useStudentSession();
  const studentName = session?.name ?? "";

  const [joinOpen, setJoinOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  // Global `?` (Shift+/) listener for the keyboard-shortcut help overlay.
  // Ignored when focus is in an editable surface so it doesn't hijack
  // typing in the join-class modal or any other input.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      setHelpOpen((v) => !v);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  // Why a counter: bumping this prompts MyClassesPanel / AssignmentsPanel
  // to refetch after a successful join, without us having to thread a
  // callback through props.
  const [classesRefreshToken, setClassesRefreshToken] = useState(0);
  const [assignmentsRefreshToken, setAssignmentsRefreshToken] = useState(0);

  const handleStart = (assignment: StudentAssignment) => {
    navigate(assignmentTakePath(assignment.id));
  };

  const handleReview = (
    assignment: StudentAssignment,
    attempt: StudentAssignmentAttempt,
  ) => {
    navigate(assignmentReviewPath(assignment.id, attempt.id));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
              Welcome back
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">
              Hi, {studentName.split(" ")[0] || studentName}
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Here's what your teacher has assigned.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-800/60"
          >
            Sign out
          </button>
        </header>

        <div className="mt-2 space-y-6">
          {/* Assignments lead the fold — in the controlled-access model this
              (plus each course's modules) is the student's entire workload.
              No free question bank / free mock test / all-tests browser. */}
          <AssignmentsPanel
            refreshToken={assignmentsRefreshToken}
            onStart={handleStart}
            onReview={handleReview}
          />
          {/* Recent feedback: surface freshly-graded attempts right above
              the progress section so a teacher's comment lands next to the
              student's mastery trends. Renders nothing when there are no
              recent items — silence > nag. */}
          <RecentFeedbackWidget studentId={session?.userId ?? null} />
          <section aria-labelledby="your-progress-title" className="space-y-3">
            <h2
              id="your-progress-title"
              className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
            >
              Your progress
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <SkillHeatmap />
              <ScorePrediction />
            </div>
          </section>
          <CourseAnnouncementsList />
          <div className="space-y-3">
            <MyClassesPanel refreshToken={classesRefreshToken} />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setJoinOpen(true)}
                className="rounded-lg bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-700 px-4 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-white dark:hover:bg-slate-900 transition"
              >
                Join a course
              </button>
            </div>
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-slate-500 dark:text-slate-400">
          Signed in as <span className="font-medium">{studentName}</span>
        </p>
      </div>

      <JoinClassModal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={() => {
          setClassesRefreshToken((t) => t + 1);
          // A newly joined course may surface new assignments too.
          setAssignmentsRefreshToken((t) => t + 1);
        }}
      />

      {/* Global keyboard-shortcut help overlay (`?` to open). */}
      <ShortcutHelpOverlay open={helpOpen} onClose={closeHelp} />
    </div>
  );
}
