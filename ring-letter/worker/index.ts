import handler from "vinext/server/fetch-handler";
import { runRetention } from "../lib/server/retention";
import { refreshSession } from "../lib/server/session";

/**
 * Sliding sessions (#4 §6.2): every response to a request with a live session
 * cookie (pages and API alike) re-issues the cookie for another year, unless
 * the route set or cleared it itself (POST /api/session, DELETE /api/session,
 * DELETE /api/me). Done here rather than in the routes so that a visit that
 * only reads pages still counts. A failure only skips the refresh.
 */
async function withSessionRefresh(request: Request, response: Response) {
  if (response.headers.getSetCookie().some((c) => c.startsWith("rl_session="))) return response;
  let cookie: string | null;
  try {
    cookie = await refreshSession(request);
  } catch {
    return response;
  }
  if (!cookie) return response;
  const refreshed = new Response(response.body, response);
  refreshed.headers.append("Set-Cookie", cookie);
  return refreshed;
}

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    return withSessionRefresh(request, await handler.fetch(request, env, ctx));
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
