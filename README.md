# Life fragments / Ring letter

本專案保留根目錄的既有 GitHub Pages 頁面與 CNAME，並於 `ring-letter/` 收錄目前 Ring letter 測試版原始碼。

目前網站：https://ring-letter-first-light.tom82523.chatgpt.site

## Ring letter 開發

需要 Node.js 22.13 以上。

```sh
cd ring-letter
npm ci
npm run db:migrate:local
npm run dev
```

正式檢查：`npm run typecheck` 與 `npm run build`。完整指令見 `ring-letter/README.md`。

這是 Vinext / Cloudflare Workers 應用，投稿使用 D1。GitHub Pages 只提供根目錄的靜態概念頁；`ring-letter/` 的變更不會因為合併到 `main` 就上線，要另外部署到 Cloudflare。

## 修改內容的位置

- `ring-letter/app/page.tsx`：首頁、投稿、我的片段與審閱。
- `ring-letter/components/match-experience.tsx`：隨機試讀、選填情境篩選與回音入口。
- `ring-letter/data/matching.ts`：八封範例信、`FORM_URL_DISTRESS` 與 `FORM_URL_ECHO`（目前為 `#`）。
- `ring-letter/app/globals.css`：既有深色信紙風格與響應式排版。
- `ring-letter/PROJECT_NOTES.md`：資料保留、權限與測試限制。

新試讀不會自動媒合或儲存互動；一般投稿與人工媒合報名分開。範例信均為虛構並有清楚標示。投稿後只在作者同意且管理者核准時公開。

## 部署與資料庫

Sites 專用的腳手架已移除，改用 `ring-letter/wrangler.jsonc` 設定 Worker 與 D1 綁定 `DB`，準備部署到我們自己的 Cloudflare 帳號（規劃見 issue #2；第二版見 issue #4）。目前線上站仍是 tom82523 在 Sites 上的舊版本。

**管理者驗證尚未替換**：API 仍然只比對 `oai-authenticated-user-email` header，這個 header 在 Sites 之外可以被偽造。換成 Cloudflare Access 之前（M2），不可部署到正式環境。

沒有包含 node_modules、建置結果、Cookie、資料庫內容或憑證。既有管理者設定在 API 中，接手前請檢查與調整。
