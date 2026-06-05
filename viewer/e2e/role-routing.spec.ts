/**
 * role-routing.spec.ts — REAL-AUTH role-routing regression
 * =========================================================
 * Guards the auth → role-routing code-split. `AuthGate` lazy-loads two chunks:
 *   - `StaffRoutesTree`   (teacher/admin console)
 *   - `StudentRoutesTree` (student surfaces + test runner)
 * …and only mounts one based on `profile.role` AFTER a real Supabase session
 * exists. The default `playwright.config.ts` boots the dev server with
 * `VITE_E2E_BYPASS_AUTH=1`, which short-circuits `AuthGate` to `E2EBypassShell`
 * and NEVER touches the role trees. This spec therefore runs under a SEPARATE
 * config (`playwright.role.config.ts`) that boots Vite WITHOUT that bypass, so
 * a genuine login is required and the correct lazy chunk must load + route.
 *
 * What it proves:
 *   - student login  → `StudentRoutesTree` chunk loads → AreaSelector renders
 *                      ("Hi, <first name>" heading from AreaSelector.tsx).
 *   - teacher login  → `StaffRoutesTree`  chunk loads → DashboardPage renders
 *                      ("Dashboard" heading from DashboardPage.tsx).
 *
 * Users are minted via the Supabase service-role admin API in `beforeAll`
 * (mirroring viewer/scripts/smoke-e2e.mjs) and deleted in `afterAll`.
 *
 * Env (see playwright.role.config.ts — it parses root ../.env into process.env):
 *   - SUPABASE_URL          — Supabase project URL (admin client)
 *   - SUPABASE_SERVICE_KEY  — service-role key (createUser / deleteUser / role fix)
 * The browser/app itself reads VITE_SUPABASE_URL/ANON from viewer/.env.local,
 * which MUST point at the SAME project so the minted users can sign in.
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Service-role admin client (Node side only — never shipped to the browser).
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    "role-routing.spec: missing SUPABASE_URL / SUPABASE_SERVICE_KEY. " +
      "These come from the repo-root ../.env — playwright.role.config.ts loads it. " +
      "Verify viewer/.env.local's VITE_SUPABASE_URL points at the SAME project.",
  );
}

const service: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Unique, timestamped identities so the spec is re-runnable without collisions.
const TS = Date.now();
const PASSWORD = "RoleRoute!" + randomBytes(6).toString("hex");
// Real email addresses (contain "@") so resolveLoginEmail passes them through
// unchanged for BOTH the educator and student login forms — the student form
// only synthesizes "<code>@students.local" when the value has no "@".
const teacherEmail = `e2e-teacher-${TS}@example.com`;
const studentEmail = `e2e-student-${TS}@example.com`;

const created: { teacherId: string | null; studentId: string | null } = {
  teacherId: null,
  studentId: null,
};

/**
 * Mint a confirmed auth user with the desired role. The 0001 signup trigger
 * (`handle_new_auth_user`) reads `raw_user_meta_data->>'role'` to seed the
 * profiles row, so passing `role` in user_metadata is enough. We then
 * defensively re-assert the role via a service-role UPDATE to be immune to any
 * trigger timing / metadata-casting surprises.
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
  created.teacherId = await mintUser(teacherEmail, "teacher", "E2E Teacher");
  created.studentId = await mintUser(studentEmail, "student", "Stu Dent");
});

test.afterAll(async () => {
  // Deleting the auth user cascades the profiles row (FK ON DELETE CASCADE).
  for (const id of [created.teacherId, created.studentId]) {
    if (!id) continue;
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) {
      // Best-effort cleanup: log but don't fail the run on a teardown hiccup.
      // eslint-disable-next-line no-console
      console.warn(`afterAll deleteUser(${id}) failed: ${error.message}`);
    }
  }
});

/**
 * Drive the AuthScreen sign-in form for a given role.
 * - educator: real email in the "Email" field.
 * - student : value in the "Student code" field (a raw email here, so it's
 *   passed through unchanged by resolveLoginEmail).
 * The role toggle is a radiogroup ("Sign in as") with "Student login" /
 * "Educator login" radios; "student" is the default selection.
 */
async function login(
  page: import("@playwright/test").Page,
  role: "educator" | "student",
  loginValue: string,
  password: string,
) {
  await page.goto("/signin");

  // Select the role via the segmented radio control.
  const roleLabel = role === "educator" ? "Educator login" : "Student login";
  await page.getByRole("radio", { name: roleLabel }).click();

  // The first text field is labelled "Email" (educator) or "Student code"
  // (student); target by its accessible label which flips with the role.
  const idField = page.getByLabel(role === "educator" ? "Email" : "Student code");
  await expect(idField).toBeVisible();
  await idField.fill(loginValue);

  await page.getByLabel("Password").fill(password);

  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("auth → role-routing code-split (real Supabase login)", () => {
  test("student login loads StudentRoutesTree and renders the student home", async ({
    page,
  }) => {
    await login(page, "student", studentEmail, PASSWORD);

    // AreaSelector heading: "Hi, <first name>" (AreaSelector.tsx). Proves the
    // lazy StudentRoutesTree chunk loaded and the student branch routed.
    await expect(
      page.getByRole("heading", { name: /^Hi,\s/ }),
    ).toBeVisible({ timeout: 30_000 });

    // Negative guard: the staff Dashboard heading must NOT be present.
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toHaveCount(0);
  });

  test("teacher login loads StaffRoutesTree and renders the Dashboard", async ({
    page,
  }) => {
    await login(page, "educator", teacherEmail, PASSWORD);

    // DashboardPage heading: "Dashboard" (DashboardPage.tsx). Teacher home is
    // /dashboard (the "/" → /dashboard redirect lives in StaffRoutesTree).
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    // Negative guard: the student "Hi, …" home heading must NOT be present.
    await expect(page.getByRole("heading", { name: /^Hi,\s/ })).toHaveCount(0);
  });
});
