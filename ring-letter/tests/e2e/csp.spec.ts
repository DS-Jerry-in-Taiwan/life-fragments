import type { Page } from "@playwright/test";
import { contentSecurityPolicy } from "../../lib/server/security-headers";
import { lateReports, nonceOf, STORY, watchCsp } from "./csp";
import {
  adminHeaders,
  asAdmin,
  eraseSession,
  expect,
  hydrated,
  ORIGIN,
  test,
  TURNSTILE_TOKEN,
  turnstileLog,
} from "./fixtures";
import { SCREENS } from "./screens";

// Security headers (#63, E2 PR 1; lib/server/security-headers.ts, set in
// worker/index.ts). The CSP is still Report-Only, which blocks nothing, so
// this spec is the gate: a Report-Only violation still fires a
// `securitypolicyviolation` event and logs to the console, and any of either
// while walking the main flows fails the test.
//
// This spec runs against `npm run dev`, whose policy also allows
// 'unsafe-eval' and inline <style> (Vite, React dev). csp-build.spec.ts walks
// the built Worker under the production policy (`npm run test:e2e:build`).

const PAGES = ["/", "/read", "/write", "/write?mode=past", "/write?mode=present", "/archive", "/mine", "/privacy", "/admin"];

test("HTML responses carry the security headers; the nonce is on every script", async ({
  request,
}) => {
  const nonces = new Set<string>();
  for (const path of PAGES) {
    const r = await request.get(ORIGIN + path, {
      headers: path === "/admin" ? adminHeaders() : {},
    });
    expect(r.status(), path).toBe(200);
    const h = r.headers();
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["content-security-policy"], path).toBe("frame-ancestors 'none'");
    const policy = h["content-security-policy-report-only"];
    const nonce = nonceOf(policy ?? "");
    expect(nonce, `${path} 的 Report-Only 政策要有 nonce`).toBeTruthy();
    // `npm run dev` gets the dev variant (unsafe-eval, inline <style>).
    expect(policy, path).toBe(contentSecurityPolicy(nonce!, true));
    nonces.add(nonce!);

    // Every <script> vinext and React render (RSC payload, $RC, entry) carries it.
    const html = await r.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length, path).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, path).toContain(` nonce="${nonce}"`);
    expect(html, `${path} 不應有 style 屬性`).not.toMatch(/<[^>]+\sstyle="/);
  }
  expect(nonces.size, "每個回應的 nonce 都不同").toBe(PAGES.length);
});

test("a client-sent CSP request header can't choose the nonce", async ({ request }) => {
  for (const name of ["Content-Security-Policy", "Content-Security-Policy-Report-Only"]) {
    const r = await request.get(ORIGIN + "/", { headers: { [name]: "script-src 'nonce-chosen'" } });
    const html = await r.text();
    expect(html).not.toContain('nonce="chosen"');
    expect(nonceOf(r.headers()["content-security-policy-report-only"])).not.toBe("chosen");
  }
});

test("other responses get nosniff and Referrer-Policy, but no page policy", async ({
  request,
}) => {
  const r = await request.get(ORIGIN + "/api/stories");
  expect(r.status()).toBe(200);
  const h = r.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["content-security-policy-report-only"]).toBeUndefined();
  expect(h["x-frame-options"]).toBeUndefined();
});

test("the listener does catch a violation", async ({ page, context }) => {
  const csp = await watchCsp(context);
  await page.goto("/");
  await hydrated(page);
  // An inline script without the nonce, as an injected one would be.
  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = "window.__injected = true";
    document.body.appendChild(s);
  });
  await expect.poll(() => csp.violations.length).toBeGreaterThan(0);
  expect(csp.violations[0].directive).toBe("script-src-elem");
});

async function fillPresent(page: Page) {
  await page.getByLabel("剛剛發生了什麼？").fill("CSP 測試留下的文字，測試結束會刪除。");
  await page.getByLabel("現在的感覺").fill("平靜");
  await page.getByRole("checkbox", { name: /我已滿 18 歲，內容是我的真實經歷/ }).check();
  await page.getByRole("checkbox", { name: /我了解團隊可閱讀投稿/ }).check();
}

test("the main flows fire no CSP violation", async ({ page, context }) => {
  test.setTimeout(180_000);
  const csp = await watchCsp(context);

  // Every screen (screens.ts), including client-side navigation to /read,
  // both writing forms and the dialogs; /admin last (below), since its
  // identity headers then stay on for the rest of the context.
  for (const screen of SCREENS.filter((s) => !s.admin)) {
    await screen.open(page);
    await screen.ready(page);
  }

  // Submitting a letter loads (the fake) Turnstile api.js and gets a token.
  await page.goto("/write?mode=present");
  await hydrated(page);
  await fillPresent(page);
  const posted = page.waitForRequest(
    (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/me/stories",
  );
  await page.getByRole("button", { name: "留下這封信", exact: true }).click();
  expect((await posted).headers()["x-turnstile-token"]).toBe(TURNSTILE_TOKEN);
  await expect(page.getByRole("heading", { name: "你的文字已留下。" })).toBeVisible();
  expect((await turnstileLog(page))?.executed).toBe(1);
  await page.getByRole("link", { name: "查看我的片段", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);

  // Feedback on the public mailbox, with its own Turnstile.
  await page.route(
    (url) => url.pathname === "/api/stories",
    (route) => route.fulfill({ json: { stories: [STORY] } }),
  );
  await page.route(
    (url) => url.pathname === "/api/feedback",
    (route) => route.fulfill({ json: { ok: true } }),
  );
  await page.goto("/archive");
  await hydrated(page);
  await page.getByText("願意告訴我們讀起來如何嗎？").click();
  await page.getByRole("checkbox", { name: /同意保存本次回饋/ }).check();
  await page.getByRole("button", { name: "有一點共鳴" }).click();
  await expect(page.locator("details").getByRole("status")).toHaveText("謝謝，你的回饋已保存。");

  // The admin screen expects an empty local D1: drop the letter first.
  await eraseSession(context);
  for (const screen of SCREENS.filter((s) => s.admin)) {
    await asAdmin(context);
    await screen.open(page);
    await screen.ready(page);
  }

  await lateReports(page);
  expect(csp.violations, "不應有 CSP 違規").toEqual([]);
  expect(csp.messages, "console 不應有 CSP 訊息").toEqual([]);
});
