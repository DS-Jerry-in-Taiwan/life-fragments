import { db } from "./index";

export type FeedbackInsert = {
  id: string;
  owner: string;
  story: string;
  kind: string;
  note: string;
  created: number;
};

export async function countFeedbackSince(owner: string, since: number) {
  const row = await db()
    .prepare("SELECT COUNT(*) AS n FROM feedback WHERE owner=? AND created>?")
    .bind(owner, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function insertFeedback(f: FeedbackInsert) {
  await db()
    .prepare("INSERT INTO feedback(id,owner,story,kind,note,created) VALUES(?,?,?,?,?,?)")
    .bind(f.id, f.owner, f.story, f.kind, f.note, f.created)
    .run();
}

export function deleteFeedbackForStory(story: string) {
  return db().prepare("DELETE FROM feedback WHERE story=?").bind(story);
}

/** Feedback the owner wrote, and feedback left on the owner's stories. */
export function deleteFeedbackByOrForOwner(owner: string) {
  return db()
    .prepare(
      "DELETE FROM feedback WHERE story IN (SELECT id FROM stories WHERE owner=?) OR owner=?",
    )
    .bind(owner, owner);
}

export function listFeedback(since: number) {
  return db()
    .prepare(
      "SELECT id,story,kind,note,created FROM feedback WHERE created>? ORDER BY created DESC LIMIT 300",
    )
    .bind(since);
}
