import type { Locator, Page } from "@playwright/test";
import { asAdmin, expect, hydrated, test } from "./fixtures";
import { SCREENS } from "./screens";

// In-site navigation as real links (V5-nav, #36; V5-c1 audit 「共用外框 2」):
// every NavButton is an <a href>, a plain click stays client-side, a modified
// click is left to the browser, and the current page is aria-current="page".

const NAV = [
  ["/read", "讀一封信"],
  ["/archive", "公開信箱"],
  ["/write", "寫一封信"],
  ["/mine", "我的片段"],
] as const;

const banner = (page: Page) => page.getByRole("banner");
const nav = (page: Page) => page.getByRole("navigation", { name: "主要導覽" });
const footer = (page: Page) => page.getByRole("contentinfo");
const brand = (page: Page) => banner(page).getByRole("link", { name: /^Ring letter/ });

async function open(page: Page, path: string) {
  await page.goto(path);
  await hydrated(page);
}

async function expectLink(link: Locator, href: string) {
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", href);
}

/**
 * Only the header link to `path` (the brand on /, a nav item on its route,
 * none elsewhere) carries aria-current.
 */
async function expectCurrent(page: Page, path: string) {
  if (path === "/") await expect(brand(page)).toHaveAttribute("aria-current", "page");
  else await expect(brand(page)).not.toHaveAttribute("aria-current", /./);
  for (const [to, label] of NAV) {
    const link = nav(page).getByRole("link", { name: label, exact: true });
    if (to === path) await expect(link).toHaveAttribute("aria-current", "page");
    else await expect(link).not.toHaveAttribute("aria-current", /./);
  }
  const marked = path === "/" || NAV.some(([to]) => to === path);
  await expect(banner(page).locator("[aria-current]")).toHaveCount(marked ? 1 : 0);
}

test("nav: header and footer links have their addresses", async ({ page }) => {
  await open(page, "/");
  await expectLink(brand(page), "/");
  for (const [to, label] of NAV) {
    await expectLink(nav(page).getByRole("link", { name: label, exact: true }), to);
  }
  await expectLink(footer(page).getByRole("link", { name: "先前投稿與撤回" }), "/mine");
  // Not a NavButton: a full page load, so Cloudflare Access can sign in.
  await expectLink(footer(page).getByRole("link", { name: "管理者登入" }), "/admin");
});

test("nav: the links inside the pages have their addresses", async ({ page }) => {
  await open(page, "/");
  const read = page.getByRole("main").getByRole("link", { name: "先讀一封", exact: true });
  await expect(read, "Hero and MatchingExplanation").toHaveCount(2);
  for (const link of await read.all()) await expectLink(link, "/read");
  await expectLink(page.getByRole("link", { name: "我想寫一封", exact: true }), "/write");

  await open(page, "/read");
  await expectLink(
    page.getByRole("main").getByRole("link", { name: "寫一封信", exact: true }),
    "/write",
  );

  await open(page, "/archive");
  await expectLink(page.getByRole("link", { name: "讀一封範例信 →" }), "/read");
  await expectLink(page.getByRole("link", { name: "留下我的片段" }), "/write");

  await open(page, "/mine");
  await expectLink(page.getByRole("link", { name: "留下此刻 →" }), "/write");
});

test("nav: 查看我的片段 after sending a letter links to /mine", async ({ page }) => {
  const write = SCREENS.find((s) => s.name === "write-present")!;
  await write.open(page);
  await write.ready(page);
  await page
    .getByLabel("剛剛發生了什麼？")
    .fill("這是自動化瀏覽器測試留下的文字，測試結束會刪除。");
  await page.getByLabel("現在的感覺").fill("平靜");
  await page.getByRole("checkbox", { name: /我已滿 18 歲，內容是我的真實經歷/ }).check();
  await page.getByRole("checkbox", { name: /我了解團隊可閱讀投稿/ }).check();
  await page.getByRole("button", { name: "留下這封信 ↗" }).click();
  await expectLink(page.getByRole("link", { name: "查看我的片段 →" }), "/mine");
  await expectCurrent(page, "/write");
});

test("nav: the admin footer link has its address and marks /admin", async ({ page, context }) => {
  await asAdmin(context);
  const admin = SCREENS.find((s) => s.name === "admin")!;
  await admin.open(page);
  await admin.ready(page);
  const link = footer(page).getByRole("link", { name: "管理信箱" });
  await expectLink(link, "/admin");
  await expect(link).toHaveAttribute("aria-current", "page");
  await expectCurrent(page, "/admin");
});

test("nav: a plain click navigates without reloading the page", async ({ page }) => {
  await open(page, "/");
  await page.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true));
  const kept = () => page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept);

  await nav(page).getByRole("link", { name: "讀一封信" }).click();
  await expect(page).toHaveURL(/\/read$/);
  await expect(page.getByRole("heading", { level: 1, name: "先讀一封，不必先寫" })).toBeVisible();
  expect(await kept(), "沒有整頁重新載入").toBe(true);

  await footer(page).getByRole("link", { name: "先前投稿與撤回" }).click();
  await expect(page).toHaveURL(/\/mine$/);
  await expect(page.getByRole("heading", { level: 1, name: "我的片段" })).toBeVisible();
  expect(await kept()).toBe(true);

  await brand(page).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: /寫下你的/ })).toBeVisible();
  expect(await kept()).toBe(true);
});

const MODIFIED_CLICKS: [string, Parameters<Locator["click"]>[0]][] = [
  ["Ctrl+click", { modifiers: ["ControlOrMeta"] }],
  ["middle click", { button: "middle" }],
];
for (const [how, click] of MODIFIED_CLICKS) {
  test(`nav: ${how} opens the link in a new tab and leaves this page`, async ({
    page,
    context,
  }) => {
    await open(page, "/");
    await page.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true));
    const opened = context.waitForEvent("page");
    await nav(page).getByRole("link", { name: "公開信箱" }).click(click);
    const tab = await opened;
    await tab.waitForLoadState("domcontentloaded");
    expect(new URL(tab.url()).pathname).toBe("/archive");
    await expect(tab.getByRole("heading", { level: 1, name: /有一段生活/ })).toBeVisible();
    await tab.close();

    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("heading", { level: 1, name: /寫下你的/ })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(
      true,
    );
    await expectCurrent(page, "/");
  });
}

test("nav: the current page's header link is aria-current", async ({ page }) => {
  // On the home page, the brand: nothing else on it links to /.
  await open(page, "/");
  await expectCurrent(page, "/");
  await expect(page.locator("[aria-current]")).toHaveCount(1);

  for (const [to] of NAV) {
    await open(page, to);
    await expectCurrent(page, to);
  }

  // The footer's /mine link is the current page there too.
  await open(page, "/mine");
  await expect(footer(page).getByRole("link", { name: "先前投稿與撤回" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // The query doesn't matter: /write?mode=past is still 寫一封信.
  await open(page, "/write?mode=past");
  await expect(page.getByRole("heading", { level: 1, name: "回想一段經歷" })).toBeVisible();
  await expectCurrent(page, "/write");

  // Client navigation moves the mark.
  await nav(page).getByRole("link", { name: "公開信箱" }).click();
  await expect(page).toHaveURL(/\/archive$/);
  await expectCurrent(page, "/archive");
});

test("nav: the active header link looks as before", async ({ page }) => {
  await open(page, "/read");
  const active = nav(page).getByRole("link", { name: "讀一封信" });
  const other = nav(page).getByRole("link", { name: "公開信箱" });
  const style = (l: Locator) =>
    l.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, border: s.borderBottomColor, decoration: s.textDecorationLine };
    });
  const gold = "rgb(220, 201, 155)";
  expect(await style(active)).toEqual({ color: gold, border: gold, decoration: "none" });
  expect((await style(other)).color).not.toBe(gold);
});
