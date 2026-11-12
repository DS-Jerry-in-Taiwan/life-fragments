import { db } from "./index";

/**
 * Consent wording version stored with every new story (and its consent_events
 * rows). Bump it whenever the consent text in components/write/ConsentFields.tsx
 * changes.
 */
export const CONSENT_VERSION = "v3-2026-11-12";

/**
 * Visibility rule shared by every story read (#4 §6): approved stories never
 * expire; any other status is shown for AGE after its last status change.
 * Takes one parameter, the cutoff (now - AGE).
 */
const LIVE = "(status='approved' OR COALESCE(status_at,created)>?)";

export type StoryInsert = {
  id: string;
  owner: string;
  title: string;
  body: string;
  era: string;
  source: string;
  status: "pending" | "private";
  consent: string;
  created: number;
  letterType: string;
  mood: string;
  reflection: string;
  attempt: string | null;
};

/** Approved stories, any age. */
export async function listApprovedStories() {
  const { results } = await db()
    .prepare(
      "SELECT id,title,body,era,source,created,letter_type AS letterType,mood,reflection FROM stories WHERE status='approved' ORDER BY created DESC LIMIT 100",
    )
    .all();
  return results;
}

/** The owner's stories still visible under the LIVE rule (`cutoff` = now - AGE). */
export async function listOwnStories(owner: string, cutoff: number) {
  const { results } = await db()
    .prepare(
      `SELECT id,title,body,era,source,status,created,letter_type AS letterType,mood,reflection FROM stories WHERE owner=? AND ${LIVE} ORDER BY created DESC`,
    )
    .bind(owner, cutoff)
    .all();
  return results;
}

/** Every story, any status, still visible under the LIVE rule, for the admin review queue. */
export function listAllStories(cutoff: number) {
  return db()
    .prepare(
      `SELECT id,title,body,era,source,status,created,letter_type AS letterType,mood,reflection FROM stories WHERE ${LIVE} ORDER BY created DESC LIMIT 200`,
    )
    .bind(cutoff);
}

export async function countStoriesSince(owner: string, since: number) {
  const row = await db()
    .prepare("SELECT COUNT(*) AS n FROM stories WHERE owner=? AND created>?")
    .bind(owner, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function ownsStory(id: string, owner: string) {
  const row = await db()
    .prepare("SELECT id FROM stories WHERE id=? AND owner=?")
    .bind(id, owner)
    .first();
  return Boolean(row);
}

/** Approved stories accept reader feedback, whatever their age. */
export async function isApprovedStory(id: string) {
  const row = await db()
    .prepare("SELECT id FROM stories WHERE id=? AND status='approved'")
    .bind(id)
    .first();
  return Boolean(row);
}

export function insertStory(s: StoryInsert) {
  return db()
    .prepare(
      "INSERT INTO stories(id,owner,title,body,era,source,status,consent,created,letter_type,mood,reflection,attempt,status_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      s.id,
      s.owner,
      s.title,
      s.body,
      s.era,
      s.source,
      s.status,
      s.consent,
      s.created,
      s.letterType,
      s.mood,
      s.reflection,
      s.attempt,
      s.created,
    );
}

export function deleteOwnStory(id: string, owner: string) {
  return db().prepare("DELETE FROM stories WHERE id=? AND owner=?").bind(id, owner);
}

export function deleteStoriesByOwner(owner: string) {
  return db().prepare("DELETE FROM stories WHERE owner=?").bind(owner);
}

export function deleteStory(id: string) {
  return db().prepare("DELETE FROM stories WHERE id=?").bind(id);
}

/**
 * Sets an admin decision. Private stories (no share consent) are never
 * matched, so they cannot be approved. Returns false when no story matched.
 *
 * A real change sets status_at (restarting the 30-day window of non-approved
 * stories) and approved_at (now when becoming approved, NULL when leaving
 * approved). Repeating the current decision changes neither timestamp.
 */
export async function moderateStory(id: string, status: "approved" | "rejected", now = Date.now()) {
  const r = await db()
    .prepare(
      `UPDATE stories SET
         status_at=CASE WHEN status=?1 THEN COALESCE(status_at,created) ELSE ?2 END,
         approved_at=CASE WHEN ?1<>'approved' THEN NULL WHEN status='approved' THEN approved_at ELSE ?2 END,
         status=?1
       WHERE id=?3 AND status IN ('pending','approved','rejected')`,
    )
    .bind(status, now, id)
    .run();
  return Boolean(r.meta.changes);
}
