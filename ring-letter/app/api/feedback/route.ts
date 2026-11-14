import { insertFeedback } from "../../../lib/server/db/feedback";
import { isApprovedStory } from "../../../lib/server/db/stories";
import { guardWrite, withBodyTurnstileAndSession } from "../../../lib/server/handler";
import { reply } from "../../../lib/server/http";
import { overDailyLimit } from "../../../lib/server/rate-limit";
import { parseFeedback } from "../../../lib/server/validation";

export async function POST(req: Request) {
  return guardWrite(req, () =>
    withBodyTurnstileAndSession(req, "feedback", async (b, who) => {
      const v = parseFeedback(b);
      if (!v.ok) return reply({ error: v.error }, 400);
      const { story, kind, note } = v.data;
      // Only a live approved story (the /archive demo stories are gone, V5-a).
      if (!(await isApprovedStory(story, Date.now())))
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
    }),
  );
}
