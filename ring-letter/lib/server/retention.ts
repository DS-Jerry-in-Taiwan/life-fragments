import { deleteExpiredAdminEvents } from "./db/admin-events";
import { deleteOrphanedConsentEvents } from "./db/consent-events";
import { AGE, db, SESSION_AGE } from "./db/index";
import { deleteStoryRows } from "./db/stories";

// Data retention (#4 §6), run once a day by the Cron Trigger in
// wrangler.jsonc (worker/index.ts `scheduled`). Nothing else deletes expired
// rows: reads only hide them (lib/server/db/stories.ts LIVE).
//
// - stories, keyed on their consent version (lib/server/db/stories.ts, the
//   same rule the reads use), together with their feedback and consent_events
//   (deleteStoryRows(), as every other delete):
//   - consent version in PERMANENT_CONSENT_VERSIONS (every submission since
//     V3-c): approved stories are never deleted automatically, any other
//     status 30 days after its last status change (status_at);
//   - any other version (the old "30 days" terms, submissions before V3-c):
//     every status, approved included, 30 days after `created`;
// - consent_events left behind by a deleted story: the sharing changes the
//   daily limit still counts (consent-events.ts keptForLimit(), less than a
//   day old) stay until the first run after that day; any other is deleted;
// - feedback, writing_attempts: 30 days after `created`. The admin metrics
//   only ever cover the last 30 days, so nothing visible is lost;
// - sessions: one year after their last visit (last_seen, or created for rows
//   without one), matching the sliding one-year cookie and currentSession()
//   (#4 §6.2). Their stories, feedback and attempts follow their own rules;
// - admin_events (the admin operation log, #4 §5.2): one year after `created`
//   (ADMIN_EVENT_AGE), whether or not their target still exists. Deleting a
//   story never deletes its log rows.
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
  adminEvents: number;
};

/** Deletes everything past retention as of `now` (ms), in one D1 batch. */
export async function runRetention(now: number): Promise<RetentionResult> {
  const cutoff = now - AGE;
  const d = db();
  const [
    storyFeedback,
    storyEvents,
    stories,
    consentEvents,
    backfilled,
    feedback,
    writingAttempts,
    sessions,
    adminEvents,
  ] = await d.batch([
    ...deleteStoryRows({ kind: "expired" }, now),
    deleteOrphanedConsentEvents(now),
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
    d.prepare("DELETE FROM sessions WHERE COALESCE(last_seen,created)<?").bind(now - SESSION_AGE),
    deleteExpiredAdminEvents(now),
  ]);
  return {
    stories: stories.meta.changes,
    feedback: storyFeedback.meta.changes + feedback.meta.changes,
    consentEvents: storyEvents.meta.changes + consentEvents.meta.changes,
    backfilledEvents: backfilled.meta.changes,
    writingAttempts: writingAttempts.meta.changes,
    sessions: sessions.meta.changes,
    adminEvents: adminEvents.meta.changes,
  };
}
