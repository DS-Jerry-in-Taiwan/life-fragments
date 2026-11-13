import { paginate, PAGE_SIZE } from "../../../../lib/server/cursor";
import { listAdminFeedback } from "../../../../lib/server/db/feedback";
import { AGE } from "../../../../lib/server/db/index";
import { guardRead, withAdmin } from "../../../../lib/server/handler";
import { reply } from "../../../../lib/server/http";
import { parseAdminFeedbackQuery } from "../../../../lib/server/validation";

// Cloudflare Access protects /api/admin and everything under it in
// production; withAdmin() re-checks the Access token and ADMIN_EMAILS.

/**
 * `{feedback, nextCursor}`: one page (50) of the last 30 days of feedback,
 * filtered by `kind` and `story`, problem reports first and then newest
 * first. Each row: id, story, kind, note, created, storyTitle (null for demo
 * stories and stories no longer live).
 */
export async function GET(req: Request) {
  return guardRead(() =>
    withAdmin(req, async () => {
      const v = parseAdminFeedbackQuery(new URL(req.url).searchParams);
      if (!v.ok) return reply({ error: v.error }, 400);
      const { results } = await listAdminFeedback(v.data, Date.now() - AGE, PAGE_SIZE + 1);
      const { page, nextCursor } = paginate(results, (f) => [
        f.kind === "report" ? 1 : 0,
        f.created,
        f.id,
      ]);
      return reply({ feedback: page, nextCursor });
    }),
  );
}
