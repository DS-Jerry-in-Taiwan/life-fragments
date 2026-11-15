import handler from "vinext/server/fetch-handler";
import { runRetention } from "../lib/server/retention";
import { applySecurityHeaders, newNonce, nonceRequest } from "../lib/server/security-headers";
import { refreshSession } from "../lib/server/session";

/**
 * Sliding sessions (#4 §6.2): every response to a request with a live session
 * cookie (pages and API alike) re-issues the cookie for another year, unless
 * the route set or cleared it itself (POST /api/session, DELETE /api/session,
 * DELETE /api/me). Done here rather than in the routes so that a visit that
 * only reads pages still counts. The lookup runs alongside the handler, so it
 * adds no D1 round trip before the response (when the route deletes the
 * session meanwhile, its response clears the cookie and the refresh is
 * dropped); a failure only skips the refresh.
 */
async function withSessionRefresh(refresh: Promise<string | null>, response: Response) {
  if (response.headers.getSetCookie().some((c) => c.startsWith("rl_session="))) return;
  const cookie = await refresh;
  if (!cookie) return;
  response.headers.append("Set-Cookie", cookie);
  // A response carrying a personal cookie must never be cached for others.
  if (!response.headers.has("Cache-Control")) response.headers.set("Cache-Control", "private");
}

const worker = {
  /**
   * Security headers (lib/server/security-headers.ts, #63): a per-request
   * nonce goes to vinext as a CSP request header (it then puts it on every
   * script it renders) and into the response's Report-Only policy. This
   * Worker also runs under `npm run dev` (the Cloudflare Vite plugin loads
   * wrangler.jsonc `main`), so e2e runs under the policy.
   */
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const refresh = refreshSession(request).catch(() => null);
    const nonce = newNonce();
    const rendered = await handler.fetch(nonceRequest(request, nonce), env, ctx);
    // Copy once: a fetch-handler response's headers may be immutable.
    const response = new Response(rendered.body, rendered);
    await withSessionRefresh(refresh, response);
    applySecurityHeaders(response.headers, nonce, import.meta.env.DEV);
    return response;
  },

  /**
   * Daily Cron Trigger (wrangler.jsonc `triggers.crons`): data retention.
   * Awaited rather than passed to ctx.waitUntil(), so a failed run rejects the
   * handler and shows up as a failed cron invocation.
   */
  async scheduled(controller: ScheduledController) {
    const deleted = await runRetention(controller.scheduledTime);
    console.log("retention", JSON.stringify(deleted));
  },
};

export default worker;
