import type { BrowserContext, Page } from "@playwright/test";
import type { Story } from "../../lib/stories";

// Shared by csp.spec.ts (dev policy) and csp-build.spec.ts (production policy).

/** The nonce in a Report-Only policy. */
export const nonceOf = (policy: string) => /'nonce-([^']+)'/.exec(policy)?.[1];

export type Violation = { page: string; directive: string; blocked: string; source: string };

/**
 * Records every CSP violation event (Report-Only ones fire it too) and every
 * CSP console message in `context`.
 */
export async function watchCsp(context: BrowserContext) {
  const violations: Violation[] = [];
  const messages: string[] = [];
  await context.exposeBinding("__cspViolation", ({ page }, v: Omit<Violation, "page">) => {
    violations.push({ page: page.url(), ...v });
  });
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __cspViolation: (v: object) => void }).__cspViolation({
        directive: e.effectiveDirective,
        blocked: e.blockedURI,
        source: `${e.sourceFile}:${e.lineNumber}`,
      });
    });
  });
  context.on("console", (m) => {
    if (/content.security.policy/i.test(m.text())) messages.push(m.text());
  });
  return { violations, messages };
}

/** Late reports (style recalculation, lazy chunks) arrive asynchronously. */
export async function lateReports(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
}

/** A fictional approved story for a mocked GET /api/stories. */
export const STORY: Story = {
  id: "e2e-csp-story",
  title: "CSP 測試的信",
  body: "這是一封虛構的測試信，只出現在瀏覽器測試裡。",
  era: "",
  source: "recollection",
  letterType: "present",
  created: Date.UTC(2026, 10, 1, 4),
  mood: "平靜",
};
