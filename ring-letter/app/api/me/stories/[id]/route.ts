import { withdrawStory } from "../../../../../lib/server/db/stories";
import { guardWrite, type IdContext, withSession } from "../../../../../lib/server/handler";
import { reply } from "../../../../../lib/server/http";
import { parseStoryId } from "../../../../../lib/server/validation";

/** Withdraws one of this browser's stories (with its feedback and consent history). */
export async function DELETE(req: Request, { params }: IdContext) {
  return guardWrite(req, () =>
    withSession(req, async (who) => {
      const v = parseStoryId((await params).id);
      if (!v.ok) return reply({ error: v.error }, 400);
      if (!(await withdrawStory(v.data, who, Date.now())))
        return reply({ error: "找不到屬於這個瀏覽器的片段。" }, 404);
      return reply({ ok: true });
    }),
  );
}
