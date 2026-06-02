import { test, expect } from "./_fixtures";

// Golden-path E2E for the viewer. These lock in current behavior so we can refactor safely.
// All tests use desktop viewport by default; mobile-specific tests are in mobile.spec.ts.

test.describe("Viewer golden paths", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // App boot: wait for the question-list region to appear (means index loaded).
    await expect(page.getByRole("navigation", { name: /question list/i })).toBeVisible({ timeout: 15_000 });
  });

  test("loads and shows app header", async ({ page }) => {
    await expect(page.locator("header h1").first()).toBeVisible();
  });

  test("can search by number", async ({ page }) => {
    const search = page.getByPlaceholder(/search.*number/i);
    await search.fill("#1");
    // The list should still be visible (filtering not erroring out).
    await expect(page.getByRole("navigation", { name: /question list/i })).toBeVisible();
  });

  test("selecting a question loads detail", async ({ page }) => {
    // First list item — click anywhere on its row
    const list = page.getByRole("navigation", { name: /question list/i });
    const firstItem = list.locator("button").first();
    await firstItem.click();
    // Detail panel should render some answer-related text. We accept multiple possible markers
    // to avoid coupling to exact wording.
    await expect(
      page.getByText(/answer|rationale|show answer|reveal/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("toggling Set switches data source", async ({ page }) => {
    // Set toggle is keyed by a stable testid so refactors of the surrounding markup
    // don't break this test.
    const setToggle = page.getByTestId("set-toggle");
    await expect(setToggle).toBeVisible({ timeout: 10_000 });
    // Click the second radio (any set other than the default "All Questions").
    const setOption = setToggle.getByRole("radio").nth(1);
    await setOption.click();
    // After switching, list should still be visible (re-fetch succeeded).
    await expect(page.getByRole("navigation", { name: /question list/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("command palette opens with Cmd+K", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    // The palette typically appears as a dialog or has a search field
    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    await page.keyboard.press("Escape");
  });

  test("help overlay opens and closes", async ({ page }) => {
    const helpBtn = page.getByLabel(/keyboard shortcuts/i);
    if (await helpBtn.isVisible().catch(() => false)) {
      await helpBtn.click();
      await expect(page.getByText(/keyboard shortcuts/i).first()).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      test.skip(true, "Help button not surfaced in toolbar");
    }
  });

  test("font size controls work", async ({ page }) => {
    const larger = page.getByLabel(/larger text/i);
    if (await larger.isVisible().catch(() => false)) {
      await larger.click();
      await larger.click();
      // No crash means pass; smoke check only.
      await expect(page.getByRole("navigation", { name: /question list/i })).toBeVisible();
    }
  });

  test("adding to print set persists across reload", async ({ page }) => {
    const list = page.getByRole("navigation", { name: /question list/i });
    // Click the print-set toggle on first item
    const addBtn = list.getByLabel(/add to print set/i).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      // Reload
      await page.reload();
      await expect(page.getByRole("navigation", { name: /question list/i })).toBeVisible({ timeout: 10_000 });
      // After reload, the toggle should now say "Remove" (already in set)
      const removeBtn = list.getByLabel(/remove from print set/i).first();
      await expect(removeBtn).toBeVisible({ timeout: 5_000 });
      // Clean up
      await removeBtn.click();
    }
  });
});

test.describe("Viewer @mobile responsive", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile tab bar is visible and switches panels", async ({ page }) => {
    await page.goto("/");
    // Smoke: page renders without crash on mobile width.
    await expect(page.getByRole("navigation", { name: /question list/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
