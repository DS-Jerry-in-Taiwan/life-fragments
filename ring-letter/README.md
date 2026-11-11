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
| `npm run test:auth` | Access JWT 驗證的單元測試 |

`npm run dev` 和 `npm start` 共用 `.wrangler/state` 裡的本機 D1。這個目錄可以直接刪掉重建，刪掉後再跑一次 `npm run db:migrate:local` 即可。

如果你的本機 D1 是 M1 之前用 `wrangler d1 execute --file` 建的，裡面沒有 `d1_migrations` 紀錄，`db:migrate:local` 會因為資料表已存在而失敗。這時刪掉 `.wrangler/state` 重建即可。

## 管理者

管理介面在 `/admin`，API 在 `/api/admin`。

**正式環境**：用 Cloudflare Access 建立一個 self-hosted 應用程式，涵蓋 `/admin*` 與 `/api/admin*`，只允許管理者的 email。Worker 會再驗證 Access 帶來的 `Cf-Access-Jwt-Assertion` JWT，需要這三個設定（任一缺少就拒絕所有管理請求）：

```sh
npx wrangler secret put ADMIN_EMAILS         # 逗號分隔，例如 me@example.com
npx wrangler secret put ACCESS_TEAM_DOMAIN   # 例如 myteam.cloudflareaccess.com
npx wrangler secret put ACCESS_AUD           # Access 應用程式的 Audience (AUD) tag
```

**開發環境**：沒有 Access。dev server 每次啟動會產生一個祕密（寫在 `.wrangler/dev-admin-token`），只有帶著它的請求才算管理者，所以就算透過 tunnel 或轉發把 dev server 開出去，別人也冒充不了。`tests/api.mjs` 會自動讀這個檔案。要在瀏覽器用 `/admin`：在 `.env.local` 設 `DEV_ADMIN_EMAIL=you@example.com`，重開 `npm run dev`，再打開終端機印出的「Dev admin sign-in」連結。

## 設定

`wrangler.jsonc` 定義 Worker 名稱、D1 綁定 `DB`（正式資料庫 `ring-letter-db`，APAC）與自訂網域 `ringletter.wetrytrysee.cc`。`workers_dev` 和 `preview_urls` 都關閉，因為 Access 只保護自訂網域，不能留其他入口。本機的 `--local` 一律使用 `.wrangler/state`，不會碰到正式資料庫。

## 部署（手動）

```sh
npx wrangler d1 migrations apply ring-letter-db --remote   # drizzle/ 有新遷移時
npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

第一次部署前，要先在 Cloudflare One 建立 Access 應用程式。Destinations 放 `ringletter.wetrytrysee.cc/admin` 和 `/api/admin` 兩筆，政策只允許管理者的 email。部署完再設上面三個 secret（先設 secret 的話，wrangler 會先建一個空殼 Worker）。缺 secret 時管理端點一律拒絕。
