import { MAX_SHARE_REQUESTS, type SharingSnapshot, unchangedSinceRead } from "./consent-events";
import { AGE, DAY, db, ITEM_IDS } from "./index";

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
export const LIVE = `COALESCE(${EXPIRES_FROM}>?,1)`;

/**
 * SQL: LIVE with `?2` as the current time (ms) instead of a cutoff parameter,
 * for the moderation conditions below, whose statements all bind now at ?2.
 */
const LIVE_AT_2 = `COALESCE(${EXPIRES_FROM}>(?2-${AGE}),1)`;

/** SQL condition for the retention job; takes one parameter, the cutoff (now - AGE). */
export const EXPIRED_STORY = `${EXPIRES_FROM}<?`;

/** SQL: when the retention job deletes the story (ms; the first daily run after it), or NULL if never. */
const EXPIRES_AT = `(${EXPIRES_FROM}+${AGE})`;

/** SQL: the story's 'share' consent events (requests to share again after submission). */
const SHARE_REQUESTS =
  "(SELECT COUNT(*) FROM consent_events e WHERE e.story=stories.id AND e.action='share')";

/** SQL: the story's consent events, all actions (the admin sends it back with a decision). */
const CONSENT_EVENTS = "(SELECT COUNT(*) FROM consent_events e WHERE e.story=stories.id)";

/** SQL: 'v3' for a consent version that keeps approved stories (PERMANENT), 'v2' for every other (30 days). */
const TERMS = `(CASE WHEN ${PERMANENT} THEN 'v3' ELSE 'v2' END)`;

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

/**
 * The owner's stories still visible under the LIVE rule (`cutoff` = now - AGE),
 * each with how many more times it may ask to be shared (#4 §6.1).
 */
export async function listOwnStories(owner: string, cutoff: number) {
  const { results } = await db()
    .prepare(
      `SELECT id,title,body,era,source,status,created,letter_type AS letterType,mood,reflection,MAX(0,${MAX_SHARE_REQUESTS}-${SHARE_REQUESTS}) AS shareRequestsLeft FROM stories WHERE owner=? AND ${LIVE} ORDER BY created DESC`,
    )
    .bind(owner, cutoff)
    .all();
  return results;
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

/** One of the owner's live stories, with what a sharing change needs; null if none. */
export function findOwnStoryForSharing(id: string, owner: string, cutoff: number) {
  return db()
    .prepare(
      `SELECT status,consent,${SHARE_REQUESTS} AS shareRequests,COALESCE(status_at,created) AS statusAt,(SELECT COUNT(*) FROM consent_events e WHERE e.story=stories.id) AS events FROM stories WHERE id=? AND owner=? AND ${LIVE}`,
    )
    .bind(id, owner, cutoff)
    .first<SharingSnapshot & { consent: string; shareRequests: number }>();
}

/**
 * The author's sharing change (#4 §6.1): snapshot → `to` with the new consent
 * string. Batch it right after insertSharingEvent() with the same snapshot:
 * it applies only if the story is unchanged since it was read AND that event
 * was just written (event count = snapshot + 1), so a stale or losing request
 * changes nothing. Sets status_at, and clears approved_at: a story that asks
 * to be shared again always goes back to human review, and one that stops
 * sharing leaves the public list at once. The body is never touched.
 */
export function setSharing(
  id: string,
  owner: string,
  from: SharingSnapshot,
  to: "pending" | "private",
  consent: string,
  now: number,
) {
  return db()
    .prepare(
      `UPDATE stories SET status=?6, consent=?7, status_at=?8, approved_at=NULL
       WHERE id=?1 AND ${unchangedSinceRead(1)}`,
    )
    .bind(id, owner, from.status, from.statusAt, from.events, to, consent, now);
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
 * SQL: story `?3` may take the admin decision `?1` ('approved' | 'rejected')
 * at time `?2`, is still live there (LIVE: an expired story awaiting the
 * retention job must not get a new window, or become permanent by approval)
 * and is unchanged since the admin read it: `?4` its statusAt, `?5` its
 * consent-event count (NULL: not checked). Private stories (no share consent)
 * never match, so they cannot be approved. Shared by moderateStory() and its
 * admin_events row (admin-events.ts logStoryDecision()).
 */
export const MODERATABLE = `id=?3 AND status IN ('pending','approved','rejected') AND ${LIVE_AT_2}
         AND (?4 IS NULL OR COALESCE(status_at,created)=?4)
         AND (?5 IS NULL OR (SELECT COUNT(*) FROM consent_events e WHERE e.story=?3)=?5)`;

/**
 * Sets an admin decision; `meta.changes` is 0 when no story matched
 * (MODERATABLE). Batch it right after logStoryDecision() with the same
 * arguments.
 *
 * A real change sets status_at (restarting the 30-day window of non-approved
 * stories) and approved_at (now when becoming approved, NULL when leaving
 * approved). Repeating the current decision changes neither timestamp.
 *
 * `expected` (optional): the statusAt and consentEvents the admin was shown.
 * When given, the decision only applies if the story has not changed since
 * (e.g. the author stopped sharing and asked again in between). The event
 * count catches changes within the same millisecond, which leave statusAt
 * as it was; see storyRevision().
 */
export function moderateStory(
  id: string,
  status: "approved" | "rejected",
  now: number,
  expected: { statusAt?: number; consentEvents?: number } = {},
) {
  return db()
    .prepare(
      `UPDATE stories SET
         status_at=CASE WHEN status=?1 THEN COALESCE(status_at,created) ELSE ?2 END,
         approved_at=CASE WHEN ?1<>'approved' THEN NULL WHEN status='approved' THEN approved_at ELSE ?2 END,
         status=?1
       WHERE ${MODERATABLE}`,
    )
    .bind(status, now, id, expected.statusAt ?? null, expected.consentEvents ?? null);
}

/**
 * A live story's statusAt and consentEvents (as listed in the admin queue),
 * or null if there is none (`cutoff` = now - AGE).
 */
export function storyRevision(id: string, cutoff: number) {
  return db()
    .prepare(
      `SELECT COALESCE(status_at,created) AS statusAt,(SELECT COUNT(*) FROM consent_events e WHERE e.story=stories.id) AS consentEvents FROM stories WHERE id=? AND ${LIVE}`,
    )
    .bind(id, cutoff)
    .first<{ statusAt: number; consentEvents: number }>();
}

// --- Admin lists and batch moderation (#4 §5.2) -------------------------------

export type AdminStoryStatus = "pending" | "approved" | "rejected" | "private";

/** GET /api/admin/stories filters (lib/server/validation.ts parseAdminStoryQuery()). */
export type AdminStoryFilter = {
  status: AdminStoryStatus | "all";
  /** Only stories that asked to be shared again after submission. */
  reshare: boolean;
  /** v3: a PERMANENT_CONSENT_VERSIONS version; v2: any other (old, legacy or empty). */
  consent?: "v2" | "v3";
  /** Deleted by retention within this many days. */
  expiring?: number;
  /** Title or body contains this text (taken literally, ASCII case-insensitive). */
  q?: string;
  /** Submitted at or after this time (ms). */
  from?: number;
  /** Submitted before this time (ms). */
  to?: number;
  id?: string;
  /** The last listed row: [created, id]. */
  cursor?: [number, string];
};

/**
 * One page of stories still visible under the LIVE rule, matching `f`,
 * newest first (created, then id, descending), at most `limit` rows. Each row
 * has what the admin card shows and sends back (statusAt, shareRequests,
 * consentEvents), its consent string, its terms ('v2' | 'v3', TERMS),
 * expiresAt (NULL when it never expires) and feedbackCount (its feedback
 * from the last 30 days, what GET /api/admin/feedback?story= lists).
 */
export function listAdminStories(f: AdminStoryFilter, now: number, limit: number) {
  const where = [LIVE];
  const args: (string | number)[] = [now - AGE];
  const add = (condition: string, ...values: (string | number)[]) => {
    where.push(condition);
    args.push(...values);
  };
  if (f.status !== "all") add("status=?", f.status);
  if (f.reshare) where.push(`${SHARE_REQUESTS}>0`);
  if (f.consent) where.push(f.consent === "v3" ? PERMANENT : `NOT ${PERMANENT}`);
  if (f.expiring !== undefined) add(`${EXPIRES_FROM}<=?`, now - AGE + f.expiring * DAY);
  if (f.q !== undefined) {
    // instr(), not LIKE: D1 refuses LIKE patterns over 50 bytes (17 CJK
    // characters), and instr() matches the text literally, so %, _ and \
    // need no escaping. lower() makes ASCII case-insensitive, as LIKE was.
    add("(instr(lower(title),lower(?))>0 OR instr(lower(body),lower(?))>0)", f.q, f.q);
  }
  if (f.from !== undefined) add("created>=?", f.from);
  if (f.to !== undefined) add("created<?", f.to);
  if (f.id !== undefined) add("id=?", f.id);
  if (f.cursor) {
    const [created, id] = f.cursor;
    add("(created<? OR (created=? AND id<?))", created, created, id);
  }
  // The page is picked first (inner query), so the per-story counts run only
  // for its rows. Parameters bind in text order: the feedback cutoff in the
  // outer SELECT, then the filters, then the LIMIT.
  return db()
    .prepare(
      `SELECT id,title,body,era,source,status,consent,created,letter_type AS letterType,mood,reflection,COALESCE(status_at,created) AS statusAt,${SHARE_REQUESTS} AS shareRequests,${CONSENT_EVENTS} AS consentEvents,${TERMS} AS terms,${EXPIRES_AT} AS expiresAt,(SELECT COUNT(*) FROM feedback f WHERE f.story=stories.id AND f.created>?) AS feedbackCount
       FROM (SELECT * FROM stories WHERE ${where.join(" AND ")} ORDER BY created DESC,id DESC LIMIT ?) AS stories
       ORDER BY created DESC,id DESC`,
    )
    .bind(now - AGE, ...args, limit)
    .all<{ id: string; created: number; expiresAt: number | null }>();
}

/** Live stories per status (`cutoff` = now - AGE). */
export function countStoriesByStatus(cutoff: number) {
  return db()
    .prepare(`SELECT status,COUNT(*) AS n FROM stories WHERE ${LIVE} GROUP BY status`)
    .bind(cutoff);
}

/** Live stories the retention job deletes within `days` days of `now`. */
export function countExpiringStories(now: number, days: number) {
  return db()
    .prepare(`SELECT COUNT(*) AS n FROM stories WHERE ${LIVE} AND ${EXPIRES_FROM}<=?`)
    .bind(now - AGE, now - AGE + days * DAY);
}

/**
 * SQL: stories among the batch items `?1` (JSON [{id, statusAt,
 * consentEvents}]) that may be rejected or taken down at time `?2` — pending
 * or approved, and live (LIVE) — and are unchanged since the admin listed them (same statusAt and
 * consent-event count). Shared by rejectStories() and its admin_events rows
 * (admin-events.ts logBatchRejections()).
 */
export const BATCH_REJECTABLE = `id IN ${ITEM_IDS} AND status IN ('pending','approved') AND ${LIVE_AT_2}
       AND EXISTS (SELECT 1 FROM json_each(?1) j WHERE json_extract(j.value,'$.id')=stories.id
         AND json_extract(j.value,'$.statusAt')=COALESCE(stories.status_at,stories.created)
         AND json_extract(j.value,'$.consentEvents')=(SELECT COUNT(*) FROM consent_events e WHERE e.story=stories.id))`;

/**
 * Batch rejection (#4 §5.2): every BATCH_REJECTABLE story becomes rejected,
 * the same change as moderateStory(id, "rejected") (always a real change
 * here: pending or approved only). Returns the ids it changed. Batch it right
 * after logBatchRejections() with the same items.
 */
export function rejectStories(items: string, now: number) {
  return db()
    .prepare(
      `UPDATE stories SET status='rejected',status_at=?2,approved_at=NULL WHERE ${BATCH_REJECTABLE} RETURNING id`,
    )
    .bind(items, now);
}

/** Deletes the stories among the batch items `items`; returns the ids it deleted. */
export function deleteStories(items: string) {
  return db().prepare(`DELETE FROM stories WHERE id IN ${ITEM_IDS} RETURNING id`).bind(items);
}

/**
 * The batch items' live stories as they are at `now`, to tell why an item
 * failed (an expired story awaiting the retention job counts as missing).
 */
export function storyRevisions(items: string, now: number) {
  return db()
    .prepare(
      `SELECT id,status,COALESCE(status_at,created) AS statusAt,${CONSENT_EVENTS} AS consentEvents FROM stories WHERE id IN ${ITEM_IDS} AND ${LIVE_AT_2}`,
    )
    .bind(items, now)
    .all<{ id: string; status: string; statusAt: number; consentEvents: number }>();
}
