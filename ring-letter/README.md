# Ring letter

匿名的跨時間故事閱讀與投稿網站。使用 [Vinext](https://github.com/cloudflare/vinext)（Vite 版 Next.js App Router，beta）+ React 19，部署在 Cloudflare Workers，資料庫為 Cloudflare D1 + Drizzle。

產品決策、隱私與同意規則記錄在 `PROJECT_NOTES.md`；搬遷規劃見 `../docs/ARCHITECTURE-MVP.md`。

## 開發

需要 Node.js 22.13 以上。

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
| `npm run test:api` | API 整合測試（需先 `npm run build && npm start`） |

`npm run dev` 和 `npm start` 共用 `.wrangler/state` 裡的本機 D1。這個目錄可以直接刪掉重建，刪掉後再跑一次 `npm run db:migrate:local` 即可。

如果你的本機 D1 是 M1 之前用 `wrangler d1 execute --file` 建的，裡面沒有 `d1_migrations` 紀錄，`db:migrate:local` 會因為資料表已存在而失敗。這時刪掉 `.wrangler/state` 重建即可。

開發伺服器會刪掉客戶端送來的 `oai-authenticated-user-*` header，所以在 dev 裡無法當管理者；API 測試要對 `npm start` 跑。

## 設定

`wrangler.jsonc` 定義 Worker 名稱與 D1 綁定 `DB`。`database_id` 目前是本機用的佔位值，部署前要換成 `wrangler d1 create ring-letter-db` 產生的真實 ID。
