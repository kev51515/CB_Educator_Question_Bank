/**
 * access.ts — small, explicit feature allow-lists.
 *
 * Some authoring surfaces are owned by a specific subset of educators rather
 * than every staff member. Rather than scatter email checks across the nav,
 * routes, and command palette, we centralise the decision here so there's one
 * source of truth to edit when the team changes.
 *
 * NOTE (enforcement scope): these gates hide UI + guard client routes. They
 * are NOT a hard data lock — the underlying content tables stay readable by
 * the student runners and other staff via the API. For a trusted-staff
 * internal tool that's the right proportionality; if hard server-side
 * enforcement is ever needed, promote this to a `profiles` capability column
 * + RLS (and keep this helper reading from it).
 */

/**
 * GATED SURFACE REGISTRY — every test / Question-Bank-connected educator
 * surface routes through {@link canAccessQuestionBank}. Keep this list in sync
 * when you add a test-connected surface so nothing leaks:
 *
 *   Nav rail (StaffShell navItems):      Question Bank, Submissions
 *   Top-level routes (StaffRoutesTree):  QUESTION_BANK, QBANK_LOG, TESTS_ADMIN,
 *                                        TEST_OVERVIEW, TEST_REVIEW, TEST_REPLAY,
 *                                        EDUCATOR_TEST_RUN (all via `gate()`)
 *   Modules add-item (inline-add/tree):  Full-Test, Practice Test, Question Set
 *   Course tab (ClassLayout):            Skills (tab hidden + route redirected)
 *   Course Overview card:                ClassSkillsSummaryCard
 *   Student profile panels:              StudentTestReportPanel, StudentTestRunsPanel
 *   Dashboard widget:                    TestReleaseNudge
 *   Command palette (lmsCommands):       Go to Practice, Go to Mock Test
 *
 * NOT gated (general teaching surfaces that merely *include* test rows):
 * Assignments tab, Grades/Gradebook — a non-allowed educator can't add test
 * content anyway, so these stay available for their regular assignments.
 *
 * Educators permitted to open these. Stored lower-cased; compare via
 * {@link canAccessQuestionBank}, which normalises the input.
 */
const QUESTION_BANK_EMAILS: ReadonlySet<string> = new Set([
  "kyao@prepmastersedu.com",
  "kevyao@gmail.com",
]);

/**
 * True if `email` is on the Question Bank allow-list. Case-insensitive and
 * whitespace-tolerant; a null/empty email is never allowed.
 */
export function canAccessQuestionBank(email: string | null | undefined): boolean {
  if (!email) return false;
  return QUESTION_BANK_EMAILS.has(email.trim().toLowerCase());
}
