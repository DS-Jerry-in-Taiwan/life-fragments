import { env } from "cloudflare:workers";

/**
 * Retention window: sessions, feedback, writing attempts and non-approved
 * stories (counted from their last status change) are hidden after this and
 * deleted by the daily retention job (lib/server/retention.ts). Approved
 * stories never expire.
 */
export const AGE = 30 * 24 * 60 * 60 * 1000;

/** Window for the per-session daily limits. */
export const DAY = 24 * 60 * 60 * 1000;

export function db(): D1Database {
  if (!env.DB) throw new Error("儲存服務尚未就緒");
  return env.DB;
}
