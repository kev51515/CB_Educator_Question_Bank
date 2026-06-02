/**
 * AuthGate
 * ========
 * Orchestrator. Owns the auth/profile lifecycle and declares the URL routing
 * table for the entire app. State → URL: each surface has a real path so
 * refresh-survives-state, deep-links, and the back button all work.
 *
 * Route map (also exported from `lib/routes.ts`):
 *
 *   Unauthenticated:
 *     /signin               → AuthScreen
 *     /quick-start          → QuickStartScreen
 *     anything else         → redirect to /signin
 *
 *   PASSWORD_RECOVERY (highest priority — wins over everything):
 *     any URL               → PasswordResetScreen
 *
 *   Authenticated, role = "student":
 *     (inside StudentShell — overlays only)
 *     /                     → AreaSelector (welcome + assignments + classes)
 *     /practice             → Question Bank (legacy main viewer, passed
 *                              from main.tsx as children)
 *     /mock-test            → MockTestApp (free practice)
 *     /assignment/:id/take  → AssignmentRunner
 *     /assignment/:id/review/:attemptId
 *                           → StudentAttemptReview
 *     /account/*            → AccountRoutes (settings; admin tabs hidden)
 *     anything else         → redirect to /
 *
 *   Authenticated, role = "teacher" or "admin":
 *     (inside StaffShell — Canvas-style left rail)
 *     /                     → redirect to /dashboard
 *     /dashboard            → DashboardPage (course-cards grid)
 *     /courses              → AllClassesView
 *     /courses/:courseId/*  → ClassLayout (owned by another agent)
 *     /account/*            → AccountRoutes (settings + admin sub-nav)
 *     anything else         → redirect to /dashboard
 *
 * Per migration 0009, teacher and admin share the same surface — privilege
 * differences (e.g. who can mint invite codes) live below this layer.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "../components/CommandPalette";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useStudentSession } from "./session";
import { useProfile } from "../lib/profile";
import { AuthScreen } from "./AuthScreen";
import { QuickStartScreen } from "./QuickStartScreen";
import { AreaSelector } from "./AreaSelector";
import { PasswordResetScreen } from "./PasswordResetScreen";
import { StaffShell } from "./StaffShell";
import { StudentShell } from "./StudentShell";
import { AccountRoutes } from "./AccountRoutes";
import {
  AssignmentReviewRoute,
  AssignmentTakeRoute,
  ClassLayout,
  StudentTestRunGuard,
} from "./routeViews";
import { AllClassesView } from "../admin";
import { FullTestApp, TestsAdminPage, TestReviewPage } from "../fulltest";
import { CalendarPage } from "../calendar";
import { DashboardPage } from "../dashboard";
import { InboxPage, ThreadView } from "../inbox";
import { QuestionBankPage } from "../teacher/QuestionBankPage";
import { QBankSubmissionLogPage } from "../teacher/QBankSubmissionLogPage";
import { StudentProfilePage } from "../teacher/StudentProfilePage";
import { StudentCourseView } from "../student/StudentCourseView";
import { MyFeedbackPage } from "../student/MyFeedbackPage";
import { ROUTES } from "../lib/routes";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/profile";
import type { AuthResult } from "./session";

/**
 * Bundled mutations + identity that any route needing account context
 * (AccountRoutes) requires. Threaded through StudentRoutesTree /
 * StaffRoutesTree so route definitions can stay declarative.
 */
interface AccountContext {
  profile: Profile;
  email: string;
  updateDisplayName: (name: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
  onSignOut: () => Promise<void> | void;
}

interface AuthGateProps {
  children: ReactNode;
}

/**
 * Read a `code=` parameter from either the URL query string or hash. We
 * uppercase + strip whitespace because join codes are stored uppercased
 * server-side. Returns "" when no code is present so callers can use the
 * result directly as an input default.
 */
function getPrefillCode(): string {
  if (typeof window === "undefined") return "";
  const query = new URLSearchParams(window.location.search).get("code");
  const hash = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  ).get("code");
  const raw = query ?? hash ?? "";
  return raw.replace(/\s+/g, "").toUpperCase();
}

function hasCodeInUrl(): boolean {
  return getPrefillCode().length > 0;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-sky-100 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950 text-slate-500 dark:text-slate-400 text-sm">
      Loading…
    </div>
  );
}

interface ProfileErrorProps {
  message: string;
  onRetry: () => void;
  onSignOut: () => void;
}

function ProfileError({ message, onRetry, onSignOut }: ProfileErrorProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-sky-100 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-xl p-6 space-y-4 text-center">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Couldn't load your profile
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-sm font-medium px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Public (unauthenticated) routes. We honor a one-time mode default —
 * if the URL carries a `?code=`, we land on /quick-start instead of
 * /signin so a QR-scanned link drops the student straight into the
 * friction-free path.
 */
function PublicRoutes({
  signInWithPassword,
  signUp,
  requestPasswordReset,
}: {
  signInWithPassword: ReturnType<typeof useStudentSession>["signInWithPassword"];
  signUp: ReturnType<typeof useStudentSession>["signUp"];
  requestPasswordReset: ReturnType<typeof useStudentSession>["requestPasswordReset"];
}) {
  const navigate = useNavigate();
  const [defaultPath] = useState(() =>
    hasCodeInUrl() ? ROUTES.QUICK_START : ROUTES.SIGN_IN,
  );

  return (
    <Routes>
      <Route
        path={ROUTES.SIGN_IN}
        element={
          <AuthScreen
            signInWithPassword={signInWithPassword}
            signUp={signUp}
            requestPasswordReset={requestPasswordReset}
            onSwitchToQuickStart={() => navigate(ROUTES.QUICK_START)}
          />
        }
      />
      <Route
        path={ROUTES.QUICK_START}
        element={
          <QuickStartScreen
            prefillCode={getPrefillCode()}
            onSwitchToSignIn={() => navigate(ROUTES.SIGN_IN)}
          />
        }
      />
      <Route path="*" element={<Navigate to={defaultPath} replace />} />
    </Routes>
  );
}

/**
 * Authenticated routes for a student.
 *
 * Controlled-access model (decided 2026-06-02): students see ONLY what the
 * teacher assigns. The free-roam surfaces — the question bank (/practice),
 * the free mock test (/mock-test) and its history — are no longer reachable
 * from a student session; their routes redirect home. The legacy bank App
 * (passed to AuthGate as `children`) is therefore not mounted for students.
 * Full-length tests stay reachable at /test/:slug but are gated by
 * StudentTestRunGuard so a student can only open a test their teacher has
 * placed in one of their courses.
 */
function StudentRoutesTree({
  studentId,
  account,
}: {
  studentId: string;
  account: AccountContext;
}) {
  return (
    <Routes>
      {/* Full-length test runner lives OUTSIDE the shell so it's a true
          distraction-free, full-viewport takeover (like Bluebook) — no left
          rail / mobile tab bar behind its intro, loading, or running states. */}
      <Route
        path={ROUTES.TEST_RUN}
        element={
          <StudentTestRunGuard>
            <FullTestApp />
          </StudentTestRunGuard>
        }
      />
      <Route element={<StudentShell />}>
        <Route path={ROUTES.HOME} element={<AreaSelector />} />
        {/* Locked: free question bank + free mock test are off-limits to
            students. Redirect any lingering links/bookmarks back home. */}
        <Route path={ROUTES.PRACTICE} element={<Navigate to={ROUTES.HOME} replace />} />
        <Route path={ROUTES.MOCK_TEST} element={<Navigate to={ROUTES.HOME} replace />} />
        <Route path={ROUTES.MOCK_TEST_HISTORY} element={<Navigate to={ROUTES.HOME} replace />} />
        <Route path={ROUTES.MOCK_TEST_REVIEW} element={<Navigate to={ROUTES.HOME} replace />} />
        <Route path={ROUTES.MY_FEEDBACK} element={<MyFeedbackPage />} />
        <Route
          path={ROUTES.ASSIGNMENT_TAKE}
          element={<AssignmentTakeRoute studentId={studentId} />}
        />
        <Route
          path={ROUTES.ASSIGNMENT_REVIEW}
          element={<AssignmentReviewRoute />}
        />
        <Route
          path={`${ROUTES.ACCOUNT}/*`}
          element={
            <AccountRoutes
              profile={account.profile}
              email={account.email}
              updateDisplayName={account.updateDisplayName}
              updatePassword={account.updatePassword}
              onSignOut={account.onSignOut}
            />
          }
        />
        <Route path={ROUTES.INBOX} element={<InboxPage />}>
          <Route path=":threadId" element={<ThreadView />} />
        </Route>
        {/* Student per-course view. `:short` is the course `short_code`
            (also accepts a UUID — RLS enforces enrollment either way). */}
        <Route path="/courses/:short" element={<StudentCourseView />} />
        <Route path="/courses/:short/modules" element={<StudentCourseView />} />
        {/* Catch-all so unknown URLs bounce back to the area selector
            instead of rendering a blank screen. */}
        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Route>
    </Routes>
  );
}

/**
 * Authenticated routes for staff (teacher / admin).
 */
function StaffRoutesTree({ account }: { account: AccountContext }) {
  return (
    <Routes>
      {/* Staff full-test preview also renders OUTSIDE the shell — same
          distraction-free takeover students get (no left rail behind it). */}
      <Route path={ROUTES.TEST_RUN} element={<FullTestApp />} />
      <Route element={<StaffShell />}>
        <Route
          path={ROUTES.HOME}
          element={<Navigate to={ROUTES.DASHBOARD} replace />}
        />
        <Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
        <Route path={ROUTES.CALENDAR} element={<CalendarPage />} />
        <Route path={ROUTES.COURSES} element={<AllClassesView />} />
        <Route path={ROUTES.QUESTION_BANK} element={<QuestionBankPage />} />
        <Route path={ROUTES.QBANK_LOG} element={<QBankSubmissionLogPage />} />
        <Route path={ROUTES.TESTS_ADMIN} element={<TestsAdminPage />} />
        <Route path={ROUTES.TEST_REVIEW} element={<TestReviewPage />} />
        {/* Per-student profile inside a course. Registered BEFORE the
            ClassLayout wildcard below so React Router matches the more
            specific path first. Lives outside ClassLayout's tab strip
            because it's a deep-link surface, not a tab. */}
        <Route
          path={ROUTES.COURSE_STUDENT_PROFILE}
          element={<StudentProfilePage />}
        />
        {/* Per-course detail lives under /courses/:courseId/* — owned by a
            parallel agent. ClassLayout dispatches its own nested routes. */}
        <Route path={`${ROUTES.COURSE}/*`} element={<ClassLayout />} />
        <Route path={ROUTES.COURSE} element={<ClassLayout />} />
        <Route
          path={`${ROUTES.ACCOUNT}/*`}
          element={
            <AccountRoutes
              profile={account.profile}
              email={account.email}
              updateDisplayName={account.updateDisplayName}
              updatePassword={account.updatePassword}
              onSignOut={account.onSignOut}
            />
          }
        />
        <Route path={ROUTES.INBOX} element={<InboxPage />}>
          <Route path=":threadId" element={<ThreadView />} />
        </Route>
        <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
      </Route>
    </Routes>
  );
}

/**
 * E2E shell used only when `VITE_E2E_BYPASS_AUTH=1`. Mirrors the small subset
 * of `StudentShell` that real users get — currently just the global ⌘/Ctrl+K
 * command-palette listener — so tests that exercise shell-level shortcuts
 * keep working without spinning up the full Supabase session machinery.
 */
function E2EBypassShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return (
    <>
      {children}
      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        index={[]}
        recentIds={[]}
        commands={[]}
        onPickQuestion={closePalette}
      />
    </>
  );
}

export function AuthGate({ children }: AuthGateProps) {
  // E2E test bypass: when the dev server is launched by Playwright with
  // VITE_E2E_BYPASS_AUTH=1, render the bank directly so tests don't have
  // to spin up a real Supabase session. Never set in production builds.
  if (import.meta.env.VITE_E2E_BYPASS_AUTH === "1") {
    return <E2EBypassShell>{children}</E2EBypassShell>;
  }

  const {
    session,
    loading,
    signInWithPassword,
    signUp,
    signOut,
    requestPasswordReset,
    updateDisplayName,
    updatePassword,
  } = useStudentSession();
  const { profile, loading: profileLoading, error: profileError, refresh } =
    useProfile();

  // Track whether we're currently inside a Supabase PASSWORD_RECOVERY window.
  // We listen to the auth event rather than ?reset=1 because the event is
  // the canonical signal (URL params can be stripped, refreshed, etc.).
  const [passwordResetActive, setPasswordResetActive] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordResetActive(true);
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // Once the session lands (anonymous or otherwise), strip the ?code= from
  // the URL so a refresh post-enrollment doesn't bounce the user back into
  // quickstart mode.
  useEffect(() => {
    if (!session) return;
    if (typeof window === "undefined") return;
    if (!hasCodeInUrl()) return;
    window.history.replaceState(null, "", window.location.pathname);
  }, [session]);

  if (loading) return <LoadingScreen />;

  if (passwordResetActive) {
    return (
      <PasswordResetScreen
        updatePassword={updatePassword}
        onComplete={() => {
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", window.location.pathname);
          }
          setPasswordResetActive(false);
        }}
      />
    );
  }

  if (!session) {
    return (
      <PublicRoutes
        signInWithPassword={signInWithPassword}
        signUp={signUp}
        requestPasswordReset={requestPasswordReset}
      />
    );
  }

  // Auth session lives, but the profiles row hasn't loaded yet.
  if (profileLoading) return <LoadingScreen />;

  if (profileError || !profile) {
    return (
      <ProfileError
        message={profileError ?? "Profile not found."}
        onRetry={() => void refresh()}
        onSignOut={signOut}
      />
    );
  }

  const isStaff = profile.role === "teacher" || profile.role === "admin";
  const account: AccountContext = {
    profile,
    email: session.email,
    updateDisplayName,
    updatePassword,
    onSignOut: signOut,
  };

  return isStaff ? (
    <StaffRoutesTree account={account} />
  ) : (
    <StudentRoutesTree studentId={session.userId} account={account} />
  );
}
