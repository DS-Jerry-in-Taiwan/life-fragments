import { db } from "./index";

// Append-only consent history (#4 §6.1). Rows share the story's lifetime:
// every statement that deletes stories is batched with the matching delete
// here (withdraw, erase-all, admin delete, retention).

export type ConsentAction = "submit" | "share" | "unshare";

export function insertConsentEvent(
  story: string,
  action: ConsentAction,
  consentVersion: string,
  created: number,
) {
  return db()
    .prepare("INSERT INTO consent_events(story,action,consent_version,created) VALUES(?,?,?,?)")
    .bind(story, action, consentVersion, created);
}

export function deleteConsentEventsForStory(story: string) {
  return db().prepare("DELETE FROM consent_events WHERE story=?").bind(story);
}

/** Events of every story the owner wrote; batch before deleting the stories. */
export function deleteConsentEventsByOwner(owner: string) {
  return db()
    .prepare("DELETE FROM consent_events WHERE story IN (SELECT id FROM stories WHERE owner=?)")
    .bind(owner);
}

/**
 * Each story may ask to be shared again at most this many times after
 * submission (#4 §6.1): counted as its 'share' events, whether it was
 * private, taken down or rejected before. Stop sharing and withdraw stay
 * available once it is used up.
 */
export const MAX_SHARE_REQUESTS = 3;

/**
 * A consent event for an author's sharing change, written only if the story
 * still belongs to `owner` and is in `fromStatus`. Batch it right before the
 * matching conditional update (lib/server/db/stories.ts setSharing(), same
 * `fromStatus`): a D1 batch is one transaction, so both statements see the
 * same state, and a request that loses a race (the story already left
 * `fromStatus`) writes neither the event nor the update.
 */
export function insertSharingEvent(
  story: string,
  owner: string,
  fromStatus: string,
  action: "share" | "unshare",
  consentVersion: string,
  created: number,
) {
  return db()
    .prepare(
      `INSERT INTO consent_events(story,action,consent_version,created)
       SELECT ?1,?2,?3,?4 WHERE EXISTS (SELECT 1 FROM stories WHERE id=?1 AND owner=?5 AND status=?6)`,
    )
    .bind(story, action, consentVersion, created, owner, fromStatus);
}

/**
 * Sharing changes (share + unshare events) on the owner's stories since
 * `since`, for the daily limit. Events go with their story, so a withdrawn
 * story's changes no longer count; each story is still capped at
 * MAX_SHARE_REQUESTS share events, and submissions at 5 a day.
 */
export async function countSharingChangesSince(owner: string, since: number) {
  const row = await db()
    .prepare(
      `SELECT COUNT(*) AS n FROM consent_events e JOIN stories s ON s.id=e.story
       WHERE s.owner=? AND e.action IN ('share','unshare') AND e.created>?`,
    )
    .bind(owner, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
