import {
  CONSENT_TERMS,
  CONSENT_VERSION,
  type ConsentTerms,
  consentString,
  consentVersionOf,
  MAX_SHARE_REQUESTS,
  PERMANENT_CONSENT_VERSIONS,
} from "../../consent";
import { insertConsentEvent, keptForLimit } from "./consent-events";
import { ADMIN_EVENT_INSERT, AGE, DAY, db, ITEM_IDS } from "./index";

// Stories and their whole lifecycle (#4 §5.2, §6, §6.1): the retention rule
// every read and delete shares, submission, the author's sharing changes,
// admin decisions, and every way a story is deleted. Each change is one D1
// batch (one transaction) built here, together with the consent_events and
// admin_events rows it writes, so the routes only assemble requests and
// replies. Every function takes the current time `now` (ms) and applies the
// retention windows itself.

// --- Retention rule (#4 §6) ----------------------------------------------------

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

/** SQL: the story is still live (not past its retention window) at the time bound at `now`. */
function liveAt(now: string) {
  return `COALESCE(${EXPIRES_FROM}>(${now}-${AGE}),1)`;
}

/**
 * SQL condition for every story read; takes one parameter, the current time.
 * Expired stories stay hidden until the retention job deletes them.
 */
export const LIVE = liveAt("?");

/** SQL: when the retention job deletes the story (ms; the first daily run after it), or NULL if never. */
const EXPIRES_AT = `(${EXPIRES_FROM}+${AGE})`;

/** SQL: the story's 'share' consent events (requests to share again after submission). */
const SHARE_REQUESTS =
  "(SELECT COUNT(*) FROM consent_events e WHERE e.story=stories.id AND e.action='share')";

/** SQL: the story's consent events, all actions (the admin sends it back with a decision). */
const CONSENT_EVENTS = "(SELECT COUNT(*) FROM consent_events e WHERE e.story=stories.id)";

/** SQL: the story's terms (lib/consent.ts CONSENT_TERMS): 'v3' for a PERMANENT version, 'v2' for every other. */
const [V2_TERMS, V3_TERMS] = CONSENT_TERMS;
const TERMS = `(CASE WHEN ${PERMANENT} THEN '${V3_TERMS}' ELSE '${V2_TERMS}' END)`;

// --- Public and author reads -----------------------------------------------------

/** Approved stories still visible under the LIVE rule. */
export async function listApprovedStories(now: number) {
  const { results } = await db()
    .prepare(
      `SELECT id,title,body,era,source,created,letter_type AS letterType,mood,reflection FROM stories WHERE status='approved' AND ${LIVE} ORDER BY created DESC LIMIT 100`,
    )
    .bind(now)
    .all();
  return results;
}

/**
 * The owner's stories still visible under the LIVE rule, each with how many
 * more times it may ask to be shared (#4 §6.1).
 */
export async function listOwnStories(owner: string, now: number) {
  const { results } = await db()
    .prepare(
      `SELECT id,title,body,era,source,status,created,letter_type AS letterType,mood,reflection,MAX(0,${MAX_SHARE_REQUESTS}-${SHARE_REQUESTS}) AS shareRequestsLeft FROM stories WHERE owner=? AND ${LIVE} ORDER BY created DESC`,
    )
    .bind(owner, now)
    .all();
  return results;
}

/** The owner's submissions in the day before `now`, for the daily limit. */
export async function countStoriesInLastDay(owner: string, now: number) {
  const row = await db()
    .prepare("SELECT COUNT(*) AS n FROM stories WHERE owner=? AND created>?")
    .bind(owner, now - DAY)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Approved stories accept reader feedback while visible under the LIVE rule. */
export async function isApprovedStory(id: string, now: number) {
  const row = await db()
    .prepare(`SELECT id FROM stories WHERE id=? AND status='approved' AND ${LIVE}`)
    .bind(id, now)
    .first();
  return Boolean(row);
}

// --- Submission --------------------------------------------------------------------

export type NewStory = {
  id: string;
  owner: string;
  title: string;
  body: string;
  era: string;
  source: string;
  /** Consent to share: pending (waits for review) when true, private otherwise. */
  share: boolean;
  created: number;
  letterType: string;
  mood: string;
  reflection: string;
  attempt: string | null;
};

/**
 * A new story under the current CONSENT_VERSION and its 'submit' consent
 * event: batch both statements together (with anything else the submission
 * completes).
 */
export function submitStory(s: NewStory) {
  const status = s.share ? "pending" : "private";
  const insert = db()
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
      status,
      consentString(CONSENT_VERSION, s.share),
      s.created,
      s.letterType,
      s.mood,
      s.reflection,
      s.attempt,
      s.created,
    );
  return {
    status,
    statements: [insert, insertConsentEvent(s.id, "submit", CONSENT_VERSION, s.created)],
  };
}

// --- Deleting stories ---------------------------------------------------------------

/**
 * Which stories a delete removes:
 * - withdraw: one of the owner's stories (DELETE /api/me/stories/:id);
 * - erase: every story the owner wrote, and also the feedback the owner wrote
 *   (DELETE /api/me);
 * - admin: one story, whoever wrote it;
 * - batch: the stories among the admin batch items (JSON, ITEM_IDS);
 * - expired: every story past its retention window (the retention job).
 */
export type DeleteScope =
  | { kind: "withdraw"; id: string; owner: string }
  | { kind: "erase"; owner: string }
  | { kind: "admin"; id: string }
  | { kind: "batch"; items: string }
  | { kind: "expired" };

function scopeCondition(scope: DeleteScope, now: number): [string, (string | number)[]] {
  switch (scope.kind) {
    case "withdraw":
      return ["id=?1 AND owner=?2", [scope.id, scope.owner]];
    case "erase":
      return ["owner=?1", [scope.owner]];
    case "admin":
      return ["id=?1", [scope.id]];
    case "batch":
      return [`id IN ${ITEM_IDS}`, [scope.items]];
    case "expired":
      return [`${EXPIRES_FROM}<(?1-${AGE})`, [now]];
  }
}

/**
 * The one way stories are deleted: their feedback, their consent_events and
 * the stories, in this order (the first two select the stories that are about
 * to go). Put all three in one batch, after the admin_events row that records
 * the delete, if any. The last statement returns the deleted ids.
 *
 * Sharing changes still counted by the session's daily limit (consent-events.ts
 * KEEP_FOR_LIMIT) stay behind until the retention job removes them, so
 * withdrawing a story does not reset the limit. Erase-all removes them too,
 * with every other consent event the session wrote: the session is deleted in
 * the same batch, so nothing is left to count against.
 */
export function deleteStoryRows(scope: DeleteScope, now: number) {
  const [where, args] = scopeCondition(scope, now);
  const stories = `(SELECT id FROM stories WHERE ${where})`;
  const erase = scope.kind === "erase";
  const d = db();
  return [
    d
      .prepare(`DELETE FROM feedback WHERE story IN ${stories}${erase ? " OR owner=?1" : ""}`)
      .bind(...args),
    erase
      ? d.prepare(`DELETE FROM consent_events WHERE story IN ${stories} OR owner=?1`).bind(...args)
      : d
          .prepare(
            `DELETE FROM consent_events WHERE story IN ${stories} AND NOT ${keptForLimit(`?${args.length + 1}`)}`,
          )
          .bind(...args, now),
    d.prepare(`DELETE FROM stories WHERE ${where} RETURNING id`).bind(...args),
  ];
}

async function ownsStory(id: string, owner: string) {
  const row = await db()
    .prepare("SELECT id FROM stories WHERE id=? AND owner=?")
    .bind(id, owner)
    .first();
  return Boolean(row);
}

/**
 * The author withdraws one of their stories (live or expired) with its
 * feedback and consent history; false when the owner has no such story.
 * Not an admin operation: nothing is logged.
 */
export async function withdrawStory(id: string, owner: string, now: number) {
  if (!(await ownsStory(id, owner))) return false;
  await db().batch(deleteStoryRows({ kind: "withdraw", id, owner }, now));
  return true;
}

// --- Admin decisions (#4 §5.2) ------------------------------------------------------
//
// Each admin change is batched right after its admin_events row, which repeats
// the change's condition (INSERT … SELECT … WHERE), so a row exists exactly
// when the change was made (a D1 batch is one transaction): repeating the
// current decision, a 409, a 400 or deleting a missing story logs nothing.
// The email is the identity withAdmin() verified, never a request value.

/**
 * SQL: story `?3` may take the admin decision `?1` ('approved' | 'rejected')
 * at time `?2`, is still live there (an expired story awaiting the retention
 * job must not get a new window, or become permanent by approval) and is
 * unchanged since the admin read it: `?4` its statusAt, `?5` its
 * consent-event count (NULL: not checked). Private stories (no share consent)
 * never match, so they cannot be approved.
 */
const MODERATABLE = `id=?3 AND status IN ('pending','approved','rejected') AND ${liveAt("?2")}
         AND (?4 IS NULL OR COALESCE(status_at,created)=?4)
         AND (?5 IS NULL OR (SELECT COUNT(*) FROM consent_events e WHERE e.story=?3)=?5)`;

/** The statusAt and consentEvents the admin was shown; each is checked only when given. */
export type Expected = { statusAt?: number; consentEvents?: number };

/** A live story's statusAt and consentEvents (as the admin story list shows them), or null. */
function storyRevision(id: string, now: number) {
  return db()
    .prepare(
      `SELECT COALESCE(status_at,created) AS statusAt,${CONSENT_EVENTS} AS consentEvents FROM stories WHERE id=? AND ${LIVE}`,
    )
    .bind(id, now)
    .first<{ statusAt: number; consentEvents: number }>();
}

/**
 * An admin decision on one story (POST /api/admin/stories/:id/moderation):
 * - "ok": applied, or already the story's status (then nothing changes and
 *   nothing is logged);
 * - "stale": `expected` was given and the story changed since (e.g. the
 *   author stopped sharing and asked again in between; the event count
 *   catches changes within the same millisecond, which leave statusAt as it
 *   was);
 * - "refused": no such live story, or a private one.
 *
 * A real change sets status_at (restarting the 30-day window of non-approved
 * stories) and approved_at (now when becoming approved, NULL when leaving
 * approved), and is logged as 'approve' / 'reject'. Repeating the current
 * decision changes neither timestamp.
 */
export async function decideStory(
  email: string,
  id: string,
  status: "approved" | "rejected",
  now: number,
  expected: Expected,
): Promise<"ok" | "stale" | "refused"> {
  const args = [status, now, id, expected.statusAt ?? null, expected.consentEvents ?? null];
  const d = db();
  const [, decided] = await d.batch([
    d
      .prepare(
        `${ADMIN_EVENT_INSERT} SELECT ?6,CASE ?1 WHEN 'approved' THEN 'approve' ELSE 'reject' END,'story',?3,?2
         WHERE EXISTS (SELECT 1 FROM stories WHERE ${MODERATABLE} AND status<>?1)`,
      )
      .bind(...args, email),
    d
      .prepare(
        `UPDATE stories SET
           status_at=CASE WHEN status=?1 THEN COALESCE(status_at,created) ELSE ?2 END,
           approved_at=CASE WHEN ?1<>'approved' THEN NULL WHEN status='approved' THEN approved_at ELSE ?2 END,
           status=?1
         WHERE ${MODERATABLE}`,
      )
      .bind(...args),
  ]);
  if (decided.meta.changes) return "ok";
  const current = await storyRevision(id, now);
  const changed =
    current &&
    ((expected.statusAt !== undefined && current.statusAt !== expected.statusAt) ||
      (expected.consentEvents !== undefined && current.consentEvents !== expected.consentEvents));
  return changed ? "stale" : "refused";
}

/**
 * An admin deletes one story, whatever its status, with its feedback and
 * consent events; logged as 'delete_story' if the story existed. The story's
 * earlier admin_events rows stay.
 */
export async function adminDeleteStory(email: string, id: string, now: number) {
  const d = db();
  await d.batch([
    d
      .prepare(
        `${ADMIN_EVENT_INSERT} SELECT ?1,'delete_story','story',?2,?3 WHERE EXISTS (SELECT 1 FROM stories WHERE id=?2)`,
      )
      .bind(email, id, now),
    ...deleteStoryRows({ kind: "admin", id }, now),
  ]);
}

/**
 * SQL: stories among the batch items `?1` (JSON [{id, statusAt,
 * consentEvents}]) that may be rejected or taken down at time `?2` — pending
 * or approved, and live — and are unchanged since the admin listed them (same
 * statusAt and consent-event count).
 */
const BATCH_REJECTABLE = `id IN ${ITEM_IDS} AND status IN ('pending','approved') AND ${liveAt("?2")}
       AND EXISTS (SELECT 1 FROM json_each(?1) j WHERE json_extract(j.value,'$.id')=stories.id
         AND json_extract(j.value,'$.statusAt')=COALESCE(stories.status_at,stories.created)
         AND json_extract(j.value,'$.consentEvents')=(SELECT COUNT(*) FROM consent_events e WHERE e.story=stories.id))`;

export type BatchItem = { id: string; statusAt: number; consentEvents: number };
export type BatchItemError = "conflict" | "not_allowed" | "missing";
export type BatchResult =
  { id: string; ok: true } | { id: string; ok: false; error: BatchItemError };

/**
 * The batch items' live stories as they are at `now`, to tell why an item
 * failed (an expired story awaiting the retention job counts as missing).
 */
function storyRevisions(items: string, now: number) {
  return db()
    .prepare(
      `SELECT id,status,COALESCE(status_at,created) AS statusAt,${CONSENT_EVENTS} AS consentEvents FROM stories WHERE id IN ${ITEM_IDS} AND ${liveAt("?2")}`,
    )
    .bind(items, now)
    .all<{ id: string; status: string; statusAt: number; consentEvents: number }>();
}

/**
 * Batch rejection or delete (POST /api/admin/moderation), each item on its
 * own, in one D1 batch:
 * - rejected: every BATCH_REJECTABLE story becomes rejected, the same change
 *   as decideStory(…, "rejected") (always a real change here), logged as
 *   'reject';
 * - delete: every existing story among the items is deleted as by
 *   adminDeleteStory() (statusAt and consentEvents are not checked), logged
 *   as 'delete_story'.
 * The changed ids come back from the change itself (RETURNING); for the
 * others a read afterwards tells why, in request order: missing (no such
 * live story), conflict (it changed since it was listed) or not_allowed.
 */
export async function moderateStories(
  email: string,
  status: "rejected" | "delete",
  items: BatchItem[],
  now: number,
): Promise<BatchResult[]> {
  const json = JSON.stringify(items);
  const d = db();
  const results =
    status === "delete"
      ? await d.batch([
          d
            .prepare(
              `${ADMIN_EVENT_INSERT} SELECT ?2,'delete_story','story',id,?3 FROM stories WHERE id IN ${ITEM_IDS}`,
            )
            .bind(json, email, now),
          ...deleteStoryRows({ kind: "batch", items: json }, now),
        ])
      : await d.batch([
          d
            .prepare(
              `${ADMIN_EVENT_INSERT} SELECT ?3,'reject','story',id,?2 FROM stories WHERE ${BATCH_REJECTABLE}`,
            )
            .bind(json, now, email),
          d
            .prepare(
              `UPDATE stories SET status='rejected',status_at=?2,approved_at=NULL WHERE ${BATCH_REJECTABLE} RETURNING id`,
            )
            .bind(json, now),
        ]);
  const done = new Set((results.at(-1)!.results as { id: string }[]).map((r) => r.id));

  const failed = items.filter((i) => !done.has(i.id));
  const current = new Map(
    failed.length
      ? (await storyRevisions(JSON.stringify(failed), now)).results.map((s) => [s.id, s])
      : [],
  );
  return items.map(({ id, statusAt, consentEvents }): BatchResult => {
    if (done.has(id)) return { id, ok: true };
    const found = current.get(id);
    const error: BatchItemError = !found
      ? "missing"
      : found.statusAt !== statusAt || found.consentEvents !== consentEvents
        ? "conflict"
        : "not_allowed";
    return { id, ok: false, error };
  });
}

// --- The author's sharing changes (#4 §6.1) ---------------------------------------

/**
 * What a sharing change read before writing: the story's status, when that
 * status was set, and how many consent events it had. Every transition writes
 * an event, so the event count changes even when a story returns to the same
 * status (A → B → A) within the same millisecond.
 */
type SharingSnapshot = { status: string; statusAt: number; events: number };

/** Which statuses each direction may start from. */
const SHARE_FROM = ["private", "rejected"];
const STOP_FROM = ["pending", "approved"];

/** One of the owner's live stories, with what a sharing change needs; null if none. */
function findOwnStoryForSharing(id: string, owner: string, now: number) {
  return db()
    .prepare(
      `SELECT status,consent,${SHARE_REQUESTS} AS shareRequests,COALESCE(status_at,created) AS statusAt,${CONSENT_EVENTS} AS events FROM stories WHERE id=? AND owner=? AND ${LIVE}`,
    )
    .bind(id, owner, now)
    .first<SharingSnapshot & { consent: string; shareRequests: number }>();
}

/**
 * SQL: story `?1` owned by `?2` is still as read (`?3` status, `?4` status
 * time) and has `?5` + `written` consent events (`written` = 1 once this
 * request's own event has been inserted earlier in the same batch).
 */
function unchangedSinceRead(written: 0 | 1) {
  return `EXISTS (SELECT 1 FROM stories WHERE id=?1 AND owner=?2 AND status=?3 AND COALESCE(status_at,created)=?4)
       AND (SELECT COUNT(*) FROM consent_events WHERE story=?1)=?5+${written}`;
}

/**
 * Why a sharing change was refused: missing (no such live story of the
 * owner), pending (already waiting for review), public (already shared),
 * not_shared (nothing to stop), cap (MAX_SHARE_REQUESTS used up), limit
 * (`overLimit` said so), stale (the story changed after it was read, e.g. a
 * concurrent request won).
 */
export type SharingRefusal =
  "missing" | "pending" | "public" | "not_shared" | "cap" | "limit" | "stale";

export type SharingResult =
  | { ok: true; status: "pending" | "private"; shareRequestsLeft: number }
  | { ok: false; reason: SharingRefusal };

/**
 * The author changes a story's sharing; the text is never touched.
 * - share: private or rejected → pending, under the current consent version
 *   (a story submitted under older terms moves onto the current ones); always
 *   reviewed again. At most MAX_SHARE_REQUESTS times per story.
 * - stop: pending or approved → private, at once (an approved story leaves
 *   the public list); the consent version is kept.
 * `overLimit` (the daily limit) is asked only once the change is otherwise
 * allowed. A change sets status_at, clears approved_at and writes a 'share'
 * or 'unshare' consent event with the owner, which the daily limit counts
 * (consent-events.ts countSharingChangesInLastDay()).
 *
 * One batch: the event, written only if the story is unchanged since it was
 * read (status, status time and event count) and, for a share request, it
 * still has a request left; then the update, which requires that event
 * (event count + 1). So a stale or losing request — including one that read
 * an older request count — writes neither.
 */
export async function changeSharing(
  id: string,
  owner: string,
  share: boolean,
  now: number,
  overLimit: () => Promise<boolean>,
): Promise<SharingResult> {
  const refuse = (reason: SharingRefusal): SharingResult => ({ ok: false, reason });
  const story = await findOwnStoryForSharing(id, owner, now);
  if (!story) return refuse("missing");
  if (share && !SHARE_FROM.includes(story.status))
    return refuse(story.status === "pending" ? "pending" : "public");
  if (!share && !STOP_FROM.includes(story.status)) return refuse("not_shared");
  if (share && story.shareRequests >= MAX_SHARE_REQUESTS) return refuse("cap");
  if (await overLimit()) return refuse("limit");

  const version = share ? CONSENT_VERSION : consentVersionOf(story.consent);
  const to = share ? "pending" : "private";
  const snapshot = [id, owner, story.status, story.statusAt, story.events];
  const underCap = share
    ? ` AND (SELECT COUNT(*) FROM consent_events WHERE story=?1 AND action='share')<${MAX_SHARE_REQUESTS}`
    : "";
  const d = db();
  const [, update] = await d.batch([
    d
      .prepare(
        `INSERT INTO consent_events(story,owner,action,consent_version,created)
         SELECT ?1,?2,?6,?7,?8 WHERE ${unchangedSinceRead(0)}${underCap}`,
      )
      .bind(...snapshot, share ? "share" : "unshare", version, now),
    d
      .prepare(
        `UPDATE stories SET status=?6, consent=?7, status_at=?8, approved_at=NULL
         WHERE id=?1 AND ${unchangedSinceRead(1)}`,
      )
      .bind(...snapshot, to, consentString(version, share), now),
  ]);
  if (!update.meta.changes) return refuse("stale");
  const shareRequests = story.shareRequests + (share ? 1 : 0);
  return {
    ok: true,
    status: to,
    shareRequestsLeft: Math.max(0, MAX_SHARE_REQUESTS - shareRequests),
  };
}

// --- Admin lists (#4 §5.2) -----------------------------------------------------------

export type AdminStoryStatus = "pending" | "approved" | "rejected" | "private";

/** GET /api/admin/stories filters (lib/server/validation.ts parseAdminStoryQuery()). */
export type AdminStoryFilter = {
  status: AdminStoryStatus | "all";
  /** Only stories that asked to be shared again after submission. */
  reshare: boolean;
  /** v3: a PERMANENT_CONSENT_VERSIONS version; v2: any other (old, legacy or empty). */
  consent?: ConsentTerms;
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
  const args: (string | number)[] = [now];
  const add = (condition: string, ...values: (string | number)[]) => {
    where.push(condition);
    args.push(...values);
  };
  if (f.status !== "all") add("status=?", f.status);
  if (f.reshare) where.push(`${SHARE_REQUESTS}>0`);
  if (f.consent) where.push(f.consent === V3_TERMS ? PERMANENT : `NOT ${PERMANENT}`);
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

/** Live stories per status. */
export function countStoriesByStatus(now: number) {
  return db()
    .prepare(`SELECT status,COUNT(*) AS n FROM stories WHERE ${LIVE} GROUP BY status`)
    .bind(now);
}

/** Live stories the retention job deletes within `days` days of `now`. */
export function countExpiringStories(now: number, days: number) {
  return db()
    .prepare(`SELECT COUNT(*) AS n FROM stories WHERE ${LIVE} AND ${EXPIRES_FROM}<=?`)
    .bind(now, now - AGE + days * DAY);
}
