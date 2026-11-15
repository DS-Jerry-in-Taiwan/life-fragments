// Unit tests for the admin page's list reconciliation (components/admin/reconcile.ts)
// and the story revision token (lib/server/cursor.ts). Run with `npm run test:admin`
// (Node >= 22.18 strips the TypeScript types natively).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  afterBatchRefetch,
  afterRefusal,
  batchError,
  CHANGED,
  isRefusal,
  movedBatchNotice,
  planBatch,
  stillListed,
} from '../components/admin/reconcile.ts';
import { decodeRevision, encodeCursor, encodeRevision } from '../lib/server/cursor.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 15);
const NO_FILTER = { status: 'pending', reshare: false, consent: '', expiring: '', q: '', from: '', to: '', id: '' };
const story = (id, patch = {}) => ({
  id, title: '標題' + id, body: '內文', era: '2020', source: 'recollection', status: 'pending', created: NOW - DAY,
  revision: 'r-' + id, shareRequests: 0, consentEvents: 1, consent: 'v3-2026-11-12:adult,privacy,share',
  terms: 'v3', expiresAt: NOW + 29 * DAY, feedbackCount: 0, ...patch,
});
const ok = (v) => ({ status: 'fulfilled', value: v });
const fail = () => ({ status: 'rejected', reason: new Error('network') });

test('stillListed: status, reshare, consent and expiring are checked; all lists every status', () => {
  const s = story('a', { status: 'rejected' });
  assert.equal(stillListed(s, NO_FILTER, NOW), false);
  assert.equal(stillListed(s, { ...NO_FILTER, status: 'rejected' }, NOW), true);
  assert.equal(stillListed(s, { ...NO_FILTER, status: 'all' }, NOW), true);
  assert.equal(stillListed(s, { ...NO_FILTER, status: 'all', reshare: true }, NOW), false);
  assert.equal(stillListed({ ...s, shareRequests: 1 }, { ...NO_FILTER, status: 'all', reshare: true }, NOW), true);
  assert.equal(stillListed(s, { ...NO_FILTER, status: 'all', consent: 'v2' }, NOW), false);
  assert.equal(stillListed(s, { ...NO_FILTER, status: 'all', consent: 'v3' }, NOW), true);
  // Expiring within 7 days: a story that now expires in 29 days, or never, leaves.
  assert.equal(stillListed(s, { ...NO_FILTER, status: 'all', expiring: '7' }, NOW), false);
  assert.equal(stillListed({ ...s, expiresAt: null }, { ...NO_FILTER, status: 'all', expiring: '7' }, NOW), false);
  assert.equal(stillListed({ ...s, expiresAt: NOW + 7 * DAY }, { ...NO_FILTER, status: 'all', expiring: '7' }, NOW), true);
  // q, dates and id can't change with a decision: not checked.
  assert.equal(stillListed(s, { ...NO_FILTER, status: 'all', q: '不在內文', from: '2030-01-01', id: 'x' }, NOW), true);
});

test('single decision refused: 409 and 400 only; gone leaves, 409 replaces with a note, 400 rethrows', () => {
  assert.deepEqual([400, 401, 403, 404, 409, 503].map(isRefusal), [true, false, false, false, true, false]);
  assert.deepEqual(afterRefusal('甲', 409, null), {
    kind: 'remove', notice: '《甲》已不在系統中（可能已過期或被刪除），已從清單移除。',
  });
  assert.equal(afterRefusal('甲', 400, null).kind, 'remove');
  const now = story('a', { status: 'private' });
  assert.deepEqual(afterRefusal('甲', 409, now), { kind: 'replace', story: now, note: CHANGED, notice: CHANGED });
  assert.equal(CHANGED, '這篇剛剛改變了，請再看一次。');
  assert.deepEqual(afterRefusal('甲', 400, now), { kind: 'rethrow' });
});

test('batchError: known reasons, and a fallback for unknown or missing ones', () => {
  assert.deepEqual(batchError({ id: 'a', ok: false, error: 'conflict' }), { note: '未處理：這篇剛剛改變了，請再看一次。', count: '剛剛改變了' });
  assert.deepEqual(batchError({ id: 'a', ok: false, error: 'not_allowed' }), { note: '未處理：這個狀態不能不通過。', count: '這個狀態不能不通過' });
  assert.deepEqual(batchError({ id: 'a', ok: false, error: 'missing' }), { note: '未處理：已不存在。', count: '已不存在' });
  for (const error of [undefined, 'new_reason'])
    assert.deepEqual(batchError({ id: 'a', ok: false, error }), { note: '未處理，請再看一次。', count: '原因不明' });
});

const mixed = [
  { id: 'a', ok: true }, { id: 'b', ok: false, error: 'conflict' }, { id: 'c', ok: true },
  { id: 'd', ok: false, error: 'missing' }, { id: 'e', ok: false, error: 'missing' }, { id: 'f', ok: false },
];

test('planBatch: delete removes the done ones and refetches only the refused ones', () => {
  const plan = planBatch('delete', mixed, 'all');
  assert.deepEqual(plan.done, ['a', 'c']);
  assert.deepEqual(plan.failed.map((r) => r.id), ['b', 'd', 'e', 'f']);
  assert.deepEqual(plan.remove, ['a', 'c']);
  assert.deepEqual(plan.ticked, ['b', 'd', 'e', 'f']);
  assert.deepEqual(plan.refetch, ['b', 'd', 'e', 'f']);
  assert.deepEqual(plan.notes, {
    b: '未處理：這篇剛剛改變了，請再看一次。', d: '未處理：已不存在。', e: '未處理：已不存在。', f: '未處理，請再看一次。',
  });
  assert.equal(plan.summary, '已永久刪除 2 篇；4 篇未處理（1 篇剛剛改變了、2 篇已不存在、1 篇原因不明）');
});

test('planBatch: rejected leave a list that can not show them, and are refetched on one that can', () => {
  for (const listStatus of ['pending', 'approved', 'private']) {
    const plan = planBatch('rejected', mixed, listStatus);
    assert.deepEqual(plan.remove, ['a', 'c'], listStatus);
    assert.deepEqual(plan.refetch, ['b', 'd', 'e', 'f'], listStatus);
  }
  for (const listStatus of ['rejected', 'all']) {
    const plan = planBatch('rejected', mixed, listStatus);
    assert.deepEqual(plan.remove, [], listStatus);
    assert.deepEqual(plan.refetch, ['a', 'c', 'b', 'd', 'e', 'f'], listStatus);
  }
  const all = planBatch('rejected', [{ id: 'a', ok: true }, { id: 'b', ok: true }], 'pending');
  assert.equal(all.summary, '已不通過或下架 2 篇');
  assert.deepEqual([all.ticked, all.refetch, all.notes], [[], [], {}]);
});

test('movedBatchNotice: counts only, and says the list was reloaded', () => {
  assert.equal(movedBatchNotice('delete', mixed), '已永久刪除 2 篇；4 篇未處理。清單已依目前的篩選重新載入。');
  assert.equal(movedBatchNotice('rejected', [{ id: 'a', ok: true }]), '已不通過或下架 1 篇。清單已依目前的篩選重新載入。');
});

test('afterBatchRefetch: refused stay, decided stay only while the filters match, gone leave', () => {
  const filter = { ...NO_FILTER, status: 'rejected' };
  const plan = planBatch('rejected', [
    { id: 'a', ok: true }, { id: 'b', ok: true }, { id: 'c', ok: false, error: 'conflict' }, { id: 'd', ok: false, error: 'missing' },
  ], 'rejected');
  assert.deepEqual(plan.refetch, ['a', 'b', 'c', 'd']);
  const a = story('a', { status: 'rejected' });
  const c = story('c', { status: 'private' }); // refused: stays to show why, whatever its status
  const out = afterBatchRefetch(plan, [ok(a), ok(null), ok(c), ok(null)], filter, NOW);
  assert.deepEqual(out.replace, [a, c]);
  assert.deepEqual(out.remove, ['b', 'd']);
  assert.deepEqual(out.notes, {});
  assert.equal(out.notice, '已不通過或下架 2 篇；2 篇未處理（1 篇剛剛改變了、1 篇已不存在），其中 1 篇已從清單移除。');

  // A decided story the other filters no longer match leaves (expiring here).
  const exp = afterBatchRefetch(plan, [ok(a), ok(null), ok(c), ok(null)], { ...filter, expiring: '7' }, NOW);
  assert.deepEqual(exp.remove, ['a', 'b', 'd']);
  assert.deepEqual(exp.replace, [c]);
});

test('afterBatchRefetch: every refused one gone, and failed fetches keep the card with a note', () => {
  const plan = planBatch('delete', [{ id: 'a', ok: true }, { id: 'b', ok: false, error: 'missing' }], 'pending');
  const gone = afterBatchRefetch(plan, [ok(null)], NO_FILTER, NOW);
  assert.deepEqual(gone.remove, ['b']);
  assert.equal(gone.notice, '已永久刪除 1 篇；1 篇未處理（1 篇已不存在），已從清單移除。');

  const r = planBatch('rejected', [{ id: 'a', ok: true }, { id: 'b', ok: false, error: 'conflict' }], 'all');
  const stale = afterBatchRefetch(r, [fail(), fail()], { ...NO_FILTER, status: 'all' }, NOW);
  assert.deepEqual([stale.replace, stale.remove], [[], []]);
  assert.deepEqual(stale.notes, {
    a: '（未能重新載入這篇，請按「重新整理」。）',
    b: '未處理：這篇剛剛改變了，請再看一次。（未能重新載入這篇，請按「重新整理」。）',
  });
  assert.equal(stale.notice, '已不通過或下架 1 篇；1 篇未處理（1 篇剛剛改變了）；2 篇未能重新載入，請按「重新整理」。');
});

test('revision: round trip, and anything else is refused', () => {
  const rev = encodeRevision({ statusAt: 1763164800000, consentEvents: 3 });
  assert.match(rev, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeRevision(rev), { statusAt: 1763164800000, consentEvents: 3 });
  // The same millisecond with one more consent event is another revision.
  assert.notEqual(encodeRevision({ statusAt: 1763164800000, consentEvents: 4 }), rev);
  for (const bad of ['', 'not base64!', rev + '=', encodeCursor([1]), encodeCursor([1, 2, 3]), encodeCursor([-1, 0]),
    encodeCursor([1.5, 0]), encodeCursor([1, -1]), encodeCursor(['1', 0]), encodeCursor([1, null]), encodeCursor({ statusAt: 1, consentEvents: 0 }),
    encodeCursor([Number.MAX_SAFE_INTEGER + 1, 0])])
    assert.equal(decodeRevision(bad), undefined, bad);
});
