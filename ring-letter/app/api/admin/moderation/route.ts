import { logBatchDeletes, logBatchRejections } from "../../../../lib/server/db/admin-events";
import { deleteConsentEventsForStories } from "../../../../lib/server/db/consent-events";
import { deleteFeedbackForStories } from "../../../../lib/server/db/feedback";
import { db } from "../../../../lib/server/db/index";
import { deleteStories, rejectStories, storyRevisions } from "../../../../lib/server/db/stories";
import { ADMIN_SAVE_FAILED, guardWrite, withAdmin } from "../../../../lib/server/handler";
import { readJsonBody, reply } from "../../../../lib/server/http";
import { parseBatchModeration } from "../../../../lib/server/validation";

// Cloudflare Access protects /api/admin and everything under it in
// production; withAdmin() re-checks the Access token and ADMIN_EMAILS.

type ItemError = "conflict" | "not_allowed" | "missing";

/**
 * Batch rejection or delete (#4 §5.2), body `{status: "rejected" | "delete",
 * items: [{id, statusAt, consentEvents}]}` (1–50 items; approval is never
 * batched: 400). Each item gets the single-story rules
 * (POST /api/admin/stories/:id/moderation), not all-or-nothing:
 * - rejected: only a pending or approved story still at the listed statusAt
 *   and consent-event count is rejected;
 * - delete: any existing story is deleted with its feedback and consent
 *   events (statusAt and consentEvents are not checked, as for a single
 *   delete).
 * One D1 batch applies every item and logs each applied one in admin_events
 * (its condition repeats the change's). The changed ids come back from the
 * change itself (RETURNING); for the others a read afterwards tells why:
 * `{results: [{id, ok, error?: "conflict" | "not_allowed" | "missing"}]}`,
 * in request order.
 */
export async function POST(req: Request) {
  return guardWrite(
    req,
    () =>
      withAdmin(req, async (email) => {
        const parsed = await readJsonBody(req, 12000);
        if (!parsed.ok) return parsed.response;
        const v = parseBatchModeration(parsed.body);
        if (!v.ok) return reply({ error: v.error }, 400);
        const { status, items } = v.data;
        const json = JSON.stringify(items);
        const now = Date.now();
        const results =
          status === "delete"
            ? await db().batch([
                logBatchDeletes(email, json, now),
                deleteFeedbackForStories(json),
                deleteConsentEventsForStories(json),
                deleteStories(json),
              ])
            : await db().batch([logBatchRejections(email, json, now), rejectStories(json, now)]);
        const done = new Set((results.at(-1)!.results as { id: string }[]).map((r) => r.id));

        const failed = items.filter((i) => !done.has(i.id));
        const current = new Map(
          failed.length
            ? (await storyRevisions(JSON.stringify(failed))).results.map((s) => [s.id, s])
            : [],
        );
        return reply({
          results: items.map(({ id, statusAt, consentEvents }) => {
            if (done.has(id)) return { id, ok: true };
            const now = current.get(id);
            const error: ItemError = !now
              ? "missing"
              : now.statusAt !== statusAt || now.consentEvents !== consentEvents
                ? "conflict"
                : "not_allowed";
            return { id, ok: false, error };
          }),
        });
      }),
    ADMIN_SAVE_FAILED,
  );
}
