/**
 * routes
 * ======
 * Central route map. Single source of truth — route paths declared here,
 * referenced by `<Route>` declarations in AuthGate and built into concrete
 * URLs via `buildPath()`. Updating routes is a one-file change.
 *
 * Naming convention: the URL says "courses" but the underlying DB table is
 * `classes` until migration 0012 renames it. The client-side code uses the
 * Course terminology consistently. Track the divergence in ARCHITECTURE.md
 * until the DB rename lands.
 *
 * Course detail defaults to /courses/:courseId/modules (Canvas-aligned —
 * Modules is the unit of content organization). Configurable per-course
 * landing is deferred.
 */

export const ROUTES = {
  // Public
  HOME: "/",
  SIGN_IN: "/signin",
  QUICK_START: "/quick-start",
  PASSWORD_RESET: "/password-reset",

  // Student
  PRACTICE: "/practice",
  // Student-facing paginated history of teacher feedback across every
  // graded / commented assignment attempt. Reached from the "View all"
  // link in RecentFeedbackWidget on the AreaSelector landing.
  MY_FEEDBACK: "/my-feedback",
  MOCK_TEST: "/mock-test",
  // Student-facing history of past free-mode mock test attempts. Lets a
  // student review past attempts and compare two side-by-side.
  MOCK_TEST_HISTORY: "/mock-test/history",
  // Per-attempt review surface for a single free-mode `test_attempts` row.
  // Mirrors `ASSIGNMENT_REVIEW` but reads from `test_attempts` + `test_answers`
  // (see migrations 0042/0043). The attempt id is a uuid.
  MOCK_TEST_REVIEW: "/mock-test/history/:attemptId",
  // Proctored, full-length practice tests (e.g. a real Digital SAT form).
  TEST_RUN: "/test/:slug",
  // Staff: full-test catalog + per-test QA/answer-key review.
  TESTS_ADMIN: "/tests",
  TEST_REVIEW: "/tests/:slug/review",
  QUESTION_BANK: "/question-bank",
  QBANK_LOG: "/qbank-submissions",
  ASSIGNMENT_TAKE: "/assignment/:assignmentId/take",
  ASSIGNMENT_REVIEW: "/assignment/:assignmentId/review/:attemptId",

  // Staff (teacher + admin) — top-level
  DASHBOARD: "/dashboard",
  CALENDAR: "/calendar",
  COURSES: "/courses",

  // Course detail (nested under /courses/:courseId)
  COURSE: "/courses/:courseId",
  COURSE_MODULES: "/courses/:courseId/modules",
  COURSE_MODULE: "/courses/:courseId/modules/:moduleId",
  COURSE_ASSIGNMENTS: "/courses/:courseId/assignments",
  COURSE_ASSIGNMENT: "/courses/:courseId/assignments/:assignmentId",
  COURSE_ASSIGNMENT_ATTEMPT:
    "/courses/:courseId/assignments/:assignmentId/attempts/:attemptId",
  COURSE_PEOPLE: "/courses/:courseId/people",
  // Per-student teacher view: one student's full activity inside a course
  // (attempts + discussion posts + portfolio submissions). The roster + the
  // gradebook both link here on a name click.
  COURSE_STUDENT_PROFILE: "/courses/:courseId/people/:studentId",
  COURSE_ANNOUNCEMENTS: "/courses/:courseId/announcements",
  COURSE_MATERIALS: "/courses/:courseId/materials",
  COURSE_GRADES: "/courses/:courseId/grades",
  COURSE_PORTFOLIO: "/courses/:courseId/portfolio",
  COURSE_DISCUSSIONS: "/courses/:courseId/discussions",
  COURSE_DISCUSSION: "/courses/:courseId/discussions/:topicId",
  COURSE_SETTINGS: "/courses/:courseId/settings",

  // Inbox (1:1 direct messaging — available to both students and staff)
  INBOX: "/inbox",
  INBOX_THREAD: "/inbox/:threadId",

  // Account (personal settings + admin power-tools tucked behind /admin)
  ACCOUNT: "/account",
  ACCOUNT_SETTINGS: "/account/settings",
  ACCOUNT_ADMIN_STATS: "/account/admin/stats",
  ACCOUNT_ADMIN_USERS: "/account/admin/users",
  ACCOUNT_ADMIN_INVITES: "/account/admin/invites",
  ACCOUNT_ADMIN_AUDIT: "/account/admin/audit",

  // --- Legacy aliases ----------------------------------------------------
  // The viewer originally used a "Console / Classes / Users / Settings"
  // vocabulary. Per docs/ARCHITECTURE.md §4e the URLs were renamed to a
  // Canvas-aligned "Dashboard / Courses / Account" scheme, but several
  // surfaces (teacher/*, settings/*, the AuthGate console shell) still
  // reference the older names. Keeping them as aliases of the canonical
  // paths lets the rename roll out without a single mega-PR. Drop these
  // once every caller has migrated.
  CONSOLE: "/dashboard",
  CLASSES: "/courses",
  CLASS: "/courses/:classId",
  CLASS_ROSTER: "/courses/:classId/people",
  CLASS_ASSIGNMENTS: "/courses/:classId/assignments",
  CLASS_ASSIGNMENT: "/courses/:classId/assignments/:assignmentId",
  CLASS_ASSIGNMENT_ATTEMPT:
    "/courses/:classId/assignments/:assignmentId/attempts/:attemptId",
  CLASS_ANNOUNCEMENTS: "/courses/:classId/announcements",
  CLASS_MATERIALS: "/courses/:classId/materials",
  CLASS_SETTINGS: "/courses/:classId/settings",
  USERS: "/account/admin/users",
  SETTINGS: "/account",
} as const;

/**
 * Substitute `:param` placeholders in a route template with concrete values.
 * Encodes each value so it survives slashes and other URL-hostile characters.
 * Throws if a required param is missing.
 */
export function buildPath(
  template: string,
  params: Record<string, string>,
): string {
  return template.replace(/:(\w+)/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined || value === null || value === "") {
      throw new Error(`buildPath: missing route param "${key}" for ${template}`);
    }
    return encodeURIComponent(value);
  });
}

// --- Convenience builders -------------------------------------------------

export function testRunPath(slug: string): string {
  return buildPath(ROUTES.TEST_RUN, { slug });
}

export function testReviewPath(slug: string): string {
  return buildPath(ROUTES.TEST_REVIEW, { slug });
}

export function coursePath(courseId: string): string {
  return buildPath(ROUTES.COURSE, { courseId });
}

export function courseModulesPath(courseId: string): string {
  return buildPath(ROUTES.COURSE_MODULES, { courseId });
}

export function courseModulePath(courseId: string, moduleId: string): string {
  return buildPath(ROUTES.COURSE_MODULE, { courseId, moduleId });
}

export function courseAssignmentsPath(courseId: string): string {
  return buildPath(ROUTES.COURSE_ASSIGNMENTS, { courseId });
}

export function courseAssignmentPath(
  courseId: string,
  assignmentId: string,
): string {
  return buildPath(ROUTES.COURSE_ASSIGNMENT, { courseId, assignmentId });
}

export function courseAssignmentAttemptPath(
  courseId: string,
  assignmentId: string,
  attemptId: string,
): string {
  return buildPath(ROUTES.COURSE_ASSIGNMENT_ATTEMPT, {
    courseId,
    assignmentId,
    attemptId,
  });
}

export function coursePeoplePath(courseId: string): string {
  return buildPath(ROUTES.COURSE_PEOPLE, { courseId });
}

/**
 * Build the URL for a single student's profile inside a course.
 *
 * `courseId` accepts either a UUID or a 6-char `short_code` — the
 * underlying lookup in `useClass()` handles both transparently. Prefer the
 * short_code at call sites for clean, shareable URLs (see CLAUDE.md).
 */
export function courseStudentProfilePath(
  courseId: string,
  studentId: string,
): string {
  return buildPath(ROUTES.COURSE_STUDENT_PROFILE, { courseId, studentId });
}

export function courseAnnouncementsPath(courseId: string): string {
  return buildPath(ROUTES.COURSE_ANNOUNCEMENTS, { courseId });
}

export function courseMaterialsPath(courseId: string): string {
  return buildPath(ROUTES.COURSE_MATERIALS, { courseId });
}

export function courseGradesPath(courseId: string): string {
  return buildPath(ROUTES.COURSE_GRADES, { courseId });
}

export function coursePortfolioPath(courseId: string): string {
  return buildPath(ROUTES.COURSE_PORTFOLIO, { courseId });
}

export function courseDiscussionsPath(courseId: string): string {
  return buildPath(ROUTES.COURSE_DISCUSSIONS, { courseId });
}

export function courseDiscussionPath(
  courseId: string,
  topicId: string,
): string {
  return buildPath(ROUTES.COURSE_DISCUSSION, { courseId, topicId });
}

export function courseSettingsPath(courseId: string): string {
  return buildPath(ROUTES.COURSE_SETTINGS, { courseId });
}

export function questionBankPath(): string {
  return ROUTES.QUESTION_BANK;
}

export function assignmentTakePath(assignmentId: string): string {
  return buildPath(ROUTES.ASSIGNMENT_TAKE, { assignmentId });
}

export function inboxThreadPath(threadId: string): string {
  return buildPath(ROUTES.INBOX_THREAD, { threadId });
}

export function assignmentReviewPath(
  assignmentId: string,
  attemptId: string,
): string {
  return buildPath(ROUTES.ASSIGNMENT_REVIEW, { assignmentId, attemptId });
}

export function mockTestReviewPath(attemptId: string): string {
  return buildPath(ROUTES.MOCK_TEST_REVIEW, { attemptId });
}

// --- Legacy builder aliases ------------------------------------------------
// Pre-Canvas-rename callers (mostly teacher/* + a few internal usages) ask
// for class-flavored helpers. These thin wrappers stay until every caller
// switches to the `course*` API.

export function accountAdminAuditPath(): string {
  return ROUTES.ACCOUNT_ADMIN_AUDIT;
}

export function classPath(classId: string): string {
  return coursePath(classId);
}

export function classRosterPath(classId: string): string {
  return coursePeoplePath(classId);
}

export function classAssignmentsPath(classId: string): string {
  return courseAssignmentsPath(classId);
}

export function classAssignmentPath(
  classId: string,
  assignmentId: string,
): string {
  return courseAssignmentPath(classId, assignmentId);
}

export function classAssignmentAttemptPath(
  classId: string,
  assignmentId: string,
  attemptId: string,
): string {
  return courseAssignmentAttemptPath(classId, assignmentId, attemptId);
}
