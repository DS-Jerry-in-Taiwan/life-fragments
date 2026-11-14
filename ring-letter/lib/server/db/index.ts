import { env } from "cloudflare:workers";

// Every function in lib/server/db takes the current time `now` (ms) and
// applies these windows itself; callers never compute cutoffs.

/** Window for the per-session daily limits. */
export const DAY = 24 * 60 * 60 * 1000;

/**
 * Retention window for feedback, writing attempts and stories (see
 * lib/server/db/stories.ts for when a story's window starts, and which never
 * expire): hidden after this and deleted by the daily retention job
 * (lib/server/retention.ts).
 */
export const AGE = 30 * DAY;

/**
 * Anonymous sessions stay valid this long after their last visit (#4 §6.2,
 * sliding: lib/server/session.ts refreshSession()), then the retention job
 * deletes them.
 */
export const SESSION_AGE = 365 * DAY;

/** Admin operation log rows (admin_events) are deleted this long after `created` (#4 §5.2). */
export const ADMIN_EVENT_AGE = 365 * DAY;

/**
 * SQL: the `id` of each object in the JSON array bound at `?1` (the items of
 * a batch admin request, lib/server/validation.ts parseBatchModeration()).
 */
export const ITEM_IDS = "(SELECT json_extract(value,'$.id') FROM json_each(?1))";

/** Column list of every admin_events insert (lib/server/db/admin-events.ts, stories.ts). */
export const ADMIN_EVENT_INSERT =
  "INSERT INTO admin_events(admin_email,action,target_type,target_id,created)";

export function db(): D1Database {
  if (!env.DB) throw new Error("儲存服務尚未就緒");
  return env.DB;
}
