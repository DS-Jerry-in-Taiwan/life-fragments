import { deleteAttemptsByOwner } from "../../../lib/server/db/attempts";
import { db } from "../../../lib/server/db/index";
import { deleteSession } from "../../../lib/server/db/sessions";
import { deleteStoryRows } from "../../../lib/server/db/stories";
import { guardWrite, withSession } from "../../../lib/server/handler";
import { reply } from "../../../lib/server/http";
import { CLEAR_SESSION_COOKIE } from "../../../lib/server/session";

/** Deletes everything this session wrote, then the session itself. */
export async function DELETE(req: Request) {
  return guardWrite(req, () =>
    withSession(req, async (who) => {
      await db().batch([
        ...deleteStoryRows({ kind: "erase", owner: who }, Date.now()),
        deleteAttemptsByOwner(who),
        deleteSession(who),
      ]);
      return reply({ ok: true }, 200, { "Set-Cookie": CLEAR_SESSION_COOKIE });
    }),
  );
}
