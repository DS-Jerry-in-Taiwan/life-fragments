import { z } from "zod";

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
const FEEDBACK_KINDS = ["more", "resonate", "neutral", "report", "comment"] as const;

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
});

/**
 * `id` from the URL path; `status` and the optional `statusAt` (the story's
 * statusAt as the admin queue listed it) from the JSON body. Any other body
 * field is ignored.
 */
export function parseModeration(id: unknown, b: unknown) {
  const body = typeof b === "object" && b !== null ? (b as Record<string, unknown>) : {};
  return check(moderationSchema, { id, status: body.status, statusAt: body.statusAt }, "無效操作");
}
