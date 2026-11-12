// The only place the frontend talks to the API (#4 §4.5). Components call
// these functions and never see the REST routes (#4 §5) behind them.
import type {
  Feedback,
  FeedbackKind,
  LetterType,
  ModerationAction,
  Story,
  WritingMetric,
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

export type AdminQueue = {
  stories: Story[];
  feedback: Feedback[];
  metrics: WritingMetric[];
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  let d: T & { error?: string };
  try {
    d = await r.json();
  } catch {
    // Not JSON (e.g. an edge error page): never hand undefined fields to the UI.
    throw new Error(FALLBACK);
  }
  if (!r.ok) throw new Error(d.error || FALLBACK);
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

function del<T = { ok: true }>(url: string) {
  return request<T>(url, { method: "DELETE" });
}

// One anonymous session per page load, shared by every caller; replaces the
// old `ready` flag. Reset after a failure or after erasing all data.
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
  await del(`/api/me/stories/${encodeURIComponent(id)}`);
}

export async function eraseMyData() {
  await del("/api/me");
  sessionPromise = null;
}

export async function sendFeedback(story: string, kind: FeedbackKind, note = "") {
  await ensureSession();
  await post("/api/feedback", { story, kind, note });
}

export async function getAdminQueue() {
  const d = await request<Partial<AdminQueue>>("/api/admin/queue");
  return { stories: d.stories ?? [], feedback: d.feedback ?? [], metrics: d.metrics ?? [] };
}

export async function moderateStory(id: string, status: ModerationAction) {
  await post(`/api/admin/stories/${encodeURIComponent(id)}/moderation`, { status });
}
