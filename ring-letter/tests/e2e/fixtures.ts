import { readFileSync } from "node:fs";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

export { expect };

export const ORIGIN = process.env.TEST_ORIGIN || "http://127.0.0.1:5173";
export const WIDTHS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
};

/**
 * The dev server grants an admin identity only to requests carrying its
 * per-run secret (vite.config.ts devAdminIdentity(), same as tests/api.mjs).
 * The headers go only to our own origin. (Playwright would keep them on a
 * redirect; the dev app never redirects off-origin, and the token is per
 * dev-server start and only unlocks the local D1.)
 */
export function adminHeaders() {
  const token =
    process.env.DEV_ADMIN_TOKEN ||
    readFileSync(new URL("../../.wrangler/dev-admin-token", import.meta.url), "utf8").trim();
  return { "x-dev-admin-token": token, "x-dev-admin-email": "dev-admin@localhost" };
}

export async function asAdmin(context: BrowserContext) {
  const admin = adminHeaders();
  await context.route(
    (url) => url.origin === new URL(ORIGIN).origin,
    (route) => route.continue({ headers: { ...route.request().headers(), ...admin } }),
  );
}

/** Delete everything this browser context's anonymous session created. */
export async function eraseSession(context: BrowserContext) {
  const cookies = await context.cookies(ORIGIN);
  if (!cookies.some((c) => c.name === "rl_session")) return;
  const r = await context.request.delete(ORIGIN + "/api/me", { headers: { Origin: ORIGIN } });
  expect(r.status(), "清除測試資料失敗").toBe(200);
}

/** The open ConfirmDialog (components/common/ConfirmDialog.tsx). */
export const confirmDialog = (page: Page) => page.getByRole("dialog");

/**
 * Answers the open ConfirmDialog with one of its buttons (取消 or the
 * confirm verb) and waits for it to close; returns the dialog's text.
 */
export async function answer(page: Page, button: string) {
  const dialog = confirmDialog(page);
  await expect(dialog).toBeVisible();
  const text = await dialog.innerText();
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  return text;
}

/** Wait until React has hydrated, so clicks on buttons actually do something. */
export async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((k) => k.startsWith("__reactFiber"));
  });
}

/**
 * Everything that can make two screenshots of the same screen differ:
 * pending requests, web fonts (self-hosted @fontsource slices, top of app/globals.css), scroll
 * position after `window.scrollTo({behavior: "smooth"})`.
 */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  const serif = await page.evaluate(
    () =>
      [...document.fonts].filter((f) => f.family.includes("Noto Serif TC") && f.status === "loaded")
        .length,
  );
  expect(serif, "Noto Serif TC 沒有載入").toBeGreaterThan(0);
  // The web font arrives as many unicode-range slices, each swapped in as it
  // loads; the final text layout could still depend on that order. Rebuild
  // the whole layout once everything is loaded so it starts from one state.
  await page.evaluate(async () => {
    const root = document.documentElement;
    root.style.display = "none";
    void root.offsetHeight;
    root.style.removeProperty("display");
    void root.offsetHeight;
    await document.fonts.ready;
  });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

/**
 * Noto Serif TC is self-hosted (@fontsource, app/globals.css; #4 §10 item 6):
 * no page may contact Google Fonts. Every test records such requests and
 * fails if there were any; `fontRequests` also lists our own woff2 slices.
 */
export const GOOGLE_FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
export function fontRequests(context: BrowserContext) {
  const google: string[] = [];
  const selfHosted: string[] = [];
  context.on("request", (r) => {
    const url = r.url();
    if (GOOGLE_FONTS.test(url)) google.push(url);
    else if (url.startsWith(ORIGIN + "/") && /\.woff2(\?|$)/.test(url)) selfHosted.push(url);
  });
  return { google, selfHosted };
}

/** Cloudflare's dummy token; the dev server's Turnstile test secret accepts it. */
export const TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js**";

/**
 * A stand-in for Cloudflare's Turnstile script (components/common/Turnstile.tsx
 * loads it on the write and feedback forms): render / execute / reset /
 * remove, with execute() answering the dummy token, as the test site key
 * would, but without depending on challenges.cloudflare.com or drawing
 * anything. `window.__turnstile` records the calls for the tests.
 */
const FAKE_TURNSTILE = `(() => {
  const widgets = new Map();
  const log = (window.__turnstile = { rendered: [], executed: 0, reset: 0, removed: 0 });
  let n = 0;
  window.turnstile = {
    render(el, options) {
      const id = "fake-" + ++n;
      widgets.set(id, options);
      const { callback, ...rest } = options;
      log.rendered.push(Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== "function")));
      return id;
    },
    execute(id) {
      log.executed++;
      if (window.__turnstileStall) return; // a challenge that never answers
      const options = widgets.get(id);
      setTimeout(() => options && options.callback(${JSON.stringify(TURNSTILE_TOKEN)}), 0);
    },
    reset() { log.reset++; },
    remove(id) { log.removed++; widgets.delete(id); },
  };
})();`;

export type TurnstileLog = {
  rendered: Record<string, string>[];
  executed: number;
  reset: number;
  removed: number;
};
export const turnstileLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { __turnstile?: TurnstileLog }).__turnstile ?? null);

export const test = base.extend<{ seededRandom: void }>({
  // components/reading/MatchExperience.tsx picks letters with Math.random(); make
  // the sequence fixed (mulberry32, seed 1) so the same letter shows each run.
  seededRandom: [
    async ({ context }, use) => {
      const fonts = fontRequests(context);
      await context.route(TURNSTILE_SCRIPT, (route) =>
        route.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_TURNSTILE }),
      );
      await context.addInitScript(() => {
        let a = 1;
        Math.random = () => {
          a = (a + 0x6d2b79f5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      });
      await use();
      // Smoke tests can finish while routed requests are still pending.
      await context.unrouteAll({ behavior: "ignoreErrors" });
      await eraseSession(context);
      expect(fonts.google, "不應向 Google Fonts 發出請求").toEqual([]);
    },
    { auto: true },
  ],
});
