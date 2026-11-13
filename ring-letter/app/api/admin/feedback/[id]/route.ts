import { logFeedbackDelete } from "../../../../../lib/server/db/admin-events";
import { deleteFeedback } from "../../../../../lib/server/db/feedback";
import { db } from "../../../../../lib/server/db/index";
import {
  ADMIN_SAVE_FAILED,
  guardWrite,
  type IdContext,
  withAdmin,
} from "../../../../../lib/server/handler";
import { reply } from "../../../../../lib/server/http";

// Cloudflare Access protects /api/admin and everything under it in
// production; withAdmin() re-checks the Access token and ADMIN_EMAILS.

/** Deletes one feedback row (spam), logged in admin_events; 404 when there is none. */
export async function DELETE(req: Request, { params }: IdContext) {
  return guardWrite(
    req,
    () =>
      withAdmin(req, async (email) => {
        const { id } = await params;
        const [, deleted] = await db().batch([
          logFeedbackDelete(email, id, Date.now()),
          deleteFeedback(id),
        ]);
        if (!deleted.meta.changes) return reply({ error: "找不到這筆回饋，可能已經刪除。" }, 404);
        return reply({ ok: true });
      }),
    ADMIN_SAVE_FAILED,
  );
}
