import { insertFeedback } from "../../../lib/server/db/feedback";
import { isApprovedStory } from "../../../lib/server/db/stories";
import { guardWrite, withBodyAndSession } from "../../../lib/server/handler";
import { reply } from "../../../lib/server/http";
import { overDailyLimit } from "../../../lib/server/rate-limit";
import { parseFeedback } from "../../../lib/server/validation";

/** Built-in sample stories in the reading view that accept feedback. */
const DEMO_STORIES = ["demo-1", "demo-2", "demo-3"];

export async function POST(req: Request) {
  return guardWrite(req, () =>
    withBodyAndSession(req, async (b, who) => {
      const v = parseFeedback(b);
      if (!v.ok) return reply({ error: v.error }, 400);
      const { story, kind, note } = v.data;
      if (!DEMO_STORIES.includes(story) && !(await isApprovedStory(story)))
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
