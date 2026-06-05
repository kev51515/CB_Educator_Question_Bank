/**
 * StaffRoutesTree (code-split)
 * ============================
 * The authenticated teacher/admin route tree (+ the StaffTestGate splat helper),
 * extracted verbatim from AuthGate and lazy-loaded so the teacher console loads
 * in its own chunk — a student session never downloads it. Behavior unchanged.
 */
import { Navigate, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { ROUTES, testOverviewPath } from "@/lib/routes";
import { StaffShell } from "./StaffShell";
import { AccountRoutes } from "./AccountRoutes";
import { ClassLayout } from "./routeViews";
import { AllClassesView } from "@/admin";
import {
  FullTestApp,
  TestsAdminPage,
  TestReviewPage,
  TestOverviewPage,
} from "@/fulltest";
import { CalendarPage } from "@/calendar";
import { DashboardPage } from "@/dashboard";
import { InboxPage, ThreadView } from "@/inbox";
import { QuestionBankPage } from "@/teacher/QuestionBankPage";
import { QBankSubmissionLogPage } from "@/teacher/QBankSubmissionLogPage";
import { StudentProfilePage } from "@/teacher/StudentProfilePage";
import type { AccountContext } from "./routeTreeTypes";

function StaffTestGate() {
  const params = useParams();
  const slug = params.slug ?? "";
  const splat = params["*"] ?? "";
  const [search] = useSearchParams();
  const bare = splat === "";
  if (bare && search.get("preview") !== "1") {
    return <Navigate to={testOverviewPath(slug)} replace />;
  }
  return <FullTestApp />;
}

/**
 * Authenticated routes for staff (teacher / admin).
 */
export default function StaffRoutesTree({ account }: { account: AccountContext }) {
  return (
    <Routes>
      {/* When staff open a test (the shared Modules /test/<slug> link), the
          BARE link redirects to the per-test OVERVIEW — info, cohort stats,
          student data — while "Preview" (?preview=1) and in-progress preview
          deep-links (…/section/n/q/m) render the runner. One splat route +
          internal gate so the runner keeps its state across the
          bare→deep-link transition (a separate exact route would remount it
          and bounce every "Begin"). Students never reach here (separate
          tree). Runner renders OUTSIDE the shell — distraction-free takeover. */}
      <Route path={`${ROUTES.TEST_RUN}/*`} element={<StaffTestGate />} />
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
        <Route path={ROUTES.TEST_OVERVIEW} element={<TestOverviewPage />} />
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
