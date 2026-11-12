import { env } from "cloudflare:workers";

/** Stories, feedback and sessions older than this are hidden and purged. */
export const AGE = 30 * 24 * 60 * 60 * 1000;

/** Window for the per-session daily limits. */
export const DAY = 24 * 60 * 60 * 1000;

export function db(): D1Database {
  if (!env.DB) throw new Error("儲存服務尚未就緒");
  return env.DB;
}

/**
 * Deletes every row older than AGE, approved public stories included (known
 * issue, see the v2 retention plan). Runs whenever a new session is created.
 */
export async function purgeExpired() {
  const cutoff = Date.now() - AGE;
  await db().batch(
    ["stories", "feedback", "sessions", "writing_attempts"].map((table) =>
      db().prepare(`DELETE FROM ${table} WHERE created<?`).bind(cutoff),
    ),
  );
}
