import { z } from "zod";
import { decodeCursor } from "./cursor";
import type { AdminEventFilter } from "./db/admin-events";
import type { AdminFeedbackFilter } from "./db/feedback";
import type { AdminStoryFilter } from "./db/stories";

// Request body schemas. Each parse* helper returns the first failing stage's
// message, so error precedence and wording match the original hand-written
// checks exactly. Every validation failure is a 400.

export type Validated<T> = { ok: true; data: T } | { ok: false; error: string };

function check<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  error: string,
): Validated<z.output<S>> {
  const r = schema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, error };
}

const LETTER_TYPES = ["past", "present"] as const;
const SOURCES = ["original", "recollection", "present"] as const;
export const FEEDBACK_KINDS = ["more", "resonate", "neutral", "report", "comment"] as const;

/** Any JSON object (arrays included), checked before the session is. */
export const jsonObject = z.custom<Record<string, unknown>>(
  (v) => typeof v === "object" && v !== null,
);

// --- public + session routes ------------------------------------------------

const startSchema = z.object({
  letterType: z.enum(LETTER_TYPES),
  id: z.string().regex(/^[a-f0-9-]{36}$/),
});

export const parseStart = (b: unknown) => check(startSchema, b, "無效的試寫選擇");

// Story ids now come from the URL path (always a string); the rule and the
// message are the ones the v1 body field had.
const storyIdSchema = z.string();

export const parseStoryId = (id: unknown) => check(storyIdSchema, id, "無效代碼");

const feedbackSchema = z.object({
  story: z.string(),
  kind: z.enum(FEEDBACK_KINDS),
  note: z.string().max(500),
});

export const parseFeedback = (b: unknown) => check(feedbackSchema, b, "回饋格式不正確");

// Submit is validated in stages: letter type, required strings, then the
// normalized content (trimmed, with defaults filled in), then the attempt id.

const submitLetterType = z.object({ letterType: z.enum(LETTER_TYPES).optional() });

/** Optional free text: trimmed when it is a string, otherwise "". */
const optionalText = z.unknown().transform((v) => (typeof v === "string" ? v.trim() : ""));

const submitFields = z.object({
  title: z.string(),
  body: z.string(),
  era: z.string(),
  source: z.string(),
  mood: optionalText,
  reflection: optionalText,
});

const submitContent = z
  .object({
    type: z.enum(["past", "present", "legacy"]),
    title: z.string().max(60),
    body: z.string().max(1500),
    era: z.string().min(1).max(40),
    source: z.enum(SOURCES),
    mood: z.string().max(60),
    reflection: z.string().max(800),
    adult: z.literal(true),
    privacy: z.literal(true),
    share: z.boolean(),
  })
  // Legacy (pre-v2) submissions keep their 30-character minimum.
  .refine((s) => s.body.length >= (s.type === "legacy" ? 30 : 1))
  // `present` is the source of present-tense letters only.
  .refine((s) => (s.type === "present") === (s.source === "present"))
  .refine((s) => s.type !== "present" || s.mood.length > 0);

export type Submission = z.output<typeof submitContent> & {
  /** Writing attempt id; set for past/present letters, null for legacy ones. */
  attempt: string | null;
};

export function parseSubmit(b: unknown, now: number): Validated<Submission> {
  const kind = check(submitLetterType, b, "無效寫法");
  if (!kind.ok) return kind;
  const fields = check(submitFields, b, "請填寫完整");
  if (!fields.ok) return fields;

  const type = kind.data.letterType ?? "legacy";
  const f = fields.data;
  const raw = b as Record<string, unknown>;
  const content = check(
    submitContent,
    {
      type,
      title: f.title.trim() || (type === "present" ? "今天的心情" : "一段仍記得的經歷"),
      body: f.body.trim(),
      era:
        type === "present"
          ? new Date(now).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })
          : f.era.trim(),
      source: type === "present" ? "present" : f.source,
      mood: f.mood,
      reflection: f.reflection,
      adult: raw.adult,
      privacy: raw.privacy,
      share: raw.share,
    },
    "請確認內容、時間、心情與同意選項。",
  );
  if (!content.ok) return content;

  if (type === "legacy") return { ok: true, data: { ...content.data, attempt: null } };
  const attempt = raw.attempt;
  if (typeof attempt !== "string") return { ok: false, error: "請先選擇一種寫法。" };
  return { ok: true, data: { ...content.data, attempt } };
}

// --- PATCH /api/me/stories/:id/sharing ---------------------------------------

/**
 * `{share: true, consent: {adult: true, privacy: true, share: true}}` asks to
 * share (the current consent wording, all three ticked again);
 * `{share: false}` stops sharing (any `consent` is ignored).
 */
const sharingSchema = z.object({ share: z.boolean() });
const shareConsentSchema = z.object({
  consent: z.object({ adult: z.literal(true), privacy: z.literal(true), share: z.literal(true) }),
});

export function parseSharing(b: unknown): Validated<{ share: boolean }> {
  const v = check(sharingSchema, b, "無效的分享設定");
  if (!v.ok || !v.data.share) return v;
  const consent = check(shareConsentSchema, b, "請勾選三項同意，才能申請分享。");
  return consent.ok ? v : consent;
}

// --- /api/admin/stories/:id/moderation ------------------------------------

const moderationSchema = z.object({
  id: z.string(),
  status: z.enum(["approved", "rejected", "delete"]),
  statusAt: z.number().int().nonnegative().optional(),
  consentEvents: z.number().int().nonnegative().optional(),
});

/**
 * `id` from the URL path; `status` and the optional `statusAt` and
 * `consentEvents` (the story's values as the admin story list showed them) from the
 * JSON body. Any other body field is ignored.
 */
export function parseModeration(id: unknown, b: unknown) {
  const body = typeof b === "object" && b !== null ? (b as Record<string, unknown>) : {};
  return check(
    moderationSchema,
    { id, status: body.status, statusAt: body.statusAt, consentEvents: body.consentEvents },
    "無效操作",
  );
}

// --- POST /api/admin/moderation (batch) ---------------------------------------

/** At most this many stories per batch request (#4 §5.2). */
export const MAX_BATCH = 50;

const batchItem = z.object({
  id: z.string().min(1).max(200),
  statusAt: z.number().int().nonnegative(),
  consentEvents: z.number().int().nonnegative(),
});

const batchSchema = z.object({
  status: z.enum(["rejected", "delete"]),
  items: z
    .array(batchItem)
    .min(1)
    .max(MAX_BATCH)
    .refine((items) => new Set(items.map((i) => i.id)).size === items.length),
});

export type BatchModeration = z.output<typeof batchSchema>;

/**
 * `{status: "rejected" | "delete", items: [{id, statusAt, consentEvents}]}`,
 * 1–50 items with distinct ids (unknown item fields are dropped). Approval is
 * never batched: every story must be read before it goes public.
 */
export function parseBatchModeration(b: unknown): Validated<BatchModeration> {
  if (typeof b === "object" && b !== null && (b as Record<string, unknown>).status === "approved")
    return { ok: false, error: "核准必須逐篇閱讀原文，不能批次操作。" };
  return check(batchSchema, b, "無效操作");
}

// --- GET /api/admin/{stories,feedback,events} query strings --------------------

const BAD_FILTER = "無效的篩選條件。";
const BAD_CURSOR = "無效的分頁位置，請重新載入。";
export const MAX_QUERY = 100;
const TAIPEI_OFFSET = 8 * 60 * 60 * 1000;

/** Query parameters as an object; empty values count as absent. */
function queryObject(params: URLSearchParams) {
  return Object.fromEntries([...params].filter(([, v]) => v !== ""));
}

/** Start of the calendar day `YYYY-MM-DD` in Taipei (UTC+8, no DST), in ms; null if not a real date. */
function taipeiDayStart(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const back = new Date(utc);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d)
    return null;
  return utc - TAIPEI_OFFSET;
}

const dayParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform(taipeiDayStart)
  .refine((t): t is number => t !== null);

/** The `cursor` param decoded and checked against `shape` (absent: undefined). */
function parseCursor<S extends z.ZodTypeAny>(
  shape: S,
  cursor: string | undefined,
): Validated<z.output<S> | undefined> {
  if (cursor === undefined) return { ok: true, data: undefined };
  return check(shape, decodeCursor(cursor), BAD_CURSOR);
}

const textParam = z.string().max(200);

const adminStoriesSchema = z
  .object({
    status: z.enum(["pending", "approved", "rejected", "private", "all"]).default("pending"),
    reshare: z.literal("1").optional(),
    consent: z.enum(["v2", "v3"]).optional(),
    expiring: z
      .string()
      .regex(/^\d{1,3}$/)
      .transform(Number)
      .refine((n) => n >= 1 && n <= 365)
      .optional(),
    q: z.string().optional(),
    from: dayParam.optional(),
    to: dayParam.optional(),
    id: textParam.optional(),
    cursor: z.string().optional(),
  })
  .refine((f) => f.from === undefined || f.to === undefined || f.from <= f.to);

const storyCursor = z.tuple([z.number().int(), z.string()]);

/**
 * GET /api/admin/stories (#4 §5.2): `status` (pending by default, or
 * approved / rejected / private / all), `reshare=1`, `consent=v2|v3`,
 * `expiring=<days 1–365>`, `q` (trimmed, at most 100 characters), `from` /
 * `to` (YYYY-MM-DD, Taipei calendar days, both inclusive), `id`, `cursor`.
 * Unknown parameters are ignored.
 */
export function parseAdminStoryQuery(params: URLSearchParams): Validated<AdminStoryFilter> {
  const raw = queryObject(params);
  const v = check(adminStoriesSchema, raw, BAD_FILTER);
  if (!v.ok) return v;
  const q = v.data.q?.trim();
  if (q !== undefined && [...q].length > MAX_QUERY)
    return { ok: false, error: `搜尋文字最多 ${MAX_QUERY} 字。` };
  const c = parseCursor(storyCursor, v.data.cursor);
  if (!c.ok) return c;
  const cursor = c.data;
  const f = v.data;
  return {
    ok: true,
    data: {
      status: f.status,
      reshare: f.reshare === "1",
      consent: f.consent,
      expiring: f.expiring,
      q: q || undefined,
      from: f.from,
      to: f.to === undefined ? undefined : f.to + 24 * 60 * 60 * 1000,
      id: f.id,
      cursor,
    },
  };
}

const adminFeedbackSchema = z.object({
  kind: z.enum([...FEEDBACK_KINDS, "all"]).default("all"),
  story: textParam.optional(),
  cursor: z.string().optional(),
});

const feedbackCursor = z.tuple([
  z.union([z.literal(0), z.literal(1)]),
  z.number().int(),
  z.string(),
]);

/** GET /api/admin/feedback: `kind` (a feedback kind, or all by default), `story`, `cursor`. */
export function parseAdminFeedbackQuery(params: URLSearchParams): Validated<AdminFeedbackFilter> {
  const v = check(adminFeedbackSchema, queryObject(params), BAD_FILTER);
  if (!v.ok) return v;
  const c = parseCursor(feedbackCursor, v.data.cursor);
  if (!c.ok) return c;
  const cursor = c.data;
  const { kind, story } = v.data;
  return { ok: true, data: { kind: kind === "all" ? undefined : kind, story, cursor } };
}

const adminEventsSchema = z.object({
  admin: z.string().max(320).optional(),
  cursor: z.string().optional(),
});

const eventCursor = z.tuple([z.number().int(), z.number().int()]);

/** GET /api/admin/events: `admin` (an admin email, compared lowercased), `cursor`. */
export function parseAdminEventQuery(params: URLSearchParams): Validated<AdminEventFilter> {
  const v = check(adminEventsSchema, queryObject(params), BAD_FILTER);
  if (!v.ok) return v;
  const c = parseCursor(eventCursor, v.data.cursor);
  if (!c.ok) return c;
  const cursor = c.data;
  return { ok: true, data: { admin: v.data.admin?.trim().toLowerCase() || undefined, cursor } };
}
