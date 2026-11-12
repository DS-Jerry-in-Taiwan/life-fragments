import { asAdmin, expect, hydrated, test, WIDTHS } from "./fixtures";
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

test("all 7 routes load directly", async ({ page, context }) => {
  await asAdmin(context);
  for (const [path, heading] of [
    ["/", /寫下你的/],
    ["/read", "先讀一封，不必先寫"],
    ["/write", "你今天想怎麼寫？"],
    ["/mine", "我的片段"],
    ["/archive", /有一段生活/],
    ["/admin", "把關每一封來信"],
    ["/privacy", "讓文字安心留下"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  }
});

test("routes: nav buttons change the URL and the back button works", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const nav = page.getByRole("navigation", { name: "主要導覽" });
  await nav.getByRole("button", { name: "讀一封信" }).click();
  await expect(page).toHaveURL(/\/read$/);
  await nav.getByRole("button", { name: "我的片段" }).click();
  await expect(page).toHaveURL(/\/mine$/);
  await expect(page.getByRole("heading", { level: 1, name: "我的片段" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/read$/);
  await expect(page.getByRole("heading", { name: "先讀一封，不必先寫" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: /寫下你的/ })).toBeVisible();
  await page.getByRole("contentinfo").getByRole("button", { name: "先前公開信箱" }).click();
  await expect(page).toHaveURL(/\/archive$/);
});

test("write: choosing a type sets ?mode=, and the link opens the form directly", async ({
  page,
}) => {
  await page.goto("/write");
  await hydrated(page);
  await page.getByRole("button", { name: /有一段過去/ }).click();
  await expect(page).toHaveURL(/\/write\?mode=past$/);
  await expect(page.getByRole("heading", { level: 1, name: "回想一段經歷" })).toBeVisible();
  // Nav 寫一封信 goes back to the chooser, as in v1.
  await page
    .getByRole("navigation", { name: "主要導覽" })
    .getByRole("button", { name: "寫一封信" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "你今天想怎麼寫？" })).toBeVisible();
  // Direct link: the form opens and the writing attempt is recorded.
  const started = page.waitForResponse(
    (r) => r.url().endsWith("/api/letter") && r.request().postData()?.includes('"start"') === true,
  );
  await page.goto("/write?mode=present");
  await expect(page.getByRole("heading", { level: 1, name: "記下此刻" })).toBeVisible();
  expect((await started).ok()).toBe(true);
});
