import { expect, test, type Page } from "@playwright/test";

const chips = (page: Page) => page.locator('ul[aria-label="Selected skills"] > li[data-chip]');
const order = async (page: Page) => (await chips(page).allInnerTexts()).map((t) => t.replace(/^\d\s*/, "").trim());
const box = (page: Page) => page.getByRole("combobox", { name: "Skills" });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(chips(page)).toHaveCount(2);
});

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "keyboard and mouse flows");

  test("Enter adds the highlighted suggestion, not the raw text", async ({ page }) => {
    await box(page).fill("typesc");
    await expect(page.getByRole("option").first()).toContainText("TypeScript");
    await page.keyboard.press("Enter");
    expect(await order(page)).toEqual(["Figma", "React", "TypeScript"]);
  });

  test("typos still find the right skill", async ({ page }) => {
    await box(page).fill("typscript");
    await expect(page.getByText("Did you mean")).toBeVisible();
    await expect(page.getByRole("option").first()).toContainText("TypeScript");
  });

  test("undo and redo with the keyboard", async ({ page }) => {
    await box(page).fill("vue");
    await page.keyboard.press("Enter");
    await expect(chips(page)).toHaveCount(3);
    await page.keyboard.press("Control+z");
    await expect(chips(page)).toHaveCount(2);
    await page.keyboard.press("Control+Shift+z");
    await expect(chips(page)).toHaveCount(3);
  });

  test("removing shows a floating undo that brings the tag back", async ({ page }) => {
    await page.getByRole("button", { name: "Remove React" }).click();
    await expect(chips(page)).toHaveCount(1);
    await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
    expect(await order(page)).toEqual(["Figma", "React"]);
  });

  test("a tag that does not fit the budget is refused with the reason", async ({ page }) => {
    for (const tag of ["Adobe Illustrator", "Interaction design", "Information architecture", "Mobile app design", "Usability testing"]) {
      await box(page).fill(`${tag},`);
    }
    await expect(page.getByText(/only \d+ left/).first()).toBeVisible();
  });

  test("Alt + arrow keys reorder, and focus stays on the moved tag", async ({ page }) => {
    await page.getByRole("button", { name: "Remove React" }).focus();
    await page.keyboard.press("Alt+ArrowLeft");
    expect(await order(page)).toEqual(["React", "Figma"]);
    await expect(page.getByRole("button", { name: "Remove React" })).toBeFocused();
    await expect(page.getByText(/React moved to position 1 of 2/)).toBeAttached();
    // The profile preview follows the new order.
    await expect(page.getByLabel("Profile preview").locator("li").first()).toContainText("React");
  });

  test("dragging a tag onto another reorders them", async ({ page }) => {
    const react = chips(page).filter({ hasText: "React" });
    const figma = chips(page).filter({ hasText: "Figma" });
    const from = (await react.boundingBox())!;
    const to = (await figma.boundingBox())!;
    await page.mouse.move(from.x + 20, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x - 5, from.y + from.height / 2, { steps: 4 });
    await page.mouse.move(to.x + 15, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => order(page)).toEqual(["React", "Figma"]);
  });

  test("online search shows a loading state, then results, and picking one adds it", async ({ page }) => {
    await box(page).fill("rust");
    await expect(page.getByText("Searching more skills…")).toBeVisible();
    await expect(page.getByRole("option", { name: /Rust/ })).toBeVisible();
    await page.getByRole("option", { name: /Rust/ }).click();
    expect(await order(page)).toContain("Rust");
    // It keeps its category colour and label.
    await expect(chips(page).filter({ hasText: "Rust" })).not.toHaveAttribute("title", "Custom skill");
  });

  test("a failed online search can be retried", async ({ page }) => {
    await box(page).fill("fail");
    await expect(page.getByText("Could not load more skills.")).toBeVisible();
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Could not load more skills.")).toBeHidden();
  });

  test("required: saving with nothing picked is blocked with a clear message", async ({ page }) => {
    await page.getByRole("button", { name: "Clear all" }).click();
    await page.getByRole("button", { name: "Save skills" }).click();
    await expect(page.getByRole("alert")).toHaveText("Pick at least one skill");
    await expect(page.getByText(/^Saved/)).toHaveCount(0);
    await box(page).fill("css");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Save skills" }).click();
    await expect(page.getByText("Saved 1 skill")).toBeVisible();
  });

  test("read only and disabled remove every control", async ({ page }) => {
    await page.getByRole("button", { name: "Read only" }).click();
    await expect(box(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove React" })).toHaveCount(0);
    await expect(chips(page)).toHaveCount(2);
    await page.getByRole("button", { name: "Disabled" }).click();
    await expect(page.getByRole("button", { name: "Save skills" })).toBeDisabled();
  });

  test("analytics events record where each add came from", async ({ page }) => {
    await page.getByText("Analytics events").click();
    await box(page).fill("vue");
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Recent events")).toContainText("add · Vue · suggestion #0");
  });
});

test.describe("mobile", () => {
  test.skip(({ isMobile }) => !isMobile, "touch layout");

  test("tapping the box opens a full-screen sheet and Done closes it", async ({ page }) => {
    await box(page).tap();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await box(page).fill("mo");
    await page.getByRole("option").first().tap();
    await sheet.getByRole("button", { name: "Done" }).tap();
    await expect(sheet).toHaveCount(0);
    expect(await order(page)).toContain("Motion design");
  });

  test("the page never scrolls sideways", async ({ page }) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("touch targets are at least 32px tall", async ({ page }) => {
    const pill = page.getByRole("button", { name: /^Prototyping/ });
    expect((await pill.boundingBox())!.height).toBeGreaterThanOrEqual(32);
  });
});
