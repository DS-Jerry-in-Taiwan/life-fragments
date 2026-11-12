import { env } from "cloudflare:workers";
import { verifyAdmin } from "../../../lib/server/auth";
import { attemptMetrics } from "../../../lib/server/db/attempts";
import { deleteFeedbackForStory, listFeedback } from "../../../lib/server/db/feedback";
import { AGE, db } from "../../../lib/server/db/index";
import { deleteStory, listAllStories, moderateStory } from "../../../lib/server/db/stories";
import { readJsonBody, reply } from "../../../lib/server/http";
import { sameOrigin } from "../../../lib/server/same-origin";
import { parseModeration } from "../../../lib/server/validation";

// Protected by Cloudflare Access (/api/admin*) in production; verifyAdmin
// re-checks the Access token and the ADMIN_EMAILS allowlist.
const FORBIDDEN = "只有管理者可以使用。";

export async function GET(req: Request) {
  try {
    if (!(await verifyAdmin(req, env))) return reply({ error: FORBIDDEN }, 403);
    const cutoff = Date.now() - AGE;
    const [stories, feedback, metrics] = await db().batch([
      listAllStories(cutoff),
      listFeedback(cutoff),
      attemptMetrics(cutoff),
    ]);
    return reply({
      stories: stories.results,
      feedback: feedback.results,
      metrics: metrics.results,
    });
  } catch {
    return reply({ error: "暫時無法讀取資料，請稍後再試。" }, 503);
  }
}

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return reply({ error: "來源驗證失敗" }, 403);
    if (!(await verifyAdmin(req, env))) return reply({ error: FORBIDDEN }, 403);
    const parsed = await readJsonBody(req, 4000);
    if (!parsed.ok) return parsed.response;
    const v = parseModeration(parsed.body);
    if (!v.ok) return reply({ error: v.error }, 400);
    const { id, status } = v.data;
    if (status === "delete") {
      await db().batch([deleteStory(id), deleteFeedbackForStory(id)]);
    } else if (!(await moderateStory(id, status))) {
      return reply({ error: "文章不存在，或作者未同意分享" }, 400);
    }
    return reply({ ok: true });
  } catch {
    return reply({ error: "這次沒有成功儲存，請稍後重試。" }, 503);
  }
}
