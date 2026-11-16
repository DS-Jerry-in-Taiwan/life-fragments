import type { Page } from "@playwright/test";
import type { AdminStory } from "../../lib/stories";
import { asAdmin, expect, hydrated, settle, test, WIDTHS } from "./fixtures";

// 管理頁樣式一致 (#37; V5-c1 audit 「管理頁 1–2」): the batch actions are the
// site's .secondary / .danger buttons, not chips, and the filter row's
// items are 48px tall on one centre line.

const SUBMITTED = Date.UTC(2026, 9, 3, 4);
/** A fictional pending story (mocked: nothing is written to D1). */
const STORY: AdminStory = {
  id: "e2e-admin-style",
  title: "樓下的麵攤",
  body: "加班到很晚，樓下的麵攤老闆多給了我一顆滷蛋。",
  era: "",
  source: "recollection",
  letterType: "present",
  created: SUBMITTED,
  status: "pending",
  revision: "e2e-revision",
  shareRequests: 0,
  consentEvents: 1,
  consent: "v3-2026-11-12:adult,privacy,share",
  terms: "v3",
  expiresAt: SUBMITTED + 30 * 86_400_000,
  feedbackCount: 0,
};

async function adminWithStory(page: Page) {
  await page.route(
    (url) => url.pathname === "/api/admin/stories",
    (r) => r.fulfill({ json: { stories: [STORY], nextCursor: null } }),
  );
  await page.goto("/admin");
  await hydrated(page);
  await expect(page.getByRole("heading", { name: STORY.title })).toBeVisible();
}

type Box = { name: string; height: number; centre: number; bottom: number };

/** Border-box height, vertical centre and bottom of each element, by name. */
function boxes(page: Page, items: Record<string, string>) {
  return page.evaluate((items) => {
    return Object.entries(items).map(([name, selector]) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`找不到 ${name}（${selector}）`);
      const r = el.getBoundingClientRect();
      return { name, height: r.height, centre: r.top + r.height / 2, bottom: r.bottom };
    });
  }, items) as Promise<Box[]>;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

for (const [label, viewport] of Object.entries(WIDTHS)) {
  test.describe(`${label} ${viewport.width}px`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ context, page }) => {
      await asAdmin(context);
      await adminWithStory(page);
      await settle(page);
    });

    test("batch actions are .secondary / .danger buttons, not chips", async ({ page }) => {
      await page.getByRole("checkbox", { name: `勾選《${STORY.title}》` }).check();
      const group = page.getByRole("group", { name: "批次操作" });
      const reject = group.getByRole("button", { name: "不通過或下架勾選的 1 篇" });
      const remove = group.getByRole("button", { name: "永久刪除勾選的 1 篇" });
      await expect(reject).toBeEnabled();
      await expect(reject).toHaveClass(/(^|\s)secondary(\s|$)/);
      await expect(remove).toHaveClass(/(^|\s)danger(\s|$)/);
      for (const button of [reject, remove]) {
        // Not inside a chip row (Chips.module.css styles `.chips button`).
        expect(
          await button.evaluate((b) => !!b.parentElement?.className.match(/chips/)),
          "批次操作不應放在 chip 列",
        ).toBe(false);
      }
      // DESIGN.md Buttons (v3 D1): .secondary is the ghost pill, .danger the
      // outlined danger pill; both ≥ 44px.
      await expect(reject).toHaveCSS("padding-left", "24px");
      await expect(reject).toHaveCSS("border-top-color", "rgb(115, 132, 140)"); // --control-border
      await expect(remove).toHaveCSS("text-decoration-line", "none");
      await expect(remove).toHaveCSS("border-top-style", "solid");
      await expect(remove).toHaveCSS("color", "rgb(242, 184, 168)"); // --danger
      // 全選 / 取消全選 stay chips.
      const all = group.getByRole("button", { name: "取消全選" });
      expect(await all.evaluate((b) => !!b.parentElement?.className.match(/chips/))).toBe(true);
    });

    test("filter row: 48px tall, one centre line; search button as tall as the fields", async ({
      page,
    }) => {
      const filters = '[role="search"][aria-label="篩選投稿"]';
      const row = await boxes(page, {
        重新申請分享: `${filters} label.check:has(input[type="checkbox"]):nth-child(1)`,
        即將到期: `${filters} label.check:has(input[type="checkbox"]):nth-child(2)`,
        同意版本: `${filters} label:has(select)`,
        select: `${filters} select`,
      });
      const search = await boxes(page, {
        q: `${filters} input[name="q"]`,
        from: `${filters} input[name="from"]`,
        to: `${filters} input[name="to"]`,
        搜尋: `${filters} form button`,
      });
      console.log(
        `[admin-style] ${viewport.width}: ` +
          [...row, ...search].map((b) => `${b.name} ${b.height}px @${b.centre}`).join(", "),
      );
      for (const b of [...row, ...search]) expect(b.height, `${b.name} 的高度`).toBe(48);
      // The row wraps on a phone: items on the same line share a centre line.
      const lines = new Map<number, Box[]>();
      for (const b of row) {
        const key = [...lines.keys()].find((c) => Math.abs(c - b.centre) < 24) ?? b.centre;
        lines.set(key, [...(lines.get(key) ?? []), b]);
      }
      for (const line of lines.values())
        for (const b of line)
          expect(near(b.centre, line[0].centre), `${b.name} 與 ${line[0].name} 同一條中線`).toBe(
            true,
          );
      // The select sits on its label's line.
      const [select, consent] = [row[3], row[2]];
      expect(near(select.centre, consent.centre), "下拉選單與「同意版本」同一條中線").toBe(true);
      // On the 1280 layout the search form is one line: fields and button on one centre line.
      if (viewport.width >= 1280)
        for (const b of search)
          expect(near(b.centre, search[0].centre), `${b.name} 與搜尋欄同一條中線`).toBe(true);
      // On a phone the dates share a line; the button has a line of its own.
      else expect(near(search[1].centre, search[2].centre), "兩個日期欄同一條中線").toBe(true);
    });
  });
}
