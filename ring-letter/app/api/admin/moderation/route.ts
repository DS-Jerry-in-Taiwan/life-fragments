import { moderateStories } from "../../../../lib/server/db/stories";
import {
  ADMIN_SAVE_FAILED,
  guardWrite,
  MAX_BATCH_MODERATION_BODY,
  withAdmin,
} from "../../../../lib/server/handler";
import { readJsonBody, reply } from "../../../../lib/server/http";
import { parseBatchModeration } from "../../../../lib/server/validation";

// Cloudflare Access protects /api/admin and everything under it in
// production; withAdmin() re-checks the Access token and ADMIN_EMAILS.

/**
 * Batch rejection or delete (#4 §5.2), body `{status: "rejected" | "delete",
 * items: [{id, statusAt, consentEvents}]}` (1–50 items; approval is never
 * batched: 400). Each item gets the single-story rules
 * (POST /api/admin/stories/:id/moderation), not all-or-nothing:
 * - rejected: only a live pending or approved story still at the listed
 *   statusAt and consent-event count is rejected (an expired story awaiting
 *   the retention job is `missing`);
 * - delete: any existing story is deleted with its feedback and consent
 *   events (statusAt and consentEvents are not checked, as for a single
 *   delete).
 * One D1 batch applies every item and logs each applied one in admin_events
 * (lib/server/db/stories.ts moderateStories()):
 * `{results: [{id, ok, error?: "conflict" | "not_allowed" | "missing"}]}`,
 * in request order.
 */
export async function POST(req: Request) {
  return guardWrite(
    req,
    () =>
      withAdmin(req, async (email) => {
        const parsed = await readJsonBody(req, MAX_BATCH_MODERATION_BODY);
        if (!parsed.ok) return parsed.response;
        const v = parseBatchModeration(parsed.body);
        if (!v.ok) return reply({ error: v.error }, 400);
        const { status, items } = v.data;
        return reply({ results: await moderateStories(email, status, items, Date.now()) });
      }),
    ADMIN_SAVE_FAILED,
  );
}
