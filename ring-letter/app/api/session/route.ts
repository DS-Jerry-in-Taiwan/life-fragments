import { guardWrite } from "../../../lib/server/handler";
import { reply } from "../../../lib/server/http";
import { createSession, currentSession } from "../../../lib/server/session";

/** Reuses a live session; otherwise issues a new one. (Expired rows are deleted by the daily retention job, lib/server/retention.ts.) */
export async function POST(req: Request) {
  return guardWrite(req, async () => {
    if (await currentSession(req)) return reply({ ok: true });
    return reply({ ok: true }, 200, { "Set-Cookie": await createSession(req) });
  });
}
