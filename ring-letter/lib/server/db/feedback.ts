import { AGE, DAY, db } from "./index";
import { LIVE } from "./stories";

export type FeedbackInsert = {
  id: string;
  owner: string;
  story: string;
  kind: string;
  note: string;
  created: number;
};

/** Feedback the owner wrote in the day before `now`, for the daily limit. */
export async function countFeedbackInLastDay(owner: string, now: number) {
  const row = await db()
    .prepare("SELECT COUNT(*) AS n FROM feedback WHERE owner=? AND created>?")
    .bind(owner, now - DAY)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function insertFeedback(f: FeedbackInsert) {
  await db()
    .prepare("INSERT INTO feedback(id,owner,story,kind,note,created) VALUES(?,?,?,?,?,?)")
    .bind(f.id, f.owner, f.story, f.kind, f.note, f.created)
    .run();
}

/** One feedback row (admin delete); batch it right after logFeedbackDelete(). Feedback on a
 * deleted story goes with it (lib/server/db/stories.ts deleteStoryRows()). */
export function deleteFeedback(id: string) {
  return db().prepare("DELETE FROM feedback WHERE id=?").bind(id);
}

/** GET /api/admin/feedback filters (lib/server/validation.ts parseAdminFeedbackQuery()). */
export type AdminFeedbackFilter = {
  kind?: string;
  story?: string;
  /** The last listed row: [1 for a problem report else 0, created, id]. */
  cursor?: [0 | 1, number, string];
};

/**
 * One page of feedback from the last 30 days (AGE before `now`), problem
 * reports first, then newest first (created, then id, descending), at most
 * `limit` rows. Each row carries its story's title (storyTitle), NULL when
 * the story is no longer live (withdrawn, deleted or expired, or one of the
 * removed /archive demo stories, ids "demo-…").
 */
export function listAdminFeedback(f: AdminFeedbackFilter, now: number, limit: number) {
  const where = [`f.created>(?-${AGE})`];
  const args: (string | number)[] = [now, now];
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
