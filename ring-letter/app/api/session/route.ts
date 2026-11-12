import { purgeExpired } from "../../../lib/server/db/index";
import { guardWrite } from "../../../lib/server/handler";
import { reply } from "../../../lib/server/http";
import { createSession, currentSession } from "../../../lib/server/session";

/** Reuses a live session; otherwise purges expired rows and issues a new one. */
export async function POST(req: Request) {
  return guardWrite(req, async () => {
    if (await currentSession(req)) return reply({ ok: true });
    await purgeExpired();
    return reply({ ok: true }, 200, { "Set-Cookie": await createSession(req) });
  });
}
