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
  // Student landing/home. The canonical student dashboard lives under a
  // `/student` prefix (and, for teacher-managed students, `/student/:code`)
  // so the address bar makes the role + personal code legible at a glance —
  // even in a screenshot. `/` redirects here for a signed-in student. Only
  // the landing carries the prefix; inner student surfaces keep their
  // existing top-level paths to avoid a routing-wide rewrite.
  // Every authenticated student surface carries the `/student` prefix so the
  // role is legible in the address bar (and in screenshots). The full-screen
  // test runner (TEST_RUN) is the one exception — it's a role-agnostic
  // takeover whose URL is stored in `module_items`, so it stays unprefixed.
  STUDENT_HOME: "/student",
  STUDENT_HOME_CODED: "/student/:code",
  PRACTICE: "/student/practice",
  // Student-facing paginated history of teacher feedback across every
  // graded / commented assignment attempt. Reached from the "View all"
  // link in RecentFeedbackWidget on the AreaSelector landing.
  MY_FEEDBACK: "/student/my-feedback",
  MOCK_TEST: "/student/mock-test",
  // Student-facing history of past free-mode mock test attempts. Lets a
  // student review past attempts and compare two side-by-side.
  MOCK_TEST_HISTORY: "/student/mock-test/history",
  // Per-attempt review surface for a single free-mode `test_attempts` row.
  // Mirrors `ASSIGNMENT_REVIEW` but reads from `test_attempts` + `test_answers`
  // (see migrations 0042/0043). The attempt id is a uuid.
  MOCK_TEST_REVIEW: "/student/mock-test/history/:attemptId",
  ASSIGNMENT_TAKE: "/student/assignment/:assignmentId/take",
  ASSIGNMENT_REVIEW: "/student/assignment/:assignmentId/review/:attemptId",
  // Student courses list + per-course view (`:short` = course short_code or UUID).
  STUDENT_COURSES: "/student/courses",
  STUDENT_COURSE: "/student/courses/:short",
  STUDENT_COURSE_MODULES: "/student/courses/:short/modules",
  // Student calendar (role-prefixed; renders the shared CalendarPage).
  STUDENT_CALENDAR: "/student/calendar",
  // Student inbox + account (role-prefixed; mirror the educator equivalents).
  STUDENT_INBOX: "/student/inbox",
  STUDENT_INBOX_THREAD: "/student/inbox/:threadId",
  STUDENT_ACCOUNT: "/student/account",
  // The student-facing full-length test runner. Role-prefixed so the address
  // bar (and screenshots/logs) make the role obvious like every other student
  // surface. The bare TEST_RUN below redirects students here.
  STUDENT_TEST_RUN: "/student/test/:slug",

  // Proctored, full-length practice tests (e.g. a real Digital SAT form).
  // TEST_RUN is the role-AGNOSTIC entry — the stable string stored in
  // `module_items.url` and shared in links — but it no longer renders anything
  // itself: each role tree redirects it to the role-prefixed surface (students
  // → STUDENT_TEST_RUN runner; staff → TEST_OVERVIEW). Kept as data so the
  // stored links + their parsers (tree.tsx, StudentTestRunGuard, etc.) are
  // untouched; only the runtime destination is role-aware.
  TEST_RUN: "/test/:slug",

  // Every authenticated educator (teacher + admin) surface carries the
  // `/educator` prefix.
  TESTS_ADMIN: "/educator/tests",
  // Staff: per-test overview — info, cohort stats, per-student data. This is
  // where a teacher lands when they open a test (students go to STUDENT_TEST_RUN).
  TEST_OVERVIEW: "/educator/tests/:slug",
  TEST_REVIEW: "/educator/tests/:slug/review",
  // Staff preview of the runner itself, role-prefixed + nested under the test's
  // overview so it reads as "the run view of this test". Renders the full-screen
  // FullTestApp (outside the staff shell). Reached from the overview's Preview.
  EDUCATOR_TEST_RUN: "/educator/tests/:slug/run",
  QUESTION_BANK: "/educator/question-bank",
  QBANK_LOG: "/educator/qbank-submissions",

  // Educator — top-level
  DASHBOARD: "/educator/dashboard",
  CALENDAR: "/educator/calendar",
  COURSES: "/educator/courses",

  // Course detail (nested under /educator/courses/:courseId)
  COURSE: "/educator/courses/:courseId",
  COURSE_OVERVIEW: "/educator/courses/:courseId/overview",
  COURSE_MODULES: "/educator/courses/:courseId/modules",
  COURSE_MODULE: "/educator/courses/:courseId/modules/:moduleId",
  COURSE_ASSIGNMENTS: "/educator/courses/:courseId/assignments",
  COURSE_ASSIGNMENT: "/educator/courses/:courseId/assignments/:assignmentId",
  COURSE_ASSIGNMENT_ATTEMPT:
    "/educator/courses/:courseId/assignments/:assignmentId/attempts/:attemptId",
  COURSE_PEOPLE: "/educator/courses/:courseId/people",
  // Per-student teacher view: one student's full activity inside a course
  // (attempts + discussion posts + portfolio submissions). The roster + the
  // gradebook both link here on a name click.
  COURSE_STUDENT_PROFILE: "/educator/courses/:courseId/people/:studentId",
  COURSE_ANNOUNCEMENTS: "/educator/courses/:courseId/announcements",
  COURSE_MATERIALS: "/educator/courses/:courseId/materials",
  COURSE_GRADES: "/educator/courses/:courseId/grades",
  COURSE_PORTFOLIO: "/educator/courses/:courseId/portfolio",
  COURSE_DISCUSSIONS: "/educator/courses/:courseId/discussions",
  COURSE_DISCUSSION: "/educator/courses/:courseId/discussions/:topicId",
  COURSE_SETTINGS: "/educator/courses/:courseId/settings",

  // Educator inbox (1:1 direct messaging).
  INBOX: "/educator/inbox",
  INBOX_THREAD: "/educator/inbox/:threadId",

  // Educator account (personal settings + admin power-tools behind /admin).
  ACCOUNT: "/educator/account",
  ACCOUNT_SETTINGS: "/educator/account/settings",
  NOTIFICATION_PREFS: "/educator/account/notification-preferences",
  ACCOUNT_ADMIN_STATS: "/educator/account/admin/stats",
  ACCOUNT_ADMIN_USERS: "/educator/account/admin/users",
  ACCOUNT_ADMIN_INVITES: "/educator/account/admin/invites",
  ACCOUNT_ADMIN_AUDIT: "/educator/account/admin/audit",

  // --- Legacy aliases ----------------------------------------------------
  // The viewer originally used a "Console / Classes / Users / Settings"
  // vocabulary. Per docs/ARCHITECTURE.md §4e the URLs were renamed to a
  // Canvas-aligned "Dashboard / Courses / Account" scheme, but several
  // surfaces (teacher/*, settings/*, the AuthGate console shell) still
  // reference the older names. Keeping them as aliases of the canonical
  // paths lets the rename roll out without a single mega-PR. Drop these
  // once every caller has migrated.
  CONSOLE: "/educator/dashboard",
  CLASSES: "/educator/courses",
  CLASS: "/educator/courses/:classId",
  CLASS_ROSTER: "/educator/courses/:classId/people",
  CLASS_ASSIGNMENTS: "/educator/courses/:classId/assignments",
  CLASS_ASSIGNMENT: "/educator/courses/:classId/assignments/:assignmentId",
  CLASS_ASSIGNMENT_ATTEMPT:
    "/educator/courses/:classId/assignments/:assignmentId/attempts/:attemptId",
  CLASS_ANNOUNCEMENTS: "/educator/courses/:classId/announcements",
  CLASS_MATERIALS: "/educator/courses/:classId/materials",
  CLASS_SETTINGS: "/educator/courses/:classId/settings",
  USERS: "/educator/account/admin/users",
  SETTINGS: "/educator/account",
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

/** The role-agnostic entry / stored-link form (`/test/:slug`). Use this only
 *  when WRITING a stored `module_items.url` or sharing a role-neutral link;
 *  at runtime it redirects to the role-prefixed surface. */
export function testRunPath(slug: string): string {
  return buildPath(ROUTES.TEST_RUN, { slug });
}

/** The student-facing runner URL (`/student/test/:slug`). Navigate students
 *  here directly to skip the bare-link redirect hop. */
export function studentTestRunPath(slug: string): string {
  return buildPath(ROUTES.STUDENT_TEST_RUN, { slug });
}

/** Staff preview of the runner — the role-prefixed run view under the test's
 *  overview (`/educator/tests/:slug/run`). Renders the full-screen runner. */
export function testPreviewPath(slug: string): string {
  return buildPath(ROUTES.EDUCATOR_TEST_RUN, { slug });
}

export function testOverviewPath(slug: string): string {
  return buildPath(ROUTES.TEST_OVERVIEW, { slug });
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

export function courseOverviewPath(courseId: string): string {
  return buildPath(ROUTES.COURSE_OVERVIEW, { courseId });
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

/**
 * Student landing URL. When the student has a teacher-assigned personal code
 * (managed accounts, e.g. "KQAZNP-01") it rides in the path so the role and
 * the student's identity are obvious from the URL bar — handy for support and
 * screenshots. Self-registered students (no code) fall back to the bare
 * `/student`. The code is display-only; access is still enforced by auth/RLS,
 * never by the URL.
 */
export function studentHomePath(code?: string | null): string {
  return code ? `${ROUTES.STUDENT_HOME}/${encodeURIComponent(code)}` : ROUTES.STUDENT_HOME;
}

/**
 * Absolute sign-in deep link for a teacher-managed student, suitable for a QR
 * code or a paste-share. Pre-fills the Student-role code + password fields on
 * the AuthScreen (the student just taps "Sign in" — we deliberately do NOT
 * auto-submit). Uses `login`/`key` params, NOT `code`, so it doesn't collide
 * with the `?code=` course-join quick-start deep link handled in AuthGate.
 *
 * The password rides in the URL in clear text — same trust model as the
 * printed credential handout the teacher already gives the student. Only mint
 * this right after create/reset, when the plaintext password is known (it's
 * bcrypt-hashed server-side and unrecoverable afterward).
 */
export function studentLoginUrl(code: string, password: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const params = new URLSearchParams({ login: code, key: password });
  return `${origin}${ROUTES.SIGN_IN}?${params.toString()}`;
}

/**
 * Sign-in deep link that pre-fills only the student's login CODE (no
 * password). Used for the bulk "print all logins" class sheet, where we can't
 * include passwords (they're bcrypt-hashed + unrecoverable). The student
 * scans, the code is filled, and they type their own password.
 */
export function studentCodePrefillUrl(code: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  return `${origin}${ROUTES.SIGN_IN}?login=${encodeURIComponent(code)}`;
}

export function assignmentTakePath(assignmentId: string): string {
  return buildPath(ROUTES.ASSIGNMENT_TAKE, { assignmentId });
}

export function inboxThreadPath(threadId: string): string {
  return buildPath(ROUTES.INBOX_THREAD, { threadId });
}

// --- Student-side role-prefixed builders ----------------------------------
// Account + inbox are shared *components* but render under a role-specific
// prefix. Educator contexts use the ROUTES.ACCOUNT / ROUTES.INBOX constants
// (already `/educator/*`); student contexts use these.

export function studentCoursesPath(): string {
  return ROUTES.STUDENT_COURSES;
}

export function studentCoursePath(short: string): string {
  return buildPath(ROUTES.STUDENT_COURSE, { short });
}

export function studentInboxPath(): string {
  return ROUTES.STUDENT_INBOX;
}

export function studentInboxThreadPath(threadId: string): string {
  return buildPath(ROUTES.STUDENT_INBOX_THREAD, { threadId });
}

/** Student account base, or a sub-page (e.g. "settings"). */
export function studentAccountPath(sub?: string): string {
  return sub ? `${ROUTES.STUDENT_ACCOUNT}/${sub}` : ROUTES.STUDENT_ACCOUNT;
}

export function assignmentReviewPath(
  assignmentId: string,
  attemptId: string,
): string {
  return buildPath(ROUTES.ASSIGNMENT_REVIEW, { assignmentId, attemptId });
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
