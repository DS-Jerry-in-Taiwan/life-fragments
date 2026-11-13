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

/** A refused request: the API's message, and its HTTP status (409: changed since listed). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  let d: T & { error?: string };
  try {
    d = await r.json();
  } catch {
    // Not JSON (e.g. an edge error page): never hand undefined fields to the UI.
    throw new ApiError(FALLBACK, r.status);
  }
  if (!r.ok) throw new ApiError(d.error || FALLBACK, r.status);
  return d;
}

/** POST with a JSON body, or with no body when `data` is omitted. */
function post<T = { ok: true }>(url: string, data?: object) {
  if (data === undefined) return request<T>(url, { method: "POST" });
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
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

export async function submitLetter(input: SubmitInput) {
  await ensureSession();
  await post("/api/me/stories", input);
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

export async function sendFeedback(story: string, kind: FeedbackKind, note = "") {
  await ensureSession();
  await post("/api/feedback", { story, kind, note });
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
