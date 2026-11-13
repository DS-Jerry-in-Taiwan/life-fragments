import { db, ITEM_IDS } from "./index";
import { BATCH_REJECTABLE, LIVE, MODERATABLE } from "./stories";

// Admin operation log (#4 §5.2). One row per admin operation that changed
// something: who (the email verifyAdmin() returned, never a request value),
// what (action + the target's opaque id) and when. Never content, titles or
// sessions. Each insert is batched right before the change it records and
// repeats that change's condition, so a row exists exactly when the change
// was made (a D1 batch is one transaction). Rows outlive their target — a
// deleted story keeps its log, which then points at nothing — and the
// retention job deletes them after a year (ADMIN_EVENT_AGE). Author withdraw
// and erase-all are not admin operations and are not logged.

export type AdminAction = "approve" | "reject" | "delete_story" | "delete_feedback";

const INSERT = "INSERT INTO admin_events(admin_email,action,target_type,target_id,created)";

/**
 * Logs a single-story decision; batch it right before moderateStory() with the
 * same arguments. Written only when the decision applies (MODERATABLE) and
 * changes the status: repeating the current decision changes nothing and is
 * not logged.
 */
export function logStoryDecision(
  email: string,
  id: string,
  status: "approved" | "rejected",
  now: number,
  expected: { statusAt?: number; consentEvents?: number } = {},
) {
  return db()
    .prepare(
      `${INSERT} SELECT ?6,CASE ?1 WHEN 'approved' THEN 'approve' ELSE 'reject' END,'story',?3,?2
       WHERE EXISTS (SELECT 1 FROM stories WHERE ${MODERATABLE} AND status<>?1)`,
    )
    .bind(status, now, id, expected.statusAt ?? null, expected.consentEvents ?? null, email);
}

/** Logs a single-story delete, if the story exists; batch it before the deletes. */
export function logStoryDelete(email: string, id: string, now: number) {
  return db()
    .prepare(
      `${INSERT} SELECT ?1,'delete_story','story',?2,?3 WHERE EXISTS (SELECT 1 FROM stories WHERE id=?2)`,
    )
    .bind(email, id, now);
}

/** Logs each story a batch rejection changes; batch it right before rejectStories() with the same items. */
export function logBatchRejections(email: string, items: string, now: number) {
  return db()
    .prepare(`${INSERT} SELECT ?3,'reject','story',id,?2 FROM stories WHERE ${BATCH_REJECTABLE}`)
    .bind(items, now, email);
}

/** Logs each existing story among the batch items; batch it before the deletes. */
export function logBatchDeletes(email: string, items: string, now: number) {
  return db()
    .prepare(
      `${INSERT} SELECT ?2,'delete_story','story',id,?3 FROM stories WHERE id IN ${ITEM_IDS}`,
    )
    .bind(items, email, now);
}

/** Logs a feedback delete, if the row exists; batch it right before deleteFeedback(). */
export function logFeedbackDelete(email: string, id: string, now: number) {
  return db()
    .prepare(
      `${INSERT} SELECT ?1,'delete_feedback','feedback',?2,?3 WHERE EXISTS (SELECT 1 FROM feedback WHERE id=?2)`,
    )
    .bind(email, id, now);
}

/** GET /api/admin/events filters (lib/server/validation.ts parseAdminEventQuery()). */
export type AdminEventFilter = {
  admin?: string;
  /** The last listed row: [created, id]. */
  cursor?: [number, number];
};

/**
 * One page of the log, newest first (created, then id, descending), at most
 * `limit` rows. targetExists: the target is still a live story, or feedback
 * still within its 30 days (`cutoff` = now - AGE), so the admin page can
 * link to it or show「（已刪除）」.
 */
export function listAdminEvents(f: AdminEventFilter, cutoff: number, limit: number) {
  const where: string[] = [];
  const args: (string | number)[] = [cutoff, cutoff];
  const add = (condition: string, ...values: (string | number)[]) => {
    where.push(condition);
    args.push(...values);
  };
  if (f.admin) add("admin_email=?", f.admin);
  if (f.cursor) {
    const [created, id] = f.cursor;
    add("(created<? OR (created=? AND id<?))", created, created, id);
  }
  return db()
    .prepare(
      `SELECT id,admin_email AS adminEmail,action,target_type AS targetType,target_id AS targetId,created,
         CASE target_type
           WHEN 'story' THEN EXISTS (SELECT 1 FROM stories WHERE id=admin_events.target_id AND ${LIVE})
           ELSE EXISTS (SELECT 1 FROM feedback WHERE id=admin_events.target_id AND created>?)
         END AS targetExists
       FROM admin_events ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY created DESC,id DESC LIMIT ?`,
    )
    .bind(...args, limit)
    .all<{ id: number; created: number; targetExists: number }>();
}

/** Every admin email in the log, for the admin filter. */
export function listEventAdmins() {
  return db()
    .prepare("SELECT DISTINCT admin_email AS email FROM admin_events ORDER BY admin_email")
    .all<{ email: string }>();
}

/** Retention: rows created before `before` (now - ADMIN_EVENT_AGE). */
export function deleteAdminEventsBefore(before: number) {
  return db().prepare("DELETE FROM admin_events WHERE created<?").bind(before);
}
