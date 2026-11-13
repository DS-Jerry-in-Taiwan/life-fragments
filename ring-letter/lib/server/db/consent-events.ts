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
