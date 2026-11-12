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

/** Any JSON object (arrays included); the action is dispatched from it. */
export const jsonObject = z.custom<Record<string, unknown>>(
  (v) => typeof v === "object" && v !== null,
);

// --- /api/letter -----------------------------------------------------------

const startSchema = z.object({
  letterType: z.enum(LETTER_TYPES),
  id: z.string().regex(/^[a-f0-9-]{36}$/),
});

export const parseStart = (b: unknown) => check(startSchema, b, "無效的試寫選擇");

const idSchema = z.object({ id: z.string() });

export const parseWithdraw = (b: unknown) => check(idSchema, b, "無效代碼");

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

// --- /api/admin ------------------------------------------------------------

const moderationSchema = z.object({
  id: z.string(),
  status: z.enum(["approved", "rejected", "delete"]),
});

export const parseModeration = (b: unknown) => check(moderationSchema, b, "無效操作");
