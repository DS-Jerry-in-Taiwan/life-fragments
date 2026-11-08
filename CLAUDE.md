# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案組成

這個 repo 有兩個互不相干的部分：

- **根目錄 `index.html` + `CNAME`**：GitHub Pages 靜態概念頁（`life.wetrytrysee.cc`），沒有建置流程，直接改 HTML。
- **`ring-letter/`**：Ring letter 應用。Vinext（Vite 版 Next.js App Router，**beta**）+ React 19，跑在 Cloudflare Workers，資料庫是 D1（SQLite）+ Drizzle。原本是用 OpenAI ChatGPT Sites 做的，目前線上版仍在 tom82523 的 Sites 帳號；我們正把它搬到自己的 Cloudflare 帳號。

搬遷規劃在 `docs/ARCHITECTURE-MVP.md`（M0–M5 里程碑），進度追蹤在 GitHub issue DS-Jerry-in-Taiwan/life-fragments#2（勾選清單）。已定案：用使用者自己的 Cloudflare 帳號、`wetrytrysee.cc` 已由 Cloudflare 管理、管理者只有使用者本人。M1 已移除所有 Sites 腳手架（`.openai/`、`scripts/`、connector、`chatgpt-auth`、sites vite plugin）。

UI 文案與錯誤訊息都是繁體中文。

## 指令（在 `ring-letter/` 下執行，需 Node ≥ 22.13）

```sh
npm ci
npm run db:migrate:local   # 第一次，或 drizzle/ 有新遷移時（wrangler d1 migrations apply）
npm run dev                # vinext dev，port 5173
npm run build              # 產生 dist/，含 dist/server/wrangler.json
npm start                  # 用 wrangler 在本機跑建置後的 Worker，port 8788
npm run typecheck
npm run lint               # main 上已有 17 個既存錯誤（page.tsx 的 any、match-experience 的 setState-in-effect）
npm run db:generate        # 改 db/schema.ts 後產生 drizzle/ 遷移
```

API 整合測試（`tests/api.mjs`，單一腳本，沒有個別測試可選）要對**建置後的 Worker** 跑：

```sh
npm run build && npm start      # 另開一個終端機
npm run test:api                # 預設 TEST_ORIGIN=http://127.0.0.1:8788
```

不要對 `npm run dev` 跑：vinext dev 的同源檢查會先回傳純文字 403，測試解析 JSON 時會壞掉。測試會偽造 `oai-authenticated-user-email` header 冒充管理者，**只能對本機跑**。測試資料最後會自行刪除，但測試中途失敗時，資料會留在本機 D1，下次跑到最後一個檢查會失敗。這時刪掉 `.wrangler/state`，再跑一次 `npm run db:migrate:local`。`npm start` 剛啟動時，第一個請求偶爾會拿到 Miniflare 的 503，重跑即可。

`npm run dev` 和 `npm start` 共用 `.wrangler/state`。`.wrangler/`、`.vinext/`、`dist/` 都是可丟棄的本機狀態。

## 架構重點

- **設定**：`wrangler.jsonc` 是 Worker 與 D1 綁定（`DB`、`migrations_dir: drizzle`）的唯一來源；`vite.config.ts` 只有 `vinext()` + `@cloudflare/vite-plugin`，從 wrangler.jsonc 讀綁定。`database_id` 目前是佔位值，M3 部署前要換掉。`worker/index.ts` 只是把請求交給 `vinext/server/fetch-handler`。
- **前端是一個大型單頁**：`app/page.tsx`（首頁 / past・present 兩種投稿 / 我的片段 / 管理審閱）與 `components/match-experience.tsx`（隨機試讀、選填情境篩選、回音入口）。程式碼高度壓縮在少數長行裡，編輯時用精確字串比對。
- **試讀與媒合是純靜態**：`data/matching.ts` 的 `MATCH_LETTERS`（八封虛構範例，每個 `SCENARIOS` 類別兩封，下一封互動需要每類至少兩封）與 `FORM_URL_DISTRESS` / `FORM_URL_ECHO`（目前是 `'#'`，點擊會顯示「尚未開放」而非假送出）。這部分不打 API、不寫 DB、不設 cookie。內容會公開，不可放未去識別化的真實原稿。
- **後端只有一個端點**：`app/api/letter/route.ts`，以 `action` 分派。GET：無 action（已核准故事）、`mine`、`admin`；POST：`session` / `start` / `submit` / `withdraw` / `erase` / `feedback` / `moderate`。透過 `cloudflare:workers` 的 `env.DB` 直接寫 SQL；`db/schema.ts` 只用於 drizzle-kit 產生遷移，程式沒有用 Drizzle 查詢。
- **匿名身分**：`rl_session` HttpOnly cookie（30 天隨機 token），DB 只存 SHA-256。每 session 每日上限：投稿 5、回饋／開始試寫 30。POST 有同源檢查。
- **管理者驗證（M2 待替換）**：目前比對 `oai-authenticated-user-email` header 與 route.ts 裡硬編碼的 `ADMIN`（tom82523）。這個 header 只有在 Sites 平台注入時才可信；M1 之後本機和任何非 Sites 部署都會接受偽造的 header。M2 要改成驗 Cloudflare Access JWT，並把管理者 API 移到 `/api/admin`。**M2 完成前不可部署到正式環境。** `page.tsx` 的「管理者登入」連到 `/signin-with-chatgpt`，這是 Sites 的路由，現在已經失效，M2 一併換掉。
- **資料保留**：`cleanup()` 在建立新 session 時刪除 30 天前的所有列，**包含已核准的公開故事**（已知問題，排在 v1.1）。
- **同意規則**：私人（未同意分享）故事不能被核准；管理者不能修改投稿內文；舊投稿的同意不可沿用到新的人工媒合流程。

`ring-letter/PROJECT_NOTES.md` 記錄了產品決策、隱私限制與歷次瀏覽器 QA 範圍，改動行為前可參考（其中提到 Sites 登入的部分在 M2 後會過時）。
