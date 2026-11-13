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
 * The headers go only to our own origin, never to Google Fonts. (Playwright
 * would keep them on a redirect; the dev app never redirects off-origin, and
 * the token is per dev-server start and only unlocks the local D1.)
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

/** Wait until React has hydrated, so clicks on buttons actually do something. */
export async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((k) => k.startsWith("__reactFiber"));
  });
}

/**
 * Everything that can make two screenshots of the same screen differ:
 * pending requests, web fonts (Google Fonts @import at the top of app/globals.css), scroll
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
  expect(serif, "Noto Serif TC 沒有載入（需要連得到 Google Fonts）").toBeGreaterThan(0);
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
 * Google Fonts serves Noto Serif TC as a variable font, but the CSS for
 * `wght@400;500;600` declares every woff2 slice three times (once per
 * weight). Which duplicate face a run of text ends up matched to depends on
 * load order, and the serif glyphs then rasterize slightly differently from
 * run to run. Collapse the duplicates into one face per file with a
 * `font-weight: 400 600` range: same files, same glyphs, one possible match.
 * The CSS and font files are fetched once per worker and reused.
 */
const fontFiles = new Map<string, { body: Buffer; headers: Record<string, string> }>();
const fontCss = new Map<string, string>();
async function stableFonts(context: BrowserContext) {
  await context.route("https://fonts.googleapis.com/css2?**", async (route) => {
    const cached = fontCss.get(route.request().url());
    if (cached)
      return route.fulfill({ status: 200, contentType: "text/css; charset=utf-8", body: cached });
    const css = await (await route.fetch()).text();
    const faces = new Map<string, { block: string; weights: number[] }>();
    for (const [block] of css.matchAll(/@font-face\s*{[^}]*}/g)) {
      const src = /src:\s*url\(([^)]+)\)/.exec(block)?.[1] ?? block;
      const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1]);
      const face = faces.get(src);
      if (face) face.weights.push(weight);
      else faces.set(src, { block, weights: [weight] });
    }
    const body = [...faces.values()]
      .map(({ block, weights }) =>
        block.replace(
          /font-weight:\s*\d+/,
          `font-weight: ${Math.min(...weights)} ${Math.max(...weights)}`,
        ),
      )
      .join("\n");
    fontCss.set(route.request().url(), body);
    await route.fulfill({ status: 200, contentType: "text/css; charset=utf-8", body });
  });
  await context.route("https://fonts.gstatic.com/**", async (route) => {
    const url = route.request().url();
    let file = fontFiles.get(url);
    if (!file) {
      const r = await route.fetch();
      if (!r.ok()) return route.fulfill({ response: r });
      file = { body: await r.body(), headers: r.headers() };
      fontFiles.set(url, file);
    }
    await route.fulfill({ status: 200, headers: file.headers, body: file.body });
  });
}

export const test = base.extend<{ seededRandom: void }>({
  // components/reading/MatchExperience.tsx picks letters with Math.random(); make
  // the sequence fixed (mulberry32, seed 1) so the same letter shows each run.
  seededRandom: [
    async ({ context }, use) => {
      await stableFonts(context);
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
      // Smoke tests can finish while font requests are still being routed.
      await context.unrouteAll({ behavior: "ignoreErrors" });
      await eraseSession(context);
    },
    { auto: true },
  ],
});
