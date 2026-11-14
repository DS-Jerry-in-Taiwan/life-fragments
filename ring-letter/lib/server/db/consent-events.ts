import { db, DAY } from "./index";

// Append-only consent history (#4 §6.1). Rows share the story's lifetime:
// every delete of a story removes them in the same batch
// (lib/server/db/stories.ts deleteStoryRows()); the sharing changes that write
// 'share' / 'unshare' rows are in stories.ts changeSharing().

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
 * Sharing changes (share + unshare events) on the owner's stories in the day
 * before `now`, for the daily limit. Events go with their story, so a
 * withdrawn story's changes no longer count; each story is still capped at
 * MAX_SHARE_REQUESTS share events, and submissions at 5 a day.
 */
export async function countSharingChangesInLastDay(owner: string, now: number) {
  const row = await db()
    .prepare(
      `SELECT COUNT(*) AS n FROM consent_events e JOIN stories s ON s.id=e.story
       WHERE s.owner=? AND e.action IN ('share','unshare') AND e.created>?`,
    )
    .bind(owner, now - DAY)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
