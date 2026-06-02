/**
 * Visual verification of the SPR-badge + inline-math fixes.
 * Captures targeted screenshots and asserts behavior matches expectations.
 */
import { test, expect } from "./_fixtures";

test.describe("Visual check — formatting fixes", () => {
  test("SPR badge lives in the metadata row, not the action row", async ({ page }) => {
    await page.goto("/");
    const list = page.getByRole("navigation", { name: /question list/i });
    await expect(list).toBeVisible({ timeout: 15_000 });

    // Walk through list entries until we hit an SPR question. SPR is sparse
    // (only a few hundred of 3,444), so cast a wider net than the initial
    // viewport — 80 is enough to virtually guarantee a hit at any sort order.
    const buttons = list.locator("button.w-full");
    const count = Math.min(await buttons.count(), 80);
    let foundSpr = false;
    for (let i = 0; i < count; i++) {
      await buttons.nth(i).click();
      await page.waitForTimeout(120);
      const sprVisible = await page
        .locator("header")
        .getByText(/^SPR$/)
        .first()
        .isVisible()
        .catch(() => false);
      if (sprVisible) {
        foundSpr = true;
        break;
      }
    }
    expect(foundSpr, "expected to find at least one SPR question in the first 30").toBe(true);

    // The action row (with #N + bookmark/done/print-set buttons) must NOT contain SPR.
    const actionRow = page.locator("header div.flex.items-start.justify-between").first();
    await expect(actionRow.getByText(/^SPR$/)).toHaveCount(0);

    // The SPR badge sits next to the difficulty chip — assert horizontal alignment.
    const sprBadge = page.locator("header").getByText(/^SPR$/).first();
    const difficulty = page.locator("header").getByText(/^(Easy|Medium|Hard)$/).first();
    const sprBox = await sprBadge.boundingBox();
    const diffBox = await difficulty.boundingBox();
    expect(sprBox).not.toBeNull();
    expect(diffBox).not.toBeNull();
    if (sprBox && diffBox) {
      const dy = Math.abs(sprBox.y + sprBox.height / 2 - (diffBox.y + diffBox.height / 2));
      expect(dy, "SPR badge should be vertically centered with difficulty").toBeLessThan(10);
    }

    await page.screenshot({
      path: "test-results/visual-spr-header.png",
      clip: { x: 0, y: 0, width: 1280, height: 240 },
    });
  });

  test("inline math reflows into the surrounding sentence", async ({ page }) => {
    await page.goto("/");
    const list = page.getByRole("navigation", { name: /question list/i });
    await expect(list).toBeVisible({ timeout: 15_000 });

    // Walk until we hit a question whose stem contains <math>.
    const buttons = list.locator("button.w-full");
    const count = Math.min(await buttons.count(), 30);
    let leftover = -1;
    for (let i = 0; i < count; i++) {
      await buttons.nth(i).click();
      await page.waitForTimeout(250);
      const hasMath = await page.locator("main math").first().isVisible().catch(() => false);
      if (!hasMath) continue;
      // Only count math-only <p> that sit BETWEEN paragraphs containing text —
      // those are stem reflow misses. Answer choices are standalone <p><math/></p>
      // by design and don't need merging.
      leftover = await page.evaluate(() => {
        const stems = document.querySelectorAll("main .q-html");
        let bad = 0;
        for (const root of Array.from(stems)) {
          const ps = Array.from(root.querySelectorAll(":scope > p"));
          for (const p of ps) {
            const onlyMath =
              p.childElementCount === 1 &&
              p.firstElementChild?.tagName.toLowerCase() === "math" &&
              p.firstElementChild.getAttribute("display") !== "block" &&
              (p.textContent ?? "").trim() ===
                (p.firstElementChild.textContent ?? "").trim();
            if (!onlyMath) continue;
            const prev = p.previousElementSibling;
            const next = p.nextElementSibling;
            // Stem reflow target: math-only <p> sitting between text-containing <p>s.
            if (
              prev && prev.tagName === "P" &&
              next && next.tagName === "P"
            ) bad++;
          }
        }
        return bad;
      });
      break;
    }
    expect(leftover, "found a question with math").toBeGreaterThanOrEqual(0);

    await page.locator("main").first().screenshot({
      path: "test-results/visual-stem-math.png",
    });

    expect(
      leftover,
      "no math-only <p> wrappers should survive QuestionHtml's preprocessing pass",
    ).toBe(0);
  });
});
