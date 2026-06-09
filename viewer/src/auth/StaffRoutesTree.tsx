/**
 * StaffRoutesTree (code-split)
 * ============================
 * The authenticated teacher/admin route tree (+ the bare-test redirect helper),
 * extracted verbatim from AuthGate and lazy-loaded so the teacher console loads
 * in its own chunk — a student session never downloads it. Behavior unchanged.
 */
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { ROUTES, testOverviewPath } from "@/lib/routes";
import { canAccessQuestionBank } from "@/lib/access";
import { StaffShell } from "./StaffShell";
import { AccountRoutes } from "./AccountRoutes";
import { ClassLayout } from "./routeViews";
import { AllClassesView } from "@/admin";
import {
  FullTestApp,
  TestsAdminPage,
  TestReviewPage,
  TestOverviewPage,
  ReplayPage,
} from "@/fulltest";
import { CalendarPage } from "@/calendar";
import { DashboardPage } from "@/dashboard";
import { InboxPage, ThreadView } from "@/inbox";
import { QuestionBankPage } from "@/teacher/QuestionBankPage";
import { QBankSubmissionLogPage } from "@/teacher/QBankSubmissionLogPage";
import { StudentProfilePage } from "@/teacher/StudentProfilePage";
import type { AccountContext } from "./routeTreeTypes";

/**
 * Staff hitting the role-agnostic `/test/:slug` (the stored Modules link, or an
 * old bookmark) always land on the per-test OVERVIEW — info, cohort stats,
 * student data. The runner itself now lives at the role-prefixed
 * EDUCATOR_TEST_RUN (`/educator/tests/:slug/run`), reached via "Preview" on the
 * overview; staff never need the bare link to render the runner.
 */
function RedirectBareTestToOverview() {
  const { slug = "" } = useParams();
  return <Navigate to={testOverviewPath(slug)} replace />;
}

/**
 * Authenticated routes for staff (teacher / admin).
 */
export default function StaffRoutesTree({ account }: { account: AccountContext }) {
  // Test / Question-Bank content is restricted to allow-listed educators. This
  // gates EVERY test-connected route in one place: the Question Bank + its
  // Submissions log, the full-test catalog/overview/review/replay, and the
  // staff preview runner. Non-allowed staff who type/bookmark/follow a stale
  // link to any of them bounce to their dashboard. (Per-course test analytics —
  // the Skills tab, student test panels — are gated in their own surfaces.)
  const canQbank = canAccessQuestionBank(account.email);
  const gate = (el: JSX.Element): JSX.Element =>
    canQbank ? el : <Navigate to={ROUTES.DASHBOARD} replace />;
  return (
    <Routes>
      {/* The role-prefixed staff runner (Preview). One splat route so it keeps
          its state across the intro→deep-link (…/section/n/q/m) transition (a
          separate exact route would remount it and bounce every "Begin").
          Renders OUTSIDE the shell — distraction-free, full-viewport takeover.
          The bare, role-agnostic /test/<slug> stored link redirects to the
          overview. Students never reach here (separate tree). */}
      <Route path={`${ROUTES.EDUCATOR_TEST_RUN}/*`} element={gate(<FullTestApp />)} />
      <Route
        path={`${ROUTES.TEST_RUN}/*`}
        element={<RedirectBareTestToOverview />}
      />
      <Route element={<StaffShell />}>
        <Route
          path={ROUTES.HOME}
          element={<Navigate to={ROUTES.DASHBOARD} replace />}
        />
        <Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
        <Route path={ROUTES.CALENDAR} element={<CalendarPage />} />
        <Route path={ROUTES.COURSES} element={<AllClassesView />} />
        <Route path={ROUTES.QUESTION_BANK} element={gate(<QuestionBankPage />)} />
        <Route path={ROUTES.QBANK_LOG} element={gate(<QBankSubmissionLogPage />)} />
        <Route path={ROUTES.TESTS_ADMIN} element={gate(<TestsAdminPage />)} />
        <Route path={ROUTES.TEST_OVERVIEW} element={gate(<TestOverviewPage />)} />
        <Route path={ROUTES.TEST_REVIEW} element={gate(<TestReviewPage />)} />
        <Route path={ROUTES.TEST_REPLAY} element={gate(<ReplayPage />)} />
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
              basePath={ROUTES.ACCOUNT}
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
