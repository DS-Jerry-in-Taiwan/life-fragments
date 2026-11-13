import { db } from "./index";

/** SQL: when the session was last seen (rows from before last_seen existed fall back to created). */
const LAST_SEEN = "COALESCE(last_seen,created)";

/** Whether the session exists and was last seen after `since`. */
export async function sessionExists(hash: string, since: number) {
  const row = await db()
    .prepare(`SELECT hash FROM sessions WHERE hash=? AND ${LAST_SEEN}>?`)
    .bind(hash, since)
    .first();
  return Boolean(row);
}

/** The session's last visit (ms) if it exists and was last seen after `since`, else null. */
export async function sessionLastSeen(hash: string, since: number) {
  const row = await db()
    .prepare(`SELECT ${LAST_SEEN} AS lastSeen FROM sessions WHERE hash=? AND ${LAST_SEEN}>?`)
    .bind(hash, since)
    .first<{ lastSeen: number }>();
  return row ? row.lastSeen : null;
}

export async function touchSession(hash: string, now: number) {
  await db().prepare("UPDATE sessions SET last_seen=? WHERE hash=?").bind(now, hash).run();
}

export async function insertSession(hash: string, created: number) {
  await db()
    .prepare("INSERT INTO sessions(hash,created,last_seen) VALUES(?,?,?)")
    .bind(hash, created, created)
    .run();
}

export function deleteSession(hash: string) {
  return db().prepare("DELETE FROM sessions WHERE hash=?").bind(hash);
}
