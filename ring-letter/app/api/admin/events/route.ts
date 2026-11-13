import { paginate, PAGE_SIZE } from "../../../../lib/server/cursor";
import { listAdminEvents, listEventAdmins } from "../../../../lib/server/db/admin-events";
import { AGE } from "../../../../lib/server/db/index";
import { guardRead, withAdmin } from "../../../../lib/server/handler";
import { reply } from "../../../../lib/server/http";
import { parseAdminEventQuery } from "../../../../lib/server/validation";

// Cloudflare Access protects /api/admin and everything under it in
// production; withAdmin() re-checks the Access token and ADMIN_EMAILS.

/**
 * `{events, admins, nextCursor}`: one page (50) of the admin operation log,
 * newest first, optionally for one `admin`. Each event: id, adminEmail,
 * action, targetType, targetId, created, targetExists (false once the story
 * or feedback is gone: 「（已刪除）」). `admins`: every email in the log.
 */
export async function GET(req: Request) {
  return guardRead(() =>
    withAdmin(req, async () => {
      const v = parseAdminEventQuery(new URL(req.url).searchParams);
      if (!v.ok) return reply({ error: v.error }, 400);
      const [{ results }, admins] = await Promise.all([
        listAdminEvents(v.data, Date.now() - AGE, PAGE_SIZE + 1),
        listEventAdmins(),
      ]);
      const { page, nextCursor } = paginate(results, (e) => [e.created, e.id]);
      return reply({
        events: page.map((e) => ({ ...e, targetExists: Boolean(e.targetExists) })),
        admins: admins.results.map((a) => a.email),
        nextCursor,
      });
    }),
  );
}
