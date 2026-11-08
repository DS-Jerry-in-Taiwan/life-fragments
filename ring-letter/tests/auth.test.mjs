// Unit tests for lib/access-jwt.ts. Run with `npm run test:auth`
// (Node >= 22.18 strips the TypeScript types natively).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearAccessKeyCache, parseEmails, verifyAccessJwt } from '../lib/access-jwt.ts';

const teamDomain = 'team.cloudflareaccess.com';
const aud = 'aud-tag-123';
const now = Date.UTC(2026, 10, 8);
const sec = Math.floor(now / 1000);

const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
const enc = (obj) => b64u(new TextEncoder().encode(JSON.stringify(obj)));

async function keyPair(kid) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid };
  return { privateKey: pair.privateKey, jwk };
}

async function sign(privateKey, claims, header = {}) {
  const h = enc({ alg: 'RS256', kid: 'k1', typ: 'JWT', ...header });
  const p = enc(claims);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(new Uint8Array(sig))}`;
}

const good = { aud: [aud], iss: `https://${teamDomain}`, email: 'Admin@Example.com', iat: sec - 10, nbf: sec - 10, exp: sec + 600 };
const k1 = await keyPair('k1');
const other = await keyPair('k1');
const fetcherFor = (keys) => { const f = async () => { f.calls++; return keys; }; f.calls = 0; return f; };
const verify = (token, fetcher = fetcherFor([k1.jwk])) => {
  clearAccessKeyCache();
  return verifyAccessJwt(token, { teamDomain, aud }, { now, fetcher });
};

test('accepts a valid token and lowercases the email', async () => {
  assert.equal(await verify(await sign(k1.privateKey, good)), 'admin@example.com');
});

test('accepts a string aud claim', async () => {
  assert.equal(await verify(await sign(k1.privateKey, { ...good, aud })), 'admin@example.com');
});

test('rejects wrong audience', async () => {
  assert.equal(await verify(await sign(k1.privateKey, { ...good, aud: ['someone-else'] })), null);
});

test('rejects wrong issuer', async () => {
  assert.equal(await verify(await sign(k1.privateKey, { ...good, iss: 'https://evil.cloudflareaccess.com' })), null);
});

test('rejects expired and not-yet-valid tokens', async () => {
  assert.equal(await verify(await sign(k1.privateKey, { ...good, exp: sec - 1 })), null);
  assert.equal(await verify(await sign(k1.privateKey, { ...good, nbf: sec + 3600 })), null);
});

test('rejects a token signed by a different key with the same kid', async () => {
  assert.equal(await verify(await sign(other.privateKey, good)), null);
});

test('rejects tampered payload', async () => {
  const [h, , s] = (await sign(k1.privateKey, good)).split('.');
  assert.equal(await verify(`${h}.${enc({ ...good, email: 'attacker@example.com' })}.${s}`), null);
});

test('rejects alg none / non-RS256 and garbage', async () => {
  assert.equal(await verify(`${enc({ alg: 'none', kid: 'k1' })}.${enc(good)}.`), null);
  assert.equal(await verify(await sign(k1.privateKey, good, { alg: 'HS256' })), null);
  assert.equal(await verify('not-a-jwt'), null);
  assert.equal(await verify('a.b.c'), null);
});

test('rejects a token without email', async () => {
  const noEmail = { ...good };
  delete noEmail.email;
  assert.equal(await verify(await sign(k1.privateKey, noEmail)), null);
});

test('refetches keys once for an unknown kid (rotation)', async () => {
  const k2 = await keyPair('k2');
  let calls = 0;
  const fetcher = async () => (++calls === 1 ? [k1.jwk] : [k1.jwk, k2.jwk]);
  clearAccessKeyCache();
  const token = await sign(k2.privateKey, good, { kid: 'k2' });
  assert.equal(await verifyAccessJwt(token, { teamDomain, aud }, { now, fetcher }), 'admin@example.com');
  assert.equal(calls, 2);
});

test('caches keys between calls', async () => {
  const fetcher = fetcherFor([k1.jwk]);
  clearAccessKeyCache();
  const token = await sign(k1.privateKey, good);
  await verifyAccessJwt(token, { teamDomain, aud }, { now, fetcher });
  await verifyAccessJwt(token, { teamDomain, aud }, { now, fetcher });
  assert.equal(fetcher.calls, 1);
});

test('parseEmails trims, lowercases and drops blanks', () => {
  assert.deepEqual(parseEmails(' A@x.com, ,b@Y.com '), ['a@x.com', 'b@y.com']);
  assert.deepEqual(parseEmails(undefined), []);
});
