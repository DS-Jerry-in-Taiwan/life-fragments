import { defineConfig } from "@playwright/test";

// Browser smoke + visual baseline for the v2 refactor (issue #4, V1-a).
// Runs against `npm run dev` (TEST_ORIGIN, same as tests/api.mjs). Screenshots
// are only comparable inside the Playwright container, so `npm run test:e2e`
// runs there; see README「瀏覽器測試與截圖基準」.
const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "tests/e2e",
  // One worker, in order: every test shares the dev server's local D1, and
  // the admin / archive screenshots need it to be empty.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  // No platform/project suffix: baselines are only ever produced in the container.
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      // Same container, same pixels: any difference is a real change.
      maxDiffPixels: 0,
      threshold: 0,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  use: {
    baseURL: origin,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    deviceScaleFactor: 1,
    // Grayscale, unhinted text: LCD subpixel antialiasing made the serif
    // web-font glyphs render slightly differently between identical runs.
    launchOptions: {
      args: ["--disable-lcd-text", "--font-render-hinting=none"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
