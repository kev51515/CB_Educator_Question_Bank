/**
 * AreaSelector
 * ============
 * Post sign-in landing page for students. In the controlled-access model
 * (2026-06) there are no free-roam "area" cards — a student's workload is the
 * assignments + course modules their teacher gives them. This page stacks, top
 * to bottom: Assignments, released full-test results, recent feedback, a
 * read-only skill-mastery panel, course announcements, and "My courses".
 * Picking an assignment navigates to the corresponding route — the router
 * mounts the right surface.
 *
 * This component is a pure landing page: it reads session data, renders the
 * panels, and emits navigations (assignment take/review live at real routes:
 * `/assignment/:id/take`, `/assignment/:id/review/:attemptId`).
 *
 * `onPick`/`onSignOut`/`studentName` props were removed: the component reads
 * its own session via `useStudentSession()` and signs out / navigates
 * directly. AuthGate no longer threads these as props.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUiTheme } from "@/lib/theme";
import { useStudentSession } from "./session";
import { ShortcutHelpOverlay } from "@/components/ShortcutHelpOverlay";

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
import { StudentTestResultsPanel } from "@/student/StudentTestResultsPanel";
import {
  AssignmentsPanel,
  CourseAnnouncementsList,
  JoinClassModal,
  MyClassesPanel,
  RecentFeedbackWidget,
  SkillHeatmap,
} from "@/student";
import type {
  StudentAssignment,
  StudentAssignmentAttempt,
} from "@/student";
import { assignmentReviewPath, assignmentTakePath, studentCoursePath } from "@/lib/routes";

export function AreaSelector() {
  const navigate = useNavigate();
  const uiTheme = useUiTheme();
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

  // Just claimed a managed seat in QuickStart? Drop the student straight into the
  // course they were invited to (better UX than landing on this hub). The target
  // course id is handed off via sessionStorage because QuickStartScreen unmounts
  // when the seat sign-in routes AuthGate here. Consume it once so a later home
  // visit doesn't re-redirect.
  useEffect(() => {
    let target: string | null = null;
    try {
      target = sessionStorage.getItem("qs.goToCourse");
      if (target) sessionStorage.removeItem("qs.goToCourse");
    } catch {
      /* sessionStorage unavailable — stay on the hub */
    }
    if (target) navigate(studentCoursePath(target), { replace: true });
  }, [navigate]);
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
    <div
      className={
        // Ivy: flat eggshell ground (the gradient's literal sky-blue stop
        // can't retheme via vars and clashes with the navy identity).
        // Classic: the original gradient, verbatim.
        uiTheme === "ivy"
          ? "min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-12"
          : "min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-12"
      }
    >
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
              Welcome back
            </p>
            <h1 className="page-title mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">
              Hi, {studentName.split(" ")[0] || studentName}
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Here's what your teacher has assigned.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center min-h-[44px] rounded-lg px-4 py-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-800/60"
          >
            Sign out
          </button>
        </header>

        {/* Two-column on desktop: the workload stack stays in the main (left)
            column with Assignments leading the fold, while "My courses" lives
            in a right rail pinned to the top. On mobile the grid collapses to a
            single column (main first, courses after) so Assignments still lead
            the fold there. */}
        <div className="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="space-y-6">
            {/* Assignments lead the fold — in the controlled-access model this
                (plus each course's modules) is the student's entire workload.
                No free question bank / free mock test / all-tests browser. */}
            <AssignmentsPanel
              refreshToken={assignmentsRefreshToken}
              onStart={handleStart}
              onReview={handleReview}
            />
            {/* Full-length test results — released by the teacher (hidden until
                then). Renders nothing when the student has no submitted tests. */}
            <StudentTestResultsPanel />
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
              <div className="grid gap-4">
                <SkillHeatmap />
              </div>
            </section>
            <CourseAnnouncementsList />
          </div>

          {/* Right rail — "My courses" pinned to the top of the column. */}
          <aside className="space-y-3 lg:sticky lg:top-6">
            <MyClassesPanel refreshToken={classesRefreshToken} />
            <div className="flex justify-center sm:justify-end">
              <button
                type="button"
                onClick={() => setJoinOpen(true)}
                className="inline-flex items-center min-h-[44px] rounded-lg bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-700 px-4 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-white dark:hover:bg-slate-900 transition"
              >
                Join a course
              </button>
            </div>
          </aside>
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
