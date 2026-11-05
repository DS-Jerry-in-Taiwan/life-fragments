# Life fragments / Ring letter

本專案保留根目錄的既有 GitHub Pages 頁面與 CNAME，並於 `ring-letter/` 收錄目前 Ring letter 測試版原始碼。

目前網站：https://ring-letter-first-light.tom82523.chatgpt.site

## Ring letter 開發

需要 Node.js 22.13 以上。

```sh
cd ring-letter
npm ci
npm run dev
```

正式檢查：`npx tsc --noEmit` 與 `npm run build`。

這是 Vinext / Cloudflare Workers 應用，既有投稿使用 D1。GitHub Pages 只能提供靜態內容，因此合併本 PR 不會自動更新 Ring letter 的伺服器功能或替換根目錄首頁。

## 修改內容的位置

- `ring-letter/app/page.tsx`：首頁、投稿、我的片段與審閱。
- `ring-letter/components/match-experience.tsx`：隨機試讀、選填情境篩選與回音入口。
- `ring-letter/data/matching.ts`：八封範例信、`FORM_URL_DISTRESS` 與 `FORM_URL_ECHO`（目前為 `#`）。
- `ring-letter/app/globals.css`：既有深色信紙風格與響應式排版。
- `ring-letter/PROJECT_NOTES.md`：資料保留、權限與測試限制。

新試讀不會自動媒合或儲存互動；一般投稿與人工媒合報名分開。範例信均為虛構並有清楚標示。投稿後只在作者同意且管理者核准時公開。

## 部署與資料庫

`ring-letter/.openai/hosting.json` 指向既有 Sites 專案；部署需該專案編輯權限。移至其他平台時需自行配置 Workers / D1，執行 `drizzle/` 中遷移，並調整部署身分設定。不可把可偽造的客戶端 header 用作管理者驗證；現有驗證依賴 Sites 平台提供的已驗證身分。

沒有包含 node_modules、建置結果、Cookie、資料庫內容或憑證。既有管理者設定在 API 中，接手前請檢查與調整。
