import handler from "vinext/server/fetch-handler";
import { runRetention } from "../lib/server/retention";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    return handler.fetch(request, env, ctx);
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
