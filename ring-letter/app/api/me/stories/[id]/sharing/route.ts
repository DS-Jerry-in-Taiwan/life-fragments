import {
  CONSENT_VERSION,
  consentString,
  consentVersionOf,
  MAX_SHARE_REQUESTS,
} from "../../../../../../lib/consent";
import { insertSharingEvent } from "../../../../../../lib/server/db/consent-events";
import { AGE, db } from "../../../../../../lib/server/db/index";
import { findOwnStoryForSharing, setSharing } from "../../../../../../lib/server/db/stories";
import {
  guardWrite,
  type IdContext,
  withBodyAndSession,
} from "../../../../../../lib/server/handler";
import { reply } from "../../../../../../lib/server/http";
import { overDailyLimit } from "../../../../../../lib/server/rate-limit";
import { parseSharing, parseStoryId } from "../../../../../../lib/server/validation";

/** Which statuses each direction may start from (#4 §6.1). */
const SHARE_FROM = ["private", "rejected"];
const STOP_FROM = ["pending", "approved"];

/**
 * The author changes a story's sharing (#4 §6.1); the text is never touched.
 * - `{share: true, consent: {adult, privacy, share: true}}`: private or
 *   rejected → pending, under the current consent version (a story submitted
 *   under older terms moves onto the current ones); always reviewed again.
 *   At most MAX_SHARE_REQUESTS times per story (409 after that).
 * - `{share: false}`: pending or approved → private, at once (an approved
 *   story leaves the public list); the consent version is kept.
 * Anything else is 409. Each change writes a consent event and counts
 * towards the per-session daily limit (429).
 */
export async function PATCH(req: Request, { params }: IdContext) {
  return guardWrite(req, () =>
    withBodyAndSession(req, async (b, who) => {
      const idCheck = parseStoryId((await params).id);
      if (!idCheck.ok) return reply({ error: idCheck.error }, 400);
      const id = idCheck.data;
      const v = parseSharing(b);
      if (!v.ok) return reply({ error: v.error }, 400);
      const { share } = v.data;
      const now = Date.now();
      const story = await findOwnStoryForSharing(id, who, now - AGE);
      if (!story) return reply({ error: "找不到屬於這個瀏覽器的片段。" }, 404);

      if (share && !SHARE_FROM.includes(story.status))
        return reply(
          {
            error:
              story.status === "pending"
                ? "這篇已在等待審閱。"
                : "這篇已經公開分享，不需要再申請。",
          },
          409,
        );
      if (!share && !STOP_FROM.includes(story.status))
        return reply({ error: "這篇目前沒有分享，不需要停止。" }, 409);
      if (share && story.shareRequests >= MAX_SHARE_REQUESTS)
        return reply(
          {
            error: `這篇已申請分享 ${MAX_SHARE_REQUESTS} 次，已達上限，無法再申請；仍可保持不公開，或撤回刪除。`,
          },
          409,
        );
      if (await overDailyLimit("sharing", who, now))
        return reply({ error: "今天已調整十次分享設定，明天再來。" }, 429);

      const version = share ? CONSENT_VERSION : consentVersionOf(story.consent);
      const to = share ? "pending" : "private";
      const [, update] = await db().batch([
        insertSharingEvent(id, who, story, share ? "share" : "unshare", version, now),
        setSharing(id, who, story, to, consentString(version, share), now),
      ]);
      if (!update.meta.changes)
        return reply({ error: "這篇的狀態剛剛改變了，請重新整理後再試。" }, 409);
      const shareRequests = story.shareRequests + (share ? 1 : 0);
      return reply({
        ok: true,
        status: to,
        shareRequestsLeft: Math.max(0, MAX_SHARE_REQUESTS - shareRequests),
      });
    }),
  );
}
