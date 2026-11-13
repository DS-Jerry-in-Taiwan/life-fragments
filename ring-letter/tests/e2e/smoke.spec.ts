import { adminHeaders, asAdmin, expect, hydrated, ORIGIN, test, WIDTHS } from "./fixtures";
import { SCREENS } from "./screens";

// Functional smoke (issue #4, section 7). Each test gets a fresh browser
// context, so no cookies are shared; the fixture erases whatever the
// test's anonymous session created.

for (const [label, viewport] of Object.entries(WIDTHS)) {
  test.describe(`${label} ${viewport.width}px`, () => {
    test.use({ viewport });
    for (const screen of SCREENS) {
      test(`${screen.name} opens`, async ({ page, context }) => {
        if (screen.admin) await asAdmin(context);
        await screen.open(page);
        await screen.ready(page);
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, "不應出現橫向捲動").toBeLessThanOrEqual(clientWidth);
      });
    }
  });
}

test("submit → 我的片段 → withdraw", async ({ page }) => {
  const title = `e2e 測試 ${Date.now()}`;
  const write = SCREENS.find((s) => s.name === "write-present")!;
  await write.open(page);
  await write.ready(page);

  await page.getByLabel("給這封信一個名字（選填）").fill(title);
  await page
    .getByLabel("剛剛發生了什麼？")
    .fill("這是自動化瀏覽器測試留下的文字，測試結束會刪除。");
  await page.getByLabel("現在的感覺").fill("平靜");
  await page.getByRole("checkbox", { name: /我已滿 18 歲，內容是我的真實經歷/ }).check();
  await page.getByRole("checkbox", { name: /我了解團隊可閱讀投稿/ }).check();
  await page.getByRole("button", { name: "留下這封信 ↗" }).click();
  await expect(page.getByRole("heading", { name: "你的文字已留下。" })).toBeVisible();
  await expect(
    page.getByText("這台裝置會記得你一年，共用裝置請記得到「我的片段」登出。"),
  ).toBeVisible();

  await page.getByRole("button", { name: "查看我的片段 →" }).click();
  const story = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: title }) });
  await expect(story).toBeVisible();
  await expect(story.getByText("未公開保存")).toBeVisible();
  await expect(story.getByText("此刻心情：平靜")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await story.getByRole("button", { name: "撤回並刪除" }).click();
  await expect(page.getByRole("status").filter({ hasText: "已刪除這段文字。" })).toBeVisible();
  await expect(story).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "還沒有留下的片段" })).toBeVisible();
});

test("我的片段: 在這台裝置登出 forgets this browser, the story stays", async ({
  page,
  context,
}) => {
  // Submitted through the API, without a writing attempt: after logging out
  // the fixture can't erase this session's rows, and a leftover attempt would
  // change the admin metrics baseline. Only the story is left, removed below.
  const title = `e2e 登出測試 ${Date.now()}`;
  const sameOrigin = { headers: { Origin: ORIGIN } };
  expect((await context.request.post(ORIGIN + "/api/session", sameOrigin)).status()).toBe(200);
  const submitted = await context.request.post(ORIGIN + "/api/me/stories", {
    ...sameOrigin,
    data: {
      title,
      body: "這是自動化瀏覽器測試留下的文字，用來驗證登出，測試結束會刪除。",
      era: "測試日期",
      source: "recollection",
      adult: true,
      privacy: true,
      share: false,
    },
  });
  expect(submitted.status()).toBe(200);
  const session = (await context.cookies(ORIGIN)).find((c) => c.name === "rl_session");
  expect(session, "應有 session cookie").toBeTruthy();
  // The page load itself re-issues the same cookie for another year (#4 §6.2).
  const visit = await page.goto("/mine");
  expect(await visit!.headerValue("set-cookie")).toMatch(
    new RegExp(`^rl_session=${session!.value}; .*Max-Age=31536000$`),
  );
  await hydrated(page);
  const renewed = (await context.cookies(ORIGIN)).find((c) => c.name === "rl_session");
  expect(renewed!.value).toBe(session!.value);
  expect(renewed!.expires - Date.now() / 1000).toBeGreaterThan(364 * 24 * 3600);

  const story = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: title }) });
  await expect(story).toBeVisible();

  // Cancelling the confirm changes nothing.
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "在這台裝置登出" }).click();
  await expect(story).toBeVisible();

  let message = "";
  page.once("dialog", (d) => {
    message = d.message();
    return d.accept();
  });
  await page.getByRole("button", { name: "在這台裝置登出" }).click();
  await expect(page.getByRole("status").filter({ hasText: "已在這台裝置登出。" })).toBeVisible();
  expect(message).toContain("投稿會保留");
  expect(message).toContain("新的身分");
  await expect(story).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "還沒有留下的片段" })).toBeVisible();
  expect((await context.cookies(ORIGIN)).some((c) => c.name === "rl_session")).toBe(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "還沒有留下的片段" })).toBeVisible();

  // The story is still on the server; remove it as admin (the fixture's
  // erase-all can't reach it any more).
  const queue = await context.request.get(ORIGIN + "/api/admin/queue", { headers: adminHeaders() });
  expect(queue.status()).toBe(200);
  const kept = ((await queue.json()).stories as { id: string; title: string }[]).filter(
    (s) => s.title === title,
  );
  expect(kept, "登出後投稿仍在伺服器").toHaveLength(1);
  const removed = await context.request.post(
    `${ORIGIN}/api/admin/stories/${encodeURIComponent(kept[0].id)}/moderation`,
    { headers: { ...adminHeaders(), Origin: ORIGIN }, data: { status: "delete" } },
  );
  expect(removed.status()).toBe(200);
});

test("all 7 routes load directly", async ({ page, context }) => {
  await asAdmin(context);
  for (const [path, heading] of [
    ["/", /寫下你的/],
    ["/read", "先讀一封，不必先寫"],
    ["/write", "你今天想怎麼寫？"],
    ["/mine", "我的片段"],
    ["/archive", /有一段生活/],
    ["/admin", "把關每一封來信"],
    ["/privacy", "讓文字安心留下"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  }
});

test("routes: nav buttons change the URL and the back button works", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const nav = page.getByRole("navigation", { name: "主要導覽" });
  await nav.getByRole("button", { name: "讀一封信" }).click();
  await expect(page).toHaveURL(/\/read$/);
  await nav.getByRole("button", { name: "我的片段" }).click();
  await expect(page).toHaveURL(/\/mine$/);
  await expect(page.getByRole("heading", { level: 1, name: "我的片段" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/read$/);
  await expect(page.getByRole("heading", { name: "先讀一封，不必先寫" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: /寫下你的/ })).toBeVisible();
  await page.getByRole("contentinfo").getByRole("button", { name: "先前公開信箱" }).click();
  await expect(page).toHaveURL(/\/archive$/);
});

test("write: choosing a type sets ?mode=, and the link opens the form directly", async ({
  page,
}) => {
  await page.goto("/write");
  await hydrated(page);
  await page.getByRole("button", { name: /有一段過去/ }).click();
  await expect(page).toHaveURL(/\/write\?mode=past$/);
  await expect(page.getByRole("heading", { level: 1, name: "回想一段經歷" })).toBeVisible();
  // Nav 寫一封信 goes back to the chooser, as in v1.
  await page
    .getByRole("navigation", { name: "主要導覽" })
    .getByRole("button", { name: "寫一封信" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "你今天想怎麼寫？" })).toBeVisible();
  // Direct link: the form opens and the writing attempt is recorded.
  const started = page.waitForResponse(
    (r) => r.url().endsWith("/api/writing-attempts") && r.request().method() === "POST",
  );
  await page.goto("/write?mode=present");
  await expect(page.getByRole("heading", { level: 1, name: "記下此刻" })).toBeVisible();
  expect((await started).ok()).toBe(true);
});

test("write: one start per chooser click; a second letter after submit works", async ({ page }) => {
  const starts: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/writing-attempts") && r.method() === "POST") starts.push(r.url());
  });
  await page.goto("/write");
  await hydrated(page);
  const fill = async (title: string) => {
    await page.getByLabel("給這封信一個名字（選填）").fill(title);
    await page.getByLabel("剛剛發生了什麼？").fill("自動化測試的文字，測試結束會刪除。");
    await page.getByLabel("現在的感覺").fill("平靜");
    await page.getByRole("checkbox", { name: /我已滿 18 歲，內容是我的真實經歷/ }).check();
    await page.getByRole("checkbox", { name: /我了解團隊可閱讀投稿/ }).check();
    await page.getByRole("button", { name: "留下這封信 ↗" }).click();
    await expect(page.getByRole("heading", { name: "你的文字已留下。" })).toBeVisible();
  };
  await page.getByRole("button", { name: /今天，/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "記下此刻" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(starts).toHaveLength(1);
  await fill("第一封");
  // Back to the chooser, then forward into the same ?mode=: a new attempt,
  // so the second letter is not rejected as already sent.
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "你今天想怎麼寫？" })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("剛剛發生了什麼？")).toBeVisible();
  expect(starts).toHaveLength(2);
  await fill("第二封");
});

test("我的片段: 改為分享 → approved → 停止分享, and the share cap", async ({ page, context }) => {
  const title = `e2e 分享測試 ${Date.now()}`;
  const sameOrigin = { headers: { Origin: ORIGIN } };
  expect((await context.request.post(ORIGIN + "/api/session", sameOrigin)).status()).toBe(200);
  const submitted = await context.request.post(ORIGIN + "/api/me/stories", {
    ...sameOrigin,
    data: {
      title,
      body: "這是自動化瀏覽器測試留下的文字，用來驗證分享設定，測試結束會刪除。",
      era: "測試日期",
      source: "recollection",
      adult: true,
      privacy: true,
      share: false,
    },
  });
  expect(submitted.status()).toBe(200);
  const id = (await submitted.json()).id as string;
  const sharing = (share: boolean) =>
    context.request.patch(`${ORIGIN}/api/me/stories/${encodeURIComponent(id)}/sharing`, {
      ...sameOrigin,
      data: share ? { share, consent: { adult: true, privacy: true, share: true } } : { share },
    });

  await page.goto("/mine");
  await hydrated(page);
  const story = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: title }) });
  await expect(story.getByText("未公開保存")).toBeVisible();

  // 改為分享 opens the consent form; all three boxes are required.
  await story.getByRole("button", { name: "改為分享" }).click();
  const form = story.getByRole("form", { name: "改為分享" });
  await expect(form.getByText("這篇還可以申請 3 次。")).toBeVisible();
  await form.getByRole("button", { name: "確認申請分享" }).click();
  await expect(story.getByText("未公開保存")).toBeVisible();
  await form.getByRole("checkbox", { name: /我願意讓這份原文經人工審閱後/ }).check();
  await form.getByRole("checkbox", { name: /我已滿 18 歲/ }).check();
  await form.getByRole("checkbox", { name: /我了解團隊可閱讀投稿/ }).check();
  await form.getByRole("button", { name: "確認申請分享" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "已送出分享申請，等待人工審閱。" }),
  ).toBeVisible();
  await expect(story.getByText("等待審閱")).toBeVisible();
  await expect(form).toHaveCount(0);

  // Approved by the admin, then stopped by the author: off the public list at once.
  const approve = await context.request.post(
    `${ORIGIN}/api/admin/stories/${encodeURIComponent(id)}/moderation`,
    { headers: { ...adminHeaders(), Origin: ORIGIN }, data: { status: "approved" } },
  );
  expect(approve.status()).toBe(200);
  await page.reload();
  await hydrated(page);
  await expect(story.getByText("已匿名分享")).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await story.getByRole("button", { name: "停止分享" }).click();
  await expect(story.getByText("已匿名分享")).toBeVisible();
  let message = "";
  page.once("dialog", (d) => {
    message = d.message();
    return d.accept();
  });
  await story.getByRole("button", { name: "停止分享" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "已停止分享，這篇改為不公開保存。" }),
  ).toBeVisible();
  expect(message).toContain("立即從公開信箱下架");
  await expect(story.getByText("未公開保存")).toBeVisible();
  const pub = await (await context.request.get(ORIGIN + "/api/stories")).json();
  expect((pub.stories as { id: string }[]).some((s) => s.id === id)).toBe(false);

  // Two more share requests use up the three; the button is then disabled.
  for (const share of [true, false, true, false]) expect((await sharing(share)).status()).toBe(200);
  await page.reload();
  await hydrated(page);
  await expect(story.getByRole("button", { name: "改為分享" })).toBeDisabled();
  await expect(story.getByText(/這篇已申請分享 3 次，已達上限/)).toBeVisible();
  await expect(story.getByRole("button", { name: "撤回並刪除" })).toBeEnabled();
});
