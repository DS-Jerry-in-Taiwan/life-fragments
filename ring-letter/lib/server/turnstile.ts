import { env } from "cloudflare:workers";
import {
  checkTurnstile,
  productionTurnstileConfig,
  TURNSTILE_HEADER,
  type TurnstileAction,
  type TurnstileConfig,
} from "./turnstile-siteverify";

/**
 * Keys for Turnstile (#4 §5.1).
 *
 * Production: the site key and TURNSTILE_HOSTNAME are `vars` in
 * wrangler.jsonc, the secret is TURNSTILE_SECRET_KEY (`wrangler secret put`).
 * A missing secret or hostname fails closed (503).
 *
 * Development (`import.meta.env.DEV`, compiled out of production builds, as
 * in lib/server/auth.ts): always Cloudflare's always-pass test keys, whatever
 * the env says. The cloudflare vite plugin loads wrangler.jsonc's `vars` into
 * dev too, so reading them here would put the production site key (which
 * rejects localhost) and hostname check into `npm run dev` and CI.
 */
function config(): TurnstileConfig {
  if (import.meta.env.DEV) {
    return { secret: "1x0000000000000000000000000000000AA", testKeys: true };
  }
  return productionTurnstileConfig(env);
}

/** The public site key for components/common/Turnstile.tsx; "" when unset. */
export function turnstileSiteKey(): string {
  if (import.meta.env.DEV) return "1x00000000000000000000AA";
  return env.TURNSTILE_SITE_KEY?.trim() ?? "";
}

/** Checks the request's `X-Turnstile-Token` for `action` with siteverify. */
export function verifyTurnstile(req: Request, action: TurnstileAction) {
  return checkTurnstile(
    req.headers.get(TURNSTILE_HEADER),
    action,
    config(),
    req.headers.get("cf-connecting-ip"),
  );
}
