// The only place the frontend talks to the API (#4 §4.5). Components call
// these functions and never see the REST routes (#4 §5) behind them.
import type {
  AdminEvent,
  AdminFeedback,
  AdminStory,
  AdminSummary,
  FeedbackKind,
  LetterType,
  ModerationAction,
  Story,
} from "./stories";

const FALLBACK = "服務暫時無法使用";

export type SubmitInput = {
  title: string;
  body: string;
  era: string;
  source: string;
  letterType: LetterType;
  attempt: string;
  mood: string;
  reflection: string;
  adult: boolean;
  privacy: boolean;
  share: boolean;
};

/**
 * A refused request: the API's message, its HTTP status (409: changed since
 * listed) and its `code` when it has one ("turnstile": the human check).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  let d: T & { error?: string; code?: string };
  try {
    d = await r.json();
  } catch {
    // Not JSON (e.g. an edge error page): never hand undefined fields to the UI.
    throw new ApiError(FALLBACK, r.status);
  }
  if (!r.ok) throw new ApiError(d.error || FALLBACK, r.status, d.code);
  return d;
}

/** POST with a JSON body, or with no body when `data` is omitted. */
function post<T = { ok: true }>(url: string, data?: object, headers: Record<string, string> = {}) {
  if (data === undefined) return request<T>(url, { method: "POST", headers });
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
}

/** Fetches a fresh one-time Turnstile token (components/common/Turnstile.tsx getToken). */
export type TurnstileToken = () => Promise<string>;

/**
 * POST with a Turnstile token in `X-Turnstile-Token` (#4 §5.1). A 403 with
 * `code: "turnstile"` (token failed, expired or already used) is retried
 * once with a new token; any other failure, or a second refusal, is thrown.
 */
async function postWithTurnstile(url: string, data: object, token: TurnstileToken) {
  const send = async () => post(url, data, { "X-Turnstile-Token": await token() });
  try {
    return await send();
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 403 && e.code === "turnstile")) throw e;
  }
  return send();
}

/**
 * One URL path segment. fetch() collapses "." and ".." segments, so
 * withdrawStory("..") would otherwise become DELETE /api/me.
 */
function segment(id: string) {
  if (id === "" || id === "." || id === "..") throw new Error("無效代碼");
  return encodeURIComponent(id);
}

function patch<T>(url: string, data: object) {
  return request<T>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

function del<T = { ok: true }>(url: string) {
  return request<T>(url, { method: "DELETE" });
}

// One anonymous session per page load, shared by every caller; replaces the
// old `ready` flag. Reset after a failure, after erasing all data or logging out.
let sessionPromise: Promise<unknown> | null = null;
function ensureSession() {
  sessionPromise ??= post("/api/session").catch((e) => {
    sessionPromise = null;
    throw e;
  });
  return sessionPromise;
}

export async function listApprovedStories() {
  return (await request<{ stories: Story[] }>("/api/stories")).stories;
}

export async function listMyStories() {
  return (await request<{ stories: Story[] }>("/api/me/stories")).stories;
}

/** Records that the author started writing; returns the attempt id. */
export async function startWriting(letterType: LetterType) {
  await ensureSession();
  const id = crypto.randomUUID();
  await post("/api/writing-attempts", { id, letterType });
  return id;
}

export async function submitLetter(input: SubmitInput, token: TurnstileToken) {
  await ensureSession();
  await postWithTurnstile("/api/me/stories", input, token);
}

export async function withdrawStory(id: string) {
  await del(`/api/me/stories/${segment(id)}`);
}

export type SharingResult = { status: string; shareRequestsLeft: number };

/**
 * 改為分享 / 再次申請分享 (`share: true`, the three consent boxes ticked
 * again) or 停止分享 (`share: false`) for one of this browser's stories.
 */
export async function setStorySharing(
  id: string,
  share: boolean,
  consent?: { adult: boolean; privacy: boolean; share: boolean },
) {
  return patch<SharingResult>(
    `/api/me/stories/${segment(id)}/sharing`,
    share ? { share, consent } : { share },
  );
}

export async function eraseMyData() {
  await del("/api/me");
  sessionPromise = null;
}

/** 在這台裝置登出: forgets this browser's session; its stories stay. */
export async function logout() {
  await del("/api/session");
  sessionPromise = null;
}

export async function sendFeedback(
  story: string,
  kind: FeedbackKind,
  note: string,
  token: TurnstileToken,
) {
  await ensureSession();
  await postWithTurnstile("/api/feedback", { story, kind, note }, token);
}

/** Story counts per status, stories expiring soon and the 30-day writing metrics. */
export async function getAdminSummary() {
  return request<AdminSummary>("/api/admin/summary");
}

/** One page of a list, and the cursor of the next (null at the end). */
export type Page<K extends string, T> = { [key in K]: T[] } & { nextCursor: string | null };

/** `query`: the URL's filters (/admin?status=…), passed through as they are. */
function withCursor(query: URLSearchParams | Record<string, string>, cursor?: string | null) {
  const q = new URLSearchParams(query);
  if (cursor) q.set("cursor", cursor);
  const s = q.toString();
  return s ? "?" + s : "";
}

/** GET /api/admin/stories: status, reshare, consent, expiring, q, from, to, id; 50 a page. */
export async function listAdminStories(
  query: URLSearchParams | Record<string, string>,
  cursor?: string | null,
) {
  return request<Page<"stories", AdminStory>>("/api/admin/stories" + withCursor(query, cursor));
}

/** One story as the admin list shows it, whatever its status; null if gone or expired. */
export async function getAdminStory(id: string) {
  const { stories } = await listAdminStories({ status: "all", id });
  return stories.find((s) => s.id === id) ?? null;
}

/** GET /api/admin/feedback: `kind`, `story`; problem reports first. */
export async function listAdminFeedback(
  filter: { kind?: FeedbackKind; story?: string },
  cursor?: string | null,
) {
  const query: Record<string, string> = {};
  if (filter.kind) query.kind = filter.kind;
  if (filter.story) query.story = filter.story;
  return request<Page<"feedback", AdminFeedback>>(
    "/api/admin/feedback" + withCursor(query, cursor),
  );
}

export async function deleteFeedback(id: string) {
  await del(`/api/admin/feedback/${segment(id)}`);
}

/** GET /api/admin/events: the operation log, optionally for one `admin`. */
export async function listAdminEvents(admin: string, cursor?: string | null) {
  return request<Page<"events", AdminEvent> & { admins: string[] }>(
    "/api/admin/events" + withCursor(admin ? { admin } : {}, cursor),
  );
}

/**
 * `listed`: the story's statusAt and consentEvents as the admin list showed them,
 * so the decision is refused (409) if the story changed since (e.g. the
 * author asked again).
 */
export async function moderateStory(
  id: string,
  status: ModerationAction,
  listed?: { statusAt?: number; consentEvents?: number },
) {
  await post(`/api/admin/stories/${segment(id)}/moderation`, {
    status,
    statusAt: listed?.statusAt,
    consentEvents: listed?.consentEvents,
  });
}

/** At most this many stories per batch (POST /api/admin/moderation; lib/server/validation.ts). */
export const MAX_BATCH = 50;

/** Why one story of a batch was left as it was. */
export type BatchError = "conflict" | "not_allowed" | "missing";
export type BatchResult = { id: string; ok: boolean; error?: BatchError };

/**
 * 不通過或下架 / 永久刪除 for up to MAX_BATCH stories at once (never approval).
 * Each item carries its statusAt and consentEvents as the list showed them;
 * every story gets the single-story rules, so the results (in request order)
 * can mix done and refused ones.
 */
export async function moderateStories(
  status: "rejected" | "delete",
  items: { id: string; statusAt: number; consentEvents: number }[],
) {
  const { results } = await post<{ results: BatchResult[] }>("/api/admin/moderation", {
    status,
    items: items.map(({ id, statusAt, consentEvents }) => ({ id, statusAt, consentEvents })),
  });
  return results;
}
