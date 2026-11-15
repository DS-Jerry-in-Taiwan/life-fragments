import type { Page } from "@playwright/test";
import type { AdminEvent, AdminFeedback, AdminStory, Story } from "../../lib/stories";
import { asAdmin, expect, hydrated, settle, test, WIDTHS } from "./fixtures";
import { SCREENS } from "./screens";

// 共用外框 (V5-c7, #35; V5-c1 audit 「共用外框 3–6」 and 「管理頁 3」): dark
// native controls, the disabled / busy cursors, a 12px minimum for readable
// text, and tap-sized footer and phone-nav links.

/** Fictional approved stories for /archive (as in archive.spec.ts). */
const STORIES: [Story, Story] = [
  {
    id: "e2e-frame-past",
    title: "那年冬天的公車站",
    body: "高三那年冬天，我每天搭最後一班公車回家。\n有一天司機多等了我一下，說：「慢慢來，車會等你。」",
    era: "高三的冬天",
    source: "recollection",
    letterType: "past",
    created: Date.UTC(2026, 9, 3, 4),
    reflection: "後來才知道，被等待的感覺，可以撐過很多個晚上。",
  },
  {
    id: "e2e-frame-present",
    title: "今天的陽台",
    body: "下班回家，陽台的薄荷又長高了一點。",
    era: "",
    source: "recollection",
    letterType: "present",
    created: Date.UTC(2026, 9, 20, 12),
    mood: "平靜",
  },
];

async function archiveWithStories(page: Page) {
  await page.route(
    (url) => url.pathname === "/api/stories",
    (route) => route.fulfill({ json: { stories: STORIES } }),
  );
  await page.goto("/archive");
  await hydrated(page);
  await expect(page.getByRole("heading", { name: STORIES[0].title })).toBeVisible();
  // Open the feedback box too, so its text is measured.
  await page.getByText("願意告訴我們讀起來如何嗎？").click();
  await expect(page.getByRole("checkbox", { name: /同意保存本次回饋/ })).toBeVisible();
}

/**
 * /admin with one story, one feedback and one log entry (mocked; the empty
 * screens in SCREENS show none of their small print: 管理頁 3).
 */
async function adminWithLists(page: Page) {
  const SUBMITTED = Date.UTC(2026, 9, 3, 4);
  const story: AdminStory = {
    ...STORIES[0],
    status: "pending",
    created: SUBMITTED,
    statusAt: SUBMITTED,
    shareRequests: 0,
    consentEvents: 1,
    consent: "v3-2026-11-12:adult,privacy,share",
    terms: "v3",
    expiresAt: SUBMITTED + 30 * 86_400_000,
    feedbackCount: 1,
  };
  const feedback: AdminFeedback = {
    id: "e2e-frame-feedback",
    story: story.id,
    kind: "comment",
    note: "讀到最後一句時想起自己的高三。",
    created: SUBMITTED + 3_600_000,
    storyTitle: story.title,
  };
  const event: AdminEvent = {
    id: 1,
    adminEmail: "dev-admin@localhost",
    action: "approve",
    targetType: "story",
    targetId: "e2e-frame-gone",
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
  await expect(page.getByText(event.targetId)).toBeVisible();
}

type Found = { where: string; text: string; size: number };

/**
 * Every rendered element with its own (direct) text, every form field and
 * every ::before / ::after with text content: its computed font size.
 * Elements inside [aria-hidden="true"] or <noscript> are returned separately.
 */
function measure(page: Page) {
  return page.evaluate(() => {
    const describe = (el: Element) => {
      const cls = [...el.classList].map((c) => "." + c).join("");
      return el.tagName.toLowerCase() + cls;
    };
    const excludedBy = (el: Element) => el.closest('[aria-hidden="true"], noscript');
    const shown = (el: Element) =>
      el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
    const checked: Found[] = [];
    const excluded: Found[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (["script", "style", "template"].includes(el.tagName.toLowerCase())) continue;
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      const field =
        el.matches(
          "textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden])",
        ) && "field";
      const entries: [string, string, number][] = [];
      if (own || field)
        entries.push(["", own || field || "", parseFloat(getComputedStyle(el).fontSize)]);
      for (const pseudo of ["::before", "::after"]) {
        const style = getComputedStyle(el, pseudo);
        const content = style.content.replace(/^"|"$/g, "").trim();
        if (style.display !== "none" && content && content !== "none" && content !== "normal")
          entries.push([pseudo, content, parseFloat(style.fontSize)]);
      }
      if (!entries.length) continue;
      const out = excludedBy(el) ? excluded : shown(el) ? checked : null;
      if (!out) continue;
      for (const [pseudo, text, size] of entries)
        out.push({ where: describe(el) + pseudo, text: text.slice(0, 20), size });
    }
    return { checked, excluded };
  });
}

const PAGES: { name: string; admin?: boolean; open: (page: Page) => Promise<void> }[] = [
  ...SCREENS.map((s) => ({
    name: s.name,
    admin: s.admin,
    open: async (page: Page) => {
      await s.open(page);
      await s.ready(page);
    },
  })),
  { name: "archive-stories", open: archiveWithStories },
  { name: "admin-lists", admin: true, open: adminWithLists },
];

for (const [label, viewport] of Object.entries(WIDTHS)) {
  test.describe(`${label} ${viewport.width}px`, () => {
    test.use({ viewport });
    for (const screen of PAGES) {
      test(`${screen.name}: readable text is at least 12px`, async ({ page, context }) => {
        if (screen.admin) await asAdmin(context);
        await screen.open(page);
        await settle(page);
        const { checked, excluded } = await measure(page);
        expect(checked.length, "應量到文字").toBeGreaterThan(10);
        const small = checked.filter((f) => f.size < 12);
        expect(small, "可閱讀的文字最小 12px").toEqual([]);
        // The exclusions go into the PR (#35): list them.
        const lines = excluded.map((f) => `${f.where} ${f.size}px 「${f.text}」`);
        console.log(`[frame] ${screen.name} ${viewport.width}: excluded ${lines.length}`);
        for (const line of lines) console.log(`[frame]   ${line}`);
      });
    }
  });
}

test("the root is dark for native controls", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    "dark",
  );
});

test("a disabled button shows not-allowed; wait only while a request is in flight", async ({
  page,
}) => {
  // Not busy: the feedback buttons wait for the consent box.
  await archiveWithStories(page);
  const resonate = page.getByRole("button", { name: "有一點共鳴" });
  await expect(resonate).toBeDisabled();
  await expect(resonate).toHaveCSS("cursor", "not-allowed");
  expect(await page.evaluate(() => "busy" in document.documentElement.dataset)).toBe(false);

  // Busy: /mine's first load is held, its buttons disabled meanwhile.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(
    (url) => url.pathname === "/api/me/stories",
    async (route) => {
      await held;
      await route.fulfill({ json: { stories: [] } });
    },
  );
  await page.goto("/mine");
  await hydrated(page);
  const logout = page.getByRole("button", { name: "在這台裝置登出" });
  await expect(logout).toBeDisabled();
  await expect(logout).toHaveCSS("cursor", "wait");
  release();
  await expect(page.getByRole("heading", { name: "還沒有留下的片段" })).toBeVisible();
  await expect(logout).toBeEnabled();
  await expect(logout).toHaveCSS("cursor", "pointer");
  expect(await page.evaluate(() => "busy" in document.documentElement.dataset)).toBe(false);
});

/** Rendered heights of the footer's links / buttons, and of the phone nav's. */
const heights = (page: Page, scope: "contentinfo" | "navigation") =>
  page
    .getByRole(scope, scope === "navigation" ? { name: "主要導覽" } : {})
    .locator("a, button")
    .evaluateAll((els) =>
      els.map((el) => ({
        text: el.textContent?.trim() ?? "",
        height: Math.round(el.getBoundingClientRect().height * 10) / 10,
      })),
    );

for (const [label, viewport] of Object.entries(WIDTHS)) {
  test(`tap targets: footer links ${label} ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await hydrated(page);
    await settle(page);
    const footer = await heights(page, "contentinfo");
    console.log(`[frame] footer ${viewport.width}: ${JSON.stringify(footer)}`);
    expect(footer.length).toBe(4);
    // 12px × line-height 1.8 + 2 × 8px padding (was about 20px).
    for (const link of footer) expect(link.height, link.text).toBeGreaterThanOrEqual(37);
    if (viewport.width === WIDTHS.mobile.width) {
      const nav = await heights(page, "navigation");
      console.log(`[frame] nav ${viewport.width}: ${JSON.stringify(nav)}`);
      expect(nav.length).toBe(4);
      // 12px × 1.8 + 2 × 10px padding + 1px border (was about 28px).
      for (const link of nav) expect(link.height, link.text).toBeGreaterThanOrEqual(41);
    }
  });
}

test("the header's ☾ is hidden from assistive tech", async ({ page }) => {
  await page.goto("/");
  const moon = page.getByRole("banner").getByText("☾", { exact: true });
  await expect(moon).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("banner").getByRole("button").first()).toHaveAccessibleName(
    /^Ring letter/,
  );
});
