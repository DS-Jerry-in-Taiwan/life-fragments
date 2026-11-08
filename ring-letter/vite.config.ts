import { cloudflare } from "@cloudflare/vite-plugin";
import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";

// Don't fetch real request.cf metadata from Cloudflare for local previews.
process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";

// The admin check still trusts `oai-authenticated-user-*` headers (replaced
// by Cloudflare Access in M2). Never let a client supply them to the dev
// server, e.g. when it is exposed with `--host`.
function stripForgedIdentityHeaders(): Plugin {
  return {
    name: "strip-forged-identity-headers",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        for (const name of Object.keys(req.headers)) {
          if (name.startsWith("oai-authenticated-user-")) delete req.headers[name];
        }
        for (let i = req.rawHeaders.length - 2; i >= 0; i -= 2) {
          if (req.rawHeaders[i].toLowerCase().startsWith("oai-authenticated-user-")) {
            req.rawHeaders.splice(i, 2);
          }
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
