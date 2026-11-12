import { asAdmin, expect, settle, test, WIDTHS } from "./fixtures";
import { SCREENS } from "./screens";

// Pixel baseline of every v1 screen. The refactor (V1-b…V1-f) must keep these
// identical; visual changes belong to V5 (issue #4, 4.7).
// Baselines are only valid in the Playwright container (README).
test.skip(
  !process.env.E2E_VISUAL,
  "截圖只在 Playwright 容器裡比對：用 npm run test:e2e（或設 E2E_VISUAL=1）",
);

for (const [label, viewport] of Object.entries(WIDTHS)) {
  test.describe(`${label} ${viewport.width}px`, () => {
    test.use({ viewport });
    for (const screen of SCREENS) {
      test(screen.name, async ({ page, context }) => {
        if (screen.admin) await asAdmin(context);
        await screen.open(page);
        await screen.ready(page);
        await settle(page);
        await expect(page).toHaveScreenshot(`${screen.name}-${viewport.width}.png`, {
          fullPage: true,
        });
      });
    }
    // The privacy dialog is fixed and scrolls on its own (max-height 85vh), so
    // the full-page shot only shows its top. Also shoot it scrolled to the end.
    test("privacy (dialog scrolled to end)", async ({ page }) => {
      const privacy = SCREENS.find((s) => s.name === "privacy")!;
      await privacy.open(page);
      await privacy.ready(page);
      await settle(page);
      const dialog = page.getByRole("dialog", { name: "讓文字安心留下" });
      await dialog.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
      await expect(dialog.getByRole("button", { name: "我了解了" })).toBeInViewport();
      await expect(page).toHaveScreenshot(`privacy-end-${viewport.width}.png`);
    });
  });
}
