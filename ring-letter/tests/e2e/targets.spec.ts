import type { Locator, Page } from "@playwright/test";
import { WIDTHS, expect, hydrated, test } from "./fixtures";

// Tap targets and the pressed state (#52; designer review): every phone
// line, header nav link and footer link is at least 44px tall, and a
// pressed 有回應到我 shows more than a change of shade.

const MIN = 44;

async function open(page: Page, path: string) {
  await page.goto(path);
  await hydrated(page);
}

/** Height of every matched element, labelled with its text. */
async function heights(items: Locator) {
  const out: [string, number][] = [];
  for (const item of await items.all()) {
    const box = await item.boundingBox();
    expect(box, await item.innerText()).not.toBeNull();
    out.push([(await item.innerText()).trim(), box!.height]);
  }
  return out;
}

function expectTall(found: [string, number][], count: number) {
  expect(found).toHaveLength(count);
  for (const [text, height] of found) expect(height, text).toBeGreaterThanOrEqual(MIN);
}

for (const [name, size] of Object.entries(WIDTHS)) {
  test.describe(`${name} ${size.width}px`, () => {
    test.use({ viewport: size });

    test("targets: every phone line is 44px tall, none overlapping", async ({ page }) => {
      for (const path of ["/read", "/write", "/privacy"]) {
        await open(page, path);
        const lines = page.locator('main a[href^="tel:"]');
        await expect(lines).toHaveCount(3);
        expectTall(await heights(lines), 3);
        const boxes = await Promise.all((await lines.all()).map((l) => l.boundingBox()));
        for (let i = 1; i < boxes.length; i++) {
          expect(boxes[i]!.y, `${path} 第 ${i + 1} 條不與上一條重疊`).toBeGreaterThanOrEqual(
            boxes[i - 1]!.y + boxes[i - 1]!.height,
          );
        }
      }
    });

    test("targets: header nav and footer links are 44px tall", async ({ page }) => {
      await open(page, "/");
      const nav = page.getByRole("navigation", { name: "主要導覽" }).getByRole("link");
      await expect(nav).toHaveCount(4);
      expectTall(await heights(nav), 4);
      const footer = page.getByRole("contentinfo").locator("a, button");
      expectTall(await heights(footer), 4);
    });
  });
}

test("pressed: 有回應到我 shows a check mark and an ink border", async ({ page }) => {
  await open(page, "/read");
  const button = page.getByRole("button", { name: "有回應到我" });
  const look = () =>
    button.evaluate((el) => ({
      mark: getComputedStyle(el, "::before").content,
      border: getComputedStyle(el).borderTopColor,
    }));
  const before = await look();
  expect(before.mark).toBe("none");

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  expect((await look()).mark).toContain("✓");
  // The border eases over --duration-fast; read it once it has settled.
  await expect.poll(async () => (await look()).border).toBe("rgb(47, 59, 65)"); // --paperink
  // The mark is decoration: the accessible name stays the same.
  await expect(page.getByRole("button", { name: "有回應到我", exact: true })).toBeVisible();

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect((await look()).mark).toBe("none");
});
