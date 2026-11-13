import { deleteConsentEventsForStory } from "../../../../../../lib/server/db/consent-events";
import { deleteFeedbackForStory } from "../../../../../../lib/server/db/feedback";
import { db } from "../../../../../../lib/server/db/index";
import { deleteStory, moderateStory, storyRevision } from "../../../../../../lib/server/db/stories";
import {
  ADMIN_SAVE_FAILED,
  guardWrite,
  type IdContext,
  withAdmin,
} from "../../../../../../lib/server/handler";
import { readJsonBody, reply } from "../../../../../../lib/server/http";
import { parseModeration } from "../../../../../../lib/server/validation";

// Cloudflare Access protects /api/admin and everything under it in
// production; withAdmin() re-checks the Access token and ADMIN_EMAILS.

/**
 * Body `{status: "approved" | "rejected" | "delete", statusAt?: number,
 * consentEvents?: number}`. Private stories can't be approved (400). With
 * `statusAt` / `consentEvents` (the values the admin queue listed), an
 * approval or rejection of a story that changed since is refused with 409;
 * delete ignores them.
 */
export async function POST(req: Request, { params }: IdContext) {
  return guardWrite(
    req,
    () =>
      withAdmin(req, async () => {
        const parsed = await readJsonBody(req, 4000);
        if (!parsed.ok) return parsed.response;
        const v = parseModeration((await params).id, parsed.body);
        if (!v.ok) return reply({ error: v.error }, 400);
        const { id, status, statusAt, consentEvents } = v.data;
        if (status === "delete") {
          await db().batch([
            deleteFeedbackForStory(id),
            deleteConsentEventsForStory(id),
            deleteStory(id),
          ]);
        } else if (!(await moderateStory(id, status, Date.now(), { statusAt, consentEvents }))) {
          const current = await storyRevision(id);
          const changed =
            current &&
            ((statusAt !== undefined && current.statusAt !== statusAt) ||
              (consentEvents !== undefined && current.consentEvents !== consentEvents));
          if (changed) return reply({ error: "這篇的狀態剛剛改變了，請重新整理後再審閱。" }, 409);
          return reply({ error: "文章不存在，或作者未同意分享" }, 400);
        }
        return reply({ ok: true });
      }),
    ADMIN_SAVE_FAILED,
  );
}
