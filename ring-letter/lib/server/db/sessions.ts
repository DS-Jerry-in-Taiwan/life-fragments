import { db } from "./index";

export async function sessionExists(hash: string, since: number) {
  const row = await db()
    .prepare("SELECT hash FROM sessions WHERE hash=? AND created>?")
    .bind(hash, since)
    .first();
  return Boolean(row);
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
