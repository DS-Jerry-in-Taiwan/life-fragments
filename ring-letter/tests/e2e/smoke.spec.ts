import {
  adminHeaders,
  asAdmin,
  expect,
  hydrated,
  ORIGIN,
  test,
  TURNSTILE_TOKEN,
  turnstileLog,
  WIDTHS,
} from "./fixtures";
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
  const posted = page.waitForRequest(
    (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/me/stories",
  );
  await page.getByRole("button", { name: "留下這封信 ↗" }).click();
  expect((await posted).headers()["x-turnstile-token"], "投稿帶 Turnstile token").toBe(
    TURNSTILE_TOKEN,
  );
  await expect(page.getByRole("heading", { name: "你的文字已留下。" })).toBeVisible();
  await expect(
    page.getByText("這台裝置會記得你一年，共用裝置請記得到「我的片段」登出。"),
  ).toBeVisible();
  const turnstile = await turnstileLog(page);
  expect(turnstile?.rendered).toEqual([
    {
      sitekey: "1x00000000000000000000AA",
      action: "submit",
      execution: "execute",
      appearance: "interaction-only",
      language: "zh-tw",
    },
  ]);
  expect(turnstile?.executed, "送出時才取 token").toBe(1);
  expect(turnstile?.reset, "用過就 reset").toBeGreaterThanOrEqual(1);

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
    headers: { ...sameOrigin.headers, "X-Turnstile-Token": TURNSTILE_TOKEN },
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
  const found = await context.request.get(
    `${ORIGIN}/api/admin/stories?status=all&q=${encodeURIComponent(title)}`,
    { headers: adminHeaders() },
  );
  expect(found.status()).toBe(200);
  const kept = ((await found.json()).stories as { id: string; title: string }[]).filter(
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
    headers: { ...sameOrigin.headers, "X-Turnstile-Token": TURNSTILE_TOKEN },
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

  // Every PATCH the page itself sends (the API calls above and below go through context.request).
  const patches: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().endsWith("/sharing")) patches.push(r.url());
  });
  const noPendingRequests = () => page.waitForLoadState("networkidle");

  // 改為分享 opens the consent form and moves focus into it; 取消 hands focus back.
  const open = story.getByRole("button", { name: "改為分享" });
  await open.click();
  const form = story.getByRole("form", { name: "改為分享" });
  await expect(form.getByText("這篇還可以申請 3 次。")).toBeVisible();
  await expect(form.getByRole("checkbox", { name: /我願意讓這份原文經人工審閱後/ })).toBeFocused();
  await form.getByRole("button", { name: "取消" }).click();
  await expect(form).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();

  // All three boxes are required: an empty submit sends nothing.
  await form.getByRole("button", { name: "確認申請分享" }).click();
  await noPendingRequests();
  expect(patches).toHaveLength(0);
  await form.getByRole("checkbox", { name: /我願意讓這份原文經人工審閱後/ }).check();
  await form.getByRole("checkbox", { name: /我已滿 18 歲/ }).check();
  await form.getByRole("checkbox", { name: /我了解團隊可閱讀投稿/ }).check();

  // A refused change (the story changed meanwhile) is reported in the form itself.
  expect((await sharing(true)).status()).toBe(200);
  await form.getByRole("button", { name: "確認申請分享" }).click();
  await expect(form.getByRole("alert")).toHaveText("這篇已在等待審閱。");
  expect(patches).toHaveLength(1);
  expect((await sharing(false)).status()).toBe(200);

  await form.getByRole("button", { name: "確認申請分享" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "已送出分享申請，等待人工審閱。" }),
  ).toBeVisible();
  await expect(story.getByText("等待審閱")).toBeVisible();
  await expect(form).toHaveCount(0);
  await expect(story.getByRole("button", { name: "停止分享" })).toBeFocused();
  expect(patches).toHaveLength(2);

  // Approved by the admin, then stopped by the author: off the public list at once.
  const found = await context.request.get(
    `${ORIGIN}/api/admin/stories?status=all&id=${encodeURIComponent(id)}`,
    { headers: adminHeaders() },
  );
  const listed = (
    (await found.json()).stories as { id: string; statusAt: number; consentEvents: number }[]
  ).find((s) => s.id === id);
  const approve = await context.request.post(
    `${ORIGIN}/api/admin/stories/${encodeURIComponent(id)}/moderation`,
    {
      headers: { ...adminHeaders(), Origin: ORIGIN },
      data: {
        status: "approved",
        statusAt: listed!.statusAt,
        consentEvents: listed!.consentEvents,
      },
    },
  );
  expect(approve.status()).toBe(200);
  await page.reload();
  await hydrated(page);
  await expect(story.getByText("已匿名分享")).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await story.getByRole("button", { name: "停止分享" }).click();
  await noPendingRequests();
  expect(patches, "取消確認不送出").toHaveLength(2);
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
  await expect(story.getByRole("button", { name: "改為分享" })).toBeFocused();
  expect(patches).toHaveLength(3);
  const pub = await (await context.request.get(ORIGIN + "/api/stories")).json();
  expect((pub.stories as { id: string }[]).some((s) => s.id === id)).toBe(false);

  // One more share request uses up the three; the button is then disabled, with the reason as its description.
  for (const share of [true, false]) expect((await sharing(share)).status()).toBe(200);
  await page.reload();
  await hydrated(page);
  const limited = story.getByRole("button", { name: "改為分享" });
  await expect(limited).toBeDisabled();
  await expect(limited).toHaveAccessibleDescription(/這篇已申請分享 3 次，已達上限/);
  await expect(story.getByRole("button", { name: "撤回並刪除" })).toBeEnabled();
});

/**
 * An anonymous author outside the browser (Node fetch with its own cookie):
 * each session may submit 5 stories a day, so seeding takes several.
 */
async function author() {
  const r = await fetch(ORIGIN + "/api/session", { method: "POST", headers: { Origin: ORIGIN } });
  expect(r.status).toBe(200);
  const cookie = r.headers.get("set-cookie")!.split(";")[0];
  const call = (method: string, path: string, data?: object) =>
    fetch(ORIGIN + path, {
      method,
      headers: {
        Origin: ORIGIN,
        Cookie: cookie,
        "Content-Type": "application/json",
        // Only submit and feedback check it (#4 §5.1); the others ignore it.
        "X-Turnstile-Token": TURNSTILE_TOKEN,
      },
      body: data && JSON.stringify(data),
    });
  return {
    async submit(title: string) {
      const r = await call("POST", "/api/me/stories", {
        title,
        body: "這是自動化瀏覽器測試留下的文字，用來驗證管理頁，測試結束會刪除。",
        era: "測試日期",
        source: "recollection",
        adult: true,
        privacy: true,
        share: true,
      });
      expect(r.status, await r.clone().text()).toBe(200);
      return ((await r.json()) as { id: string }).id;
    },
    async sharing(id: string, share: boolean) {
      const r = await call(
        "PATCH",
        `/api/me/stories/${encodeURIComponent(id)}/sharing`,
        share ? { share, consent: { adult: true, privacy: true, share: true } } : { share },
      );
      expect(r.status).toBe(200);
    },
    async feedback(story: string, note: string) {
      const r = await call("POST", "/api/feedback", { story, kind: "comment", note });
      expect(r.status).toBe(200);
    },
    erase: async () => expect((await call("DELETE", "/api/me")).status).toBe(200),
  };
}

test("admin: filter → search → load more → 409 refreshes one card → delete", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000); // seeds 51 stories one request at a time
  const tag = `e2e管理${Date.now()}`;
  const authors = await Promise.all(Array.from({ length: 11 }, author));
  try {
    // 51 pending stories, one more than a page; the newest is the last submitted.
    const ids: string[] = [];
    for (const [i, a] of authors.entries())
      for (let j = 0; j < (i < 10 ? 5 : 1); j++)
        ids.push(await a.submit(`${tag} 第 ${String(ids.length + 1).padStart(2, "0")} 篇`));
    const newestTitle = `${tag} 第 51 篇`;

    await asAdmin(context);
    await page.goto("/admin");
    await hydrated(page);
    const cards = page.getByRole("article").filter({ hasText: tag });
    const search = page.getByRole("search", { name: "篩選投稿" });

    // Filter: status chips go to the URL.
    await search.getByRole("button", { name: /^全部/ }).click();
    await expect(page).toHaveURL(/\/admin\?status=all$/);
    await expect(search.getByRole("button", { name: /^全部/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await search.getByRole("button", { name: /^等待審閱/ }).click();
    await expect(page).toHaveURL(/\/admin$/);

    // Search: the first 50, newest first; 載入更多 brings the 51st.
    await search.getByLabel(/標題或內文/).fill(tag);
    await search.getByRole("button", { name: "搜尋" }).click();
    await expect(page).toHaveURL(new RegExp(`\\?q=${encodeURIComponent(tag)}$`));
    await expect(cards).toHaveCount(50);
    await expect(cards.first().getByRole("heading")).toHaveText(newestTitle);
    await expect(cards.first()).toContainText(ids[50]);
    await expect(cards.first()).toContainText("剩 30 天");
    await page.getByRole("button", { name: "載入更多" }).click();
    await expect(cards).toHaveCount(51);
    await expect(page.getByRole("button", { name: "載入更多" })).toHaveCount(0);

    // The URL keeps the conditions across a reload.
    await page.reload();
    await hydrated(page);
    await expect(cards).toHaveCount(50);
    await expect(search.getByLabel(/標題或內文/)).toHaveValue(tag);
    await page.getByRole("button", { name: "載入更多" }).click();
    await expect(cards).toHaveCount(51);

    // 409: the author stops sharing and asks again after the page listed it.
    const newest = cards.filter({ has: page.getByRole("heading", { name: newestTitle }) });
    await authors[10].sharing(ids[50], false);
    await authors[10].sharing(ids[50], true);
    await expect(newest).not.toContainText("重新申請分享");
    await newest.getByRole("button", { name: "核准分享原文" }).click();
    await expect(newest.getByText("這篇剛剛改變了，請再看一次。")).toBeVisible();
    await expect(newest).toContainText("重新申請分享");
    await expect(newest).toContainText("授權紀錄 3 筆");
    await expect(cards, "沒有重新載入整個清單").toHaveCount(51);
    await newest.getByRole("button", { name: "核准分享原文" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已更新文章狀態。" })).toBeVisible();
    await expect(newest.getByText("已匿名分享")).toBeVisible();
    await expect(newest).not.toContainText("剩 30 天");
    await expect(search.getByRole("button", { name: /^已匿名分享（\d+）/ })).toBeVisible();

    // 看回饋（N） filters the feedback to that story; one is deleted after a confirm.
    const note = `${tag} 的回饋`;
    await authors[0].feedback(ids[50], note);
    // Now approved, it left the pending list on the next load: list all (the search stays).
    await search.getByRole("button", { name: /^全部/ }).click();
    await expect(page).toHaveURL(new RegExp(`\\?status=all&q=${encodeURIComponent(tag)}$`));
    await expect(cards).toHaveCount(50);
    await newest.getByRole("button", { name: "看回饋（1）" }).click();
    await expect(page.getByText(`只顯示《${newestTitle}》的回饋。`)).toBeVisible();
    const item = page.getByRole("article").filter({ hasText: note });
    await expect(item).toHaveCount(1);
    await expect(item.getByRole("button", { name: `《${newestTitle}》` })).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await item.getByRole("button", { name: "刪除這筆回饋" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已刪除這筆回饋。" })).toBeVisible();
    await expect(item).toHaveCount(0);
    await expect(newest.getByRole("button", { name: /^看回饋/ })).toHaveCount(0);
    await expect(page.getByRole("article").filter({ hasText: "刪除回饋" })).not.toHaveCount(0);

    // Delete: confirm names the story; the notice quotes title and date.
    const second = cards.filter({ has: page.getByRole("heading", { name: `${tag} 第 50 篇` }) });
    let message = "";
    page.once("dialog", (d) => {
      message = d.message();
      return d.accept();
    });
    await second.getByRole("button", { name: "永久刪除" }).click();
    const date = new Date().toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
    await expect(
      page.getByRole("status").filter({ hasText: `已刪除《${tag} 第 50 篇》（${date}）` }),
    ).toBeVisible();
    expect(message).toContain(`${tag} 第 50 篇`);
    await expect(second).toHaveCount(0);
    await expect(cards).toHaveCount(49);

    // The operation log has both, the deleted story marked.
    const log = page.getByRole("article").filter({ hasText: "dev-admin@localhost" });
    await expect(
      log.filter({ hasText: "永久刪除故事" }).filter({ hasText: ids[49] }),
    ).toContainText("（已刪除）");
    const approved = log.filter({ hasText: "核准分享" }).filter({ hasText: ids[50] });
    await expect(approved).not.toContainText("（已刪除）");
    // A live target goes to its card.
    await approved.getByRole("button", { name: ids[50] }).click();
    await expect(newest).toBeFocused();

    // Back: the previous conditions come back (the search in pending, then none).
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/admin\\?q=${encodeURIComponent(tag)}$`));
    await expect(search.getByRole("button", { name: /^等待審閱/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(search.getByLabel(/標題或內文/)).toHaveValue(tag);
    await page.goBack();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(search.getByLabel(/標題或內文/)).toHaveValue("");
  } finally {
    for (const a of authors) await a.erase();
  }
});

test("admin: batch 不通過或下架 and 永久刪除, with per-story results", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000); // seeds 51 stories one request at a time
  const tag = `e2e批次${Date.now()}`;
  const title = (i: number) => `${tag} 第 ${String(i + 1).padStart(2, "0")} 篇`;
  const authors = await Promise.all(Array.from({ length: 11 }, author));
  const owner = (i: number) => authors[Math.min(Math.floor(i / 5), 10)];
  const moderate = async (id: string, status: string) => {
    const r = await context.request.post(
      `${ORIGIN}/api/admin/stories/${encodeURIComponent(id)}/moderation`,
      { headers: { ...adminHeaders(), Origin: ORIGIN }, data: { status } },
    );
    expect(r.status()).toBe(200);
  };
  try {
    const ids: string[] = [];
    for (let i = 0; i < 51; i++) ids.push(await owner(i).submit(title(i)));
    // The newest first: 50 approved, 49 private, 48 rejected, the rest pending.
    await moderate(ids[50], "approved");
    await owner(49).sharing(ids[49], false);
    await moderate(ids[48], "rejected");

    await asAdmin(context);
    await page.goto(`/admin?status=all&q=${encodeURIComponent(tag)}`);
    await hydrated(page);
    const cards = page.getByRole("article").filter({ hasText: tag });
    const card = (i: number) =>
      cards.filter({ has: page.getByRole("heading", { name: title(i) }) });
    const tick = (i: number) => page.getByRole("checkbox", { name: `勾選《${title(i)}》` });
    const bar = page.getByRole("group", { name: "批次操作" });
    const count = bar.getByText(/^已勾選 \d+ 篇$/);
    await expect(cards).toHaveCount(50);

    // Never a batch approval.
    await expect(bar.getByRole("button", { name: /核准/ })).toHaveCount(0);

    // 全選 ticks the loaded cards only; one more page arrives unticked.
    await bar.getByRole("button", { name: "全選已載入的 50 篇" }).click();
    await expect(count).toHaveText("已勾選 50 篇");
    await page.getByRole("button", { name: "載入更多" }).click();
    await expect(cards).toHaveCount(51);
    await expect(tick(0)).not.toBeChecked();
    await expect(tick(1)).toBeChecked();
    await expect(count).toHaveText("已勾選 50 篇");
    // More than 50 loaded: 全選 becomes 勾選前 50 篇, so a selection can always be sent.
    const firstFifty = bar.getByRole("button", { name: "勾選前 50 篇" });
    await expect(firstFifty).toBeDisabled();
    // Ticked by hand, more than 50 is refused per button, not cut short.
    await tick(0).check();
    await expect(count).toHaveText("已勾選 51 篇");
    const remove = bar.getByRole("button", { name: /^永久刪除勾選的/ });
    const reject = bar.getByRole("button", { name: /^不通過或下架勾選的/ });
    await expect(remove).toBeDisabled();
    await expect(remove).toHaveAccessibleDescription(/一次最多處理 50 篇/);
    // 49 of them can be rejected (not the private and the rejected one): within the cap.
    await expect(reject).toHaveText("不通過或下架勾選的 49 篇");
    await expect(reject).toBeEnabled();
    await bar.getByRole("button", { name: "取消全選" }).click();
    await expect(count).toHaveText("已勾選 0 篇");
    await firstFifty.click();
    await expect(count).toHaveText("已勾選 50 篇");
    await expect(tick(50)).toBeChecked();
    await expect(tick(0)).not.toBeChecked();
    await expect(firstFifty).toBeDisabled();
    // 50 ticked but not the first 50: 勾選前 50 篇 can still complete them.
    await tick(0).check();
    await tick(50).uncheck();
    await expect(count).toHaveText("已勾選 50 篇");
    await expect(firstFifty).toBeEnabled();
    // Changing the filters clears the selection; coming back doesn't restore it.
    await page.getByRole("button", { name: /^等待審閱/ }).click();
    await expect(page).toHaveURL(/status=pending|\/admin\?q=/);
    await page.goBack();
    await expect(page).toHaveURL(/status=all/);
    await expect(count).toHaveText("已勾選 0 篇");
    await page.getByRole("button", { name: "載入更多" }).click();
    await expect(cards).toHaveCount(51);
    await expect(tick(0)).not.toBeChecked();

    // Only a private story ticked: 不通過或下架 doesn't apply, and says why.
    await tick(49).check();
    await expect(reject).toBeDisabled();
    await expect(reject).toHaveAccessibleDescription(/不能不通過或下架/);

    // 不通過或下架: sent for the approved and pending ones only; one changed meanwhile.
    for (const i of [50, 48, 47, 46]) await tick(i).check();
    await expect(reject).toHaveText("不通過或下架勾選的 3 篇");
    await owner(46).sharing(ids[46], false);
    await owner(46).sharing(ids[46], true);
    let message = "";
    page.once("dialog", (d) => {
      message = d.message();
      return d.accept();
    });
    await reject.click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "已不通過或下架 2 篇；1 篇未處理（1 篇剛剛改變了）。" }),
    ).toBeVisible();
    expect(message).toContain(
      `不通過或下架 3 篇：《${title(50)}》《${title(47)}》《${title(46)}》`,
    );
    expect(message).toContain("另外 2 篇不是等待審閱或已匿名分享");
    await expect(card(50).getByText("暫不分享", { exact: true })).toBeVisible();
    await expect(card(47).getByText("暫不分享", { exact: true })).toBeVisible();
    await expect(tick(50)).not.toBeChecked();
    await expect(tick(47)).not.toBeChecked();
    // The refused one: still ticked, the reason on it, its new revision fetched.
    await expect(card(46).getByText("未處理：這篇剛剛改變了，請再看一次。")).toBeVisible();
    await expect(card(46)).toContainText("重新申請分享");
    await expect(tick(46)).toBeChecked();
    await expect(tick(49)).toBeChecked();
    await expect(tick(48)).toBeChecked();
    await expect(cards, "沒有重新載入整個清單").toHaveCount(51);

    // 永久刪除: any status; one deleted elsewhere in between is reported and dropped.
    await tick(45).check();
    await moderate(ids[45], "delete");
    await expect(remove).toHaveText("永久刪除勾選的 4 篇");
    page.once("dialog", (d) => {
      message = d.message();
      return d.accept();
    });
    await remove.click();
    await expect(
      page.getByRole("status").filter({
        hasText: "已永久刪除 3 篇；1 篇未處理（1 篇已不存在），已從清單移除。",
      }),
    ).toBeVisible();
    expect(message).toContain(
      `永久刪除 4 篇（含回饋與授權紀錄），無法復原：《${title(49)}》《${title(48)}》《${title(46)}》等`,
    );
    for (const i of [49, 48, 46, 45]) await expect(card(i)).toHaveCount(0);
    await expect(cards).toHaveCount(47);
    await expect(count).toHaveText("已勾選 0 篇");

    // Under a filter that doesn't list rejected stories, rejected cards leave it.
    await page
      .getByRole("search", { name: "篩選投稿" })
      .getByRole("button", { name: /^等待審閱/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/admin\\?q=${encodeURIComponent(tag)}$`));
    await expect(cards).toHaveCount(45);
    await expect(count).toHaveText("已勾選 0 篇");
    for (const i of [44, 43]) await tick(i).check();
    page.once("dialog", (d) => d.accept());
    await reject.click();
    await expect(
      page.getByRole("status").filter({ hasText: "已不通過或下架 2 篇。" }),
    ).toBeVisible();
    for (const i of [44, 43]) await expect(card(i)).toHaveCount(0);
    await expect(cards).toHaveCount(43);
    await expect(count).toHaveText("已勾選 0 篇");

    // The operation log has each one done, the deleted ones marked.
    const log = page.getByRole("article").filter({ hasText: "dev-admin@localhost" });
    for (const i of [50, 47, 44, 43])
      await expect(
        log.filter({ hasText: "暫不分享／下架" }).filter({ hasText: ids[i] }),
      ).not.toContainText("（已刪除）");
    await expect(
      log.filter({ hasText: "暫不分享／下架" }).filter({ hasText: ids[46] }),
    ).toHaveCount(0);
    for (const i of [49, 48, 46])
      await expect(
        log.filter({ hasText: "永久刪除故事" }).filter({ hasText: ids[i] }),
      ).toContainText("（已刪除）");
  } finally {
    for (const a of authors) await a.erase();
  }
});

// --- Turnstile (#4 §5.1): the fake api.js from fixtures.ts stands in for Cloudflare's.

test("Turnstile: the script loads only with the write or feedback form", async ({ page }) => {
  const loads: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith("https://challenges.cloudflare.com/")) loads.push(page.url());
  });
  for (const path of ["/", "/read", "/archive", "/mine", "/privacy", "/write"]) {
    await page.goto(path);
    await hydrated(page);
  }
  await expect(page.getByRole("heading", { level: 1, name: "你今天想怎麼寫？" })).toBeVisible();
  expect(loads, "首頁、試讀、公開信箱、寫法選擇不載入").toEqual([]);

  // Opening the feedback box on /archive loads it.
  await page.goto("/archive");
  await hydrated(page);
  await page.getByText("願意告訴我們讀起來如何嗎？").click();
  await expect.poll(() => loads.length).toBe(1);
  expect((await turnstileLog(page))?.rendered.map((r) => r.action)).toEqual(["feedback"]);
});

test("feedback: sent with a token; one retry on a Turnstile refusal, then the error, the note kept", async ({
  page,
}) => {
  await page.goto("/archive");
  await hydrated(page);
  await expect(page.getByText("信箱剛剛開啟。先讀一段示範，感受這裡的節奏。")).toBeVisible();
  await page.getByText("願意告訴我們讀起來如何嗎？").click();
  await page.getByRole("checkbox", { name: /同意保存本次回饋/ }).check();

  // Accepted on the first try: the request carries the token.
  const tokens: (string | undefined)[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/feedback")
      tokens.push(r.headers()["x-turnstile-token"]);
  });
  await page.getByRole("button", { name: "有一點共鳴" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "謝謝，你的回饋已保存。" }),
  ).toBeVisible();
  expect(tokens).toEqual([TURNSTILE_TOKEN]);

  // Refused once (e.g. the token expired): a new token, sent again, accepted.
  let refusals = 1;
  await page.route("**/api/feedback", (route) =>
    refusals-- > 0
      ? route.fulfill({
          status: 403,
          json: { error: "人機驗證沒有通過，請再試一次。", code: "turnstile" },
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "沒有特別感覺" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "謝謝，你的回饋已保存。" }),
  ).toBeVisible();
  expect(tokens).toHaveLength(3);
  const afterRetry = (await turnstileLog(page))!;
  expect(afterRetry.executed, "每次送出都取新 token").toBe(3);

  // Refused twice: the error shows and the note stays in the box.
  refusals = 2;
  const note = "這段回饋文字要留在表單上。";
  await page.getByLabel("有沒有哪個細節留下印象？也可以說哪裡不適合。").fill(note);
  await page.getByRole("button", { name: "送出回饋" }).click();
  await expect(page.getByRole("alert")).toContainText("人機驗證沒有通過，請再試一次。");
  expect(tokens, "只重試一次").toHaveLength(5);
  await expect(page.getByLabel("有沒有哪個細節留下印象？也可以說哪裡不適合。")).toHaveValue(note);
  const log = (await turnstileLog(page))!;
  expect(log.executed).toBe(5);
  expect(log.reset, "每個請求之後都 reset").toBeGreaterThanOrEqual(3);
});

test("write: a Turnstile refusal after the retry keeps the letter in the form", async ({
  page,
}) => {
  const write = SCREENS.find((s) => s.name === "write-present")!;
  await write.open(page);
  await write.ready(page);
  const text = "這封信因為人機驗證失敗沒有送出，文字要留著。";
  await page.getByLabel("剛剛發生了什麼？").fill(text);
  await page.getByRole("checkbox", { name: /我已滿 18 歲，內容是我的真實經歷/ }).check();
  await page.getByRole("checkbox", { name: /我了解團隊可閱讀投稿/ }).check();
  let posts = 0;
  await page.route("**/api/me/stories", (route) =>
    route.request().method() === "POST"
      ? (posts++,
        route.fulfill({
          status: 403,
          json: { error: "人機驗證沒有通過，請再試一次。", code: "turnstile" },
        }))
      : route.continue(),
  );
  await page.getByRole("button", { name: "留下這封信 ↗" }).click();
  await expect(page.getByRole("alert")).toContainText("人機驗證沒有通過，請再試一次。");
  expect(posts, "重取 token 重送一次").toBe(2);
  await expect(page.getByLabel("剛剛發生了什麼？")).toHaveValue(text);
  await expect(page.getByRole("button", { name: "留下這封信 ↗" })).toBeEnabled();
});
