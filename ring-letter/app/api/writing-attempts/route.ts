import { insertAttempt } from "../../../lib/server/db/attempts";
import { guardWrite, withBodyAndSession } from "../../../lib/server/handler";
import { reply } from "../../../lib/server/http";
import { overDailyLimit } from "../../../lib/server/rate-limit";
import { parseStart } from "../../../lib/server/validation";

/** Records that the author started writing (the client picks the attempt id). */
export async function POST(req: Request) {
  return guardWrite(req, () =>
    withBodyAndSession(req, async (b, who) => {
      const v = parseStart(b);
      if (!v.ok) return reply({ error: v.error }, 400);
      if (await overDailyLimit("attempts", who))
        return reply({ error: "今天已開始多次試寫，請明天再試。" }, 429);
      await insertAttempt(v.data.id, who, v.data.letterType, Date.now());
      return reply({ ok: true });
    }),
  );
}
