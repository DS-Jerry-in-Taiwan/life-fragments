import type { Page } from "@playwright/test";
import { asAdmin, expect, hydrated, settle, test, TURNSTILE_TOKEN, WIDTHS } from "./fixtures";
import { archiveWithStories, mineWithStories, STATES, STORIES, submit } from "./states";

// Browser QA (V5-d, #39; #4 §4.8's list), the automatable part: layout at
// 320 / 390 / 1280 and at 200% zoom, text contrast over the night sky,
// keyboard-only main flows, page titles and the skip link at phone width,
// reduced motion, tap target sizes and the unopened entries' text. axe runs
// in a11y.spec.ts; the device checks are listed in PROJECT_NOTES.md.

/** Viewport widths where nothing may scroll sideways (320: the narrowest phones). */
const LAYOUT_WIDTHS = [320, WIDTHS.mobile.width, WIDTHS.desktop.width];

const scrollsSideways = (page: Page) =>
  page.evaluate(() => {
    const el = document.scrollingElement!;
    return el.scrollWidth > el.clientWidth ? `${el.scrollWidth} > ${el.clientWidth}` : "";
  });

test.describe("layout: no horizontal scroll", () => {
  test.use({ viewport: WIDTHS.mobile });
  for (const state of STATES) {
    test(`layout: ${state.name} at 320 / 390 / 1280`, async ({ page, context }) => {
      if (state.admin) await asAdmin(context);
      await state.open(page, context);
      await settle(page);
      for (const width of LAYOUT_WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
        expect(await scrollsSideways(page), `${state.name} ${width}px 不應橫向捲動`).toBe("");
      }
    });
  }
});

/*
 * 200% zoom. Browser zoom at 200% in a 1280 × 800 window gives the page a
 * 640 × 400 CSS-pixel viewport at devicePixelRatio 2, and media queries see
 * 640px: exactly this emulation. (CSS `zoom: 2` on <html> would keep the
 * 1280px media queries, which a zoomed browser doesn't, so it is less
 * faithful.) 640px is our phone breakpoint, so the phone layout applies.
 */
test.describe("200% zoom (640 × 400 at 2×)", () => {
  test.use({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });

  for (const state of STATES) {
    test(`zoom: ${state.name} has no horizontal scroll`, async ({ page, context }) => {
      if (state.admin) await asAdmin(context);
      await state.open(page, context);
      await settle(page);
      expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
      expect(await scrollsSideways(page)).toBe("");
    });
  }

  test("zoom: the nav is reachable and the write form can be sent", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    const nav = page.getByRole("navigation", { name: "主要導覽" });
    for (const name of ["讀一封信", "公開信箱", "寫一封信", "我的片段"])
      await expect(nav.getByRole("link", { name })).toBeInViewport();
    await nav.getByRole("link", { name: "寫一封信" }).click();
    await page.getByRole("button", { name: /今天，/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "記下此刻" })).toBeVisible();
    await page
      .getByLabel("剛剛發生了什麼？")
      .fill("這是 200% 縮放測試留下的文字，測試結束會刪除。");
    await page.getByLabel("現在的感覺").fill("平靜");
    await page.getByRole("checkbox", { name: /我已滿 18 歲，內容是我的真實經歷/ }).check();
    await page.getByRole("checkbox", { name: /我了解團隊可閱讀投稿/ }).check();
    const send = page.getByRole("button", { name: "留下這封信 →" });
    // Centred: scrollIntoViewIfNeeded stops at a fractional edge (1.85 line heights).
    await send.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await expect(send).toBeInViewport({ ratio: 1 });
    await send.click();
    await expect(page.getByRole("heading", { name: "你的文字已留下。" })).toBeVisible();
    expect(await scrollsSideways(page)).toBe("");
  });
});

/*
 * Contrast of the text itself, where axe says "incomplete" (text over the
 * night sky's gradient, or over the modal backdrop). Every shown,
 * non-decorative text element's colour is measured against its own
 * background, composed from its ancestors' background colours over the
 * lightest point of the sky (SiteShell.module.css: the #27414b66 glow over
 * #122936 = #1a333e, stars ignored). Large text (≥ 24px, or ≥ 18.66px bold)
 * needs 3:1, the rest 4.5:1. Disabled controls are exempt (WCAG 1.4.3).
 */
const SKY_LIGHTEST = [26, 51, 62];

type Low = { text: string; size: number; ratio: number; fg: string; bg: string };

function lowContrast(page: Page) {
  return page.evaluate((sky) => {
    const parse = (css: string): number[] | null => {
      const srgb = css.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?/);
      if (srgb) return [...srgb.slice(1, 4).map((v) => Number(v) * 255), Number(srgb[4] ?? 1)];
      const m = css.match(/^rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:,? \/? ?([\d.]+))?\)/);
      return m ? [...m.slice(1, 4).map(Number), Number(m[4] ?? 1)] : null;
    };
    const over = (top: number[], under: number[]) =>
      under.slice(0, 3).map((u, i) => top[i] * top[3] + u * (1 - top[3]));
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const hex = (c: number[]) =>
      "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    const out: Low[] = [];
    let measured = 0;
    for (const el of document.body.querySelectorAll("*")) {
      if (["SCRIPT", "STYLE", "TEMPLATE", "OPTION", "DATALIST"].includes(el.tagName)) continue;
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      // Symbols count too (×, ✓): they can carry meaning. Decoration is
      // excluded by aria-hidden below.
      if (!own) continue;
      if (el.closest('[aria-hidden="true"], noscript, [inert]')) continue;
      if (el.closest("button:disabled, input:disabled, fieldset:disabled")) continue;
      // While a modal is open, only it is shown at full strength.
      const modal = document.querySelector("dialog:modal");
      if (modal && !modal.contains(el)) continue;
      const style = getComputedStyle(el);
      if (!el.getClientRects().length || style.visibility === "hidden") continue;
      // Off-screen skip link (shown only on focus).
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 && window.scrollY === 0) continue;
      const chain: Element[] = [];
      for (let a: Element | null = el; a && a !== document.documentElement; a = a.parentElement)
        chain.unshift(a);
      // Each element with `opacity` is a group: its own background, its
      // descendants and the text are composed first, then blended over what
      // lies under the group by that opacity. Render the background pixel
      // and the text pixel that way, from the outermost ancestor in.
      const fgRaw = parse(style.color)!;
      const layers = chain.map((a) => {
        const cs = getComputedStyle(a);
        return { bg: parse(cs.backgroundColor), opacity: Number(cs.opacity) };
      });
      const render = (k: number, under: number[], text: boolean): number[] => {
        if (k === layers.length) return text ? over(fgRaw, under) : under;
        const { bg: own, opacity } = layers[k];
        const inner = own && own[3] > 0 ? over(own, under) : under;
        const done = render(k + 1, inner, text);
        return under.map((u, i) => done[i] * opacity + u * (1 - opacity));
      };
      const bg = render(0, sky, false);
      const fg = render(0, sky, true);
      const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      measured++;
      if (ratio < (large ? 3 : 4.5))
        out.push({
          text: own.slice(0, 24),
          size,
          ratio: Math.round(ratio * 100) / 100,
          fg: hex(fg),
          bg: hex(bg),
        });
    }
    return { measured, low: out };
  }, SKY_LIGHTEST) as Promise<{ measured: number; low: Low[] }>;
}

// Both widths axe scans: its gradient results are incomplete at each.
for (const [label, viewport] of Object.entries(WIDTHS))
  test.describe(`contrast ${label}: text ≥ 4.5:1, large text ≥ 3:1`, () => {
    test.use({ viewport });
    for (const state of STATES) {
      test(`contrast ${viewport.width}: ${state.name}`, async ({ page, context }) => {
        if (state.admin) await asAdmin(context);
        await state.open(page, context);
        await settle(page);
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
        const { measured, low } = await lowContrast(page);
        expect(measured, "應量到文字").toBeGreaterThan(3);
        expect(low).toEqual([]);
      });
    }
  });

// ---------------------------------------------------------------------------
// Keyboard only: Tab / Shift+Tab / Enter / Space / Esc, no clicks.

/** What the focused element is called: aria-label, its label, or its text. */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "";
    const label =
      el.getAttribute("aria-label") ||
      (el as HTMLInputElement).labels?.[0]?.textContent ||
      el.textContent ||
      "";
    return label.replace(/\s+/g, " ").trim();
  });

/** Presses Tab (or Shift+Tab) until the focused element's name contains `name`. */
async function tabTo(page: Page, name: string | RegExp, { back = false, max = 80 } = {}) {
  const seen: string[] = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
    const now = await focusedName(page);
    seen.push(now.slice(0, 16));
    if (typeof name === "string" ? now.includes(name) : name.test(now)) return;
  }
  throw new Error(`Tab 找不到「${name}」：${seen.join(" / ")}`);
}

const focusVisible = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement!;
    const s = getComputedStyle(el);
    return el.matches(":focus-visible") && s.outlineStyle !== "none" && s.outlineWidth !== "0px";
  });

test.describe("keyboard only", () => {
  test.use({ viewport: WIDTHS.mobile });

  test("keyboard: /read — 再讀一封, a scenario, 有回應到我 on and off", async ({ page }) => {
    await page.goto("/read");
    await hydrated(page);
    const letter = page.locator("[data-letter-id]");
    const first = await letter.getAttribute("data-letter-id");

    await tabTo(page, "再讀一封");
    expect(await focusVisible(page), "焦點外框看得見").toBe(true);
    await page.keyboard.press("Enter");
    await expect(letter).toBeFocused();
    await expect(letter).not.toHaveAttribute("data-letter-id", first!);

    await expect(page.getByRole("group", { name: "選擇信件情境" })).toBeVisible();
    await tabTo(page, "感情");
    await page.keyboard.press("Enter");
    await expect(letter).toBeFocused();
    await expect(letter).toHaveAttribute("data-scenario", "感情");

    const resonate = page.getByRole("button", { name: "有回應到我" });
    await tabTo(page, "有回應到我");
    await page.keyboard.press("Space");
    await expect(resonate).toHaveAttribute("aria-pressed", "true");
    await expect(resonate).toBeFocused();
    await expect(page.getByRole("status")).toContainText("謝謝你停下來讀這封信");
    await page.keyboard.press("Space");
    await expect(resonate).toHaveAttribute("aria-pressed", "false");
  });

  test("keyboard: /write — choose, fill, send, the success screen", async ({ page }) => {
    await page.goto("/write");
    await hydrated(page);
    await tabTo(page, "記下此刻");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "記下此刻" })).toBeFocused();

    await tabTo(page, "給這封信一個名字");
    await page.keyboard.type(`e2e 鍵盤 ${Date.now()}`);
    await tabTo(page, "剛剛發生了什麼？");
    await page.keyboard.type("這是只用鍵盤寫的測試信，測試結束會刪除。");
    // Enter in the textarea is a new line, not a submit.
    await page.keyboard.press("Enter");
    await page.keyboard.type("第二行。");
    await tabTo(page, "現在的感覺");
    await page.keyboard.type("平靜");
    await page.keyboard.press("Enter"); // a one-line field: nothing is sent
    await expect(page.getByRole("heading", { level: 1, name: "記下此刻" })).toBeVisible();
    await tabTo(page, "我已滿 18 歲，內容是我的真實經歷");
    await page.keyboard.press("Space");
    await tabTo(page, "我了解團隊可閱讀投稿");
    await page.keyboard.press("Space");
    await expect(page.getByRole("checkbox", { name: /我了解團隊可閱讀投稿/ })).toBeChecked();

    const posted = page.waitForRequest(
      (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/me/stories",
    );
    await tabTo(page, "留下這封信");
    await page.keyboard.press("Enter");
    expect((await posted).headers()["x-turnstile-token"]).toBe(TURNSTILE_TOKEN);
    const done = page.getByRole("heading", { name: "你的文字已留下。" });
    await expect(done).toBeFocused();
    await tabTo(page, "查看我的片段");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/mine$/);
  });

  test("keyboard: /mine — 撤回並刪除 through the ConfirmDialog", async ({ page, context }) => {
    const title = `e2e 鍵盤撤回 ${Date.now()}`;
    await submit(context, title);
    await page.goto("/mine");
    await hydrated(page);
    const withdraw = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: title }) })
      .getByRole("button", { name: "撤回並刪除" });
    await expect(withdraw).toBeVisible();

    // Esc says no, and focus goes back to the button.
    await tabTo(page, "撤回並刪除");
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "取消" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(withdraw).toBeFocused();

    // Tab never reaches the page behind the dialog (the native modal may
    // pass through the browser's own UI); its confirm button deletes.
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("button", { name: "取消" })).toBeFocused();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      const behind = await page.evaluate(() => {
        const a = document.activeElement;
        return !!a && a !== document.body && !a.closest("dialog");
      });
      expect(behind, `第 ${i + 1} 次 Tab 不到對話框後面`).toBe(false);
    }
    await tabTo(page, "確定刪除", { max: 4 });
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    const notice = page.getByRole("status").filter({ hasText: "已刪除這段文字。" });
    await expect(notice).toBeVisible();
    await expect.poll(() => focusedName(page)).toContain("已刪除這段文字。");
    await expect(page.getByRole("heading", { name: "還沒有留下的片段" })).toBeVisible();
  });

  test("keyboard: /archive — feedback with the consent", async ({ page }) => {
    await page.route(
      (url) => url.pathname === "/api/stories",
      (route) => route.fulfill({ json: { stories: STORIES } }),
    );
    let token = "";
    await page.route(
      (url) => url.pathname === "/api/feedback",
      (route) => {
        token = route.request().headers()["x-turnstile-token"];
        return route.fulfill({ json: { ok: true } });
      },
    );
    await page.goto("/archive");
    await hydrated(page);
    await expect(page.getByRole("heading", { name: STORIES[0].title })).toBeVisible();

    await tabTo(page, "願意告訴我們讀起來如何嗎？");
    await page.keyboard.press("Enter");
    const consent = page.getByRole("checkbox", { name: /同意保存本次回饋/ });
    await expect(consent).toBeVisible();
    // The buttons wait for the consent, so the next stop is the checkbox.
    await tabTo(page, "同意保存本次回饋", { max: 1 });
    await page.keyboard.press("Space");
    await expect(consent).toBeChecked();
    await tabTo(page, "有一點共鳴", { max: 3 });
    await page.keyboard.press("Enter");
    await expect(page.locator("details").getByRole("status")).toHaveText("謝謝，你的回饋已保存。");
    expect(token).toBe(TURNSTILE_TOKEN);

    // The pressed button is now disabled (✓ 已記錄); Tab carries on from
    // there to the note, then 送出回饋.
    await tabTo(page, "有沒有哪個細節留下印象", { max: 3 });
    await page.keyboard.type("鍵盤測試的回饋。");
    await tabTo(page, "送出回饋", { max: 3 });
    await page.keyboard.press("Enter");
    await expect(page.locator("details").getByRole("status")).toHaveText("謝謝，你的回饋已保存。");
  });
});

// ---------------------------------------------------------------------------
// Skip link and titles at phone width (page-title.spec.ts covers the default
// desktop viewport and the server HTML).

const TITLED = [
  ["/", "Ring letter｜遇見另一段時光"],
  ["/read", "讀一封信｜Ring letter"],
  ["/archive", "公開信箱｜Ring letter"],
  ["/write", "寫一封信｜Ring letter"],
  ["/mine", "我的片段｜Ring letter"],
  ["/privacy", "資料使用說明｜Ring letter"],
  ["/admin", "管理信箱｜Ring letter"],
] as const;

test.describe("phone 390px: skip link and titles", () => {
  test.use({ viewport: WIDTHS.mobile });

  test("skip link: the first Tab stop on every route; Enter focuses main, no #", async ({
    page,
    context,
  }) => {
    await asAdmin(context);
    for (const [path] of TITLED) {
      await page.goto(path);
      await hydrated(page);
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "跳到主要內容" }), path).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("main"), path).toBeFocused();
      expect(new URL(page.url()).hash, path).toBe("");
    }
  });

  test("titles: seven distinct titles, each set after client navigation", async ({ page }) => {
    expect(new Set(TITLED.map(([, t]) => t)).size).toBe(7);
    await page.goto("/privacy");
    await hydrated(page);
    await expect(page).toHaveTitle("資料使用說明｜Ring letter");
    const nav = page.getByRole("navigation", { name: "主要導覽" });
    for (const [path, name] of [
      ["/read", "讀一封信"],
      ["/archive", "公開信箱"],
      ["/write", "寫一封信"],
      ["/mine", "我的片段"],
    ] as const) {
      await nav.getByRole("link", { name }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page).toHaveTitle(TITLED.find(([p]) => p === path)![1]);
    }
    await page
      .getByRole("banner")
      .getByRole("link", { name: /^Ring letter/ })
      .click();
    await expect(page).toHaveTitle("Ring letter｜遇見另一段時光");
  });
});

// ---------------------------------------------------------------------------
// prefers-reduced-motion: no animation or transition, and every scroll the
// site starts is instant.

/** Records the `behavior` of every scrollIntoView / scrollTo the page calls. */
async function recordScrolls(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = ((window as unknown as { __scrolls: string[] }).__scrolls = []);
    const intoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (arg?: boolean | ScrollIntoViewOptions) {
      calls.push("scrollIntoView:" + (typeof arg === "object" ? (arg.behavior ?? "auto") : "auto"));
      return intoView.call(this, arg);
    };
    const to = window.scrollTo;
    window.scrollTo = function (this: Window, ...args: unknown[]) {
      const a = args[0];
      calls.push(
        "scrollTo:" +
          (typeof a === "object" && a ? ((a as ScrollToOptions).behavior ?? "auto") : "auto"),
      );
      return (to as (...x: unknown[]) => void).apply(this, args);
    } as typeof window.scrollTo;
  });
  return async () => {
    const calls = await page.evaluate(() =>
      (window as unknown as { __scrolls: string[] }).__scrolls.splice(0),
    );
    // Playwright's own scrolling (scrollIntoViewIfNeeded) doesn't go through these.
    return calls;
  };
}

/** Elements with a running animation, or a non-zero transition. */
const moving = (page: Page) =>
  page.evaluate(() => {
    const animated = document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .map(
        (a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? "?",
      );
    const transitions = [...document.querySelectorAll("*")]
      .filter((el) => {
        const s = getComputedStyle(el);
        return (
          s.transitionProperty !== "none" &&
          s.transitionDuration.split(",").some((d) => parseFloat(d) > 0)
        );
      })
      .map((el) => el.tagName.toLowerCase() + [...el.classList].map((c) => "." + c).join(""));
    return { animated, transitions: [...new Set(transitions)] };
  });

for (const reduce of [true, false]) {
  test(`motion: ${reduce ? "reduced — nothing moves, scrolls are instant" : "default — the letter arrives, scrolls are smooth"}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reduce ? "reduce" : "no-preference" });
    const scrolls = await recordScrolls(page);
    const want = reduce ? "auto" : "smooth";

    // /read: 再讀一封 animates the new letter in and scrolls to it.
    await page.goto("/read");
    await hydrated(page);
    await page.getByRole("button", { name: "再讀一封" }).click();
    const letter = page.locator("[data-letter-id]");
    await expect(letter).toBeFocused();
    expect(await letter.evaluate((el) => getComputedStyle(el).animationName)).toEqual(
      reduce ? "none" : expect.stringContaining("letter-arrive"),
    );
    const now = await moving(page);
    if (reduce) expect(now).toEqual({ animated: [], transitions: [] });
    else expect(now.transitions.length, "平常按鈕有轉場").toBeGreaterThan(0);
    expect(await scrolls()).toEqual([`scrollIntoView:${want}`]);

    // Header navigation scrolls to the top (useGo).
    await page
      .getByRole("navigation", { name: "主要導覽" })
      .getByRole("link", { name: "公開信箱" })
      .click();
    await expect(page).toHaveURL(/\/archive$/);
    // Read once: scrolls() drains the record.
    const navScrolls = await scrolls();
    expect(navScrolls).toContain(`scrollTo:${want}`);
    expect(navScrolls.filter((s) => !s.endsWith(want))).toEqual([]);

    // /archive: 再讀一封 scrolls to the next story.
    await archiveWithStories(page);
    await scrolls();
    await page.getByRole("button", { name: "再讀一封 →" }).click();
    await expect(page.locator("article[data-story-id]")).toBeFocused();
    expect(await scrolls()).toEqual([`scrollIntoView:${want}`]);
    if (reduce) expect((await moving(page)).transitions).toEqual([]);
  });
}

// ---------------------------------------------------------------------------
// Tap targets not covered by targets.spec.ts: every control in <main>
// (inline links inside running text excluded, as WCAG 2.5.8 does). 44px is
// our goal and is reported; 24px (WCAG 2.2 AA 2.5.8) is required.

type Target = { name: string; width: number; height: number };

const targets = (page: Page, scope = "main") =>
  page.evaluate((scope) => {
    const out: Target[] = [];
    const root = document.querySelector(scope) ?? document.body;
    const items = root.querySelectorAll(
      'button, summary, select, textarea, input:not([type="hidden"]), a[href]',
    );
    for (const el of items) {
      if (!el.getClientRects().length) continue;
      // Inline: a link or link-like button inside a sentence (2.5.8's exception).
      if (
        el.matches("a, button") &&
        el.closest("p, li, dd") &&
        !el.matches(".nav-link, .primary, .secondary, .danger, .text-btn")
      )
        continue;
      // A checkbox is pressed through its whole label.
      const box = (el.matches('input[type="checkbox"]') && el.closest("label")) || el;
      const r = box.getBoundingClientRect();
      const name = (
        el.getAttribute("aria-label") ||
        (el as HTMLInputElement).labels?.[0]?.textContent ||
        el.textContent ||
        el.getAttribute("name") ||
        el.tagName
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 18);
      out.push({
        name: `${el.tagName.toLowerCase()} ${name}`,
        width: Math.round(r.width),
        height: Math.round(r.height * 10) / 10,
      });
    }
    return out;
  }, scope);

const TARGET_STATES: {
  name: string;
  admin?: boolean;
  open: (page: Page, context: import("@playwright/test").BrowserContext) => Promise<void>;
}[] = [
  STATES.find((s) => s.name === "read-open")!,
  { name: "write-present", open: STATES.find((s) => s.name === "write-present")!.open },
  { name: "mine-stories", open: mineWithStories },
  {
    name: "mine-stories (share form closed)",
    open: async (page, context) => {
      await submit(context, `e2e QA 私人 ${Date.now()}`);
      await submit(context, `e2e QA 分享 ${Date.now()}`, true);
      await page.goto("/mine");
      await hydrated(page);
      await expect(page.getByRole("button", { name: "改為分享" })).toBeVisible();
    },
  },
  { name: "archive-stories", open: archiveWithStories },
  STATES.find((s) => s.name === "admin-lists")!,
];

for (const [label, viewport] of Object.entries(WIDTHS)) {
  test.describe(`targets ${label} ${viewport.width}px`, () => {
    test.use({ viewport });
    for (const state of TARGET_STATES) {
      test(`targets: ${state.name}`, async ({ page, context }) => {
        if (state.admin) await asAdmin(context);
        await state.open(page, context);
        await settle(page);
        const found = await targets(page);
        expect(found.length).toBeGreaterThan(2);
        const small = found.filter((t) => t.height < 44);
        console.log(
          `[targets] ${state.name} ${viewport.width}: ` +
            found.map((t) => `${t.name} ${t.height}`).join(" | "),
        );
        console.log(
          `[targets] ${state.name} ${viewport.width} UNDER 44: ` +
            (small.map((t) => `${t.name} ${t.width}×${t.height}`).join(" | ") || "none"),
        );
        // Under 24px (WCAG 2.2 AA 2.5.8's minimum) only these two link-styled
        // buttons, which pass 2.5.8 by its spacing exception (axe's
        // target-size rule, a11y.spec.ts, checks that); reported in #39.
        const UNDER_24 = /^button (完整資料使用說明|《.*》)$/;
        expect(
          found.filter((t) => (t.height < 24 || t.width < 24) && !UNDER_24.test(t.name)),
        ).toEqual([]);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Unopened entries (#56): 尚未開放 reaches assistive tech.

test("not open: 尚未開放 is in the accessibility tree on both entries", async ({ page }) => {
  await page.goto("/read");
  await hydrated(page);
  const echo = page.locator('[data-form="echo"]');
  expect(await echo.ariaSnapshot()).toMatch(/留下回音\s*尚未開放|留下回音[\s\S]*尚未開放/);
  const summary = page.locator("summary", { hasText: "想參加人工媒合？" });
  // A <summary> is a button-like control: its accessible name includes the tag.
  await expect(summary).toHaveAccessibleName(/想參加人工媒合？\s*尚未開放/);
  await summary.press("Enter");
  const distress = page.locator('[data-form="distress"]');
  expect(await distress.ariaSnapshot()).toContain("尚未開放");
  // Not hidden from assistive tech anywhere up the tree.
  for (const tag of await page.getByText("尚未開放", { exact: true }).all())
    expect(await tag.evaluate((el) => !!el.closest('[aria-hidden="true"]'))).toBe(false);
});

// v3 D2: the scenarios are always-visible chips, each a 44px target (was a 43.4px summary).
test("/read scenario chips are 44px click targets", async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/read");
    await hydrated(page);
    const chips = page.getByRole("group", { name: "選擇信件情境" }).getByRole("button");
    await expect(chips).toHaveCount(5);
    for (const chip of await chips.all())
      expect((await chip.boundingBox())!.height, await chip.innerText()).toBeGreaterThanOrEqual(44);
    await expect(page.locator("summary", { hasText: "想讀特定情境？" })).toHaveCount(0);
  }
});
