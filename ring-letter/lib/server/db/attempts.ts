import { AGE, DAY, db } from "./index";

export type AttemptRow = { id: string; completed: number | null };

/** Attempts the owner started in the day before `now`, for the daily limit. */
export async function countAttemptsInLastDay(owner: string, now: number) {
  const row = await db()
    .prepare("SELECT COUNT(*) AS n FROM writing_attempts WHERE owner=? AND created>?")
    .bind(owner, now - DAY)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Idempotent: re-sending the same attempt id is a no-op. */
export async function insertAttempt(
  id: string,
  owner: string,
  letterType: string,
  created: number,
) {
  await db()
    .prepare("INSERT OR IGNORE INTO writing_attempts(id,owner,letter_type,created) VALUES(?,?,?,?)")
    .bind(id, owner, letterType, created)
    .run();
}

/** The owner's attempt of this letter type, if started within the last 30 days (AGE). */
export function findAttempt(id: string, owner: string, letterType: string, now: number) {
  return db()
    .prepare(
      "SELECT id,completed FROM writing_attempts WHERE id=? AND owner=? AND letter_type=? AND created>?",
    )
    .bind(id, owner, letterType, now - AGE)
    .first<AttemptRow>();
}

export function completeAttempt(id: string, owner: string, completed: number, shared: boolean) {
  return db()
    .prepare("UPDATE writing_attempts SET completed=?, shared=? WHERE id=? AND owner=?")
    .bind(completed, shared ? 1 : 0, id, owner);
}

export function deleteAttemptsByOwner(owner: string) {
  return db().prepare("DELETE FROM writing_attempts WHERE owner=?").bind(owner);
}

/** Starts / completions / shares per letter type over the last 30 days, for the admin dashboard. */
export function attemptMetrics(now: number) {
  return db()
    .prepare(
      "SELECT letter_type AS letterType, COUNT(*) AS starts, SUM(CASE WHEN completed IS NOT NULL THEN 1 ELSE 0 END) AS completions, SUM(shared) AS shares FROM writing_attempts WHERE created>? GROUP BY letter_type",
    )
    .bind(now - AGE);
}
