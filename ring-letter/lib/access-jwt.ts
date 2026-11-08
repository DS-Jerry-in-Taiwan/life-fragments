// Verifies Cloudflare Access application tokens (the `Cf-Access-Jwt-Assertion`
// header). Pure Web Crypto, no Worker imports, so Node can unit-test it.
// https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/

export type AccessConfig = {
  /** Team domain, e.g. `myteam.cloudflareaccess.com` (no scheme). */
  teamDomain: string;
  /** Application Audience (AUD) tag. */
  aud: string;
};

export type Jwk = JsonWebKey & { kid?: string };
export type KeyFetcher = (teamDomain: string) => Promise<Jwk[]>;

type Header = { alg?: string; kid?: string };
type Claims = { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string };

const CACHE_MS = 60 * 60 * 1000;
/** An unknown kid forces a refetch at most this often, so junk tokens can't hammer the certs endpoint. */
const REFRESH_MIN_MS = 5 * 60 * 1000;
const cache = new Map<string, { keys: Jwk[]; fetched: number }>();

export const fetchAccessKeys: KeyFetcher = async (teamDomain) => {
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs request failed: ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  return body.keys ?? [];
};

async function keysFor(teamDomain: string, fetcher: KeyFetcher, now: number, refresh: boolean) {
  const hit = cache.get(teamDomain);
  if (hit && now - hit.fetched < (refresh ? REFRESH_MIN_MS : CACHE_MS)) return hit.keys;
  const keys = await fetcher(teamDomain);
  cache.set(teamDomain, { keys, fetched: now });
  return keys;
}

function decodePart<T>(part: string): T {
  return JSON.parse(new TextDecoder().decode(base64url(part))) as T;
}

function base64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Returns the token's email when the token is a valid, unexpired RS256 Access
 * token for `config`; otherwise null. Never throws for a bad token.
 */
export async function verifyAccessJwt(
  token: string,
  config: AccessConfig,
  { now = Date.now(), fetcher = fetchAccessKeys }: { now?: number; fetcher?: KeyFetcher } = {},
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header: Header, claims: Claims;
  try {
    header = decodePart<Header>(parts[0]);
    claims = decodePart<Claims>(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const seconds = now / 1000;
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(config.aud)) return null;
  if (claims.iss !== `https://${config.teamDomain}`) return null;
  if (typeof claims.exp !== "number" || claims.exp <= seconds) return null;
  if (typeof claims.nbf === "number" && claims.nbf > seconds + 60) return null;
  if (typeof claims.email !== "string" || !claims.email) return null;

  // Unknown kid → refetch once (at most every REFRESH_MIN_MS), in case Access rotated its keys.
  let jwk = (await keysFor(config.teamDomain, fetcher, now, false)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await keysFor(config.teamDomain, fetcher, now, true)).find((k) => k.kid === header.kid);
  if (!jwk) return null;

  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    return ok ? claims.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Parses a comma-separated allowlist into lowercased emails. */
export function parseEmails(list: string | undefined): string[] {
  return (list ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Test hook: forget cached keys. */
export function clearAccessKeyCache() {
  cache.clear();
}
