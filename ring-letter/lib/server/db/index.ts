import { env } from "cloudflare:workers";

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

export function db(): D1Database {
  if (!env.DB) throw new Error("儲存服務尚未就緒");
  return env.DB;
}
