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
npm run lint               # main 上已有 17 個既存錯誤（ring-letter-app.tsx 的 any、match-experience 的 setState-in-effect）
npm run db:generate        # 改 db/schema.ts 後產生 drizzle/ 遷移
npm run test:auth          # lib/access-jwt.ts 單元測試（node --test，Node 原生剝除 TS 型別）
```

API 整合測試（`tests/api.mjs`，單一腳本，沒有個別測試可選）對 **`npm run dev`** 跑：

```sh
npm run dev                     # 另開一個終端機
npm run test:api                # 預設 TEST_ORIGIN=http://127.0.0.1:5173
```

測試讀 `.wrangler/dev-admin-token`（dev server 每次啟動產生的祕密）來扮演管理者（見下方「管理者驗證」），所以要先啟動 dev server，也不能對 `npm start` 或正式環境跑：建置後的 Worker 沒有這條路，管理者測試會拿到 403。測試資料最後會自行刪除，但測試中途失敗時，資料會留在本機 D1，下次跑到最後一個檢查會失敗。這時刪掉 `.wrangler/state`，再跑一次 `npm run db:migrate:local`。

`npm run dev` 和 `npm start` 共用 `.wrangler/state`。`.wrangler/`、`.vinext/`、`dist/` 都是可丟棄的本機狀態。

## 架構重點

- **設定**：`wrangler.jsonc` 是 Worker 與 D1 綁定（`DB`、`migrations_dir: drizzle`）的唯一來源；`vite.config.ts` 是 `vinext()` + `@cloudflare/vite-plugin`，加上 dev 專用的管理者身分 middleware（`devAdminIdentity()`）。`database_id` 目前是佔位值，M3 部署前要換掉。`worker/index.ts` 只是把請求交給 `vinext/server/fetch-handler`。
- **前端是一個大型單頁**：`components/ring-letter-app.tsx`（首頁 / past・present 兩種投稿 / 我的片段 / 管理審閱，以 tab 切換）由 `app/page.tsx` 和 `app/admin/page.tsx`（`initialTab="admin"`）共用；`components/match-experience.tsx` 是隨機試讀、選填情境篩選、回音入口。程式碼高度壓縮在少數長行裡，編輯時用精確字串比對。
- **試讀與媒合是純靜態**：`data/matching.ts` 的 `MATCH_LETTERS`（八封虛構範例，每個 `SCENARIOS` 類別兩封，下一封互動需要每類至少兩封）與 `FORM_URL_DISTRESS` / `FORM_URL_ECHO`（目前是 `'#'`，點擊會顯示「尚未開放」而非假送出）。這部分不打 API、不寫 DB、不設 cookie。內容會公開，不可放未去識別化的真實原稿。
- **後端兩個端點**：`app/api/letter/route.ts`（公開＋匿名 session，以 `action` 分派；GET：無 action＝已核准故事、`mine`；POST：`session` / `start` / `submit` / `withdraw` / `erase` / `feedback`）與 `app/api/admin/route.ts`（GET 審閱清單＋回饋＋寫作指標；POST `{id,status}` 審核）。共用的 `db()` / `reply()` / `AGE` / `sameOrigin()` 在 `lib/server.ts`。透過 `cloudflare:workers` 的 `env.DB` 直接寫 SQL；`db/schema.ts` 只用於 drizzle-kit 產生遷移，程式沒有用 Drizzle 查詢。
- **匿名身分**：`rl_session` HttpOnly cookie（30 天隨機 token），DB 只存 SHA-256。每 session 每日上限：投稿 5、回饋／開始試寫 30。POST 有同源檢查。
- **管理者驗證**（`lib/admin.ts` 的 `verifyAdmin()`）：
  - 正式環境：Cloudflare Access 保護 `/admin*` 與 `/api/admin*`。Worker 仍自己驗 `Cf-Access-Jwt-Assertion`（`lib/access-jwt.ts`：RS256、`aud`、`iss`、`exp`／`nbf`，從 `https://<team>/cdn-cgi/access/certs` 取公鑰並快取 1 小時，未知 `kid` 會重抓一次），再比對 `ADMIN_EMAILS` 白名單。設定值 `ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`、`ADMIN_EMAILS`（secret，不進版控）任一缺少就一律拒絕。
  - 管理者必須用整頁導覽進 `/admin` 才會觸發 Access 登入；前端用 `fetch()` 打 `/api/admin` 時若未登入，Access 會回跨來源重新導向而失敗。所以頁尾「管理者登入」是連到 `/admin` 的一般連結。
  - 開發環境（`import.meta.env.DEV`，正式建置會整段移除）：身分直接取 `Cf-Access-Authenticated-User-Email` header。這個 header 由 `vite.config.ts` 的 `devAdminIdentity()` 設定：它先刪掉客戶端送來的所有 `cf-access-*`、`oai-authenticated-user-*` header，只有帶著本次啟動的祕密（寫在 `.wrangler/dev-admin-token`）的請求才會拿到身分——`x-dev-admin-token` + `x-dev-admin-email`（測試用），或透過終端機印出的 `/__dev-admin?token=…` 登入連結取得的 `rl_dev_admin` cookie（瀏覽器用，注入 `.env.local` 的 `DEV_ADMIN_EMAIL`）。**不要改成用來源 IP 判斷**：Cloudflare plugin 的 quick tunnel、ssh／Docker／WSL 轉發、反向代理進來的請求都會是 loopback。
- **資料保留**：`cleanup()` 在建立新 session 時刪除 30 天前的所有列，**包含已核准的公開故事**（已知問題，排在 v2）。
- **同意規則**：私人（未同意分享）故事不能被核准；管理者不能修改投稿內文；舊投稿的同意不可沿用到新的人工媒合流程。

`ring-letter/PROJECT_NOTES.md` 記錄了產品決策、隱私限制與歷次瀏覽器 QA 範圍，改動行為前可參考。
