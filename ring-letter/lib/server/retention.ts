import { AGE, db } from "./db/index";
import { EXPIRED_STORY } from "./db/stories";

// Data retention (#4 §6), run once a day by the Cron Trigger in
// wrangler.jsonc (worker/index.ts `scheduled`). Nothing else deletes expired
// rows: reads only hide them (lib/server/db/stories.ts LIVE).
//
// - stories, keyed on their consent version (lib/server/db/stories.ts
//   EXPIRED_STORY, the same rule the reads use), together with their feedback
//   and consent_events:
//   - consent version in PERMANENT_CONSENT_VERSIONS (none yet; V3-c activates
//     it): approved stories are never deleted automatically, any other status
//     30 days after its last status change (status_at);
//   - any other version (the old "30 days" terms): every status, approved
//     included, 30 days after `created`;
// - feedback, writing_attempts: 30 days after `created`. The admin metrics
//   only ever cover the last 30 days, so nothing visible is lost;
// - sessions: 30 days after `created`, v1's rule, matching the 30-day cookie
//   and currentSession(). TODO(V3-c, #4 §6.2): one year after last_seen.
//
// It also gives every remaining story without a 'submit' consent event one,
// as the 0003 migration did for existing stories: during a deploy the
// migration is applied before the new Worker is live, and the old Worker
// inserts stories without events.

export type RetentionResult = {
  stories: number;
  feedback: number;
  consentEvents: number;
  backfilledEvents: number;
  writingAttempts: number;
  sessions: number;
};

/** Deletes everything past retention as of `now` (ms), in one D1 batch. */
export async function runRetention(now: number): Promise<RetentionResult> {
  const cutoff = now - AGE;
  const d = db();
  const [storyFeedback, stories, consentEvents, backfilled, feedback, writingAttempts, sessions] =
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
      // Same version rule as the 0003 backfill.
      d.prepare(
        `INSERT INTO consent_events (story, action, consent_version, created)
         SELECT id, 'submit',
           CASE WHEN instr(consent, ':') > 0 THEN substr(consent, 1, instr(consent, ':') - 1) ELSE consent END,
           created
         FROM stories s
         WHERE NOT EXISTS (SELECT 1 FROM consent_events e WHERE e.story = s.id AND e.action = 'submit')
         ORDER BY created, id`,
      ),
      d.prepare("DELETE FROM feedback WHERE created<?").bind(cutoff),
      d.prepare("DELETE FROM writing_attempts WHERE created<?").bind(cutoff),
      d.prepare("DELETE FROM sessions WHERE created<?").bind(cutoff),
    ]);
  return {
    stories: stories.meta.changes,
    feedback: storyFeedback.meta.changes + feedback.meta.changes,
    consentEvents: consentEvents.meta.changes,
    backfilledEvents: backfilled.meta.changes,
    writingAttempts: writingAttempts.meta.changes,
    sessions: sessions.meta.changes,
  };
}
