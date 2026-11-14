import type { Page } from "@playwright/test";
import { answer, expect, hydrated, test, turnstileLog, WIDTHS } from "./fixtures";
import { SCREENS } from "./screens";

// 寫信頁打磨 (V5-c4, #31): errors by the submit button, focus on each new
// screen, the chooser's cards, field contrast, Enter in one-line fields, the
// live body count, Turnstile's theme, the consent note's size and the
// privacy notice as a real modal. The fixture erases what each test sent.

const h1 = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const submitButton = (page: Page) => page.getByRole("button", { name: "留下這封信 ↗" });

async function open(page: Page, name: "write-past" | "write-present") {
  const screen = SCREENS.find((s) => s.name === name)!;
  await screen.open(page);
  await screen.ready(page);
}

async function consent(page: Page) {
  await page.getByRole("checkbox", { name: /我已滿 18 歲，內容是我的真實經歷/ }).check();
  await page.getByRole("checkbox", { name: /我了解團隊可閱讀投稿/ }).check();
}

/** Every POST of a letter, with the body it sent. */
function letterPosts(page: Page) {
  const bodies: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/me/stories")
      bodies.push((r.postDataJSON() as { body: string }).body);
  });
  return bodies;
}

test.describe("phone 390px", () => {
  test.use({ viewport: WIDTHS.mobile });

  const cases: {
    name: string;
    message: string;
    prepare: (page: Page) => Promise<void>;
  }[] = [
    {
      name: "nothing answered",
      message: "至少留下一件事、一個畫面或一點感受。",
      prepare: async () => {},
    },
    {
      name: "over 1,500",
      message: "這封信的正文合計超過 1,500 字，請稍微縮短後再送出。",
      prepare: async (page) => {
        for (const label of [
          "你想起的是哪一件事？",
          "如果只留下一個畫面，你會寫下哪個瞬間？",
          "那時候，你最在意或最不確定的是什麼？",
        ])
          await page.getByLabel(label).fill("字".repeat(600));
      },
    },
    {
      name: "Turnstile refused twice",
      message: "人機驗證沒有通過，請再試一次。",
      prepare: async (page) => {
        await page.getByLabel("你想起的是哪一件事？").fill("送不出去的一件事。");
        await page.route("**/api/me/stories", (route) =>
          route.request().method() === "POST"
            ? route.fulfill({
                status: 403,
                json: { error: "人機驗證沒有通過，請再試一次。", code: "turnstile" },
              })
            : route.continue(),
        );
      },
    },
    {
      name: "503",
      message: "人機驗證服務暫時無法使用，請保留文字並稍後重試。",
      prepare: async (page) => {
        await page.getByLabel("你想起的是哪一件事？").fill("送不出去的一件事。");
        await page.route("**/api/me/stories", (route) =>
          route.request().method() === "POST"
            ? route.fulfill({
                status: 503,
                json: {
                  error: "人機驗證服務暫時無法使用，請保留文字並稍後重試。",
                  code: "turnstile",
                },
              })
            : route.continue(),
        );
      },
    },
  ];
  for (const c of cases) {
    test(`a submit error (${c.name}) shows by the button, on screen`, async ({ page }) => {
      await open(page, "write-past");
      await page.getByLabel("這件事大約發生在什麼時候？").fill("高中時");
      await consent(page);
      await c.prepare(page);
      await submitButton(page).click();
      const form = page.locator("form");
      const alert = form.getByRole("alert");
      await expect(alert).toHaveText(c.message);
      await expect(alert, "390px 寬時不用捲動就看得到").toBeInViewport();
      await expect(submitButton(page)).toBeInViewport();
      // One message, by the button: not also at the top of the page.
      await expect(page.getByRole("alert")).toHaveCount(1);
      const [button, message] = [await submitButton(page).boundingBox(), await alert.boundingBox()];
      expect(message!.y - (button!.y + button!.height), "緊接在送出按鈕下方").toBeLessThan(40);
      expect(message!.y).toBeGreaterThan(button!.y);

      // The same error again, after scrolling away: back on screen.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await expect(alert).not.toBeInViewport();
      await submitButton(page).evaluate((b: HTMLElement) => b.click());
      await expect(alert).toHaveText(c.message);
      await expect(alert, "同樣的錯誤再出現一次也捲回來").toBeInViewport();
    });
  }

  test("privacy notice: page under it doesn't scroll", async ({ page }) => {
    await open(page, "write-present");
    // Opened from the top of the page (a script click doesn't scroll), so
    // there is room to scroll down behind it.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page
      .getByRole("button", { name: "完整資料使用說明" })
      .evaluate((b: HTMLElement) => b.click());
    const dialog = page.getByRole("dialog", { name: "讓文字安心留下" });
    await expect(dialog).toBeVisible();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBe(0);
    // The backdrop, below the dialog box.
    const box = (await dialog.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 30);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY), "背景不捲動").toBe(before);
  });
});

test("focus goes to the new screen's heading: chosen, sent, 重新選擇寫法", async ({ page }) => {
  await page.goto("/write");
  await hydrated(page);
  await page.getByRole("button", { name: /^回想一段經歷/ }).click();
  await expect(h1(page, "回想一段經歷")).toBeFocused();

  await page.getByRole("button", { name: "← 重新選擇寫法" }).click();
  await answer(page, "清除並切換");
  await expect(h1(page, "你今天想怎麼寫？")).toBeFocused();

  await page.getByRole("button", { name: /^記下此刻/ }).click();
  await expect(h1(page, "記下此刻")).toBeFocused();
  await page.getByLabel("剛剛發生了什麼？").fill("自動化測試的文字，測試結束會刪除。");
  await page.getByLabel("現在的感覺").fill("平靜");
  await consent(page);
  await submitButton(page).click();
  await expect(page.getByRole("heading", { level: 2, name: "你的文字已留下。" })).toBeFocused();
});

test("chooser: each card has its heading outside a short button", async ({ page }) => {
  await page.goto("/write");
  await hydrated(page);
  for (const [heading, action] of [
    [/^有一段過去，\s*我還記得$/, "回想一段經歷"],
    [/^今天，\s*我有一點感受$/, "記下此刻"],
  ] as const) {
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    const button = page.getByRole("button", { name: new RegExp(`^${action}`) });
    await expect(button).toHaveCount(1);
    // Named by its action and the card's heading, not the card's whole text.
    await expect(button).toHaveAccessibleName(
      new RegExp(`^${action} ${heading.source.slice(1, -1)}$`),
    );
    await expect(button.getByRole("heading")).toHaveCount(0);
    await expect(button.locator("p, h2")).toHaveCount(0);
  }
});

/** WCAG relative luminance contrast of two opaque rgb() colours. */
function ratio(a: number[], b: number[]) {
  const lum = (c: number[]) => {
    const [r, g, bl] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const rgba = (css: string) => {
  const [r, g, b, a = 1] = css.match(/[\d.]+/g)!.map(Number);
  return { rgb: [r, g, b], a };
};
const over = (fg: string, bg: number[]) => {
  const { rgb, a } = rgba(fg);
  return rgb.map((v, i) => v * a + bg[i] * (1 - a));
};

test("fields: border ≥ 3:1 and placeholder ≥ 4.5:1", async ({ page }) => {
  await open(page, "write-present");
  const field = page.getByLabel("剛剛發生了什麼？");
  const css = await field.evaluate((el) => {
    const s = getComputedStyle(el);
    const form = el.closest("form")!;
    return {
      border: s.borderTopColor,
      background: s.backgroundColor,
      placeholder: getComputedStyle(el, "::placeholder").color,
      form: getComputedStyle(form).backgroundColor,
      page: getComputedStyle(document.body).backgroundColor,
    };
  });
  const fieldBg = rgba(css.background).rgb;
  const around = over(css.form, rgba(css.page).rgb);
  const border = over(css.border, fieldBg);
  expect(ratio(border, fieldBg), "邊框對輸入框底色").toBeGreaterThanOrEqual(3);
  expect(ratio(border, around), "邊框對表單底色").toBeGreaterThanOrEqual(3);
  expect(ratio(over(css.placeholder, fieldBg), fieldBg), "placeholder").toBeGreaterThanOrEqual(4.5);
});

test("Enter in a one-line field doesn't send the letter; in a textarea it's a new line", async ({
  page,
}) => {
  const posts = letterPosts(page);
  await open(page, "write-present");
  const body = page.getByLabel("剛剛發生了什麼？");
  await body.fill("第一行");
  await body.press("End");
  await body.press("Enter");
  await body.pressSequentially("第二行");
  await expect(body).toHaveValue("第一行\n第二行");
  const mood = page.getByLabel("現在的感覺");
  await mood.fill("平靜");
  await consent(page);
  await page.getByLabel("給這封信一個名字（選填）").fill("按 Enter 不送出");
  for (const field of [mood, page.getByLabel("給這封信一個名字（選填）")]) {
    await field.press("Enter");
  }
  await page.waitForTimeout(300);
  await expect(page.getByRole("heading", { name: "你的文字已留下。" })).toHaveCount(0);
  expect(posts).toEqual([]);

  // While an IME is composing, Enter is left alone (it picks the characters).
  const prevented = await mood.evaluate((el) =>
    [{ isComposing: false }, { isComposing: true }, { isComposing: false, keyCode: 229 }].map(
      ({ keyCode, ...init }) => {
        const e = new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
          ...init,
        });
        if (keyCode) Object.defineProperty(e, "keyCode", { value: keyCode });
        el.dispatchEvent(e);
        return e.defaultPrevented;
      },
    ),
  );
  expect(prevented).toEqual([true, false, false]);

  // The button still sends it.
  await submitButton(page).click();
  await expect(page.getByRole("heading", { name: "你的文字已留下。" })).toBeVisible();
  expect(posts).toHaveLength(1);
});

test("live count: N／1,500 of the body as sent, in UTF-16 units like the server", async ({
  page,
}) => {
  const posts = letterPosts(page);
  await open(page, "write-past");
  const count = page.getByText(/^[\d,]+／1,500$/);
  await expect(count).toHaveText("0／1,500");
  const event = page.getByLabel("你想起的是哪一件事？");
  await event.fill("一二三");
  // 「我記得的事：一二三」
  await expect(count).toHaveText("9／1,500");
  await page.getByLabel("那時候，你最在意或最不確定的是什麼？").fill("😀 ");
  // + "\n\n當時的感受：😀" (the emoji is two UTF-16 units; the space is trimmed)
  await expect(count).toHaveText("19／1,500");
  await expect(event).toHaveAccessibleDescription("19／1,500");

  // Over the limit: the count says so before sending.
  const scene = page.getByLabel("如果只留下一個畫面，你會寫下哪個瞬間？");
  await event.fill("字".repeat(700));
  await scene.fill("字".repeat(700));
  // 6 + 700 + 2 + 5 + 700 + 2 + 6 + 2
  await expect(count).toHaveText("1,423／1,500");
  await page.getByLabel("那時候，你最在意或最不確定的是什麼？").fill("字".repeat(80));
  await expect(count).toHaveText("1,501／1,500");
  await page.getByLabel("那時候，你最在意或最不確定的是什麼？").fill("字".repeat(79));
  await expect(count).toHaveText("1,500／1,500");

  // A reload brings the draft back with its count.
  await page.reload();
  await hydrated(page);
  await expect(count).toHaveText("1,500／1,500");

  // What is sent is exactly that long, and the server takes it.
  await page.getByLabel("這件事大約發生在什麼時候？").fill("高中時");
  await consent(page);
  await submitButton(page).click();
  await expect(page.getByRole("heading", { name: "你的文字已留下。" })).toBeVisible();
  expect(posts.map((b) => b.length)).toEqual([1500]);

  // 原文 and 當下信 count their one body.
  await page.goto("/write?mode=past");
  await hydrated(page);
  await page.getByLabel("你想怎麼寫？").selectOption("original");
  await page.getByLabel("當時的原文").fill("  原文😀  ");
  await expect(count).toHaveText("4／1,500");
  await page.goto("/write?mode=present");
  await hydrated(page);
  await page.getByLabel("剛剛發生了什麼？").fill("今天");
  await expect(count).toHaveText("2／1,500");
});

test("Turnstile is drawn dark", async ({ page }) => {
  await open(page, "write-present");
  await expect.poll(async () => (await turnstileLog(page))?.rendered.length).toBe(1);
  expect((await turnstileLog(page))!.rendered[0]).toMatchObject({ theme: "dark" });
});

test("consent note is 13px, wording unchanged", async ({ page }) => {
  await open(page, "write-present");
  const note = page.getByText("未勾選時不會公開，管理團隊仍可閱讀。").locator("..");
  await expect(note).toHaveText(
    "未勾選時不會公開，管理團隊仍可閱讀。之後可在「我的片段」改為分享或停止分享。審閱不會改寫原文。請移除姓名、公司、地址與第三人的私密資訊。",
  );
  await expect(note).toHaveCSS("font-size", "13px");
});

test("privacy notice is a modal: focus inside, Tab stays in, Esc closes, focus back", async ({
  page,
}) => {
  await open(page, "write-present");
  const opener = page.getByRole("button", { name: "完整資料使用說明" });
  const dialog = page.getByRole("dialog", { name: "讓文字安心留下" });
  const focusInDialog = () =>
    page.evaluate(() => !!document.activeElement?.closest("dialog[open]"));
  const focusBehind = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      return !!a && a !== document.body && !a.closest("dialog");
    });

  await opener.click();
  await expect(dialog).toBeVisible();
  expect(await focusInDialog(), "開啟時焦點在對話框裡").toBe(true);
  // Tab around more times than the dialog has stops: never onto the page behind.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await focusBehind(), `第 ${i + 1} 次 Tab`).toBe(false);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener, "焦點回到開啟的按鈕").toBeFocused();

  // 我了解了 closes it too, from the footer's link.
  const footer = page.getByRole("contentinfo").getByRole("button", { name: "先前投稿資料說明" });
  await footer.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "我了解了" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(footer).toBeFocused();
  // ×, too.
  await footer.click();
  await dialog.getByRole("button", { name: "關閉說明" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(footer).toBeFocused();
});
