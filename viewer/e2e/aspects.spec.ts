/**
 * End-to-end check for the "Sub-type within skill" aspect filter.
 *
 * Verifies:
 *   - Switching to Advanced + no skill scope shows the panel placeholder.
 *   - Selecting Equivalent Expressions reveals labelled aspect options
 *     (the catalog labels, e.g. "Combine like terms" — not bare slugs).
 *   - Ticking an aspect option narrows the question count.
 *
 * Notes:
 *   - The sidebar uses `<label><input sr-only/><span>{label}</span></label>`
 *     for every check row. Playwright considers the sr-only input invisible,
 *     so we drive interactions by clicking the visible label text and scope
 *     to the sidebar (`complementary` role) to avoid matching list entries.
 */
import { test, expect } from "./_fixtures";

test.describe("Aspects filter", () => {
  test("Advanced mode + no skill renders the panel placeholder", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: /question list/i })).toBeVisible({
      timeout: 15_000,
    });

    // Depth selector button names include their tooltip — match by prefix.
    await page.getByRole("button", { name: /^Advanced Full facets/ }).click();

    await expect(
      page.getByText(/Select one or more skills above to reveal/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Equivalent Expressions reveals labelled aspect options", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: /question list/i })).toBeVisible({
      timeout: 15_000,
    });

    const sidebar = page.getByRole("complementary", { name: /filters/i });

    await page.getByRole("button", { name: /^Advanced Full facets/ }).click();

    // Expand the Advanced Math row so the skill children render.
    await sidebar.getByRole("button", { name: /^expand advanced math$/i }).click();

    // Click the visible skill text inside the sidebar.
    await sidebar.getByText("Equivalent expressions", { exact: true }).click();

    // The catalog supplies the human label. Bare slugs (eq-expr-combine)
    // would fail this assertion.
    // Catalog label is verbose ("Combine like terms / add or subtract
    // polynomials") — match a stable prefix.
    await expect(sidebar.getByText(/Combine like terms/i).first()).toBeVisible({
      timeout: 5_000,
    });

    // Ticking an aspect must narrow the question count.
    const header = page.locator("header").first();
    const before = (await header.innerText()) || "";
    const beforeMatch = before.match(/(\d[\d,]*)\s*questions/i);
    const beforeCount = parseInt((beforeMatch?.[1] ?? "0").replace(/,/g, ""), 10);

    await sidebar.getByText(/Combine like terms/i).first().click();
    await page.waitForTimeout(250);

    const after = (await header.innerText()) || "";
    const afterMatch = after.match(/(\d[\d,]*)\s*questions/i);
    if (afterMatch) {
      const afterCount = parseInt(afterMatch[1].replace(/,/g, ""), 10);
      expect(afterCount, "ticking an aspect should reduce the count").toBeLessThan(
        beforeCount,
      );
    }
  });
});
