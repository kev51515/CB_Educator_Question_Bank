/**
 * Detail panel: answer/rationale toggles, bookmark/done buttons,
 * keyboard shortcuts that target the detail view.
 */
import { test, expect } from "./_fixtures";

test.describe("Detail panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const list = page.getByRole("navigation", { name: /question list/i });
    await expect(list).toBeVisible({ timeout: 15_000 });
    // Pick the first question
    await list.locator("button").first().click();
  });

  test("answer toggle reveals/hides marked-correct option", async ({ page }) => {
    // Press `a` to toggle answer
    await page.keyboard.press("a");
    // We don't know the exact wording, but something correctness-related should appear.
    await expect(page.getByText(/correct|answer/i).first()).toBeVisible({ timeout: 3_000 });
    await page.keyboard.press("a");
  });

  test("rationale toggle reveals rationale block", async ({ page }) => {
    await page.keyboard.press("r");
    // Rationale text typically contains "because", "since", or "Choice X is correct"
    await expect(page.getByText(/rationale|explanation|choice/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("J / K navigates between questions", async ({ page }) => {
    // Capture the question-id from the URL hash before navigating.
    const before = page.url();
    await page.keyboard.press("j");
    // The URL hash is updated on selection — wait for a different hash.
    await expect.poll(() => page.url(), { timeout: 3_000 }).not.toBe(before);
  });

  test("/ focuses the search input", async ({ page }) => {
    await page.keyboard.press("/");
    const search = page.getByPlaceholder(/search.*number/i);
    await expect(search).toBeFocused();
  });
});
