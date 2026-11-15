import type { Page } from "@playwright/test";
import { eraseSession, expect, hydrated, test } from "./fixtures";

// Entries that aren't open yet say so on the entry itself (#51; designer
// review): /read's 留下回音 and 想參加人工媒合？ are labelled 尚未開放 and are
// not controls, so nobody presses one only to be told no. The submit button
// reads → (↗ usually means "opens another site").

async function open(page: Page, path: string) {
  await page.goto(path);
  await hydrated(page);
}

test("not open: 留下回音 on the letter is text marked 尚未開放, not a control", async ({
  page,
}) => {
  await open(page, "/read");
  const paper = page.locator("[data-letter-id]");
  const echo = paper.locator('[data-form="echo"]');
  await expect(echo).toHaveText("留下回音尚未開放");
  await expect(echo).toBeVisible();
  // Nothing to press: no link, no button, not in the Tab order.
  await expect(paper.getByRole("link", { name: /留下回音/ })).toHaveCount(0);
  await expect(paper.getByRole("button", { name: /留下回音/ })).toHaveCount(0);
  expect(await echo.evaluate((el) => el.querySelector("a, button, [tabindex]"))).toBeNull();
  // The other two actions are unchanged.
  await expect(paper.getByRole("button", { name: "有回應到我" })).toBeVisible();
  await expect(paper.getByRole("button", { name: "再讀一封" })).toBeVisible();
});

test("not open: 想參加人工媒合？ says 尚未開放 before it is opened", async ({ page }) => {
  await open(page, "/read");
  const summary = page.locator("summary", { hasText: "想參加人工媒合？" });
  await expect(summary).toContainText("尚未開放");
  await summary.click();
  const form = page.locator('[data-form="distress"]');
  await expect(form).toHaveText("前往人工媒合表單尚未開放");
  await expect(page.getByRole("link", { name: /人工媒合表單/ })).toHaveCount(0);
  await expect(page.getByText(/人工媒合開放後，會另外確認收信與文字後續使用的意願/)).toBeVisible();
  // The old click-then-refuse notice and the 1–3 天 promise are gone.
  const text = await page.locator("body").innerText();
  for (const old of ["表單尚未開放。你可以先讀信", "1–3", "天處理"])
    expect(text, old).not.toContain(old);
});

test("not open: the care note no longer points at the unopened form", async ({ page }) => {
  await open(page, "/read");
  await expect(
    page.getByText("人工媒合開放後，會另外說明如何要求撤下。", { exact: false }),
  ).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("透過媒合表單中的聯絡方式");
});

test("submit: 留下這封信 → (not ↗)", async ({ page, context }) => {
  await page.goto("/write?mode=present");
  await hydrated(page);
  await expect(page.getByRole("button", { name: "留下這封信 →" })).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain("↗");
  // Opening the form started a writing attempt; leave no data behind.
  await eraseSession(context);
});
