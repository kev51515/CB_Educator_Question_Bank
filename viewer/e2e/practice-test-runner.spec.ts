/**
 * practice-test-runner.spec.ts — REAL-BROWSER full-test RUNNER click-test
 * =======================================================================
 * The one layer the API harness (scripts/clickthrough-practice-test.mjs) can't
 * cover: the actual rendered `fulltest/FullTestApp` runner UI a student sits in
 * front of. This proves the runner is INTERACTIVE in a real browser — lazy
 * chunks load, the intro renders, a module's question + A–D choices render,
 * a choice can be SELECTED, a choice can be ELIMINATED (Bluebook strikethrough),
 * and the first module can be SUBMITTED and advances. Catches render /
 * lazy-import / interaction regressions that a pure-RPC harness never sees.
 *
 * Runs under playwright.role.config.ts (NO VITE_E2E_BYPASS_AUTH) so a GENUINE
 * Supabase login is required and the lazy StudentRoutesTree + the test-runner
 * chunk must actually load.
 *
 * --- Pre-req setup (verified against scripts/clickthrough-practice-test.mjs) --
 * The 0090 course-scope rule + the client `StudentTestRunGuard`
 * (src/auth/routeViews.tsx) only let a student OPEN /test/<slug> when the slug
 * is linked from a course they're enrolled in, via a `module_items` row of
 * item_type='link' whose url contains `/test/<slug>`. So beforeAll mints a
 * teacher + student, creates a course owned by the teacher, enrols the student
 * (course_memberships), and links the test slug into the course
 * (course_modules + module_items). This mirrors the .mjs harness exactly
 * (clickthrough-practice-test.mjs lines ~430–461).
 *
 * Env (parsed from repo-root ../.env by playwright.role.config.ts):
 *   - SUPABASE_URL          — admin client (createUser / role fix / cleanup)
 *   - SUPABASE_SERVICE_KEY  — service-role key
 * The browser/app reads VITE_SUPABASE_URL/ANON from viewer/.env.local, which
 * MUST point at the SAME project so the minted student can sign in.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

// The DSAT form seeded by migration 0049 and used by the .mjs harness
// (clickthrough-practice-test.mjs line 46: `const SLUG = "dsat-nov-2023"`).
const SLUG = "dsat-nov-2023";

// ---------------------------------------------------------------------------
// Service-role admin client (Node side only — never shipped to the browser).
// Mirrors role-routing.spec.ts (lines 36–49).
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    "practice-test-runner.spec: missing SUPABASE_URL / SUPABASE_SERVICE_KEY. " +
      "These come from the repo-root ../.env — playwright.role.config.ts loads it. " +
      "Verify viewer/.env.local's VITE_SUPABASE_URL points at the SAME project.",
  );
}

const service: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Unique, timestamped identities so the spec is re-runnable without collisions.
const TS = Date.now();
const PASSWORD = "RunnerTest!" + randomBytes(6).toString("hex");
// Real email addresses (contain "@") so resolveLoginEmail passes them through
// unchanged on the student login form (role-routing.spec.ts lines 54–58).
const teacherEmail = `e2e-runner-teacher-${TS}@example.com`;
const studentEmail = `e2e-runner-student-${TS}@example.com`;

const created: {
  teacherId: string | null;
  studentId: string | null;
  courseId: string | null;
} = { teacherId: null, studentId: null, courseId: null };

/**
 * Mint a confirmed auth user with the desired role. The 0001 signup trigger
 * seeds the profiles row from user_metadata.role; we then re-assert it via a
 * service-role UPDATE to be immune to trigger timing (role-routing.spec.ts
 * lines 72–93, plus clickthrough-practice-test.mjs lines 85–99).
 */
async function mintUser(
  email: string,
  role: "teacher" | "student",
  displayName: string,
): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName, role },
  });
  if (error) throw new Error(`createUser(${role}): ${error.message}`);
  const userId = data.user.id;

  const { error: upErr } = await service
    .from("profiles")
    .update({ role, display_name: displayName })
    .eq("id", userId);
  if (upErr) throw new Error(`profile role fix(${role}): ${upErr.message}`);

  return userId;
}

test.beforeAll(async () => {
  // 1. Mint teacher + student.
  created.teacherId = await mintUser(teacherEmail, "teacher", "Runner Teacher");
  created.studentId = await mintUser(studentEmail, "student", "Runner Student");

  // 2–5. Build the course + enrolment + test link so the student passes both
  // the 0090 server scope rule AND the client StudentTestRunGuard. This block
  // is a faithful copy of clickthrough-practice-test.mjs lines ~430–461.

  // 2. Course owned by the teacher.
  const { data: courseRow, error: courseErr } = await service
    .from("courses")
    .insert({ name: `RunnerE2E-${TS}`, teacher_id: created.teacherId })
    .select("id")
    .single();
  if (courseErr) throw new Error(`create course: ${courseErr.message}`);
  created.courseId = courseRow.id;

  // 3. Enrol the student.
  const { error: memErr } = await service
    .from("course_memberships")
    .insert({ course_id: created.courseId, student_id: created.studentId });
  if (memErr) throw new Error(`enroll student: ${memErr.message}`);

  // 4. A module to hang the link off.
  const { data: modRow, error: modErr } = await service
    .from("course_modules")
    .insert({ course_id: created.courseId, name: "Practice Tests", position: 1 })
    .select("id")
    .single();
  if (modErr) throw new Error(`create module: ${modErr.message}`);

  // 5. The link item pointing at /test/<slug> — StudentTestRunGuard ilike-matches
  //    `%/test/${slug}%` on item_type='link' (routeViews.tsx lines 131–143).
  const { error: miErr } = await service.from("module_items").insert({
    module_id: modRow.id,
    item_type: "link",
    title: "DSAT Nov 2023",
    url: `/test/${SLUG}`,
    position: 1,
  });
  if (miErr) throw new Error(`create module_item: ${miErr.message}`);
});

test.afterAll(async () => {
  // Delete the course first (in case any FK isn't ON DELETE CASCADE from the
  // user side); course_modules + module_items + course_memberships cascade off
  // the course. Best-effort — never fail the run on a teardown hiccup.
  if (created.courseId) {
    const { error } = await service
      .from("courses")
      .delete()
      .eq("id", created.courseId);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`afterAll delete course failed: ${error.message}`);
    }
  }
  // Deleting the auth user cascades the profiles row (FK ON DELETE CASCADE).
  for (const id of [created.teacherId, created.studentId]) {
    if (!id) continue;
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`afterAll deleteUser(${id}) failed: ${error.message}`);
    }
  }
});

/**
 * Drive the AuthScreen sign-in form as a STUDENT with a real email.
 * Verbatim pattern from role-routing.spec.ts (lines 121–142): the role toggle
 * is a radiogroup; "Student login" is the default; the id field is labelled
 * "Student code" in student mode but a raw email is passed through unchanged
 * by resolveLoginEmail (only values without "@" get the @students.local
 * synthesis).
 */
async function studentLogin(page: Page, loginValue: string, password: string) {
  await page.goto("/signin");
  await page.getByRole("radio", { name: "Student login" }).click();
  const idField = page.getByLabel("Student code");
  await expect(idField).toBeVisible();
  await idField.fill(loginValue);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/**
 * Locate the answer-choice <button> for a given A–D letter inside the active
 * QuestionPane. The choice button (QuestionPane.tsx lines 243–279) has no
 * aria-label; its first child is a round badge <span> whose text is exactly the
 * letter, followed by the choice text. There is exactly one such badge per
 * choice. We match a button that contains a span whose trimmed text is the
 * letter — robust to the choice copy and to dark-mode class churn.
 *
 * NOTE: when strike mode is ON, an ADDITIONAL small "cross out" button per
 * choice appears (QuestionPane.tsx lines 282–301) carrying an aria-label
 * ("Cross out choice X" / "Restore choice X") — that one is targeted directly
 * via getByRole/name in the test, so this helper (no aria-label) won't collide.
 */
function choiceButton(page: Page, letter: "A" | "B" | "C" | "D") {
  // The badge span text is the bare letter; scope to the answer <ul>/<li>.
  return page
    .locator("li")
    .filter({ has: page.locator(`span:text-is("${letter}")`) })
    .getByRole("button")
    .first();
}

test.describe("full-test runner — real browser interaction (real Supabase login)", () => {
  // Generous: real login + lazy StudentRoutesTree chunk + the test-runner chunk
  // + start_test/get_test_module RPC round-trips. Per the prompt's 30s guidance.
  test.setTimeout(90_000);

  test("student can open and interact with the practice-test runner", async ({
    page,
  }) => {
    // Surface any client error overlay / console error for debuggability.
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // 1. Real student login.
    await studentLogin(page, studentEmail, PASSWORD);

    // Wait for the authenticated landing (session persisted + StudentRoutesTree
    // mounted; "/" → studentHomePath redirects to /student) BEFORE the full-page
    // goto below. Otherwise goto aborts the in-flight signInWithPassword and
    // reloads unauthenticated → bounced to /quick-start.
    await page.waitForURL(/\/student/, { timeout: 30_000 });

    // 2. Open the test runner. StudentTestRunGuard checks enrolment, then
    //    FullTestApp bootstraps via start_test. Navigate directly to the
    //    role-agnostic runner URL (ROUTES.TEST_RUN = "/test/:slug").
    await page.goto(`/test/${SLUG}`);

    // 3. Intro renders. FullTestApp intro (lines 633–669) shows a "Full-length
    //    practice test" eyebrow + the test title + the module list + a Begin
    //    button. Wait on the eyebrow (stable, copy-fixed) — proves the lazy
    //    chunk loaded and start_test resolved (not the guard's loading skeleton).
    await expect(
      page.getByText("Full-length practice test", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    // 4. Click Begin. A fresh student (answered=0, current_module=1) shows
    //    "Begin test" (line 666: resuming ? `Resume — Module N` : "Begin test").
    //    Tolerate "Resume — Module 1" too in case a prior partial run lingers.
    const beginBtn = page
      .getByRole("button", { name: /^Begin test$|^Resume — Module/ })
      .first();
    await expect(beginBtn).toBeVisible();
    await beginBtn.click();

    // 5. Module 1 renders. The runner footer shows "Question 1 of N"
    //    (FullTestApp.tsx line 914). Wait on it — proves get_test_module
    //    resolved and the QuestionPane mounted.
    await expect(
      page.getByRole("button", { name: /^Question 1 of \d+/ }),
    ).toBeVisible({ timeout: 30_000 });

    // 6. The first question's A–D choices render. The DSAT form's module 1 is
    //    Reading & Writing → MCQ (four choice rows, QuestionPane.tsx lines
    //    234–306). Assert all four choice buttons are present.
    for (const letter of ["A", "B", "C", "D"] as const) {
      await expect(choiceButton(page, letter)).toBeVisible();
    }

    // 7. Select choice A. The button onClick sets the answer; the selected
    //    state applies a blue border (lines 246–251). We assert selection via
    //    the badge span gaining the selected-only "bg-blue-600" class
    //    (lines 261–262: selected → "...bg-blue-600 text-white...").
    const choiceA = choiceButton(page, "A");
    await choiceA.click();
    // The round badge inside choice A turns blue when selected.
    await expect(
      choiceA.locator("span").filter({ hasText: /^A$/ }).first(),
    ).toHaveClass(/bg-blue-600/, { timeout: 10_000 });

    // 8. Turn on the "Cross out answer choices" tool (QHeader toggle,
    //    QuestionPane.tsx lines 184–200: aria-label="Cross out answer
    //    choices"). Only rendered for mcq questions.
    await page
      .getByRole("button", { name: "Cross out answer choices" })
      .click();

    // 9. Eliminate a DIFFERENT choice (C) — its per-choice cross-out button
    //    carries aria-label "Cross out choice C" (lines 286–287). After
    //    clicking, that control flips to "Restore choice C" (the label is
    //    struck ? Restore : Cross out), proving the eliminated state took.
    await page.getByRole("button", { name: "Cross out choice C" }).click();
    await expect(
      page.getByRole("button", { name: "Restore choice C" }),
    ).toBeVisible({ timeout: 10_000 });
    // And the eliminated choice button is now disabled (line 244: disabled
    // when struck) — the eliminated choice can't be selected as an answer.
    await expect(choiceButton(page, "C")).toBeDisabled();

    // 10. Open the section-submit confirm. On the FIRST question the footer
    //     primary is "Next" (line 938–945); the "Submit" button only appears
    //     on the LAST question (lines 947–953). Jump to the last question via
    //     the question navigator so "Submit" is available without answering
    //     every item (blanks are allowed — the confirm warns but permits it).
    // Reach the last question by clicking "Next" until the footer primary turns
    // into "Submit". More robust than the numbered navigator buttons (whose
    // accessible name is the bare question number, not "Question N"). Bounded by
    // the question count read from the footer label.
    const navLabel = await page
      .getByRole("button", { name: /^Question 1 of \d+/ })
      .innerText();
    const total = Number(navLabel.match(/of (\d+)/)?.[1] ?? "0");
    expect(total).toBeGreaterThan(0);
    const submitBtn = page.getByRole("button", { name: "Submit", exact: true });
    const nextBtn = page.getByRole("button", { name: "Next", exact: true });
    for (let i = 0; i < total && !(await submitBtn.isVisible()); i++) {
      await nextBtn.click();
    }
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
    await submitBtn.click();

    // 11. The ConfirmDialog opens (FullTestApp → teacher/ConfirmDialog), titled
    //     "Submit this section?". Submitting a section is one-way, so it's gated
    //     behind a type-to-confirm: the "Submit section" button stays DISABLED
    //     until the student types "submit". Assert that gate, then confirm.
    const dialog = page.getByRole("dialog", { name: "Submit this section?" });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const confirmBtn = dialog.getByRole("button", { name: "Submit section" });
    await expect(confirmBtn).toBeDisabled();
    await dialog.getByLabel(/Type\s+submit\s+to confirm/i).fill("submit");
    await expect(confirmBtn).toBeEnabled();
    await page.screenshot({ path: "test-results/submit-confirm-dialog.png" });
    await confirmBtn.click();

    // 12. The module submitted and advanced. submit_test_module returns
    //     finished=false + next_module for a non-final module, so the runner
    //     enters the "break" phase (FullTestApp.tsx lines 672–697): heading
    //     "Section complete" + a "Start next section" button. Accept either
    //     that, OR (if the DSAT form were single-module) the student "Test
    //     submitted" screen — both are NON-error advance states.
    const advanced = page
      .getByRole("heading", { name: "Section complete" })
      .or(page.getByRole("heading", { name: "Test submitted" }))
      .or(page.getByRole("button", { name: /^Question 1 of \d+/ })); // module 2
    await expect(advanced.first()).toBeVisible({ timeout: 30_000 });

    // 13. Negative guard: we must NOT have landed on the error screen
    //     ("Test unavailable", lines 576–590) or the empty-module fallback.
    await expect(
      page.getByRole("heading", { name: "Test unavailable" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("This section didn't load any questions.", {
        exact: false,
      }),
    ).toHaveCount(0);
  });
});
