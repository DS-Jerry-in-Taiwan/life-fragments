import { deleteSession } from "../../../lib/server/db/sessions";
import { guardWrite } from "../../../lib/server/handler";
import { reply } from "../../../lib/server/http";
import {
  CLEAR_SESSION_COOKIE,
  cookieSession,
  createSession,
  currentSession,
} from "../../../lib/server/session";

/**
 * Reuses a live session; otherwise issues a new one. (A live session's cookie
 * is re-issued by worker/index.ts; expired rows are deleted by the daily
 * retention job, lib/server/retention.ts.)
 */
export async function POST(req: Request) {
  return guardWrite(req, async () => {
    if (await currentSession(req)) return reply({ ok: true });
    return reply({ ok: true }, 200, { "Set-Cookie": await createSession(req) });
  });
}

/**
 * 在這台裝置登出 (#4 §6.2): deletes the session row and clears the cookie. The
 * session's stories, feedback and writing attempts stay (and expire under the
 * retention rules), but no browser can reach them as their owner any more.
 * Without a session cookie, or with an expired one, it still clears the
 * cookie and succeeds: the browser ends up logged out either way.
 */
export async function DELETE(req: Request) {
  return guardWrite(req, async () => {
    const hash = await cookieSession(req);
    if (hash) await deleteSession(hash).run();
    return reply({ ok: true }, 200, { "Set-Cookie": CLEAR_SESSION_COOKIE });
  });
}
