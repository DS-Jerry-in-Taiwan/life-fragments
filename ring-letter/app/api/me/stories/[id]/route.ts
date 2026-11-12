import { deleteFeedbackForStory } from "../../../../../lib/server/db/feedback";
import { db } from "../../../../../lib/server/db/index";
import { deleteOwnStory, ownsStory } from "../../../../../lib/server/db/stories";
import { guardWrite, type IdContext, withSession } from "../../../../../lib/server/handler";
import { reply } from "../../../../../lib/server/http";
import { parseStoryId } from "../../../../../lib/server/validation";

/** Withdraws one of this browser's stories (and the feedback on it). */
export async function DELETE(req: Request, { params }: IdContext) {
  return guardWrite(req, () =>
    withSession(req, async (who) => {
      const v = parseStoryId((await params).id);
      if (!v.ok) return reply({ error: v.error }, 400);
      const id = v.data;
      if (!(await ownsStory(id, who))) return reply({ error: "找不到屬於這個瀏覽器的片段。" }, 404);
      await db().batch([deleteOwnStory(id, who), deleteFeedbackForStory(id)]);
      return reply({ ok: true });
    }),
  );
}
