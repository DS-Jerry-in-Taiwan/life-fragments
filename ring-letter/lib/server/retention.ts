import { AGE, db } from "./db/index";

// Data retention (#4 §6), run once a day by the Cron Trigger in
// wrangler.jsonc (worker/index.ts `scheduled`). Nothing else deletes expired
// rows: reads only hide them (lib/server/db/stories.ts LIVE).
//
// - stories that are not approved (private, pending, rejected, any other
//   status): 30 days after their last status change (status_at), together
//   with their feedback and consent_events;
// - approved stories: never; only withdrawal, erase-all or admin delete
//   remove them;
// - feedback, writing_attempts: 30 days after `created`. The admin metrics
//   only ever cover the last 30 days, so nothing visible is lost;
// - sessions: 30 days after `created`, v1's rule, matching the 30-day cookie
//   and currentSession(). TODO(V3-c, #4 §6.2): one year after last_seen.

/** Non-approved story past its 30-day window; takes the cutoff as its parameter. */
const EXPIRED_STORY = "status<>'approved' AND COALESCE(status_at,created)<?";

export type RetentionResult = {
  stories: number;
  feedback: number;
  consentEvents: number;
  writingAttempts: number;
  sessions: number;
};

/** Deletes everything past retention as of `now` (ms), in one D1 batch. */
export async function runRetention(now: number): Promise<RetentionResult> {
  const cutoff = now - AGE;
  const d = db();
  const [storyFeedback, stories, consentEvents, feedback, writingAttempts, sessions] =
    await d.batch([
      // Feedback first: the subquery needs the stories that are about to go.
      d
        .prepare(
          `DELETE FROM feedback WHERE story IN (SELECT id FROM stories WHERE ${EXPIRED_STORY})`,
        )
        .bind(cutoff),
      d.prepare(`DELETE FROM stories WHERE ${EXPIRED_STORY}`).bind(cutoff),
      // Every event whose story is gone: this run's deletions plus anything
      // a past delete path missed.
      d.prepare("DELETE FROM consent_events WHERE story NOT IN (SELECT id FROM stories)"),
      d.prepare("DELETE FROM feedback WHERE created<?").bind(cutoff),
      d.prepare("DELETE FROM writing_attempts WHERE created<?").bind(cutoff),
      d.prepare("DELETE FROM sessions WHERE created<?").bind(cutoff),
    ]);
  return {
    stories: stories.meta.changes,
    feedback: storyFeedback.meta.changes + feedback.meta.changes,
    consentEvents: consentEvents.meta.changes,
    writingAttempts: writingAttempts.meta.changes,
    sessions: sessions.meta.changes,
  };
}
