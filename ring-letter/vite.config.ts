import { cloudflare } from "@cloudflare/vite-plugin";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import vinext from "vinext";
import { defineConfig, loadEnv, type Plugin } from "vite";

// Don't fetch real request.cf metadata from Cloudflare for local previews.
process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";

const IDENTITY = "cf-access-authenticated-user-email";
const TOKEN_HEADER = "x-dev-admin-token";
const EMAIL_HEADER = "x-dev-admin-email";
const COOKIE = "rl_dev_admin";
const SIGN_IN_PATH = "/__dev-admin";

/**
 * Dev-only admin identity. In `npm run dev`, lib/server/auth.ts trusts the
 * `Cf-Access-Authenticated-User-Email` header (there is no Access locally).
 * The source address can't be the trust boundary: the Cloudflare plugin's
 * quick tunnel, ssh/Docker/WSL forwards and reverse proxies all arrive from
 * loopback. So:
 *
 * - Every client-supplied `cf-access-*` and legacy `oai-authenticated-user-*`
 *   header is dropped.
 * - A random secret is generated per dev-server start and written to
 *   .wrangler/dev-admin-token. Only a request carrying it gets an identity:
 *   either `x-dev-admin-token` + `x-dev-admin-email` (tests/api.mjs), or the
 *   `rl_dev_admin` cookie set by the sign-in link printed in the terminal,
 *   which injects DEV_ADMIN_EMAIL from .env.local (browser use of /admin).
 */
function devAdminIdentity(): Plugin {
  return {
    name: "dev-admin-identity",
    configureServer(server) {
      const root = server.config.root;
      const devAdmin = loadEnv(server.config.mode, root, "").DEV_ADMIN_EMAIL?.trim();
      const token = randomBytes(32).toString("hex");
      const tokenFile = path.join(root, ".wrangler", "dev-admin-token");
      mkdirSync(path.dirname(tokenFile), { recursive: true });
      writeFileSync(tokenFile, token, { mode: 0o600 });
      const matches = (value: string | undefined) =>
        !!value && value.length === token.length && timingSafeEqual(Buffer.from(value), Buffer.from(token));

      server.httpServer?.once("listening", () => {
        if (devAdmin) {
          server.config.logger.info(`  ➜  Dev admin sign-in (${devAdmin}): ${SIGN_IN_PATH}?token=${token}`);
        }
      });

      server.middlewares.use((req, res, next) => {
        const drop = (name: string) => {
          const n = name.toLowerCase();
          return n.startsWith("cf-access-") || n.startsWith("oai-authenticated-user-") || n === TOKEN_HEADER || n === EMAIL_HEADER;
        };
        const sentToken = req.headers[TOKEN_HEADER];
        const sentEmail = req.headers[EMAIL_HEADER];
        const cookieToken = /(?:^|;\s*)rl_dev_admin=([a-f0-9]+)/.exec(req.headers.cookie ?? "")?.[1];

        for (const name of Object.keys(req.headers)) if (drop(name)) delete req.headers[name];
        for (let i = req.rawHeaders.length - 2; i >= 0; i -= 2) {
          if (drop(req.rawHeaders[i])) req.rawHeaders.splice(i, 2);
        }

        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname === SIGN_IN_PATH) {
          const ok = !!devAdmin && matches(url.searchParams.get("token") ?? undefined);
          res.statusCode = ok ? 302 : 403;
          res.setHeader("Cache-Control", "no-store");
          if (ok) {
            res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`);
            res.setHeader("Location", "/admin");
          }
          res.end();
          return;
        }

        let email: string | undefined;
        if (typeof sentToken === "string" && matches(sentToken) && typeof sentEmail === "string") email = sentEmail.trim();
        else if (devAdmin && matches(cookieToken)) email = devAdmin;
        if (email) {
          req.headers[IDENTITY] = email;
          req.rawHeaders.push(IDENTITY, email);
        }
        next();
      });
    },
  };
}

// Bindings (D1 `DB`) come from wrangler.jsonc. Local dev and `npm start`
// share the Miniflare state in .wrangler/state.
export default defineConfig({
  plugins: [
    devAdminIdentity(),
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
    }),
  ],
});
