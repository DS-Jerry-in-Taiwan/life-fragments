import { attemptMetrics } from "../../../../lib/server/db/attempts";
import { listFeedback } from "../../../../lib/server/db/feedback";
import { AGE, db } from "../../../../lib/server/db/index";
import { listAllStories } from "../../../../lib/server/db/stories";
import { guardRead, withAdmin } from "../../../../lib/server/handler";
import { reply } from "../../../../lib/server/http";

// Cloudflare Access protects /api/admin and everything under it in
// production; withAdmin() re-checks the Access token and ADMIN_EMAILS.

/**
 * Review queue: stories still visible under the retention rules
 * (lib/server/db/stories.ts), and the last 30 days of feedback and writing
 * metrics (older feedback and attempts are deleted by the retention job).
 */
export async function GET(req: Request) {
  return guardRead(() =>
    withAdmin(req, async () => {
      const cutoff = Date.now() - AGE;
      const [stories, feedback, metrics] = await db().batch([
        listAllStories(cutoff),
        listFeedback(cutoff),
        attemptMetrics(cutoff),
      ]);
      return reply({
        stories: stories.results,
        feedback: feedback.results,
        metrics: metrics.results,
      });
    }),
  );
}
