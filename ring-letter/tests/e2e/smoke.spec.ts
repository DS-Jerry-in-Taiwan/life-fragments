import { asAdmin, expect, test, WIDTHS } from "./fixtures";
import { SCREENS } from "./screens";

// Functional smoke (issue #4, section 7). Each test gets a fresh browser
// context, so no cookies are shared; the fixture erases whatever the
// test's anonymous session created.

for (const [label, viewport] of Object.entries(WIDTHS)) {
  test.describe(`${label} ${viewport.width}px`, () => {
    test.use({ viewport });
    for (const screen of SCREENS) {
      test(`${screen.name} opens`, async ({ page, context }) => {
        if (screen.admin) await asAdmin(context);
        await screen.open(page);
        await screen.ready(page);
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, "不應出現橫向捲動").toBeLessThanOrEqual(clientWidth);
      });
    }
  });
}

test("submit → 我的片段 → withdraw", async ({ page }) => {
  const title = `e2e 測試 ${Date.now()}`;
  const write = SCREENS.find((s) => s.name === "write-present")!;
  await write.open(page);
  await write.ready(page);

  await page.getByLabel("給這封信一個名字（選填）").fill(title);
  await page
    .getByLabel("剛剛發生了什麼？")
    .fill("這是自動化瀏覽器測試留下的文字，測試結束會刪除。");
  await page.getByLabel("現在的感覺").fill("平靜");
  await page.getByRole("checkbox", { name: /我已滿 18 歲，內容是我的真實經歷/ }).check();
  await page.getByRole("checkbox", { name: /我了解團隊可閱讀投稿/ }).check();
  await page.getByRole("button", { name: "留下這封信 ↗" }).click();
  await expect(page.getByRole("heading", { name: "你的文字已留下。" })).toBeVisible();

  await page.getByRole("button", { name: "查看我的片段 →" }).click();
  const story = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: title }) });
  await expect(story).toBeVisible();
  await expect(story.getByText("未公開保存")).toBeVisible();
  await expect(story.getByText("此刻心情：平靜")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await story.getByRole("button", { name: "撤回並刪除" }).click();
  await expect(page.getByRole("status").filter({ hasText: "已刪除這段文字。" })).toBeVisible();
  await expect(story).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "還沒有留下的片段" })).toBeVisible();
});
