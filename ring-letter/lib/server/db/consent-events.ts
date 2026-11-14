import { DAY, db } from "./index";

// Append-only consent history (#4 §6.1). Rows share the story's lifetime:
// every delete of a story removes them in the same batch
// (lib/server/db/stories.ts deleteStoryRows()), except the sharing changes the
// daily limit still counts (keptForLimit()). The sharing changes that write
// 'share' / 'unshare' rows are stories.ts changeSharing().
//
// `owner` (migration 0006) is the session hash that made a 'share' /
// 'unshare' change; 'submit' rows and rows written before V5-r have none.

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

/**
 * SQL: the row is a sharing change the daily limit still counts at the time
 * bound at `now` (it has an owner and is less than a day old). Deleting a
 * story (withdraw, admin delete, retention) keeps such rows, so the limit
 * survives the story; the retention job deletes them once they are older
 * (at most a day plus one daily run later), and erase-all deletes them at
 * once with the session.
 */
export function keptForLimit(now: string) {
  return `(owner IS NOT NULL AND created>(${now}-${DAY}))`;
}

/**
 * Sharing changes (share + unshare events) the owner made in the day before
 * `now`, for the daily limit: counted by the session that made them, so a
 * withdrawn or deleted story's changes still count. Rows without an owner
 * (written before migration 0006, e.g. by the old Worker during a deploy)
 * count through their story, as before.
 */
export async function countSharingChangesInLastDay(owner: string, now: number) {
  const row = await db()
    .prepare(
      `SELECT COUNT(*) AS n FROM consent_events
       WHERE action IN ('share','unshare') AND created>?2
         AND (owner=?1 OR (owner IS NULL AND story IN (SELECT id FROM stories WHERE owner=?1)))`,
    )
    .bind(owner, now - DAY)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Retention: every event whose story is gone (anything a past delete path
 * missed), except the sharing changes still counted by the daily limit.
 */
export function deleteOrphanedConsentEvents(now: number) {
  return db()
    .prepare(
      `DELETE FROM consent_events WHERE story NOT IN (SELECT id FROM stories) AND NOT ${keptForLimit("?1")}`,
    )
    .bind(now);
}
