import handler from "vinext/server/fetch-handler";
import { runRetention } from "../lib/server/retention";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    return handler.fetch(request, env, ctx);
  },

  /** Daily Cron Trigger (wrangler.jsonc `triggers.crons`): data retention. */
  scheduled(controller: ScheduledController, _env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runRetention(controller.scheduledTime).then((deleted) =>
        console.log("retention", JSON.stringify(deleted)),
      ),
    );
  },
};

export default worker;
