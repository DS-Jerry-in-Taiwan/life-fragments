import { completeAttempt, findAttempt } from "../../../../lib/server/db/attempts";
import { insertConsentEvent } from "../../../../lib/server/db/consent-events";
import { AGE, db } from "../../../../lib/server/db/index";
import { CONSENT_VERSION, insertStory, listOwnStories } from "../../../../lib/server/db/stories";
import { guardRead, guardWrite, withBodyTurnstileAndSession } from "../../../../lib/server/handler";
import { reply } from "../../../../lib/server/http";
import { overDailyLimit } from "../../../../lib/server/rate-limit";
import { currentSession } from "../../../../lib/server/session";
import { parseSubmit } from "../../../../lib/server/validation";

/** This browser's own stories; an empty list without a live session. */
export async function GET(req: Request) {
  return guardRead(async () => {
    const who = await currentSession(req);
    return reply({ stories: who ? await listOwnStories(who, Date.now() - AGE) : [] });
  });
}

/** Submits a letter: pending when shared, private otherwise. */
export async function POST(req: Request) {
  return guardWrite(req, () =>
    withBodyTurnstileAndSession(req, "submit", async (b, who) => {
      const now = Date.now();
      const v = parseSubmit(b, now);
      if (!v.ok) return reply({ error: v.error }, 400);
      const s = v.data;
      if (s.attempt !== null) {
        const row = await findAttempt(s.attempt, who, s.type, now - AGE);
        // code "attempt": the write form starts a new attempt and keeps the letter.
        if (!row) return reply({ error: "試寫階段已過期，請重新選擇寫法。", code: "attempt" }, 400);
        if (row.completed !== null)
          return reply({ error: "這封信已送出，請到我的片段查看。" }, 409);
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
      const consent = insertConsentEvent(id, "submit", CONSENT_VERSION, now);
      await db().batch(
        s.attempt !== null
          ? [insert, consent, completeAttempt(s.attempt, who, now, s.share)]
          : [insert, consent],
      );
      return reply({ ok: true, id, status });
    }),
  );
}
