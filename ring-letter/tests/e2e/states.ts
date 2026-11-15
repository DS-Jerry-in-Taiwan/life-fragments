import type { BrowserContext, Page } from "@playwright/test";
import type { AdminEvent, AdminFeedback, AdminStory, Story } from "../../lib/stories";
import { expect, hydrated, ORIGIN, TURNSTILE_TOKEN } from "./fixtures";
import { SCREENS } from "./screens";

/**
 * The states the V5-d QA (#39) checks (a11y.spec.ts, qa.spec.ts): the seven
 * routes as first opened, then the screens and open dialogs reached from
 * them, and the pages with data (mocked, or submitted through the API for
 * 我的片段; the fixture erases the session afterwards). All data is fictional.
 */
export type State = {
  name: string;
  /** One of the seven routes as first opened (checked at every width). */
  route?: boolean;
  admin?: boolean;
  open: (page: Page, context: BrowserContext) => Promise<void>;
};

const screen = (name: string) => {
  const s = SCREENS.find((x) => x.name === name)!;
  return async (page: Page) => {
    await s.open(page);
    await s.ready(page);
  };
};

export const STORIES: [Story, Story] = [
  {
    id: "e2e-qa-past",
    title: "那年冬天的公車站",
    body: "高三那年冬天，我每天搭最後一班公車回家。\n有一天司機多等了我一下，說：「慢慢來，車會等你。」",
    era: "高三的冬天",
    source: "recollection",
    letterType: "past",
    created: Date.UTC(2026, 9, 3, 4),
    reflection: "後來才知道，被等待的感覺，可以撐過很多個晚上。",
  },
  {
    id: "e2e-qa-present",
    title: "今天的陽台",
    body: "下班回家，陽台的薄荷又長高了一點。",
    era: "",
    source: "recollection",
    letterType: "present",
    created: Date.UTC(2026, 9, 20, 12),
    mood: "平靜",
  },
];

/** /archive with two mocked approved stories, the feedback box open. */
export async function archiveWithStories(page: Page) {
  await page.route(
    (url) => url.pathname === "/api/stories",
    (route) => route.fulfill({ json: { stories: STORIES } }),
  );
  await page.goto("/archive");
  await hydrated(page);
  await expect(page.getByRole("heading", { name: STORIES[0].title })).toBeVisible();
  await page.getByText("願意告訴我們讀起來如何嗎？").click();
  await expect(page.getByRole("checkbox", { name: /同意保存本次回饋/ })).toBeVisible();
}

/** /admin with one pending story, one feedback and one log entry (mocked, as frame.spec.ts). */
export async function adminWithLists(page: Page) {
  const SUBMITTED = Date.UTC(2026, 9, 3, 4);
  const story: AdminStory = {
    ...STORIES[0],
    status: "pending",
    created: SUBMITTED,
    revision: "e2e-revision",
    shareRequests: 1,
    consentEvents: 3,
    consent: "v3-2026-11-12:adult,privacy,share",
    terms: "v3",
    expiresAt: SUBMITTED + 30 * 86_400_000,
    feedbackCount: 1,
  };
  const feedback: AdminFeedback = {
    id: "e2e-qa-feedback",
    story: story.id,
    kind: "report",
    note: "讀到最後一句時想起自己的高三。",
    created: SUBMITTED + 3_600_000,
    storyTitle: story.title,
  };
  const event: AdminEvent = {
    id: 1,
    adminEmail: "dev-admin@localhost",
    action: "approve",
    targetType: "story",
    targetId: "e2e-qa-gone",
    created: SUBMITTED,
    targetExists: false,
  };
  await page.route(
    (url) => url.pathname === "/api/admin/stories",
    (r) => r.fulfill({ json: { stories: [story], nextCursor: null } }),
  );
  await page.route("**/api/admin/feedback*", (r) =>
    r.fulfill({ json: { feedback: [feedback], nextCursor: null } }),
  );
  await page.route("**/api/admin/events*", (r) =>
    r.fulfill({ json: { events: [event], admins: [event.adminEmail], nextCursor: null } }),
  );
  await page.goto("/admin");
  await hydrated(page);
  await expect(page.getByRole("heading", { name: story.title })).toBeVisible();
  await expect(page.getByText(feedback.note)).toBeVisible();
  // A ticked card shows the batch bar too.
  await page.getByRole("checkbox", { name: `勾選《${story.title}》` }).check();
  await expect(page.getByRole("group", { name: "批次操作" })).toBeVisible();
}

const sameOrigin = { Origin: ORIGIN };

/** Submits a story for this context's anonymous session through the API (as mine.spec.ts). */
export async function submit(context: BrowserContext, title: string, share = false) {
  expect(
    (await context.request.post(ORIGIN + "/api/session", { headers: sameOrigin })).status(),
  ).toBe(200);
  const r = await context.request.post(ORIGIN + "/api/me/stories", {
    headers: { ...sameOrigin, "X-Turnstile-Token": TURNSTILE_TOKEN },
    data: {
      title,
      body: "這是自動化瀏覽器測試留下的文字，用來檢查無障礙與版面，測試結束會刪除。\n".repeat(4),
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

/** /mine with a private and a pending (shared) story, the private one's 改為分享 form open. */
export async function mineWithStories(page: Page, context: BrowserContext) {
  const stamp = Date.now();
  await submit(context, `e2e QA 私人 ${stamp}`);
  await submit(context, `e2e QA 分享 ${stamp}`, true);
  await page.goto("/mine");
  await hydrated(page);
  await expect(page.getByRole("heading", { name: `e2e QA 私人 ${stamp}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "停止分享" })).toBeVisible();
  await page.getByRole("button", { name: "改為分享" }).click();
  await expect(page.getByRole("checkbox").first()).toBeFocused();
}

export const ROUTES = ["/", "/read", "/write", "/mine", "/archive", "/privacy", "/admin"] as const;

export const STATES: State[] = [
  { name: "home", route: true, open: screen("home") },
  {
    name: "read",
    route: true,
    open: async (page) => {
      await page.goto("/read");
      await hydrated(page);
      await expect(page.getByRole("heading", { name: "先讀一封，不必先寫" })).toBeVisible();
    },
  },
  { name: "write", route: true, open: screen("write") },
  { name: "mine", route: true, open: screen("mine") },
  { name: "archive", route: true, open: screen("archive") },
  { name: "privacy-page", route: true, open: screen("privacy-page") },
  { name: "admin", route: true, admin: true, open: screen("admin") },
  {
    // The scenario chips open, 有回應到我 pressed (its status line shows), 人工媒合 open.
    name: "read-open",
    open: async (page) => {
      await page.goto("/read");
      await hydrated(page);
      await page.locator("summary", { hasText: "想讀特定情境？" }).click();
      await expect(page.getByRole("group", { name: "選擇信件情境" })).toBeVisible();
      await page.getByRole("button", { name: "有回應到我" }).click();
      await expect(page.getByRole("button", { name: "有回應到我" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.locator("summary", { hasText: "想參加人工媒合？" }).click();
      await expect(page.locator('[data-form="distress"]')).toBeVisible();
    },
  },
  { name: "write-past", open: screen("write-past") },
  { name: "write-present", open: screen("write-present") },
  { name: "privacy-dialog", open: screen("privacy") },
  { name: "confirm-dialog", open: screen("confirm") },
  { name: "archive-stories", open: archiveWithStories },
  { name: "mine-stories", open: mineWithStories },
  { name: "admin-lists", admin: true, open: adminWithLists },
];
