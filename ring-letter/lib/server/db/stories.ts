import { db } from "./index";

/**
 * Consent wording version stored with every new story (and its consent_events
 * rows). Bump it whenever the consent text in components/write/ConsentFields.tsx
 * changes, and add the new version to PERMANENT_CONSENT_VERSIONS when its
 * wording still promises keeping approved stories until withdrawn.
 * v3-2026-11-12 (V3-c): approved public stories kept until withdrawn or
 * deleted by an admin, other statuses 30 days after their last status change.
 */
export const CONSENT_VERSION = "v3-2026-11-12";

/**
 * Consent versions whose wording allows keeping an approved story until it is
 * withdrawn or deleted by an admin (#4 §6). V3-c switched CONSENT_VERSION to
 * the first of them together with the sliding one-year sessions, 「在這台裝置
 * 登出」 and the contact address for admin-assisted deletion, so authors can
 * actually withdraw. Stories under any other version (v2-2026-11-05 and
 * earlier, legacy or empty) keep the terms they were submitted under: 30 days
 * from `created`, whatever their status. Existing consent strings are never
 * rewritten.
 */
export const PERMANENT_CONSENT_VERSIONS = ["v3-2026-11-12"] as const;

/** SQL: the story's consent version, the prefix of `consent` before ':' ('' without one). */
const VERSION = "substr(consent,1,instr(consent,':')-1)";
const PERMANENT = `${VERSION} IN (${PERMANENT_CONSENT_VERSIONS.map((v) => `'${v}'`).join(",")})`;

/**
 * SQL: when the story's retention window starts, or NULL if it never expires.
 * - permanent consent version, approved: NULL (never expires);
 * - permanent consent version, any other status: its last status change;
 * - any other consent version, any status: `created` (a later status change
 *   never extends it).
 */
const EXPIRES_FROM = `(CASE WHEN ${PERMANENT} THEN (CASE WHEN status='approved' THEN NULL ELSE COALESCE(status_at,created) END) ELSE created END)`;

/** SQL condition for every story read; takes one parameter, the cutoff (now - AGE). */
const LIVE = `COALESCE(${EXPIRES_FROM}>?,1)`;

/** SQL condition for the retention job; takes one parameter, the cutoff (now - AGE). */
export const EXPIRED_STORY = `${EXPIRES_FROM}<?`;

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

/** Approved stories still visible under the LIVE rule (`cutoff` = now - AGE). */
export async function listApprovedStories(cutoff: number) {
  const { results } = await db()
    .prepare(
      `SELECT id,title,body,era,source,created,letter_type AS letterType,mood,reflection FROM stories WHERE status='approved' AND ${LIVE} ORDER BY created DESC LIMIT 100`,
    )
    .bind(cutoff)
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

/**
 * Stories still visible under the LIVE rule, for the admin review queue,
 * newest first: every approved one (approved v3 stories never expire, and an
 * admin must always be able to find one to delete it on the author's
 * request), plus the 200 newest of any other status.
 */
export function listAllStories(cutoff: number) {
  const columns =
    "id,title,body,era,source,status,created,letter_type AS letterType,mood,reflection";
  return db()
    .prepare(
      `SELECT * FROM (SELECT ${columns} FROM stories WHERE status='approved' AND ${LIVE}
       UNION ALL
       SELECT * FROM (SELECT ${columns} FROM stories WHERE status<>'approved' AND ${LIVE} ORDER BY created DESC LIMIT 200))
       ORDER BY created DESC`,
    )
    .bind(cutoff, cutoff);
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

/** Approved stories accept reader feedback while visible under the LIVE rule. */
export async function isApprovedStory(id: string, cutoff: number) {
  const row = await db()
    .prepare(`SELECT id FROM stories WHERE id=? AND status='approved' AND ${LIVE}`)
    .bind(id, cutoff)
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
