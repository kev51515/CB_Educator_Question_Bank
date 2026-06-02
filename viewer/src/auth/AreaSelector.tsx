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
import { TestsPanel } from "../fulltest";

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
import {
  ROUTES,
  assignmentReviewPath,
  assignmentTakePath,
} from "../lib/routes";

interface AreaCardProps {
  title: string;
  description: string;
  accent: "indigo" | "emerald";
  icon: React.ReactNode;
  onClick: () => void;
  ready: boolean;
}

function AreaCard({ title, description, accent, icon, onClick, ready }: AreaCardProps) {
  const accentClasses =
    accent === "indigo"
      ? "from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 focus:ring-indigo-500"
      : "from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 focus:ring-emerald-500";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${accentClasses} p-6 text-left text-white shadow-lg ring-1 ring-white/10 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-100 dark:focus:ring-offset-slate-950`}
    >
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-white/15 p-3 backdrop-blur-sm">{icon}</div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold leading-tight">{title}</h2>
          <p className="mt-1 text-sm text-white/85">{description}</p>
          {!ready && (
            <span className="mt-3 inline-block rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
              Coming soon
            </span>
          )}
        </div>
      </div>
      <span
        aria-hidden
        className="absolute right-4 bottom-4 text-2xl opacity-60 transition-transform group-hover:translate-x-1"
      >
        →
      </span>
    </button>
  );
}

export function AreaSelector() {
  const navigate = useNavigate();
  // We need the student id to scope assignment_attempts inserts / lookups,
  // and the display name for the welcome header. useStudentSession is cheap
  // (it's just a hook around the supabase session) and ensures we never
  // end up with a stale or mismatched id.
  const { session, setArea, signOut } = useStudentSession();
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

  const handlePickBank = () => {
    // Keep the legacy area localStorage in sync so post-refresh restores
    // (eventually) and other code that still reads session.area sees
    // "bank" while the student is on /practice.
    setArea("bank");
    navigate(ROUTES.PRACTICE);
  };

  const handlePickMock = () => {
    setArea("mock");
    navigate(ROUTES.MOCK_TEST);
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
              Pick where you'd like to study today.
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

        <div className="grid gap-4 sm:grid-cols-2">
          <AreaCard
            title="Question Bank"
            description="Browse, filter, and practice individual SAT questions by domain and skill."
            accent="indigo"
            ready
            onClick={handlePickBank}
            icon={
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14" />
                <path d="M4 19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2" />
                <path d="M8 7h8M8 11h8M8 15h5" />
              </svg>
            }
          />
          <AreaCard
            title="Full Mock Test"
            description="Take a timed practice test under realistic conditions and see your score."
            accent="emerald"
            ready
            onClick={handlePickMock}
            icon={
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx={12} cy={13} r={8} />
                <path d="M12 9v4l2.5 2.5" />
                <path d="M9 2h6" />
              </svg>
            }
          />
        </div>

        <div className="mt-10 space-y-6">
          {/* M18: assignments lead the fold so students see what's due first. */}
          <AssignmentsPanel
            refreshToken={assignmentsRefreshToken}
            onStart={handleStart}
            onReview={handleReview}
          />
          {/* M14: one-click weak-skills drill CTA right under what's due. */}
          <button
            type="button"
            onClick={() => navigate(`${ROUTES.PRACTICE}?weak=1`)}
            className="w-full min-h-[40px] flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-rose-500/95 to-amber-500/95 hover:from-rose-600 hover:to-amber-600 text-white px-5 py-4 shadow-md ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 dark:focus:ring-offset-slate-950"
            aria-label="Drill your weak skills"
          >
            <div className="text-left">
              <div className="text-sm font-semibold">Drill your weak skills</div>
              <div className="text-xs text-white/85 mt-0.5">
                Jump into the question bank filtered to skills you struggle with.
              </div>
            </div>
            <span aria-hidden className="text-xl">→</span>
          </button>
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
          <TestsPanel />
          {/* B4: quick link to the mock-test history surface so past
              attempts and side-by-side comparisons are one click away from
              the post-sign-in landing. Placed next to TestsPanel since
              that's the mock-test surface. */}
          <button
            type="button"
            onClick={() => navigate(ROUTES.MOCK_TEST_HISTORY)}
            className="w-full min-h-[40px] flex items-center justify-between gap-3 rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-white dark:hover:bg-slate-900 px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-slate-950 transition"
            aria-label="Review your mock test history"
          >
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Review your mock tests
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                See past attempts and compare them side-by-side.
              </div>
            </div>
            <span
              aria-hidden
              className="text-xl text-indigo-600 dark:text-indigo-400"
            >
              →
            </span>
          </button>
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
