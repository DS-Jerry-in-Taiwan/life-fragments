// The only place the frontend talks to the API (#4 §4.5). Components call
// these functions; when the API moves to REST routes (V2) only this file
// changes.
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
  const d = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(d.error || FALLBACK);
  return d;
}

function post<T = { ok: true }>(url: string, data: object) {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

const letter = (action: string, data: object = {}) => post("/api/letter", { action, ...data });

// One anonymous session per page load, shared by every caller; replaces the
// old `ready` flag. Reset after a failure or after erasing all data.
let sessionPromise: Promise<unknown> | null = null;
function ensureSession() {
  sessionPromise ??= letter("session").catch((e) => {
    sessionPromise = null;
    throw e;
  });
  return sessionPromise;
}

export async function listApprovedStories() {
  return (await request<{ stories: Story[] }>("/api/letter")).stories;
}

export async function listMyStories() {
  return (await request<{ stories: Story[] }>("/api/letter?action=mine")).stories;
}

/** Records that the author started writing; returns the attempt id. */
export async function startWriting(letterType: LetterType) {
  await ensureSession();
  const id = crypto.randomUUID();
  await letter("start", { id, letterType });
  return id;
}

export async function submitLetter(input: SubmitInput) {
  await ensureSession();
  await letter("submit", input);
}

export async function withdrawStory(id: string) {
  await letter("withdraw", { id });
}

export async function eraseMyData() {
  await letter("erase");
  sessionPromise = null;
}

export async function sendFeedback(story: string, kind: FeedbackKind, note = "") {
  await ensureSession();
  await letter("feedback", { story, kind, note });
}

export async function getAdminQueue() {
  const d = await request<Partial<AdminQueue>>("/api/admin");
  return { stories: d.stories ?? [], feedback: d.feedback ?? [], metrics: d.metrics ?? [] };
}

export async function moderateStory(id: string, status: ModerationAction) {
  await post("/api/admin", { id, status });
}
