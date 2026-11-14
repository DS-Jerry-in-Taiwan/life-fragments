import { MAX_SHARE_REQUESTS } from "../../consent";
import { db, ITEM_IDS } from "./index";

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

/** Events of the stories among the batch items `items` (admin batch delete). */
export function deleteConsentEventsForStories(items: string) {
  return db().prepare(`DELETE FROM consent_events WHERE story IN ${ITEM_IDS}`).bind(items);
}

/** Events of every story the owner wrote; batch before deleting the stories. */
export function deleteConsentEventsByOwner(owner: string) {
  return db()
    .prepare("DELETE FROM consent_events WHERE story IN (SELECT id FROM stories WHERE owner=?)")
    .bind(owner);
}

/**
 * What an author's sharing change read before writing: the story's status,
 * when that status was set, and how many consent events it had. Every
 * transition writes an event, so the event count changes even when a story
 * returns to the same status (A → B → A) within the same millisecond.
 */
export type SharingSnapshot = { status: string; statusAt: number; events: number };

/**
 * SQL: story `?1` owned by `?2` is still as read (`?3` status, `?4` status
 * time) and has `?5` + `written` consent events (`written` = 1 once this
 * request's own event has been inserted earlier in the same batch).
 */
export function unchangedSinceRead(written: 0 | 1) {
  return `EXISTS (SELECT 1 FROM stories WHERE id=?1 AND owner=?2 AND status=?3 AND COALESCE(status_at,created)=?4)
       AND (SELECT COUNT(*) FROM consent_events WHERE story=?1)=?5+${written}`;
}

/**
 * A consent event for an author's sharing change, written only if the story
 * is unchanged since `from` was read (status, status time and event count:
 * unchangedSinceRead) and, for a share request, it still has a
 * request left. Batch it right before the matching setSharing() with the same
 * snapshot: a D1 batch is one transaction, and the update requires this event
 * (event count + 1), so a stale or losing request — including one that read
 * an older request count — writes neither the event nor the update.
 */
export function insertSharingEvent(
  story: string,
  owner: string,
  from: SharingSnapshot,
  action: "share" | "unshare",
  consentVersion: string,
  created: number,
) {
  const underCap =
    action === "share"
      ? ` AND (SELECT COUNT(*) FROM consent_events WHERE story=?1 AND action='share')<${MAX_SHARE_REQUESTS}`
      : "";
  return db()
    .prepare(
      `INSERT INTO consent_events(story,action,consent_version,created)
       SELECT ?1,?6,?7,?8 WHERE ${unchangedSinceRead(0)}${underCap}`,
    )
    .bind(story, owner, from.status, from.statusAt, from.events, action, consentVersion, created);
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
