import {
  completeAttempt,
  deleteAttemptsByOwner,
  findAttempt,
  insertAttempt,
} from "../../../lib/server/db/attempts";
import {
  deleteFeedbackByOrForOwner,
  deleteFeedbackForStory,
  insertFeedback,
} from "../../../lib/server/db/feedback";
import { AGE, db, purgeExpired } from "../../../lib/server/db/index";
import { deleteSession } from "../../../lib/server/db/sessions";
import {
  CONSENT_VERSION,
  deleteOwnStory,
  deleteStoriesByOwner,
  insertStory,
  isApprovedStory,
  listApprovedStories,
  listOwnStories,
  ownsStory,
} from "../../../lib/server/db/stories";
import { readJsonBody, reply } from "../../../lib/server/http";
import { overDailyLimit } from "../../../lib/server/rate-limit";
import { sameOrigin } from "../../../lib/server/same-origin";
import { CLEAR_SESSION_COOKIE, createSession, currentSession } from "../../../lib/server/session";
import {
  jsonObject,
  parseFeedback,
  parseStart,
  parseSubmit,
  parseWithdraw,
} from "../../../lib/server/validation";

// Public + anonymous-session API, dispatched on `action`.
// GET: (none) approved stories, `mine`. POST: session / start / submit /
// withdraw / erase / feedback.

type Body = Record<string, unknown>;

const MOVED = "管理功能已移到 /admin。";
/** Built-in sample stories in the reading view that accept feedback. */
const DEMO_STORIES = ["demo-1", "demo-2", "demo-3"];

export async function GET(req: Request) {
  try {
    const action = new URL(req.url).searchParams.get("action");
    const who = await currentSession(req);
    const cutoff = Date.now() - AGE;
    if (action === "admin") return reply({ error: MOVED }, 410);
    if (action === "mine") return reply({ stories: who ? await listOwnStories(who, cutoff) : [] });
    return reply({ stories: await listApprovedStories(cutoff) });
  } catch {
    return reply({ error: "暫時無法讀取資料，請稍後再試。" }, 503);
  }
}

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return reply({ error: "來源驗證失敗" }, 403);
    const parsed = await readJsonBody(req, 12000);
    if (!parsed.ok) return parsed.response;
    const envelope = jsonObject.safeParse(parsed.body);
    if (!envelope.success) return reply({ error: "格式不正確" }, 400);
    const b = envelope.data;

    if (b.action === "session") return await startSession(req);
    if (b.action === "moderate") return reply({ error: MOVED }, 410);
    const who = await currentSession(req);
    if (!who) return reply({ error: "體驗工作階段已過期，請重新整理頁面。" }, 401);
    switch (b.action) {
      case "start":
        return await start(b, who);
      case "submit":
        return await submit(b, who);
      case "withdraw":
        return await withdraw(b, who);
      case "erase":
        return await erase(who);
      case "feedback":
        return await feedback(b, who);
      default:
        return reply({ error: "不支援的操作" }, 400);
    }
  } catch {
    return reply({ error: "這次沒有成功儲存，請保留文字並稍後重試。" }, 503);
  }
}

/** Reuses a live session; otherwise purges expired rows and issues a new one. */
async function startSession(req: Request) {
  if (await currentSession(req)) return reply({ ok: true });
  await purgeExpired();
  return reply({ ok: true }, 200, { "Set-Cookie": await createSession(req) });
}

async function start(b: Body, who: string) {
  const v = parseStart(b);
  if (!v.ok) return reply({ error: v.error }, 400);
  if (await overDailyLimit("attempts", who))
    return reply({ error: "今天已開始多次試寫，請明天再試。" }, 429);
  await insertAttempt(v.data.id, who, v.data.letterType, Date.now());
  return reply({ ok: true });
}

async function submit(b: Body, who: string) {
  const now = Date.now();
  const v = parseSubmit(b, now);
  if (!v.ok) return reply({ error: v.error }, 400);
  const s = v.data;
  if (s.attempt !== null) {
    const row = await findAttempt(s.attempt, who, s.type, now - AGE);
    if (!row) return reply({ error: "試寫階段已過期，請重新選擇寫法。" }, 400);
    if (row.completed !== null) return reply({ error: "這封信已送出，請到我的片段查看。" }, 409);
  }
  if (await overDailyLimit("stories", who, now))
    return reply({ error: "今天已留下五篇，讓文字休息一下，明天再來。" }, 429);

  const id = crypto.randomUUID();
  const status = s.share ? "pending" : "private";
  const insert = insertStory({
    id,
    owner: who,
    title: s.title,
    body: s.body,
    era: s.era,
    source: s.source,
    status,
    consent: `${CONSENT_VERSION}:adult,privacy,${s.share ? "share" : "private"}`,
    created: now,
    letterType: s.type,
    mood: s.mood,
    reflection: s.reflection,
    attempt: s.attempt,
  });
  await db().batch(
    s.attempt !== null ? [insert, completeAttempt(s.attempt, who, now, s.share)] : [insert],
  );
  return reply({ ok: true, id, status });
}

async function withdraw(b: Body, who: string) {
  const v = parseWithdraw(b);
  if (!v.ok) return reply({ error: v.error }, 400);
  const { id } = v.data;
  if (!(await ownsStory(id, who))) return reply({ error: "找不到屬於這個瀏覽器的片段。" }, 404);
  await db().batch([deleteOwnStory(id, who), deleteFeedbackForStory(id)]);
  return reply({ ok: true });
}

/** Deletes everything this session wrote, then the session itself. */
async function erase(who: string) {
  await db().batch([
    deleteFeedbackByOrForOwner(who),
    deleteStoriesByOwner(who),
    deleteAttemptsByOwner(who),
    deleteSession(who),
  ]);
  return reply({ ok: true }, 200, { "Set-Cookie": CLEAR_SESSION_COOKIE });
}

async function feedback(b: Body, who: string) {
  const v = parseFeedback(b);
  if (!v.ok) return reply({ error: v.error }, 400);
  const { story, kind, note } = v.data;
  if (!DEMO_STORIES.includes(story) && !(await isApprovedStory(story, Date.now() - AGE)))
    return reply({ error: "這篇故事已不再提供。" }, 404);
  if (await overDailyLimit("feedback", who))
    return reply({ error: "今日回饋已足夠，謝謝你。" }, 429);
  await insertFeedback({
    id: crypto.randomUUID(),
    owner: who,
    story,
    kind,
    note: note.trim(),
    created: Date.now(),
  });
  return reply({ ok: true });
}
