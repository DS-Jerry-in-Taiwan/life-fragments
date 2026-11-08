import { env } from 'cloudflare:workers';
import { verifyAdmin } from '../../../lib/admin';
import { AGE, db, reply, sameOrigin } from '../../../lib/server';

// Protected by Cloudflare Access (/api/admin*) in production; verifyAdmin
// re-checks the Access token and the ADMIN_EMAILS allowlist.
const FORBIDDEN = '只有管理者可以使用。';

export async function GET(req: Request) {
  try {
    if (!(await verifyAdmin(req, env))) return reply({ error: FORBIDDEN }, 403);
    const cutoff = Date.now() - AGE;
    const s = await db().prepare('SELECT id,title,body,era,source,status,created,letter_type AS letterType,mood,reflection FROM stories WHERE created>? ORDER BY created DESC LIMIT 200').bind(cutoff).all();
    const f = await db().prepare('SELECT id,story,kind,note,created FROM feedback WHERE created>? ORDER BY created DESC LIMIT 300').bind(cutoff).all();
    const metrics = await db().prepare('SELECT letter_type AS letterType, COUNT(*) AS starts, SUM(CASE WHEN completed IS NOT NULL THEN 1 ELSE 0 END) AS completions, SUM(shared) AS shares FROM writing_attempts WHERE created>? GROUP BY letter_type').bind(cutoff).all();
    return reply({ stories: s.results, feedback: f.results, metrics: metrics.results });
  } catch {
    return reply({ error: '暫時無法讀取資料，請稍後再試。' }, 503);
  }
}

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return reply({ error: '來源驗證失敗' }, 403);
    if (!(await verifyAdmin(req, env))) return reply({ error: FORBIDDEN }, 403);
    if (!req.headers.get('content-type')?.includes('application/json')) return reply({ error: '格式不支援' }, 415);
    let b: { id?: unknown; status?: unknown };
    try { b = await req.json(); } catch { return reply({ error: '格式不正確' }, 400); }
    if (!b || typeof b !== 'object' || typeof b.id !== 'string' || typeof b.status !== 'string' || !['approved', 'rejected', 'delete'].includes(b.status)) return reply({ error: '無效操作' }, 400);
    if (b.status === 'delete') {
      await db().batch([db().prepare('DELETE FROM stories WHERE id=?').bind(b.id), db().prepare('DELETE FROM feedback WHERE story=?').bind(b.id)]);
    } else {
      const r = await db().prepare("UPDATE stories SET status=? WHERE id=? AND status IN ('pending','approved','rejected')").bind(b.status, b.id).run();
      if (!r.meta.changes) return reply({ error: '文章不存在，或作者未同意分享' }, 400);
    }
    return reply({ ok: true });
  } catch {
    return reply({ error: '這次沒有成功儲存，請稍後重試。' }, 503);
  }
}
