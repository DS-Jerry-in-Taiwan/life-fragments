import { db, ITEM_IDS } from "./index";
import { LIVE } from "./stories";

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

/** Feedback on the stories among the batch items `items` (admin batch delete). */
export function deleteFeedbackForStories(items: string) {
  return db().prepare(`DELETE FROM feedback WHERE story IN ${ITEM_IDS}`).bind(items);
}

/** One feedback row (admin delete); batch it right after logFeedbackDelete(). */
export function deleteFeedback(id: string) {
  return db().prepare("DELETE FROM feedback WHERE id=?").bind(id);
}

/** Feedback the owner wrote, and feedback left on the owner's stories. */
export function deleteFeedbackByOrForOwner(owner: string) {
  return db()
    .prepare(
      "DELETE FROM feedback WHERE story IN (SELECT id FROM stories WHERE owner=?) OR owner=?",
    )
    .bind(owner, owner);
}

/** GET /api/admin/feedback filters (lib/server/validation.ts parseAdminFeedbackQuery()). */
export type AdminFeedbackFilter = {
  kind?: string;
  story?: string;
  /** The last listed row: [1 for a problem report else 0, created, id]. */
  cursor?: [0 | 1, number, string];
};

/**
 * One page of feedback from the last 30 days (`cutoff` = now - AGE), problem
 * reports first, then newest first (created, then id, descending), at most
 * `limit` rows. Each row carries its story's title (storyTitle), NULL when
 * the story is no longer live (withdrawn, deleted or expired, or one of the
 * removed /archive demo stories, ids "demo-…").
 */
export function listAdminFeedback(f: AdminFeedbackFilter, cutoff: number, limit: number) {
  const where = ["f.created>?"];
  const args: (string | number)[] = [cutoff, cutoff];
  const add = (condition: string, ...values: (string | number)[]) => {
    where.push(condition);
    args.push(...values);
  };
  if (f.kind) add("f.kind=?", f.kind);
  if (f.story) add("f.story=?", f.story);
  if (f.cursor) {
    const [report, created, id] = f.cursor;
    add(
      "((f.kind='report')<? OR ((f.kind='report')=? AND (f.created<? OR (f.created=? AND f.id<?))))",
      report,
      report,
      created,
      created,
      id,
    );
  }
  return db()
    .prepare(
      `SELECT f.id,f.story,f.kind,f.note,f.created,s.title AS storyTitle
       FROM feedback f LEFT JOIN (SELECT id,title FROM stories WHERE ${LIVE}) s ON s.id=f.story
       WHERE ${where.join(" AND ")}
       ORDER BY (f.kind='report') DESC,f.created DESC,f.id DESC LIMIT ?`,
    )
    .bind(...args, limit)
    .all<{ id: string; kind: string; created: number }>();
}
