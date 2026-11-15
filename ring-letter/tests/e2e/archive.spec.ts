import type { Page } from "@playwright/test";
import type { Story } from "../../lib/stories";
import { expect, hydrated, settle, test, WIDTHS } from "./fixtures";

// 公開信箱 polish (V5-c6, #33; V5-c1 audit 「公開信箱 1–4」). The approved
// stories come from a mocked GET /api/stories, so the page and its baselines
// don't depend on what is in the local D1 (visual.spec.ts's `archive` shot is
// the empty state of a fresh DB). The stories are fictional.

const STORIES: Story[] = [
  {
    id: "e2e-archive-past",
    title: "那年冬天的公車站",
    body: "高三那年冬天，我每天搭最後一班公車回家。\n站牌下的路燈壞了半邊，我常在那裡背單字，一邊等車一邊數著呼出的白氣。\n有一天司機多等了我一下，說：「慢慢來，車會等你。」那句話我記到現在。",
    era: "高三的冬天",
    source: "recollection",
    letterType: "past",
    created: Date.UTC(2026, 9, 3, 4),
    reflection: "後來才知道，被等待的感覺，可以撐過很多個晚上。",
  },
  {
    id: "e2e-archive-present",
    title: "今天的陽台",
    body: "下班回家，陽台的薄荷又長高了一點。\n今天沒有什麼特別的事，只是想記下來：我還在照顧一些小東西，它們也在照顧我。",
    era: "",
    source: "recollection",
    letterType: "present",
    created: Date.UTC(2026, 9, 20, 12),
    mood: "平靜",
  },
];

/** /archive with `stories` approved; returns the letter paper. */
async function open(page: Page, stories: Story[]) {
  await page.route(
    (url) => url.pathname === "/api/stories",
    (route) => route.fulfill({ json: { stories } }),
  );
  await page.goto("/archive");
  await hydrated(page);
  await expect(page.getByRole("heading", { name: stories[0].title })).toBeVisible();
  return page.locator("article[data-story-id]");
}

const feedbackBox = (page: Page) => page.locator("details");
const summary = (page: Page) => page.getByText("願意告訴我們讀起來如何嗎？");
const consent = (page: Page) => page.getByRole("checkbox", { name: /同意保存本次回饋/ });
const FEEDBACK_BUTTONS = ["有一點共鳴", "沒有特別感覺", "想繼續讀", "送出回饋", "回報這篇有問題"];

test("archive: with one story there is no 再讀一封", async ({ page }) => {
  const letter = await open(page, STORIES.slice(0, 1));
  await expect(letter).toHaveCount(1);
  await expect(page.getByRole("button", { name: /再讀一封/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "留下我的片段" })).toBeVisible();
});

test("archive: 再讀一封 brings the next story into view and focuses it", async ({ page }) => {
  const letter = await open(page, STORIES);
  await expect(letter).toHaveAttribute("data-story-id", STORIES[0].id);
  // Opening the page does not move focus to the letter.
  await expect(letter).not.toBeFocused();
  const topInView = () =>
    expect
      .poll(() =>
        letter.evaluate((el) => {
          const top = el.getBoundingClientRect().top;
          return top >= -1 && top < innerHeight / 2;
        }),
      )
      .toBe(true);

  await page.getByRole("button", { name: "再讀一封 →" }).click();
  await expect(letter).toHaveAttribute("data-story-id", STORIES[1].id);
  await expect(letter).toBeFocused();
  await topInView();
  // A mouse click doesn't draw the ring.
  expect(await letter.evaluate((el) => el.matches(":focus-visible"))).toBe(false);

  // From the keyboard, the focused letter shows a visible ring; it wraps around.
  await page.getByRole("button", { name: "再讀一封 →" }).focus();
  await page.keyboard.press("Enter");
  await expect(letter).toHaveAttribute("data-story-id", STORIES[0].id);
  await expect(letter).toBeFocused();
  expect(
    await letter.evaluate((el) => {
      const s = getComputedStyle(el);
      return el.matches(":focus-visible") && s.outlineStyle !== "none" && s.outlineWidth !== "0px";
    }),
  ).toBe(true);
});

test("archive: the story meta on the paper is at least 4.5:1", async ({ page }) => {
  const letter = await open(page, STORIES.slice(0, 1));
  const meta = letter.getByText(/^回憶信 · 事件：高三的冬天/);
  await expect(meta).toBeVisible();
  const ratio = await meta.evaluate((el) => {
    const rgb = (c: string) => c.match(/\d+/g)!.slice(0, 3).map(Number);
    const lum = (c: string) => {
      const [r, g, b] = rgb(c).map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const fg = lum(getComputedStyle(el).color);
    const bg = lum(getComputedStyle(el.closest("article")!).backgroundColor);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test("archive: the feedback summary is a 44px target; buttons wait for the consent", async ({
  page,
}) => {
  await open(page, STORIES.slice(0, 1));
  expect((await summary(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await summary(page).click();
  await expect(consent(page)).not.toBeChecked();
  for (const name of FEEDBACK_BUTTONS) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAccessibleDescription(/^我已滿 18 歲，同意保存本次回饋/);
  }
  await consent(page).check();
  for (const name of FEEDBACK_BUTTONS) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toHaveAccessibleDescription("");
    // 送出回饋 also needs a note.
    if (name === "送出回饋") await expect(button).toBeDisabled();
    else await expect(button).toBeEnabled();
  }
});

test("archive: feedback errors and results show inside the feedback box", async ({ page }) => {
  const letter = await open(page, STORIES);
  let fail = true;
  await page.route(
    (url) => url.pathname === "/api/feedback",
    (route) =>
      fail
        ? route.fulfill({ status: 404, json: { error: "找不到這篇文章。" } })
        : route.fulfill({ json: { ok: true } }),
  );
  await summary(page).click();
  await consent(page).check();
  const box = feedbackBox(page);

  await page.getByRole("button", { name: "有一點共鳴" }).click();
  await expect(box.getByRole("alert")).toHaveText(/找不到這篇文章。/);
  await expect(page.getByRole("alert")).toHaveCount(1);

  fail = false;
  await page.getByRole("button", { name: "有一點共鳴" }).click();
  await expect(box.getByRole("status")).toHaveText("謝謝，你的回饋已保存。");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(1);

  // 想繼續讀 turns to the next story, as 再讀一封 does.
  await page.getByRole("button", { name: "想繼續讀" }).click();
  await expect(letter).toHaveAttribute("data-story-id", STORIES[1].id);
  await expect(letter).toBeFocused();
  await expect(box.getByRole("status")).toHaveText("翻到另一段故事。");

  // 再讀一封 clears the box's message.
  await page.getByRole("button", { name: "再讀一封 →" }).click();
  await expect(letter).toHaveAttribute("data-story-id", STORIES[0].id);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("archive: with one story, 想繼續讀 is recorded without turning", async ({ page }) => {
  const letter = await open(page, STORIES.slice(0, 1));
  await page.route(
    (url) => url.pathname === "/api/feedback",
    (route) => route.fulfill({ json: { ok: true } }),
  );
  await summary(page).click();
  await consent(page).check();
  await page.getByRole("button", { name: "想繼續讀" }).click();
  await expect(feedbackBox(page).getByRole("status")).toHaveText("謝謝，你的回饋已保存。");
  await expect(letter).not.toBeFocused();
});

// Baselines of the page with stories (visual.spec.ts has the empty one), the
// feedback box open and its consent not yet ticked.
test.describe("archive with stories (screenshots)", () => {
  test.skip(
    !process.env.E2E_VISUAL,
    "截圖只在 Playwright 容器裡比對：用 npm run test:e2e（或設 E2E_VISUAL=1）",
  );
  for (const viewport of Object.values(WIDTHS)) {
    test(`archive-stories-${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, STORIES);
      await summary(page).click();
      await expect(consent(page)).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`archive-stories-${viewport.width}.png`, {
        fullPage: true,
      });
    });
  }
});
