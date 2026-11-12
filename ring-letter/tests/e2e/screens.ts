import type { Page } from "@playwright/test";
import { expect, hydrated } from "./fixtures";

/**
 * Every v1 screen, reached the way a user reaches it today (nav / footer
 * buttons). Locate by role, text, aria-* or data-event only — never by CSS
 * class, which CSS Modules will rewrite (issue #4, 4.6.6).
 *
 * When V1-d turns tabs into routes, change each `open` to e.g.
 * `page.goto("/read")`; `ready` and the snapshot names stay the same.
 */
export type Screen = {
  name: string;
  admin?: boolean;
  /** Writes to the DB (session + writing attempt); cleaned up by the fixture. */
  writes?: boolean;
  open: (page: Page) => Promise<void>;
  ready: (page: Page) => Promise<void>;
};

async function home(page: Page) {
  await page.goto("/");
  await hydrated(page);
}
const nav = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "主要導覽" }).getByRole("button", { name });
const footer = (page: Page, name: string) =>
  page.getByRole("contentinfo").getByRole("button", { name });
const h1 = (page: Page, name: string | RegExp) => page.getByRole("heading", { level: 1, name });

async function chooser(page: Page) {
  await home(page);
  await nav(page, "寫一封信").click();
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
    open: async (page) => {
      await home(page);
      await nav(page, "讀一封信").click();
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
    open: async (page) => {
      await home(page);
      await nav(page, "我的片段").click();
    },
    ready: async (page) => {
      await expect(h1(page, "我的片段")).toBeVisible();
      await expect(page.getByRole("heading", { name: "還沒有留下的片段" })).toBeVisible();
    },
  },
  {
    name: "archive",
    open: async (page) => {
      await home(page);
      await footer(page, "先前公開信箱").click();
    },
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
    name: "admin",
    admin: true,
    open: async (page) => {
      await page.goto("/admin");
      await hydrated(page);
    },
    ready: async (page) => {
      await expect(h1(page, "把關每一封來信")).toBeVisible();
      // The baseline is of an empty DB; leftover data (e.g. from an aborted
      // tests/api.mjs run) would change counts and lists.
      await expect(
        page.getByText("尚無投稿，收到後會出現在這裡。"),
        "本機 D1 有殘留資料：刪掉 .wrangler/state 後重跑 db:migrate:local",
      ).toBeVisible();
      await expect(page.getByText("尚無回饋。")).toBeVisible();
      await expect(page.getByRole("button", { name: "重新整理" })).toBeEnabled();
    },
  },
];
