# Ring letter

匿名的跨時間故事閱讀與投稿網站。使用 [Vinext](https://github.com/cloudflare/vinext)（Vite 版 Next.js App Router，beta）+ React 19，部署在 Cloudflare Workers，資料庫為 Cloudflare D1 + Drizzle。

產品決策、隱私與同意規則記錄在 `PROJECT_NOTES.md`；搬遷規劃見 GitHub issue #2，第二版規劃見 issue #4。

## 開發

需要 Node.js 22.18 以上。

```sh
npm ci
npm run db:migrate:local   # 第一次，或 drizzle/ 有新遷移時
npm run dev                # http://127.0.0.1:5173
```

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器（HMR，port 5173） |
| `npm run build` | 建置到 `dist/`，含 `dist/server/wrangler.json` |
| `npm start` | 用 Wrangler 在本機跑建置後的 Worker（port 8788） |
| `npm run typecheck` | TypeScript 型別檢查 |
| `npm run lint` | ESLint |
| `npm run db:generate` | 修改 `db/schema.ts` 後產生新的 `drizzle/` 遷移 |
| `npm run db:migrate:local` | 把 `drizzle/` 的遷移套用到本機 D1 |
| `npm run test:api` | API 整合測試（需先另開 `npm run dev`） |
| `npm run test:retention` | 資料保留政策測試（需先另開 `npm run dev`；會清掉本機 D1 幾乎所有資料，放在 `test:api` 之後跑） |
| `npm run test:auth` | Access JWT 驗證的單元測試 |
| `npm run test:e2e` | Playwright smoke 與截圖比對（需先另開 `npm run dev`，並有 Docker） |
| `npm run test:e2e:update` | 重新產生截圖基準 |

`npm run dev` 和 `npm start` 共用 `.wrangler/state` 裡的本機 D1。這個目錄可以直接刪掉重建，刪掉後再跑一次 `npm run db:migrate:local` 即可。

如果你的本機 D1 是 M1 之前用 `wrangler d1 execute --file` 建的，裡面沒有 `d1_migrations` 紀錄，`db:migrate:local` 會因為資料表已存在而失敗。這時刪掉 `.wrangler/state` 重建即可。

## 瀏覽器測試與截圖基準

`tests/e2e/` 是 v2 重構的安全網（issue #4，V1-a）：`smoke.spec.ts` 檢查每個畫面都能打開、390px 寬沒有橫向捲動、投稿 → 我的片段 → 撤回、我的片段的「在這台裝置登出」、管理頁的篩選 → 搜尋 → 載入更多 → 單篇 409 自動更新 → 刪除（種 51 篇測試投稿，結束後刪除）；`visual.spec.ts` 對每個畫面在 390px 與 1280px 拍整頁截圖，和 `tests/e2e/__screenshots__/` 的基準逐像素比對（不允許任何像素超出預設的顏色容差 0.2，只吸收不同 CPU 的反鋸齒雜訊）。畫面清單在 `tests/e2e/screens.ts`。

截圖只有在同一個環境才能比對，所以測試一律跑在官方 Playwright 容器（`mcr.microsoft.com/playwright:v<版本>-noble`，版本跟著 `@playwright/test`）裡，CI 也一樣。dev server 跑在本機，容器用 host 網路連過去，所以**只能在 Linux 上跑**（Docker Desktop for Mac／Windows 的 host 網路連不到本機 127.0.0.1；容器固定用 `linux/amd64`，基準也是 amd64 產生的）。

```sh
npm run db:migrate:local
npm run dev                                   # 另開一個終端機
npm run test:e2e                              # 比對；預設 TEST_ORIGIN=http://127.0.0.1:5173
TEST_ORIGIN=http://127.0.0.1:5174 npm run test:e2e   # dev server 在別的 port 時
npm run test:e2e:update                       # 畫面確定要改時，重新產生有差異的基準
```

- 本機 D1 要是乾淨的（跟 `test:api` 一樣）：管理頁與公開信箱的截圖是空資料庫的樣子。管理頁的操作紀錄會保留一年（smoke 測試自己的操作也會留下），截圖時把 `/api/admin/events` 換成空清單（`tests/e2e/screens.ts`）。有殘留資料就刪掉 `.wrangler/state` 再跑 `db:migrate:local`。
- 字型從 Google Fonts 載入，需要連得到網路。Google 對 400／500／600 三個字重回傳同一批可變字型檔、每個檔宣告三次，比對哪一個會隨載入順序而變，造成字形有細微像素差；測試會把這段 CSS 改寫成每個檔一個 `font-weight: 400 600` 的 @font-face（見 `tests/e2e/fixtures.ts`），字檔本身不變。
- 失敗時差異圖在 `test-results/`；CI 會把 `playwright-report/` 與 `test-results/` 上傳成 artifact。
- 升級 `@playwright/test` 後，容器版本會跟著換，要重新產生全部基準（`npm run test:e2e -- --update-snapshots=all`）。

## 管理者

管理介面在 `/admin`，API 在 `/api/admin/` 底下（`GET /api/admin/summary`、`GET /api/admin/stories`（篩選、搜尋、分頁）、`POST /api/admin/stories/:id/moderation`、`GET /api/admin/feedback`、`DELETE /api/admin/feedback/:id`、`POST /api/admin/moderation`（批次不通過或刪除）、`GET /api/admin/events`（操作紀錄））。頁面由上而下是摘要、篩選列、故事清單、回饋、操作紀錄。篩選條件寫在網址（例如 `/admin?status=approved&q=…`），重新整理、上一頁或分享連結都保留；搜尋框貼上故事 id 會改成精確查詢（狀態自動切到「全部」）。清單每次 50 篇，底部「載入更多」。每張卡片有故事 id、投稿日期、同意版本與「剩 N 天」（核准後永久保留的不顯示），代刪時用來核對來信。審閱遇到 409（列出之後作者又改了）會只重新抓那一篇並標示「這篇剛剛改變了，請再看一次」；永久刪除後顯示「已刪除《標題》（投稿日期）」，回信可引用。每張卡片都有勾選框，可批次「不通過或下架」（只處理勾選中等待審閱或已匿名分享的，沒有這類就停用並說明原因）或「永久刪除」（任何狀態）；沒有批次核准，核准一定要逐篇讀過原文。「全選」只勾目前已載入的卡片，換篩選條件就清空；一次最多 50 篇，超過就停用並提示，不會自動截斷。送出前用確認框列出篇數與前幾篇標題。結果逐篇回報：刪除成功的從清單移除、不通過成功的就地更新；沒處理的保持勾選、在卡片上標原因（剛剛改變了／這個狀態不能不通過／已不存在）並重新抓那幾篇，已不存在的從清單移除；頂端提示總結，例如「已永久刪除 10 篇；2 篇未處理（1 篇剛剛改變了、1 篇已不存在）」。核准、不通過、刪除故事與刪除回饋都會記在 `admin_events`（操作者 email、動作、對象 id、時間，不含內容），保留一年。卡片上的「重新申請分享」表示作者在「我的片段」把這篇改為分享或再次申請（停止分享後再分享也一樣，一定要重新核准），下方的「授權紀錄 N 筆」是送出、改為分享、停止分享的次數。

**正式環境**：用 Cloudflare Access 建立一個 self-hosted 應用程式，涵蓋 `/admin*` 與 `/api/admin*`（包含 `/api/admin/` 底下所有子路徑），只允許管理者的 email。Worker 會再驗證 Access 帶來的 `Cf-Access-Jwt-Assertion` JWT，需要這三個設定（任一缺少就拒絕所有管理請求）：

```sh
npx wrangler secret put ADMIN_EMAILS         # 逗號分隔，例如 me@example.com
npx wrangler secret put ACCESS_TEAM_DOMAIN   # 例如 myteam.cloudflareaccess.com
npx wrangler secret put ACCESS_AUD           # Access 應用程式的 Audience (AUD) tag
```

**開發環境**：沒有 Access。dev server 每次啟動會產生一個祕密（寫在 `.wrangler/dev-admin-token`），只有帶著它的請求才算管理者，所以就算透過 tunnel 或轉發把 dev server 開出去，別人也冒充不了。`tests/api.mjs` 會自動讀這個檔案。要在瀏覽器用 `/admin`：在 `.env.local` 設 `DEV_ADMIN_EMAIL=you@example.com`，重開 `npm run dev`，再打開終端機印出的「Dev admin sign-in」連結。

## 設定

`wrangler.jsonc` 定義 Worker 名稱、D1 綁定 `DB`（正式資料庫 `ring-letter-db`，APAC）、自訂網域 `ringletter.wetrytrysee.cc`，以及每日的 Cron Trigger（`17 19 * * *`，台北 03:17，執行 `lib/server/retention.ts` 的資料保留政策；部署後在 Cloudflare 主控台的 Worker → Settings → Triggers 可以看到）。`workers_dev` 和 `preview_urls` 都關閉，因為 Access 只保護自訂網域，不能留其他入口。本機的 `--local` 一律使用 `.wrangler/state`，不會碰到正式資料庫。

## 部署（手動）

```sh
npx wrangler d1 migrations apply ring-letter-db --remote   # drizzle/ 有新遷移時
npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

第一次部署前，要先在 Cloudflare One 建立 Access 應用程式。Destinations 放 `ringletter.wetrytrysee.cc/admin` 和 `/api/admin` 兩筆（Access 的路徑會一併保護其下所有子路徑，例如 `/api/admin/summary`；部署後的 smoke test 會確認 `/api/admin/summary` 被 Access 轉址），政策只允許管理者的 email。部署完再設上面三個 secret（先設 secret 的話，wrangler 會先建一個空殼 Worker）。缺 secret 時管理端點一律拒絕。

頁尾與隱私說明公開的聯絡信箱 `ringletter@wetrytrysee.cc`（`lib/contact.ts`）用 Cloudflare Email Routing 轉寄給管理者，不公開管理者自己的信箱：在 `wetrytrysee.cc` 的 Email → Email Routing 建立這個自訂地址並指向已驗證的目的地信箱。作者遺失 cookie、換裝置或超過一年沒回來時，會寫信來請管理者代刪（#4 第 6.2 節）：在 `/admin` 狀態選「全部」，用搜尋框（標題或部分內文）加投稿日期範圍找到該篇，用「永久刪除」移除（連同回饋與同意紀錄），通常 7 天內回信告知。

### Session 與資料保留

匿名 session 的 cookie 是 1 年，每次造訪（頁面或 API）都由 `worker/index.ts` 續發，`sessions.last_seen` 每天最多寫一次；最後造訪後 1 年由每日 Cron 刪除。故事保留依同意版本：V3-c 起的投稿（`v3-2026-11-12`）核准公開後保留到撤回或管理者刪除，其他狀態在最後一次狀態變更後 30 天刪除；之前的投稿照當時的 30 天條款（送出後 30 天，包含已核准）。回饋與試寫紀錄 30 天。管理者操作紀錄（`admin_events`）1 年。細節見 `lib/server/retention.ts` 與 `PROJECT_NOTES.md`。

作者可在「我的片段」改為分享（重新勾選目前版本的同意，舊版同意的故事因此改用新條款）或停止分享（已公開的立即下架，改為未公開，依上面的 30 天規則刪除）；每篇送出後最多再申請分享 3 次，每個 session 每天最多調整 10 次（`PATCH /api/me/stories/:id/sharing`）。
