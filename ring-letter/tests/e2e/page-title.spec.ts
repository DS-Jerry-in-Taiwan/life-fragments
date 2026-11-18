import type { Page } from "@playwright/test";
import { adminHeaders, asAdmin, expect, hydrated, test } from "./fixtures";

// Page titles and the skip link (#50; designer review, WCAG 2.4.2 / 2.4.1):
// tabs, bookmarks, history and screen readers can tell the pages apart, and
// a keyboard user can jump past the header to the content.

const TITLES = [
  ["/", "Ring letter｜遇見另一段時光"],
  ["/read", "讀一封信｜Ring letter"],
  ["/archive", "公開信箱｜Ring letter"],
  ["/write", "寫一封信｜Ring letter"],
  ["/mine", "我的片段｜Ring letter"],
  ["/privacy", "資料使用說明｜Ring letter"],
  ["/admin", "管理信箱｜Ring letter"],
] as const;

const titleOf = (html: string) => html.match(/<title>([^<]*)<\/title>/)?.[1];

test("title: every route has its own title in the server HTML", async ({ request }) => {
  for (const [path, title] of TITLES) {
    const r = await request.get(path, { headers: path === "/admin" ? adminHeaders() : {} });
    expect(r.status(), path).toBe(200);
    expect(titleOf(await r.text()), path).toBe(title);
  }
});

test("title: client navigation changes the title", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  await expect(page).toHaveTitle("Ring letter｜遇見另一段時光");
  const nav = page.getByRole("navigation", { name: "主要導覽" });
  await nav.getByRole("link", { name: "公開信箱" }).click();
  await expect(page).toHaveURL(/\/archive$/);
  await expect(page).toHaveTitle("公開信箱｜Ring letter");
  await nav.getByRole("link", { name: "寫一封信" }).click();
  await expect(page).toHaveTitle("寫一封信｜Ring letter");
});

const skip = (page: Page) => page.getByRole("link", { name: "跳到主要內容" });

/** Is any part of the element inside the viewport? */
const onScreen = (page: Page) =>
  skip(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  });

for (const [path] of TITLES) {
  test(`skip link: first Tab stop on ${path}, moves focus to main`, async ({ page, context }) => {
    if (path === "/admin") await asAdmin(context);
    await page.goto(path);
    await hydrated(page);
    // /admin's controls are disabled until its lists load; the Tab after the
    // skip link would pass over them into the footer.
    if (path === "/admin")
      await expect(page.getByRole("button", { name: "重新整理" })).toBeEnabled();
    // /archive's links (the empty state's) appear once the mailbox has loaded.
    if (path === "/archive") await expect(page.getByText("正在查看信箱…")).toHaveCount(0);
    expect(await onScreen(page), "平常看不到").toBe(false);

    await page.keyboard.press("Tab");
    await expect(skip(page)).toBeFocused();
    expect(await onScreen(page), "取得焦點時看得到").toBe(true);

    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    expect(new URL(page.url()).hash, "網址不加 #main").toBe("");
    expect(await onScreen(page)).toBe(false);

    // The next Tab continues inside the content, not back in the header.
    await page.keyboard.press("Tab");
    const inMain = await page.evaluate(
      () =>
        !!document.activeElement?.closest("main") &&
        document.activeElement !== document.querySelector("main"),
    );
    expect(inMain, "下一個 Tab 在主要內容裡").toBe(true);
  });
}
