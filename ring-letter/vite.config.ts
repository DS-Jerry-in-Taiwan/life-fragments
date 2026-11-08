import { cloudflare } from "@cloudflare/vite-plugin";
import vinext from "vinext";
import { defineConfig, loadEnv, type Plugin } from "vite";

// Don't fetch real request.cf metadata from Cloudflare for local previews.
process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";

// In dev, lib/admin.ts takes the admin identity from the
// `Cf-Access-Authenticated-User-Email` header (there is no Access locally).
// Only honour identity headers from loopback, so a dev server exposed with
// `--host` can't be used to impersonate the admin from the network. The
// legacy Sites `oai-authenticated-user-*` headers are always dropped.
// For using /admin in the browser, set DEV_ADMIN_EMAIL in .env.local; it is
// injected for loopback requests that don't send their own identity.
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function stripForgedIdentityHeaders(): Plugin {
  return {
    name: "strip-forged-identity-headers",
    configureServer(server) {
      const devAdmin = loadEnv(server.config.mode, server.config.root, "").DEV_ADMIN_EMAIL;
      server.middlewares.use((req, _res, next) => {
        const loopback = LOOPBACK.has(req.socket.remoteAddress ?? "");
        const forged = (name: string) => {
          const n = name.toLowerCase();
          return n.startsWith("oai-authenticated-user-") || (!loopback && n.startsWith("cf-access-"));
        };
        for (const name of Object.keys(req.headers)) if (forged(name)) delete req.headers[name];
        for (let i = req.rawHeaders.length - 2; i >= 0; i -= 2) {
          if (forged(req.rawHeaders[i])) req.rawHeaders.splice(i, 2);
        }
        if (loopback && devAdmin && !req.headers["cf-access-authenticated-user-email"]) {
          req.headers["cf-access-authenticated-user-email"] = devAdmin;
          req.rawHeaders.push("cf-access-authenticated-user-email", devAdmin);
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
    stripForgedIdentityHeaders(),
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
    }),
  ],
});
