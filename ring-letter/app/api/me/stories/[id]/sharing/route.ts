import { MAX_SHARE_REQUESTS } from "../../../../../../lib/consent";
import { changeSharing, type SharingRefusal } from "../../../../../../lib/server/db/stories";
import {
  guardWrite,
  type IdContext,
  withBodyAndSession,
} from "../../../../../../lib/server/handler";
import { reply } from "../../../../../../lib/server/http";
import { overDailyLimit } from "../../../../../../lib/server/rate-limit";
import { parseSharing, parseStoryId } from "../../../../../../lib/server/validation";

const REFUSED: Record<SharingRefusal, [number, string]> = {
  missing: [404, "找不到屬於這個瀏覽器的片段。"],
  pending: [409, "這篇已在等待審閱。"],
  public: [409, "這篇已經公開分享，不需要再申請。"],
  not_shared: [409, "這篇目前沒有分享，不需要停止。"],
  cap: [
    409,
    `這篇已申請分享 ${MAX_SHARE_REQUESTS} 次，已達上限，無法再申請；仍可保持不公開，或撤回刪除。`,
  ],
  limit: [429, "今天已調整十次分享設定，明天再來。"],
  stale: [409, "這篇的狀態剛剛改變了，請重新整理後再試。"],
};

/**
 * The author changes a story's sharing (#4 §6.1; lib/server/db/stories.ts
 * changeSharing()); the text is never touched.
 * - `{share: true, consent: {adult, privacy, share: true}}`: private or
 *   rejected → pending, under the current consent version; always reviewed
 *   again. At most MAX_SHARE_REQUESTS times per story (409 after that).
 * - `{share: false}`: pending or approved → private, at once; the consent
 *   version is kept.
 * Anything else is 409. Each change writes a consent event and counts
 * towards the per-session daily limit (429).
 */
export async function PATCH(req: Request, { params }: IdContext) {
  return guardWrite(req, () =>
    withBodyAndSession(req, async (b, who) => {
      const idCheck = parseStoryId((await params).id);
      if (!idCheck.ok) return reply({ error: idCheck.error }, 400);
      const v = parseSharing(b);
      if (!v.ok) return reply({ error: v.error }, 400);
      const now = Date.now();
      const result = await changeSharing(idCheck.data, who, v.data.share, now, () =>
        overDailyLimit("sharing", who, now),
      );
      if (!result.ok) {
        const [status, error] = REFUSED[result.reason];
        return reply({ error }, status);
      }
      return reply(result);
    }),
  );
}
