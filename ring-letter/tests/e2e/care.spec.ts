import type { Locator, Page } from "@playwright/test";
import { expect, hydrated, test } from "./fixtures";
import { SCREENS } from "./screens";

// 求助管道 (#34): wherever the site says it is not a counselling or
// emergency service — /read's care note, every screen of /write and the
// privacy notice (dialog and page) — the three phone lines are there as
// tel: links, and reachable by keyboard.

const LINES = [
  { name: "1925 安心專線", href: "tel:1925" },
  { name: "1995 生命線", href: "tel:1995" },
  { name: "1980 張老師", href: "tel:1980" },
];

async function expectLines(scope: Locator) {
  await expect(scope.getByText("如果你現在很難受，可以撥打這些專線：")).toBeVisible();
  await expect(scope.getByText("（24 小時）")).toBeVisible();
  for (const line of LINES) {
    const link = scope.getByRole("link", { name: line.name, exact: true });
    await expect(link).toHaveCount(1);
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", line.href);
  }
}

/** The paragraph that holds the lines: the one with the lead sentence. */
const care = (scope: Page | Locator) =>
  scope.locator("p").filter({ hasText: "如果你現在很難受，可以撥打這些專線：" });

async function open(page: Page, name: string) {
  const screen = SCREENS.find((s) => s.name === name)!;
  await screen.open(page);
  await screen.ready(page);
}

test("/read: the care note lists the lines", async ({ page }) => {
  await page.goto("/read");
  await hydrated(page);
  const note = care(page);
  await expect(note).toContainText("這裡不是諮商或緊急求助的地方。");
  await expectLines(note);
});

for (const name of ["write", "write-past", "write-present"]) {
  test(`/write (${name}): the lines are under the screen`, async ({ page }) => {
    await open(page, name);
    const note = care(page.locator("main"));
    await expect(note).toContainText("這裡不是諮商或緊急求助的地方。");
    await expectLines(note);
  });
}

test("privacy dialog lists the lines", async ({ page }) => {
  await open(page, "privacy");
  const dialog = page.getByRole("dialog", { name: "讓文字安心留下" });
  await expect(dialog).toContainText("此處不是即時對話或緊急支援服務。");
  await expectLines(care(dialog));
});

test("/privacy lists the lines", async ({ page }) => {
  await open(page, "privacy-page");
  await expectLines(care(page));
});

test("the lines are reachable by keyboard, with the site's focus ring", async ({ page }) => {
  await page.goto("/read");
  await hydrated(page);
  const first = care(page).getByRole("link", { name: LINES[0].name, exact: true });
  // Tab until the first line has focus (it is near the end of the page).
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    if (await first.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(first).toBeFocused();
  const outline = await first.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth };
  });
  expect(outline).toEqual({ style: "solid", width: "2px" });
  for (const line of LINES.slice(1)) {
    await page.keyboard.press("Tab");
    await expect(care(page).getByRole("link", { name: line.name, exact: true })).toBeFocused();
  }
});
