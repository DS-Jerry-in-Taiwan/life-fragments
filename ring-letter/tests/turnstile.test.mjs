// Unit tests for lib/server/turnstile-siteverify.ts (#4 §5.1). Run with
// `npm run test:turnstile` (Node >= 22.18 strips the TypeScript types natively).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkTurnstile, productionTurnstileConfig, SITEVERIFY_URL,
  TURNSTILE_FAILED, TURNSTILE_MISSING, TURNSTILE_UNAVAILABLE,
} from '../lib/server/turnstile-siteverify.ts';

const config = { secret: 'secret-key', hostname: 'ringletter.wetrytrysee.cc' };
const good = { success: true, 'error-codes': [], challenge_ts: '2026-11-14T00:00:00.000Z', hostname: 'ringletter.wetrytrysee.cc', action: 'submit', cdata: '' };

/** A mock fetch answering `answer` (object → JSON, function → called); records each call. */
function mock(answer) {
  const f = async (url, init) => {
    f.calls.push({ url, init, form: Object.fromEntries(init.body) });
    if (typeof answer === 'function') return answer(init);
    return Response.json(answer);
  };
  f.calls = [];
  return f;
}
const check = (fetcher, { token = 'tok', action = 'submit', cfg = config, ip = '203.0.113.7', timeoutMs } = {}) =>
  checkTurnstile(token, action, cfg, ip, { fetcher, timeoutMs });

const FAILED = { ok: false, status: 403, error: TURNSTILE_FAILED };
const UNAVAILABLE = { ok: false, status: 503, error: TURNSTILE_UNAVAILABLE };

test('passes a valid token and sends secret, response, remoteip and an idempotency key', async () => {
  const f = mock(good);
  assert.deepEqual(await check(f), { ok: true });
  assert.equal(f.calls.length, 1);
  const { url, init, form } = f.calls[0];
  assert.equal(url, SITEVERIFY_URL);
  assert.equal(init.method, 'POST');
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(form.secret, 'secret-key');
  assert.equal(form.response, 'tok');
  assert.equal(form.remoteip, '203.0.113.7');
  assert.match(form.idempotency_key, /^[0-9a-f-]{36}$/);
  await check(f);
  assert.notEqual(f.calls[1].form.idempotency_key, form.idempotency_key, 'a new key per request');
});

test('omits remoteip without CF-Connecting-IP; matches the hostname case-insensitively', async () => {
  const f = mock({ ...good, hostname: 'RingLetter.WeTryTrySee.cc' });
  assert.deepEqual(await check(f, { ip: null }), { ok: true });
  assert.equal('remoteip' in f.calls[0].form, false);
});

test('a missing or blank token is 403 without calling siteverify', async () => {
  const f = mock(good);
  for (const token of [null, '', '   '])
    assert.deepEqual(await check(f, { token }), { ok: false, status: 403, error: TURNSTILE_MISSING });
  assert.equal(f.calls.length, 0);
});

test('success:false is 403', async () => {
  assert.deepEqual(await check(mock({ success: false, 'error-codes': ['invalid-input-response'] })), FAILED);
});

test('an expired or already used token (timeout-or-duplicate) is 403', async () => {
  assert.deepEqual(await check(mock({ success: false, 'error-codes': ['timeout-or-duplicate'] })), FAILED);
});

test('success:false for a service or configuration problem is 503, not the visitor\'s fault', async () => {
  for (const code of ['internal-error', 'invalid-input-secret', 'missing-input-secret', 'bad-request'])
    assert.deepEqual(await check(mock({ success: false, 'error-codes': [code] })), UNAVAILABLE, code);
  assert.deepEqual(await check(mock({ success: false, 'error-codes': ['something-new'] })), FAILED, 'unknown codes stay 403');
});

test('another action is 403, even with success:true', async () => {
  assert.deepEqual(await check(mock(good), { action: 'feedback' }), FAILED);
  assert.deepEqual(await check(mock({ ...good, action: undefined })), FAILED, 'no action at all');
  assert.deepEqual(await check(mock({ ...good, action: 'feedback' }), { action: 'feedback' }), { ok: true });
});

test('another hostname is 403; no configured hostname skips the check', async () => {
  assert.deepEqual(await check(mock({ ...good, hostname: 'evil.example' })), FAILED);
  assert.deepEqual(await check(mock({ ...good, hostname: undefined })), FAILED);
  assert.deepEqual(await check(mock({ ...good, hostname: 'example.com' }), { cfg: { secret: 's' } }), { ok: true });
});

test('dev test keys: success without action or hostname passes, success:false still fails', async () => {
  const cfg = { secret: '1x0000000000000000000000000000000AA', testKeys: true };
  const testAnswer = { success: true, 'error-codes': [], hostname: 'example.com', metadata: { result_with_testing_key: true } };
  assert.deepEqual(await check(mock(testAnswer), { cfg }), { ok: true });
  assert.deepEqual(await check(mock({ success: false }), { cfg }), FAILED);
});

test('network error, timeout, non-2xx or malformed answer is 503', async () => {
  assert.deepEqual(await check(mock(() => { throw new TypeError('fetch failed'); })), UNAVAILABLE);
  const hang = mock((init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))));
  const started = Date.now();
  assert.deepEqual(await check(hang, { timeoutMs: 50 }), UNAVAILABLE);
  assert.ok(Date.now() - started < 2000, 'gives up at the timeout');
  assert.deepEqual(await check(mock(() => new Response('bad gateway', { status: 502 }))), UNAVAILABLE);
  assert.deepEqual(await check(mock(() => new Response('<html>', { status: 200 }))), UNAVAILABLE);
  assert.deepEqual(await check(mock({ 'error-codes': [] })), UNAVAILABLE, 'no success field');
  assert.deepEqual(await check(mock(null)), UNAVAILABLE);
});

test('production without the secret fails closed (503) and never calls siteverify', async () => {
  const f = mock(good);
  for (const env of [{}, { TURNSTILE_SECRET_KEY: '' }, { TURNSTILE_SECRET_KEY: '  ', TURNSTILE_HOSTNAME: 'ringletter.wetrytrysee.cc' }])
    assert.deepEqual(await check(f, { cfg: productionTurnstileConfig(env) }), UNAVAILABLE);
  assert.equal(f.calls.length, 0);
});

test('production config: secret and lowercased hostname from the env', () => {
  assert.deepEqual(productionTurnstileConfig({ TURNSTILE_SECRET_KEY: 'k', TURNSTILE_HOSTNAME: ' RingLetter.wetrytrysee.cc ' }),
    { secret: 'k', hostname: 'ringletter.wetrytrysee.cc' });
  assert.deepEqual(productionTurnstileConfig({ TURNSTILE_SECRET_KEY: 'k' }), { secret: 'k', hostname: undefined });
});
