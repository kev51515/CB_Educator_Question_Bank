/**
 * StudentRoutesTree (code-split)
 * ==============================
 * The authenticated student route tree, extracted verbatim from AuthGate and
 * lazy-loaded so a student's surfaces (and the test runner / KaTeX) load in
 * their own chunk instead of the main bundle. Behavior is unchanged.
 */
import { lazy } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { ROUTES, studentHomePath, studentTestRunPath } from "@/lib/routes";
import { StudentShell } from "./StudentShell";
import { AreaSelector } from "./AreaSelector";
import { AccountRoutes } from "./AccountRoutes";
import {
  AssignmentReviewRoute,
  AssignmentTakeRoute,
  StudentTestRunGuard,
} from "./routeViews";
import { FullTestApp } from "@/fulltest";
import { LineLinkPage } from "@/line";
import { CalendarPage } from "@/calendar";
import { SharedRecordingView } from "@/recordings";
// Lazy-loaded so the Inbox's TipTap/ProseMirror (MarkdownEditor) stack lands
// in its own chunk instead of the critical-path bundle. The parent <Suspense
// fallback={<LoadingScreen />}> in AuthGate covers these.
const InboxPage = lazy(() =>
  import("@/inbox/InboxPage").then((m) => ({ default: m.InboxPage })),
);
const ThreadView = lazy(() =>
  import("@/inbox/ThreadView").then((m) => ({ default: m.ThreadView })),
);
import { MyFeedbackPage } from "@/student/MyFeedbackPage";
import { SkillDrillRoute } from "@/student/SkillDrillRoute";
import { StudentCourseView } from "@/student/StudentCourseView";
import { StudentCoursesPage } from "@/student/StudentCoursesPage";
import { SharedRecordingsPage } from "@/student/SharedRecordingsPage";
import type { AccountContext } from "./routeTreeTypes";

/**
 * Redirect the role-agnostic `/test/:slug/*` (the link stored in
 * `module_items`, or an old bookmark) to the role-prefixed student runner,
 * preserving any deep-link suffix (…/section/n/q/m) and query string so a
 * resume / shared section link survives the hop.
 */
function RedirectBareTestToStudent() {
  const params = useParams();
  const slug = params.slug ?? "";
  const splat = params["*"] ?? "";
  const { search } = useLocation();
  const suffix = splat ? `/${splat}` : "";
  return <Navigate to={`${studentTestRunPath(slug)}${suffix}${search}`} replace />;
}

export default function StudentRoutesTree({
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
          rail / mobile tab bar behind its intro, loading, or running states.
          The runner is role-prefixed (/student/test/:slug) so the address bar
          shows the role like every other student surface; the bare,
          role-agnostic /test/:slug stored link redirects here. */}
      <Route
        path={`${ROUTES.STUDENT_TEST_RUN}/*`}
        element={
          <StudentTestRunGuard>
            <FullTestApp />
          </StudentTestRunGuard>
        }
      />
      <Route
        path={`${ROUTES.TEST_RUN}/*`}
        element={<RedirectBareTestToStudent />}
      />
      {/* Skill Drill — the qbank runner is a full-viewport iframe takeover, so
          it lives OUTSIDE the shell like the test runner. */}
      <Route path={ROUTES.STUDENT_SKILL_DRILL} element={<SkillDrillRoute />} />

      {/* LINE Account Link landing — full-viewport, outside the shell; it just
          mints a nonce and redirects out to LINE's accountLink dialog. */}
      <Route path={ROUTES.LINE_LINK} element={<LineLinkPage />} />
      <Route element={<StudentShell />}>
        {/* `/` redirects to the prefixed landing so the URL bar shows the
            role (and the personal code, when the account has one). The
            dashboard itself renders at /student and /student/:code; the
            `:code` segment is display-only (auth/RLS enforce access). */}
        <Route
          path={ROUTES.HOME}
          element={
            <Navigate to={studentHomePath(account.profile.login_code)} replace />
          }
        />
        <Route path={ROUTES.STUDENT_HOME} element={<AreaSelector />} />
        <Route path={ROUTES.STUDENT_HOME_CODED} element={<AreaSelector />} />
        {/* Locked: free question bank + free mock test are off-limits to
            students. Redirect any lingering links/bookmarks back home. */}
        <Route path={ROUTES.PRACTICE} element={<Navigate to={ROUTES.HOME} replace />} />
        <Route path={ROUTES.MOCK_TEST} element={<Navigate to={ROUTES.HOME} replace />} />
        <Route path={ROUTES.MOCK_TEST_HISTORY} element={<Navigate to={ROUTES.HOME} replace />} />
        <Route path={ROUTES.MOCK_TEST_REVIEW} element={<Navigate to={ROUTES.HOME} replace />} />
        <Route path={ROUTES.MY_FEEDBACK} element={<MyFeedbackPage />} />
        {/* Read-only recording shared into a course module (RLS-gated). */}
        <Route path={ROUTES.RECORDING_VIEW} element={<SharedRecordingView />} />
        <Route path={ROUTES.STUDENT_RECORDINGS} element={<SharedRecordingsPage />} />
        <Route
          path={ROUTES.ASSIGNMENT_TAKE}
          element={<AssignmentTakeRoute studentId={studentId} />}
        />
        <Route
          path={ROUTES.ASSIGNMENT_REVIEW}
          element={<AssignmentReviewRoute />}
        />
        <Route
          path={`${ROUTES.STUDENT_ACCOUNT}/*`}
          element={
            <AccountRoutes
              profile={account.profile}
              email={account.email}
              updateDisplayName={account.updateDisplayName}
              updatePassword={account.updatePassword}
              onSignOut={account.onSignOut}
              basePath={ROUTES.STUDENT_ACCOUNT}
            />
          }
        />
        <Route path={ROUTES.STUDENT_INBOX} element={<InboxPage />}>
          <Route path=":threadId" element={<ThreadView />} />
        </Route>
        {/* Student per-course view. `:short` is the course `short_code`
            (also accepts a UUID — RLS enforces enrollment either way). */}
        <Route path={ROUTES.STUDENT_CALENDAR} element={<CalendarPage />} />
        <Route path={ROUTES.STUDENT_COURSES} element={<StudentCoursesPage />} />
        <Route path={ROUTES.STUDENT_COURSE} element={<StudentCourseView />} />
        <Route path={ROUTES.STUDENT_COURSE_MODULES} element={<StudentCourseView />} />
        {/* Catch-all so unknown URLs bounce back to the area selector
            instead of rendering a blank screen. */}
        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Route>
    </Routes>
  );
}
