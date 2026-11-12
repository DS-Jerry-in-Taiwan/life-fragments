import { db } from "./index";

/** Consent wording version stored with every new story. */
export const CONSENT_VERSION = "v2-2026-11-05";

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

export async function listApprovedStories(since: number) {
  const { results } = await db()
    .prepare(
      "SELECT id,title,body,era,source,created,letter_type AS letterType,mood,reflection FROM stories WHERE status='approved' AND created>? ORDER BY created DESC LIMIT 100",
    )
    .bind(since)
    .all();
  return results;
}

export async function listOwnStories(owner: string, since: number) {
  const { results } = await db()
    .prepare(
      "SELECT id,title,body,era,source,status,created,letter_type AS letterType,mood,reflection FROM stories WHERE owner=? AND created>? ORDER BY created DESC",
    )
    .bind(owner, since)
    .all();
  return results;
}

/** Every story, any status, for the admin review queue. */
export function listAllStories(since: number) {
  return db()
    .prepare(
      "SELECT id,title,body,era,source,status,created,letter_type AS letterType,mood,reflection FROM stories WHERE created>? ORDER BY created DESC LIMIT 200",
    )
    .bind(since);
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

export async function isApprovedStory(id: string, since: number) {
  const row = await db()
    .prepare("SELECT id FROM stories WHERE id=? AND status='approved' AND created>?")
    .bind(id, since)
    .first();
  return Boolean(row);
}

export function insertStory(s: StoryInsert) {
  return db()
    .prepare(
      "INSERT INTO stories(id,owner,title,body,era,source,status,consent,created,letter_type,mood,reflection,attempt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
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
 * matched, so they cannot be approved. Returns false when nothing changed.
 */
export async function moderateStory(id: string, status: "approved" | "rejected") {
  const r = await db()
    .prepare(
      "UPDATE stories SET status=? WHERE id=? AND status IN ('pending','approved','rejected')",
    )
    .bind(status, id)
    .run();
  return Boolean(r.meta.changes);
}
