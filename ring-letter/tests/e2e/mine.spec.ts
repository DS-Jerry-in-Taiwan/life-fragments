import type { BrowserContext, Locator, Page } from "@playwright/test";
import {
  adminHeaders,
  answer,
  expect,
  hydrated,
  ORIGIN,
  test,
  TURNSTILE_TOKEN,
  WIDTHS,
} from "./fixtures";

// 我的片段 polish (V5-c5, #32; V5-c1 audit 「我的片段 1–6」). Phone width, where
// the result banner at the top is far above the buttons that report there.
test.use({ viewport: WIDTHS.mobile });

const sameOrigin = { Origin: ORIGIN };

/** Submits a story for this context's anonymous session through the API (no writing attempt). */
async function submit(context: BrowserContext, title: string, share = false) {
  expect(
    (await context.request.post(ORIGIN + "/api/session", { headers: sameOrigin })).status(),
  ).toBe(200);
  const r = await context.request.post(ORIGIN + "/api/me/stories", {
    headers: { ...sameOrigin, "X-Turnstile-Token": TURNSTILE_TOKEN },
    data: {
      title,
      body: "這是自動化瀏覽器測試留下的文字，用來驗證「我的片段」，測試結束會刪除。\n".repeat(6),
      era: "測試日期",
      source: "recollection",
      adult: true,
      privacy: true,
      share,
    },
  });
  expect(r.status(), await r.text()).toBe(200);
  return ((await r.json()) as { id: string }).id;
}

const card = (page: Page, title: string) =>
  page.getByRole("article").filter({ has: page.getByRole("heading", { name: title }) });

/**
 * Holds every request matching `method` + `path` until `release()`, so the
 * page's busy state (正在處理…) stays on screen long enough to look at it.
 */
async function hold(page: Page, method: string, path: RegExp) {
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  await page.route(
    (url) => path.test(url.pathname),
    async (route) => {
      if (route.request().method() !== method) return route.fallback();
      await released;
      await route.fallback();
    },
  );
  return release;
}

/** Page-relative top edges: unaffected by scrolling, only by layout. */
const tops = (locators: Locator[]) =>
  Promise.all(
    locators.map((l) => l.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)),
  );

/**
 * The focused element's text, for "the result message has focus": nothing
 * when focus fell back to the page (whose text contains the message too) or
 * sits on something as large as <main>.
 */
const focusedText = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (
      !el ||
      el === document.body ||
      el.closest("main") === el ||
      el.contains(document.querySelector("h1"))
    )
      return "";
    return el.textContent ?? "";
  });

/** WCAG 2 contrast of two sRGB colours, each as [r, g, b] 0–255. */
function contrast(a: number[], b: number[]) {
  const lum = (c: number[]) => {
    const [r, g, bl] = c.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** A computed colour, `rgb(…)` or `color(srgb …)`, as [r, g, b] 0–255. */
function rgb(css: string) {
  const srgb = css.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
  if (srgb) return srgb.slice(1, 4).map((v) => Number(v) * 255);
  const m = css.match(/^rgba?\((\d+(?:\.\d+)?),? (\d+(?:\.\d+)?),? (\d+(?:\.\d+)?)/);
  expect(m, `無法解析顏色 ${css}`).toBeTruthy();
  return m!.slice(1, 4).map(Number);
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/**
 * The lightest point behind a 我的片段 card: the night sky's radial glow
 * (#27414b66 over #122936, SiteShell.module.css) under the card's #ffffff03.
 */
const DARKEST_CARD_GLOW = hex("#1d3541");

test("撤回: the result is in view and focused, 正在處理… moves nothing; era, .danger, ☾", async ({
  page,
  context,
}) => {
  const stamp = Date.now();
  const first = `e2e 片段一 ${stamp}`;
  const second = `e2e 片段二 ${stamp}`;
  await submit(context, first);
  await submit(context, second);
  await page.goto("/mine");
  await hydrated(page);
  const h1 = page.getByRole("heading", { level: 1, name: "我的片段" });
  await expect(card(page, first)).toBeVisible();
  await expect(card(page, second)).toBeVisible();

  // The era line under the title, on the dark card.
  const era = card(page, second).getByText("測試日期");
  const eraColour = rgb(await era.evaluate((el) => getComputedStyle(el).color));
  expect(
    contrast(eraColour, DARKEST_CARD_GLOW),
    "時代標示在深色卡片 ≥ 4.5:1",
  ).toBeGreaterThanOrEqual(4.5);

  // Every .danger is a tap-sized target; 刪除我的所有資料 is one too.
  const withdraw = card(page, second).getByRole("button", { name: "撤回並刪除" });
  const eraseAll = page.getByRole("button", { name: "刪除我的所有資料" });
  for (const b of [withdraw, eraseAll])
    expect(await b.evaluate((el) => getComputedStyle(el).minHeight)).toBe("45px");
  expect(await eraseAll.evaluate((el) => el.classList.contains("danger"))).toBe(true);
  const look = (l: Locator) =>
    l.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.color, s.textDecorationLine, s.fontSize];
    });
  expect(await look(eraseAll), "全部刪除與撤回同樣是危險樣式").toEqual(await look(withdraw));

  // Withdraw the second, held at the server: while 正在處理… shows, nothing moves.
  const release = await hold(page, "DELETE", /^\/api\/me\/stories\/[^/]+$/);
  const watched = [h1, card(page, first), page.getByRole("button", { name: "在這台裝置登出" })];
  const before = await tops(watched);
  await withdraw.scrollIntoViewIfNeeded();
  await withdraw.click();
  await answer(page, "確定刪除");
  await expect(page.getByRole("status").filter({ hasText: "正在處理…" })).toBeVisible();
  expect(await tops(watched), "正在處理… 不推動版面").toEqual(before);
  await expect(h1, "撤回時頁首在畫面外").not.toBeInViewport();
  release();

  const notice = page.getByRole("status").filter({ hasText: "已刪除這段文字。" });
  await expect(notice).toBeInViewport();
  await expect.poll(() => focusedText(page), "焦點在結果訊息").toContain("已刪除這段文字。");
  await expect(card(page, second)).toHaveCount(0);
  await expect(card(page, first)).toBeVisible();

  // Withdraw the last one: the empty state, its ☾ hidden from assistive tech.
  await card(page, first).getByRole("button", { name: "撤回並刪除" }).click();
  await answer(page, "確定刪除");
  await expect(page.getByRole("heading", { name: "還沒有留下的片段" })).toBeVisible();
  await expect(page.getByRole("main").getByText("☾", { exact: true })).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect.poll(() => focusedText(page)).toContain("已刪除這段文字。");
});

test("刪除我的所有資料: the result is in view and focused (reduced motion), nothing moves", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const title = `e2e 全部刪除 ${Date.now()}`;
  await submit(context, title);
  await page.goto("/mine");
  await hydrated(page);
  const h1 = page.getByRole("heading", { level: 1, name: "我的片段" });
  await expect(card(page, title)).toBeVisible();

  const release = await hold(page, "DELETE", /^\/api\/me$/);
  const eraseAll = page.getByRole("button", { name: "刪除我的所有資料" });
  const watched = [h1, card(page, title), eraseAll];
  const before = await tops(watched);
  await eraseAll.scrollIntoViewIfNeeded();
  await eraseAll.click();
  await answer(page, "全部刪除");
  await expect(page.getByRole("status").filter({ hasText: "正在處理…" })).toBeVisible();
  expect(await tops(watched), "正在處理… 不推動版面").toEqual(before);
  await expect(h1).not.toBeInViewport();
  release();

  const notice = page.getByRole("status").filter({ hasText: "已刪除本瀏覽器對應的投稿與回饋。" });
  await expect(notice).toBeInViewport();
  await expect.poll(() => focusedText(page)).toContain("已刪除本瀏覽器對應的投稿與回饋。");
  await expect(page.getByRole("heading", { name: "還沒有留下的片段" })).toBeVisible();
});

test("在這台裝置登出: the result is in view and focused", async ({ page, context }) => {
  const title = `e2e 登出焦點 ${Date.now()}`;
  const id = await submit(context, title);
  await page.goto("/mine");
  await hydrated(page);
  await expect(card(page, title)).toBeVisible();

  const logout = page.getByRole("button", { name: "在這台裝置登出" });
  await logout.scrollIntoViewIfNeeded();
  await logout.click();
  await answer(page, "登出");
  const notice = page.getByRole("status").filter({ hasText: "已在這台裝置登出。" });
  await expect(notice).toBeInViewport();
  await expect.poll(() => focusedText(page)).toContain("已在這台裝置登出。");

  // The story stays on the server after logging out; remove it as admin.
  const removed = await context.request.post(
    `${ORIGIN}/api/admin/stories/${encodeURIComponent(id)}/moderation`,
    { headers: { ...adminHeaders(), ...sameOrigin }, data: { status: "delete" } },
  );
  expect(removed.status()).toBe(200);
});

test("StoryMeta on the archive's letter paper is ≥ 4.5:1", async ({ page, context }) => {
  const title = `e2e 信紙時代 ${Date.now()}`;
  const id = await submit(context, title, true);
  const found = await context.request.get(
    `${ORIGIN}/api/admin/stories?status=all&id=${encodeURIComponent(id)}`,
    { headers: adminHeaders() },
  );
  const listed = (
    (await found.json()).stories as { id: string; statusAt: number; consentEvents: number }[]
  ).find((s) => s.id === id)!;
  const approve = await context.request.post(
    `${ORIGIN}/api/admin/stories/${encodeURIComponent(id)}/moderation`,
    {
      headers: { ...adminHeaders(), ...sameOrigin },
      data: { status: "approved", statusAt: listed.statusAt, consentEvents: listed.consentEvents },
    },
  );
  expect(approve.status()).toBe(200);

  await page.goto("/archive");
  await hydrated(page);
  const paper = card(page, title);
  const era = paper.getByText("測試日期");
  await expect(era).toBeVisible();
  const colour = rgb(await era.evaluate((el) => getComputedStyle(el).color));
  const background = rgb(await paper.evaluate((el) => getComputedStyle(el).backgroundColor));
  expect(contrast(colour, background), "時代標示在信紙 ≥ 4.5:1").toBeGreaterThanOrEqual(4.5);
  // The fixture's erase-all removes the story (and with it the archive entry).
});
