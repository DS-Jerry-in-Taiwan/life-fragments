import { ADMIN_EVENT_AGE, ADMIN_EVENT_INSERT, AGE, db } from "./index";
import { LIVE } from "./stories";

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

// The story operations (approve, reject, delete_story) are logged by the
// lifecycle functions in lib/server/db/stories.ts, next to the changes whose
// conditions they repeat.

/** Logs a feedback delete, if the row exists; batch it right before deleteFeedback(). */
export function logFeedbackDelete(email: string, id: string, now: number) {
  return db()
    .prepare(
      `${ADMIN_EVENT_INSERT} SELECT ?1,'delete_feedback','feedback',?2,?3 WHERE EXISTS (SELECT 1 FROM feedback WHERE id=?2)`,
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
 * still within its 30 days, so the admin page can link to it or show
 * 「（已刪除）」.
 */
export function listAdminEvents(f: AdminEventFilter, now: number, limit: number) {
  const where: string[] = [];
  const args: (string | number)[] = [now, now];
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
           ELSE EXISTS (SELECT 1 FROM feedback WHERE id=admin_events.target_id AND created>(?-${AGE}))
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

/** Retention: rows created more than ADMIN_EVENT_AGE before `now`. */
export function deleteExpiredAdminEvents(now: number) {
  return db()
    .prepare("DELETE FROM admin_events WHERE created<?")
    .bind(now - ADMIN_EVENT_AGE);
}
