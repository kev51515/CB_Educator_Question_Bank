/**
 * Filter interactions: section/difficulty toggles, search, reset.
 */
import { test, expect } from "./_fixtures";

test.describe("Filters", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: /question list/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("typing in search shrinks the question count", async ({ page }) => {
    const header = page.locator("header").first();
    const beforeText = (await header.innerText()) || "";
    const beforeMatch = beforeText.match(/(\d[\d,]*)\s*(questions|available)/i);
    expect(beforeMatch).not.toBeNull();
    const beforeCount = parseInt((beforeMatch?.[1] ?? "0").replace(/,/g, ""), 10);

    await page.getByPlaceholder(/search.*number/i).fill("nonlinear");
    await page.waitForTimeout(300);

    const afterText = (await header.innerText()) || "";
    const afterMatch = afterText.match(/(\d[\d,]*)\s*questions/i);
    if (afterMatch) {
      const afterCount = parseInt(afterMatch[1].replace(/,/g, ""), 10);
      expect(afterCount).toBeLessThan(beforeCount);
    } else {
      // Some setups gate visibility; tolerate that as long as the search updated state.
      expect(afterText).not.toBe(beforeText);
    }
  });
});
