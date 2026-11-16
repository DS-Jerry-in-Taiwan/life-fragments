import type { Page } from "@playwright/test";
import type { Story } from "../../lib/stories";
import { expect, hydrated, test } from "./fixtures";
import { SCREENS } from "./screens";

// 其餘文案 (V5-copy, #38; V5-c1 audit 首頁 4, 試讀 9, 寫信 11, 公開信箱 5,
// 外框 8): the site only describes what really exists, under one set of
// names. Each new string is there and each old one is gone.

async function open(page: Page, path: string) {
  await page.goto(path);
  await hydrated(page);
}

/** None of `old` appears anywhere on the page. */
async function gone(page: Page, old: string[]) {
  const text = await page.locator("body").innerText();
  for (const s of old) expect(text, s).not.toContain(s);
}

const DRAFT_NOTE = "已帶回上次未送出的草稿，只暫存在這個分頁。";

test("copy: home says human matching is not open yet", async ({ page }) => {
  await open(page, "/");
  await expect(
    page.getByText("人工媒合目前尚未開放；開放後由真人處理，不是即時回覆。"),
  ).toBeVisible();
  await expect(page.getByText(/這一步由真人人工媒合，目前尚未開放。/)).toBeVisible();
  await gone(page, ["1–3 天", "測試期間由真人人工媒合", "大約需要"]);
});

// #77 (Jerry, final): the hero no longer promises matching at all; step 03
// says replies come once they open.
test("copy: home doesn't promise matching; replies come once they open", async ({ page }) => {
  await open(page, "/");
  await expect(page.getByText(/^開放後，你可以回覆那封信，寫給幾年前的那個人；/)).toBeVisible();
  await gone(page, [
    "如果有相似的過去經歷，我們會試著讓那封信回應現在的你。",
    "人工媒合開放後，我們會試著讓一封相似的信回應現在的你。",
    "你可以回覆那封信，寫給幾年前的那個人。",
  ]);
});

test("copy: /read sample letters have no 媒合理由", async ({ page }) => {
  await open(page, "/read");
  await expect(page.getByRole("term").filter({ hasText: "這類信的共同處" })).toBeVisible();
  await gone(page, ["媒合理由", "這個範例配對的共同處"]);
});

test("copy: /archive is 公開信箱 everywhere", async ({ page }) => {
  await open(page, "/archive");
  // v3 D3: no eyebrow on the page (DESIGN.md); the name is the tab title and
  // the current header link.
  await expect(page).toHaveTitle("公開信箱｜Ring letter");
  await expect(
    page.getByRole("navigation", { name: "主要導覽" }).getByRole("link", { name: "公開信箱" }),
  ).toHaveAttribute("aria-current", "page");
  await gone(page, ["時光信箱"]);
});

test("copy: the reader feedback consent names 刪除我的所有資料", async ({ page }) => {
  const story: Story = {
    id: "e2e-copy-story",
    title: "文案測試的信",
    body: "這是一封虛構的測試信。",
    era: "",
    source: "recollection",
    letterType: "present",
    created: Date.UTC(2026, 9, 20, 12),
  };
  await page.route(
    (url) => url.pathname === "/api/stories",
    (route) => route.fulfill({ json: { stories: [story] } }),
  );
  await open(page, "/archive");
  await page.getByText("願意告訴我們讀起來如何嗎？").click();
  await expect(
    page.getByRole("checkbox", {
      name: /過期不再顯示並於後續清理。可用「我的片段」的「刪除我的所有資料」刪除。/,
    }),
  ).toBeVisible();
  await gone(page, ["可在「我的片段」刪除"]);
});

test("copy: the footer names 我的片段 and 資料使用說明", async ({ page }) => {
  await open(page, "/");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "我的片段", exact: true })).toBeVisible();
  await expect(footer.getByRole("button", { name: "資料使用說明" })).toBeVisible();
  await gone(page, ["先前投稿與撤回", "先前投稿資料說明"]);
  // The header brand stays.
  await expect(page.getByRole("banner").getByText("時光來信")).toBeVisible();
});

test("copy: the privacy notice says feedback goes only with everything", async ({ page }) => {
  await open(page, "/privacy");
  await expect(page.getByText("你可隨時在「我的片段」查看並撤回這個瀏覽器的投稿。")).toBeVisible();
  await expect(
    page.getByText(
      "回饋與試寫紀錄無法逐筆刪除，可用「我的片段」的「刪除我的所有資料」連同投稿一起刪除。",
    ),
  ).toBeVisible();
  await gone(page, ["查看並刪除這個瀏覽器的投稿及回饋"]);
});

test("copy: the /write chooser names 刪除我的所有資料", async ({ page }) => {
  const chooser = SCREENS.find((s) => s.name === "write")!;
  await chooser.open(page);
  await chooser.ready(page);
  await expect(
    page.getByText(/30 天存取，可用「我的片段」的「刪除我的所有資料」刪除。/),
  ).toBeVisible();
  await gone(page, ["可在「我的片段」刪除"]);
});

test("copy: /write says when it brought a draft back", async ({ page }) => {
  const write = SCREENS.find((s) => s.name === "write-present")!;
  await write.open(page);
  await write.ready(page);
  const note = page.getByText(DRAFT_NOTE);
  // A fresh letter: nothing was brought back.
  await expect(note).toHaveCount(0);

  // A reload of an empty form (its draft holds only the writing attempt): still nothing.
  await page.reload();
  await hydrated(page);
  await expect(page.getByLabel("剛剛發生了什麼？")).toBeVisible();
  await expect(note).toHaveCount(0);

  // With text typed: the reload brings it back, and says so, quietly.
  await page.getByLabel("剛剛發生了什麼？").fill("文案測試的草稿。");
  await page.reload();
  await hydrated(page);
  await expect(page.getByLabel("剛剛發生了什麼？")).toHaveValue("文案測試的草稿。");
  await expect(note).toBeVisible();
  await expect(note).not.toHaveAttribute("role", /alert|status/);

  // Back to the chooser and into the other type, which has no draft: no note.
  await page.goto("/write?mode=past");
  await hydrated(page);
  await expect(page.getByLabel("這件事大約發生在什麼時候？")).toBeVisible();
  await expect(note).toHaveCount(0);
});
