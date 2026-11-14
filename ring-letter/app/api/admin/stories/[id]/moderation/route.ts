import { adminDeleteStory, decideStory } from "../../../../../../lib/server/db/stories";
import {
  ADMIN_SAVE_FAILED,
  guardWrite,
  type IdContext,
  MAX_MODERATION_BODY,
  withAdmin,
} from "../../../../../../lib/server/handler";
import { readJsonBody, reply } from "../../../../../../lib/server/http";
import { parseModeration } from "../../../../../../lib/server/validation";

// Cloudflare Access protects /api/admin and everything under it in
// production; withAdmin() re-checks the Access token and ADMIN_EMAILS.

/**
 * Body `{status: "approved" | "rejected" | "delete", statusAt?: number,
 * consentEvents?: number}`. Private stories can't be approved (400). With
 * `statusAt` / `consentEvents` (the values the admin story list showed), an
 * approval or rejection of a story that changed since is refused with 409;
 * delete ignores them. A story past its retention window (expired, not yet
 * deleted by the daily job) is treated as missing: 400, never 409.
 *
 * Every applied operation is logged in admin_events with the verified admin
 * email, in the same batch (lib/server/db/stories.ts): an approval or
 * rejection that changes the status, or the delete of an existing story.
 * Repeating the current decision, and deleting a missing story, still answer
 * `{ok: true}` but log nothing.
 */
export async function POST(req: Request, { params }: IdContext) {
  return guardWrite(
    req,
    () =>
      withAdmin(req, async (email) => {
        const parsed = await readJsonBody(req, MAX_MODERATION_BODY);
        if (!parsed.ok) return parsed.response;
        const v = parseModeration((await params).id, parsed.body);
        if (!v.ok) return reply({ error: v.error }, 400);
        const { id, status, statusAt, consentEvents } = v.data;
        const now = Date.now();
        if (status === "delete") {
          await adminDeleteStory(email, id, now);
          return reply({ ok: true });
        }
        const decided = await decideStory(email, id, status, now, { statusAt, consentEvents });
        if (decided === "stale")
          return reply({ error: "這篇的狀態剛剛改變了，請重新整理後再審閱。" }, 409);
        if (decided === "refused") return reply({ error: "文章不存在，或作者未同意分享" }, 400);
        return reply({ ok: true });
      }),
    ADMIN_SAVE_FAILED,
  );
}
