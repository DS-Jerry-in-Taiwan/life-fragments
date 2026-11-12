import { deleteFeedbackForStory } from "../../../../../../lib/server/db/feedback";
import { db } from "../../../../../../lib/server/db/index";
import { deleteStory, moderateStory } from "../../../../../../lib/server/db/stories";
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

/** Body `{status: "approved" | "rejected" | "delete"}`. Private stories can't be approved. */
export async function POST(req: Request, { params }: IdContext) {
  return guardWrite(
    req,
    () =>
      withAdmin(req, async () => {
        const parsed = await readJsonBody(req, 4000);
        if (!parsed.ok) return parsed.response;
        const v = parseModeration((await params).id, parsed.body);
        if (!v.ok) return reply({ error: v.error }, 400);
        const { id, status } = v.data;
        if (status === "delete") {
          await db().batch([deleteStory(id), deleteFeedbackForStory(id)]);
        } else if (!(await moderateStory(id, status))) {
          return reply({ error: "文章不存在，或作者未同意分享" }, 400);
        }
        return reply({ ok: true });
      }),
    ADMIN_SAVE_FAILED,
  );
}
