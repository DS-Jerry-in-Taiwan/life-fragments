import { contentSecurityPolicy } from "../../lib/server/security-headers";
import { lateReports, nonceOf, STORY, watchCsp } from "./csp";
import { expect, hydrated, ORIGIN, test, turnstileLog } from "./fixtures";
import { SCREENS } from "./screens";

// The CSP gate under the *production* policy (#63, #68 review). csp.spec.ts
// runs against `npm run dev`, whose policy also allows 'unsafe-eval' and
// inline <style>; a change needing either would pass there and break the
// site once the policy is enforced. This spec walks the built Worker
// instead: `npm run build`, `npm start` (port 8788), then
//
//   TEST_ORIGIN=http://127.0.0.1:8788 npm run test:e2e:build
//
// It runs only with CSP_BUILD=1 (set by that script), and is skipped in the
// normal dev run. The build has no dev admin identity (so no /admin) and its
// Turnstile can't verify locally (so no real submit): the fake api.js
// (fixtures.ts) still loads under the policy, and feedback is mocked.

test.skip(!process.env.CSP_BUILD, "只對建置後的 Worker 跑（npm run test:e2e:build）");

const PAGES = ["/", "/read", "/write", "/write?mode=past", "/write?mode=present", "/archive", "/mine", "/privacy"];

test("build: HTML carries the production policy, with no 'unsafe-' source", async ({
  request,
}) => {
  const nonces = new Set<string>();
  for (const path of PAGES) {
    const r = await request.get(ORIGIN + path);
    expect(r.status(), path).toBe(200);
    const h = r.headers();
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["content-security-policy"], path).toBe("frame-ancestors 'none'");
    const policy = h["content-security-policy-report-only"] ?? "";
    expect(policy, `${path} 的正式政策不可有 'unsafe-'`).not.toContain("'unsafe-");
    const nonce = nonceOf(policy);
    expect(nonce, `${path} 的 Report-Only 政策要有 nonce`).toBeTruthy();
    expect(policy, path).toBe(contentSecurityPolicy(nonce!));
    nonces.add(nonce!);

    const html = await r.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length, path).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, path).toContain(` nonce="${nonce}"`);
    expect(html, `${path} 不應有 style 屬性`).not.toMatch(/<[^>]+\sstyle="/);
    expect(html, `${path} 不應有 <style>`).not.toMatch(/<style\b/);
  }
  expect(nonces.size, "每個回應的 nonce 都不同").toBe(PAGES.length);
});

test("build: the listener does catch a violation", async ({ page, context }) => {
  const csp = await watchCsp(context);
  await page.goto("/");
  await hydrated(page);
  // An inline <style>, which only the dev policy allows.
  await page.evaluate(() => {
    const s = document.createElement("style");
    s.textContent = "body { outline: 0 }";
    document.head.appendChild(s);
  });
  await expect.poll(() => csp.violations.length).toBeGreaterThan(0);
  expect(csp.violations[0].directive).toBe("style-src-elem");
});

test("build: the main flows fire no CSP violation", async ({ page, context }) => {
  test.setTimeout(180_000);
  const csp = await watchCsp(context);

  // Every screen but /admin: client-side navigation to /read, both writing
  // forms, the dialogs, /mine, the empty /archive, /privacy.
  for (const screen of SCREENS.filter((s) => !s.admin)) {
    await screen.open(page);
    await screen.ready(page);
  }

  // The writing form loads Turnstile's api.js (the fake one) under the policy.
  await page.goto("/write?mode=present");
  await hydrated(page);
  await expect.poll(async () => (await turnstileLog(page))?.rendered.length ?? 0).toBe(1);

  // /archive with stories, and its feedback box (with its own Turnstile).
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
  await expect(page.getByRole("heading", { name: STORY.title })).toBeVisible();
  await page.getByText("願意告訴我們讀起來如何嗎？").click();
  await page.getByRole("checkbox", { name: /同意保存本次回饋/ }).check();
  await page.getByRole("button", { name: "有一點共鳴" }).click();
  await expect(page.locator("details").getByRole("status")).toHaveText("謝謝，你的回饋已保存。");

  await lateReports(page);
  expect(csp.violations, "不應有 CSP 違規").toEqual([]);
  expect(csp.messages, "console 不應有 CSP 訊息").toEqual([]);
});
