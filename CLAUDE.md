# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案組成

這個 repo 有兩個互不相干的部分：

- **根目錄 `index.html` + `CNAME`**：GitHub Pages 靜態概念頁（`life.wetrytrysee.cc`），沒有建置流程，直接改 HTML。
- **`ring-letter/`**：Ring letter 應用。Vinext（Vite 版 Next.js App Router，**beta**）+ React 19，跑在 Cloudflare Workers，資料庫是 D1（SQLite）+ Drizzle。原本是用 OpenAI ChatGPT Sites 做的，目前線上版仍在 tom82523 的 Sites 帳號；我們正把它搬到自己的 Cloudflare 帳號。

規劃文件一律記在 GitHub issue，不放進 repo：v1 搬遷規劃（M0–M5，已定版）在 DS-Jerry-in-Taiwan/life-fragments#2，v2 規劃（V1–V6：前端拆分、REST、保留政策、設計打磨）在 #4；兩者的 issue 內文即文件與勾選進度。已定案：用使用者自己的 Cloudflare 帳號、`wetrytrysee.cc` 已由 Cloudflare 管理、管理者只有使用者本人。M1 已移除所有 Sites 腳手架（`.openai/`、`scripts/`、connector、`chatgpt-auth`、sites vite plugin）。

UI 文案與錯誤訊息都是繁體中文。

## 指令（在 `ring-letter/` 下執行，需 Node ≥ 22.18）

```sh
npm ci
npm run db:migrate:local   # 第一次，或 drizzle/ 有新遷移時（wrangler d1 migrations apply）
npm run dev                # vinext dev，port 5173（對外開放用 -- --hostname 0.0.0.0）
npm run build              # 產生 dist/，含 dist/server/wrangler.json
npm start                  # 用 wrangler 在本機跑建置後的 Worker，port 8788
npm run typecheck
npm run lint               # 已知 1 個既存錯誤（MatchExperience 的 setState-in-effect）
npm run db:generate        # 改 db/schema.ts 後產生 drizzle/ 遷移
npm run test:auth          # lib/server/access-jwt.ts 單元測試（node --test，Node 原生剝除 TS 型別）
npm run test:turnstile     # lib/server/turnstile-siteverify.ts 單元測試（同上，mock fetch）
```

API 整合測試（`tests/api.mjs`，單一腳本，沒有個別測試可選）對 **`npm run dev`** 跑：

```sh
npm run dev                     # 另開一個終端機
npm run test:api                # 預設 TEST_ORIGIN=http://127.0.0.1:5173
npm run test:retention          # 保留政策（tests/retention.mjs），會清掉本機 D1 幾乎所有資料，放最後跑
```

測試讀 `.wrangler/dev-admin-token`（dev server 每次啟動產生的祕密）來扮演管理者（見下方「管理者驗證」），所以要先啟動 dev server，也不能對 `npm start` 或正式環境跑：建置後的 Worker 沒有這條路，管理者測試會拿到 403。測試資料最後會自行刪除，但測試中途失敗時，資料會留在本機 D1，下次跑到最後一個檢查會失敗。這時刪掉 `.wrangler/state`，再跑一次 `npm run db:migrate:local`。

`tests/retention.mjs` 用 Cloudflare Vite plugin 的 dev 專用 `/cdn-cgi/handler/scheduled?time=<ms>` 以未來時間觸發 Cron（「31 天後」、「一年後」），並用 `wrangler d1 execute --local` 檢查／插入少量回溯時間的資料（`tests/api.mjs` 也用同一招讀同意字串、改 `last_seen`）。未來時間的 Cron 會刪掉本機 D1 裡除了「永久版本且已核准」以外的**所有**故事、回饋、試寫，以及（「一年後」那次）所有 session（不只測試的），所以只對可丟棄的 `.wrangler/state` 跑。`npm start`（wrangler dev 跑建置後的 Worker）的 `/cdn-cgi/handler/scheduled` 在 wrangler 4.92 因 assets router 無法轉送 `ScheduledController` 而回 500，本機測 Cron 一律用 `npm run dev`。

`npm run dev` 和 `npm start` 共用 `.wrangler/state`。`.wrangler/`、`.vinext/`、`dist/` 都是可丟棄的本機狀態。

## 架構重點

- **設定**：`wrangler.jsonc` 是 Worker 與 D1 綁定（`DB`、`migrations_dir: drizzle`）的唯一來源；`vite.config.ts` 是 `vinext()` + `@cloudflare/vite-plugin`，加上 dev 專用的管理者身分 middleware（`devAdminIdentity()`）。正式環境：D1 `ring-letter-db`、自訂網域 `ringletter.wetrytrysee.cc`、`workers_dev`／`preview_urls` 關閉（Access 只守自訂網域），部署步驟見 `ring-letter/README.md`。`worker/index.ts` 的 `fetch` 把請求交給 `vinext/server/fetch-handler`，再對帶著有效 `rl_session` 的請求續發 cookie（見「匿名身分」）；`scheduled` 接 `wrangler.jsonc` 的 Cron Trigger（每日 19:17 UTC＝台北 03:17），執行 `lib/server/retention.ts` 的 `runRetention()`。
- **前端（v2 V1 拆分中，見 #4 第 4 節）**：7 條路由 `/`、`/read`、`/write`（`?mode=past|present`）、`/mine`、`/archive`、`/admin`（篩選條件在網址：`status`／`reshare`／`consent`／`expiring`／`q`／`from`／`to`／`id`，與 `GET /api/admin/stories` 同名；V6-b。卡片勾選後可批次不通過或永久刪除，`components/admin/BatchBar.tsx`，V6-c；沒有批次核准；不通過成功的在狀態篩選不含 rejected 時從清單移除，否則就地更新）、`/privacy`，各在 `app/<路由>/page.tsx`。`app/layout.tsx` 用 `components/shell/SiteShell.tsx`（夜空、header、footer、隱私說明 dialog，並透過 `ShellContext` 提供 `openPrivacy`／`setAdmin`）包住每一頁；站內導覽用 `NavButton`（`router.push`，暫時保留 v1 的 `<button>` 外觀，V5 再改成連結）。各畫面元件依功能放在 `components/{shell,home,reading,archive,write,mine,admin,story,privacy,common}/`。管理頁（`components/admin/`）：`AdminDashboard` 依序是摘要、篩選列（`StoryFilters`，條件經 `router.push` 寫進網址）、故事清單（`StoryList`／`StoryCard`）、回饋（`FeedbackList`）、操作紀錄（`EventLog`），三個清單共用 `usePagedList`（cursor 分頁、丟棄過時回應）；單篇審閱 409 時只用 `?status=all&id=` 重抓那一篇更新卡片。前端只透過 `lib/api-client.ts` 呼叫 API；每個畫面用 `lib/use-action.ts` 管自己的 busy／error／notice。
- **試讀與媒合是純靜態**：`data/matching.ts` 的 `MATCH_LETTERS`（八封虛構範例，每個 `SCENARIOS` 類別兩封，下一封互動需要每類至少兩封）與 `FORM_URL_DISTRESS` / `FORM_URL_ECHO`（目前是 `'#'`，點擊會顯示「尚未開放」而非假送出）。這部分不打 API、不寫 DB、不設 cookie。內容會公開，不可放未去識別化的真實原稿。
- **後端 REST 路由**（v2 V2-b，見 #4 第 5 節；v1 的 `/api/letter` 與 `action` 分派已整個移除，沒有相容層）：每條路由一個 `app/api/<路徑>/route.ts`，動態段落用 `[id]`（`params` 是 Promise）。
  - 公開：`GET /api/stories`（已核准故事）、`POST /api/session`（建立／沿用匿名 session）、`DELETE /api/session`（在這台裝置登出：刪 session 列、清 cookie，故事與回饋保留；沒有 session 也回 200 並清 cookie）。
  - 匿名 session：`POST /api/writing-attempts`（開始試寫，body `{id,letterType}`）、`POST /api/me/stories`（投稿，需要 Turnstile）、`GET /api/me/stories`（自己的片段，沒有 session 時回空清單）、`DELETE /api/me/stories/:id`（撤回）、`PATCH /api/me/stories/:id/sharing`（作者調整分享授權，見下方「作者調整分享」）、`DELETE /api/me`（清除全部資料並清掉 cookie）、`POST /api/feedback`（需要 Turnstile）。
  - 管理者（Access）：`POST /api/admin/stories/:id/moderation`（body `{status, statusAt?, consentEvents?}`；兩者是管理清單列出的 `statusAt`（`COALESCE(status_at,created)`）與授權紀錄筆數，核准／拒絕時若故事之後已變更（例如作者停止分享又重新申請，筆數可抓到同一毫秒內的變更）回 409「這篇的狀態剛剛改變了，請重新整理後再審閱。」；不帶就照舊不檢查，刪除一律不檢查；管理介面一律帶上）。
  - 管理者 V6 端點（#4 第 5.2 節；V6-b 前端改用後已刪除 `/api/admin/queue`，沒有 200 篇上限了）：`GET /api/admin/summary`（各狀態篇數、7 天內到期篇數、寫作指標）、`GET /api/admin/stories`（`status`（預設 pending）／`reshare=1`／`consent=v2|v3`／`expiring=<天>`／`q`／`from`／`to`（台北日期，含頭尾）／`id`／`cursor`，每頁 50，依 `created DESC, id DESC`，回 `nextCursor`；每篇另帶 `consent`、`terms`（v3＝`PERMANENT_CONSENT_VERSIONS`，其他都算 v2）、`expiresAt`（永久保留為 null）、`feedbackCount`（30 天內的回饋筆數；先在內層子查詢選出這一頁，再只對這些列算各種筆數，`feedback(story)` 有索引，遷移 0005））、`GET /api/admin/feedback`（`kind`、`story`、`cursor`；問題回報排最前，帶 `storyTitle`，示範故事與已不在的故事為 null）、`DELETE /api/admin/feedback/:id`（404 若不存在）、`POST /api/admin/moderation`（批次，body `{status:"rejected"|"delete", items:[{id,statusAt,consentEvents}]}`，1–50 篇，`approved` 回 400；逐篇回 `{results:[{id,ok,error?:"conflict"|"not_allowed"|"missing"}]}`，不通過只對 pending／approved 且未變更的有效，刪除不檢查）、`GET /api/admin/events`（操作紀錄，`admin`、`cursor`，每筆帶 `targetExists`，另回 `admins`）。查詢參數在 `lib/server/validation.ts` 驗證（400），cursor 是 `lib/server/cursor.ts` 的不透明 base64url。`q` 用 `instr()` 不用 `LIKE`：D1 拒絕超過 50 bytes 的 LIKE pattern。所有篩選都套用與公開清單相同的 `LIVE`，過期待刪的不會出現；審核（單篇與批次）的條件也含 `LIVE`，過期待刪的故事不能被核准或不通過（單篇回 400、批次回 `missing`，不寫紀錄），以免重設期限或變成永久保留。
  - 路由只做組裝，檢查順序與錯誤訊息照 v1：`lib/server/handler.ts` 的 `guardRead()`／`guardWrite()`（POST／PATCH／DELETE 同源檢查、例外轉 503）、`withBodyAndSession()`（先 JSON body 再 session）、`withBodyTurnstileAndSession()`（投稿與回饋：body → `withTurnstile()` → session）、`withSession()`、`withAdmin()`。路由沒有匯出的方法由框架回 405。其他共用模組在 `lib/server/`：`session.ts`（`rl_session` cookie、SHA-256、`refreshSession()`）、`rate-limit.ts`（每日上限）、`same-origin.ts`、`http.ts`（`reply()`、JSON body 解析 415／413／400）、`validation.ts`（zod schema，錯誤訊息照舊）、`auth.ts`、`db/`（`index.ts` 的 `db()`／`AGE`／`SESSION_AGE`／`ADMIN_EVENT_AGE`／`ITEM_IDS`，以及 `stories`／`feedback`／`sessions`／`attempts`／`consent-events`／`admin-events` 各一個檔，一個查詢一個函式）、`cursor.ts`（管理清單的不透明 cursor 與每頁 50）、`retention.ts`（每日保留政策）。透過 `cloudflare:workers` 的 `env.DB` 直接寫 SQL；`db/schema.ts` 只用於 drizzle-kit 產生遷移，程式沒有用 Drizzle 查詢。
- **匿名身分**（#4 第 6.2 節，V3-c）：`rl_session` HttpOnly cookie（隨機 token，`Max-Age` 1 年），DB 只存 SHA-256。**1 年滑動**：`sessions.last_seen` 在 1 年內（`SESSION_AGE`）才算有效；`worker/index.ts` 對每個帶有效 cookie 的回應（頁面與 API 都算，路由自己設／清 `rl_session` 時除外）用 `refreshSession()` 重發同一個 cookie，`last_seen` 超過 24 小時才寫一次 DB，舊的 30 天 cookie 也在下次造訪時升級成 1 年。只讀頁面不會建立 session（前端只在試寫、投稿、回饋時呼叫 `POST /api/session`）。「我的片段」有「在這台裝置登出」（`api.logout()`）。忘了 cookie、換裝置或超過一年的作者，由管理者依來信（`ringletter@wetrytrysee.cc`，`lib/contact.ts`；頁尾與隱私說明都有）在 `/admin` 代刪。每 session 每日上限（最近 24 小時，`lib/server/rate-limit.ts`）：投稿 5、回饋／開始試寫 30、分享設定變更 10（改為分享與停止分享都算，從 `consent_events` 計數，不另存）。POST／PATCH／DELETE 都有同源檢查。
- **Turnstile**（#4 第 5.1 節，V4）：只保護投稿與回饋，header `X-Turnstile-Token`，檢查順序是同源 403 → body 415／413／400 → Turnstile → session 401 → 欄位 400 → …。錯誤都帶 `code:"turnstile"`：沒帶 token 403「請先完成人機驗證再送出。」、驗證失敗（`success` 不是 true、action 不符、hostname 不符）403「人機驗證沒有通過，請再試一次。」、siteverify 連不上／逾時 5 秒／回應異常、`error-codes` 是 `internal-error`／`invalid-input-secret`／`missing-input-secret`／`bad-request`，或缺 secret 503「人機驗證服務暫時無法使用，請保留文字並稍後重試。」（fail closed）。`lib/server/turnstile-siteverify.ts` 是不依賴 Worker 的純檢查（單元測試用），`lib/server/turnstile.ts` 供應金鑰：正式環境 `TURNSTILE_SITE_KEY`、`TURNSTILE_HOSTNAME` 是 `wrangler.jsonc` 的 `vars`，`TURNSTILE_SECRET_KEY` 是 Worker secret；`import.meta.env.DEV` 分支（正式建置移除）一律用 Cloudflare 的測試金鑰、**不讀 env**（Cloudflare plugin 會把 `vars` 也載入 dev），也不檢查 action 與 hostname（測試金鑰的回應不帶 action、hostname 是 `example.com`），所以 dev／CI 不需要設定，但 siteverify 仍會真的連 Cloudflare。site key 由 `app/layout.tsx` 讀出、經 `ShellContext` 給 `components/common/Turnstile.tsx`（寫信表單出現、回饋框展開時才載入 `api.js?render=explicit`，15 秒沒載入就放棄、下次送出再試，`execute()` 30 秒沒有回呼也放棄並 reset（顯示互動挑戰時暫停計時），`execution:"execute"`、`appearance:"interaction-only"`，送出時才 `getToken()`，每次請求後 `reset()`）；`lib/api-client.ts` 的 `submitLetter()`／`sendFeedback()` 收一個取 token 的函式，403＋`code:"turnstile"` 時重取重送一次。`tests/api.mjs`／`tests/retention.mjs` 送測試 token `XXXX.DUMMY.TOKEN.XXXX`；e2e 用 `tests/e2e/fixtures.ts` 的假 `api.js`。`deploy.yml` 在缺 `TURNSTILE_SECRET_KEY` 或 `wrangler.jsonc` 仍是 `REPLACE_WITH_TURNSTILE_SITE_KEY` 時中止部署。
- **管理者驗證**（`lib/server/auth.ts` 的 `verifyAdmin()`）：
  - 正式環境：Cloudflare Access 保護 `/admin*` 與 `/api/admin*`（含 `/api/admin/summary`、`/api/admin/stories/:id/moderation` 等所有子路徑）。Worker 仍自己驗 `Cf-Access-Jwt-Assertion`（`lib/server/access-jwt.ts`：RS256、`aud`、`iss`、`exp`／`nbf`，從 `https://<team>/cdn-cgi/access/certs` 取公鑰並快取 1 小時，未知 `kid` 會重抓一次），再比對 `ADMIN_EMAILS` 白名單。設定值 `ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`、`ADMIN_EMAILS`（secret，不進版控）任一缺少就一律拒絕。
  - 管理者必須用整頁導覽進 `/admin` 才會觸發 Access 登入；前端用 `fetch()` 打 `/api/admin/…` 時若未登入，Access 會回跨來源重新導向而失敗。所以頁尾「管理者登入」是連到 `/admin` 的一般連結。
  - 開發環境（`import.meta.env.DEV`，正式建置會整段移除）：身分直接取 `Cf-Access-Authenticated-User-Email` header。這個 header 由 `vite.config.ts` 的 `devAdminIdentity()` 設定：它先刪掉客戶端送來的所有 `cf-access-*`、`oai-authenticated-user-*` header，只有帶著本次啟動的祕密（寫在 `.wrangler/dev-admin-token`）的請求才會拿到身分——`x-dev-admin-token` + `x-dev-admin-email`（測試用），或透過終端機印出的 `/__dev-admin?token=…` 登入連結取得的 `rl_dev_admin` cookie（瀏覽器用，注入 `.env.local` 的 `DEV_ADMIN_EMAIL`）。**不要改成用來源 IP 判斷**：Cloudflare plugin 的 quick tunnel、ssh／Docker／WSL 轉發、反向代理進來的請求都會是 loopback。
- **資料保留**（#4 第 6 節，V3-a 建閘門、V3-c 啟用）：只由每日 Cron 的 `runRetention()`（`lib/server/retention.ts`）在一個 D1 batch 裡刪除；建立 session 不再清理。故事的規則看它的同意版本（`stories.consent` 冒號前的前綴，不看 `consent_events`），讀取（公開清單、`isApprovedStory` 回饋資格、我的片段、管理清單）與刪除共用 `lib/server/db/stories.ts` 的同一個 SQL（`EXPIRES_FROM`／`LIVE`／`EXPIRED_STORY`）：
  - 版本在 `PERMANENT_CONSENT_VERSIONS`（`v3-2026-11-12`）：已核准**不自動刪除**（只有撤回、全部刪除、管理者刪除）；其他狀態從 `status_at`（最後一次狀態變更）起 30 天。
  - 其他版本（`v2-2026-11-05`、舊的或空的，承諾的是「30 天」）：任何狀態、包含已核准，一律從 `created` 起 30 天，之後的狀態變更不會延長。
  - V3-c 起 `CONSENT_VERSION` 是 `v3-2026-11-12`，新投稿都適用上一條；同時上線的是新的同意與隱私文字、聯絡信箱、登出與 1 年滑動 session（作者要能撤回，才能承諾「保留到撤回」）。之前的投稿保留原本的同意字串與 30 天條款，不遷移、不改寫。
  - 故事刪除時連同回饋與 `consent_events`；`feedback`、`writing_attempts` 從 `created` 起 30 天（`AGE`）；`sessions` 從 `COALESCE(last_seen, created)` 起 1 年（`SESSION_AGE`）；`admin_events` 從 `created` 起 1 年（`ADMIN_EVENT_AGE`），不論對象是否還在。
  - 審核改變狀態時更新 `status_at`；改成 approved 設 `approved_at`，離開 approved 清成 NULL；重複同一決定不動時間。
- **授權歷史**：`consent_events`（append-only：`submit`／`share`／`unshare`＋`consent_version`），投稿時與故事同一個 batch 寫入 `submit`；任何刪除故事的路徑都在同一個 batch 刪掉它的事件。改了 `components/write/ConsentFields.tsx` 的同意文字就要更新 `CONSENT_VERSION`（`lib/server/db/stories.ts`），新文字若仍承諾「核准後保留到撤回」，也要把新版本加進 `PERMANENT_CONSENT_VERSIONS`。
- **管理者操作紀錄**（#4 第 5.2 節，V6-a）：`admin_events`（遷移 0004；`admin_email`、`action`：`approve`／`reject`／`delete_story`／`delete_feedback`、`target_type`、`target_id`、`created`），`lib/server/db/admin-events.ts`。email 只取 `withAdmin()` 傳入的已驗證身分。每筆紀錄和操作放在同一個 `db().batch()`，排在變更之前、用與變更相同的條件（`INSERT … SELECT … WHERE`），所以只有真的變更才有紀錄：重複同一決定、409、400、刪除不存在的都不記；批次只記成功的。不存內容、標題、session。刪除故事不刪它的紀錄；作者撤回、全部刪除不記。
- **作者調整分享**（#4 第 6.1 節，V3-b）：`PATCH /api/me/stories/:id/sharing`。`{share:true, consent:{adult,privacy,share 都是 true}}`：`private`／`rejected` → `pending`，同意字串改成目前的 `CONSENT_VERSION`（舊版同意的故事因此改用新條款），寫 `share` 事件；`{share:false}`：`pending`／`approved` → `private`（已核准的立即下架、清掉 `approved_at`），同意字串保留原版本、旗標改 `private`，寫 `unshare` 事件。兩者都設 `status_at`，內文不動；再分享一定重新審閱。其他組合 409；只有擁有者能改（其他 session 看到 404）；每篇送出後最多 3 個 `share` 事件（`MAX_SHARE_REQUESTS`，用完 409，仍可停止分享或撤回）；`GET /api/me/stories` 每篇帶 `shareRequestsLeft`，管理清單每篇帶 `shareRequests`／`consentEvents`，待審且有 `share` 事件的顯示「重新申請分享」。前端在 `components/mine/ShareToggle.tsx`，勾選文字與投稿表單共用 `components/write/ConsentFields.tsx` 的元件。
- **同意規則**：私人（未同意分享）故事不能被核准；管理者不能修改投稿內文；舊投稿的同意不可沿用到新的人工媒合流程。

`ring-letter/PROJECT_NOTES.md` 記錄了產品決策、隱私限制與歷次瀏覽器 QA 範圍，改動行為前可參考。
