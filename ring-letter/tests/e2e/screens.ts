import type { Page } from "@playwright/test";
import { expect, hydrated } from "./fixtures";

/**
 * Every screen, opened by its route (V1-d). The privacy dialog is still
 * opened from the footer; /privacy is the same notice as a page. Locate by role, text, aria-* or data-event only — never by CSS
 * class, which CSS Modules will rewrite (issue #4, 4.6.6).
 *
 * Snapshot names are unchanged from the v1 (tab) baselines, which the routed
 * screens must still match pixel for pixel.
 */
export type Screen = {
  name: string;
  admin?: boolean;
  /** Writes to the DB (session + writing attempt); cleaned up by the fixture. */
  writes?: boolean;
  open: (page: Page) => Promise<void>;
  ready: (page: Page) => Promise<void>;
};

async function route(page: Page, path: string) {
  await page.goto(path);
  await hydrated(page);
}
const home = (page: Page) => route(page, "/");
const footer = (page: Page, name: string) =>
  page.getByRole("contentinfo").getByRole("button", { name });
const h1 = (page: Page, name: string | RegExp) => page.getByRole("heading", { level: 1, name });

async function chooser(page: Page) {
  await route(page, "/write");
  await expect(h1(page, "你今天想怎麼寫？")).toBeVisible();
}

export const SCREENS: Screen[] = [
  {
    name: "home",
    open: home,
    ready: async (page) => {
      await expect(h1(page, /寫下你的/)).toBeVisible();
      await expect(page.getByRole("heading", { name: "先讀一封，不必先寫" })).toBeVisible();
    },
  },
  {
    name: "read",
    // Via the home page, like the v1 baseline: home's own random letter uses
    // the first value of the seeded Math.random sequence, so a direct
    // goto("/read") would show a different letter. (Also covers client-side
    // navigation; the routes smoke test covers loading /read directly.)
    open: async (page) => {
      await home(page);
      await page
        .getByRole("navigation", { name: "主要導覽" })
        .getByRole("button", { name: "讀一封信" })
        .click();
      await expect(page).toHaveURL(/\/read$/);
    },
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "先讀一封，不必先寫" })).toBeVisible();
      await expect(h1(page, /寫下你的/)).toHaveCount(0);
    },
  },
  {
    name: "write",
    open: chooser,
    ready: async (page) => {
      await expect(page.getByRole("button", { name: /有一段過去/ })).toBeEnabled();
      await expect(page.getByRole("button", { name: /今天，/ })).toBeEnabled();
    },
  },
  {
    name: "write-past",
    writes: true,
    open: async (page) => {
      await chooser(page);
      await page.getByRole("button", { name: /有一段過去/ }).click();
    },
    ready: async (page) => {
      await expect(h1(page, "回想一段經歷")).toBeVisible();
      await expect(page.getByLabel("這件事大約發生在什麼時候？")).toBeVisible();
    },
  },
  {
    name: "write-present",
    writes: true,
    open: async (page) => {
      await chooser(page);
      await page.getByRole("button", { name: /今天，/ }).click();
    },
    ready: async (page) => {
      await expect(h1(page, "記下此刻")).toBeVisible();
      await expect(page.getByLabel("現在的感覺")).toBeVisible();
    },
  },
  {
    name: "mine",
    open: (page) => route(page, "/mine"),
    ready: async (page) => {
      await expect(h1(page, "我的片段")).toBeVisible();
      await expect(page.getByRole("heading", { name: "還沒有留下的片段" })).toBeVisible();
    },
  },
  {
    name: "archive",
    open: (page) => route(page, "/archive"),
    ready: async (page) => {
      await expect(h1(page, /有一段生活/)).toBeVisible();
      // Fresh DB: no approved stories, so the first hardcoded demo shows.
      await expect(page.getByText("信箱剛剛開啟。先讀一段示範，感受這裡的節奏。")).toBeVisible();
      await expect(page.getByRole("heading", { name: "那天，我提早一站下車" })).toBeVisible();
    },
  },
  {
    name: "privacy",
    open: async (page) => {
      await home(page);
      await footer(page, "先前投稿資料說明").click();
    },
    ready: async (page) => {
      await expect(page.getByRole("dialog", { name: "讓文字安心留下" })).toBeVisible();
    },
  },
  {
    name: "privacy-page",
    open: (page) => route(page, "/privacy"),
    ready: async (page) => {
      await expect(page.getByRole("heading", { level: 1, name: "讓文字安心留下" })).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    },
  },
  {
    name: "admin",
    admin: true,
    open: async (page) => {
      // The operation log keeps a year of admin operations, including the
      // smoke tests' own (kept by design after their stories are deleted):
      // the baseline shows it empty.
      await page.route("**/api/admin/events*", (r) =>
        r.fulfill({ json: { events: [], admins: [], nextCursor: null } }),
      );
      await route(page, "/admin");
    },
    ready: async (page) => {
      await expect(h1(page, "把關每一封來信")).toBeVisible();
      // The baseline is of an empty DB; leftover data (e.g. from an aborted
      // tests/api.mjs run) would change counts and lists.
      await expect(
        page.getByText("沒有符合條件的投稿。"),
        "本機 D1 有殘留資料：刪掉 .wrangler/state 後重跑 db:migrate:local",
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "等待審閱（0）" })).toBeVisible();
      await expect(page.getByRole("button", { name: "全部（0）" })).toBeVisible();
      await expect(page.getByText("尚無回饋。")).toBeVisible();
      await expect(page.getByText("尚無操作紀錄。")).toBeVisible();
      await expect(page.getByRole("button", { name: "重新整理" })).toBeEnabled();
    },
  },
];
