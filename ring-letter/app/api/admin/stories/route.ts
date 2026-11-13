import { paginate, PAGE_SIZE } from "../../../../lib/server/cursor";
import { listAdminStories } from "../../../../lib/server/db/stories";
import { guardRead, withAdmin } from "../../../../lib/server/handler";
import { reply } from "../../../../lib/server/http";
import { parseAdminStoryQuery } from "../../../../lib/server/validation";

// Cloudflare Access protects /api/admin and everything under it in
// production; withAdmin() re-checks the Access token and ADMIN_EMAILS.

/**
 * `{stories, nextCursor}`: one page (50) of live stories matching the query
 * (lib/server/validation.ts parseAdminStoryQuery(); 400 when invalid), newest
 * first; nextCursor is null on the last page. Expired stories the retention
 * job has not deleted yet never appear.
 */
export async function GET(req: Request) {
  return guardRead(() =>
    withAdmin(req, async () => {
      const v = parseAdminStoryQuery(new URL(req.url).searchParams);
      if (!v.ok) return reply({ error: v.error }, 400);
      const { results } = await listAdminStories(v.data, Date.now(), PAGE_SIZE + 1);
      const { page, nextCursor } = paginate(results, (s) => [s.created, s.id]);
      return reply({ stories: page, nextCursor });
    }),
  );
}
