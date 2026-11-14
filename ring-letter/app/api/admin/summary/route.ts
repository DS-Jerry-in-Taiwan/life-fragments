import { attemptMetrics } from "../../../../lib/server/db/attempts";
import { db } from "../../../../lib/server/db/index";
import {
  type AdminStoryStatus,
  countExpiringStories,
  countStoriesByStatus,
} from "../../../../lib/server/db/stories";
import { guardRead, withAdmin } from "../../../../lib/server/handler";
import { reply } from "../../../../lib/server/http";

// Cloudflare Access protects /api/admin and everything under it in
// production; withAdmin() re-checks the Access token and ADMIN_EMAILS.

/** The admin dashboard counts the "expiring soon" stories over this many days. */
const EXPIRING_DAYS = 7;

/**
 * `{counts: {pending, approved, rejected, private}, expiring, expiringDays,
 * metrics}`: live stories per status and those the retention job deletes
 * within `expiringDays` days (both under the same rules as every read,
 * lib/server/db/stories.ts), and the last 30 days of writing metrics.
 */
export async function GET(req: Request) {
  return guardRead(() =>
    withAdmin(req, async () => {
      const now = Date.now();
      const [byStatus, expiring, metrics] = await db().batch([
        countStoriesByStatus(now),
        countExpiringStories(now, EXPIRING_DAYS),
        attemptMetrics(now),
      ]);
      const counts: Record<AdminStoryStatus, number> = {
        pending: 0,
        approved: 0,
        rejected: 0,
        private: 0,
      };
      for (const row of byStatus.results as { status: string; n: number }[])
        if (row.status in counts) counts[row.status as AdminStoryStatus] = row.n;
      return reply({
        counts,
        expiring: (expiring.results[0] as { n: number }).n,
        expiringDays: EXPIRING_DAYS,
        metrics: metrics.results,
      });
    }),
  );
}
