import { DAY, SESSION_AGE } from "./db/index";
import { insertSession, sessionExists, sessionLastSeen, touchSession } from "./db/sessions";

// Anonymous sessions: a random 32-byte token in the HttpOnly `rl_session`
// cookie; the database only stores its SHA-256.
//
// Sliding one-year lifetime (#4 §6.2): a session is valid while its last visit
// (sessions.last_seen) is less than SESSION_AGE ago. Every request carrying a
// live cookie gets it re-issued with a fresh one-year Max-Age and moves
// last_seen forward, written at most once a day: worker/index.ts calls
// refreshSession() for every response that doesn't set the cookie itself.

const MAX_AGE_SECONDS = SESSION_AGE / 1000; // 31536000, one year
const TOKEN = /(?:^|;\s*)rl_session=([a-f0-9]{64})(?:;|$)/;

/** Expires the cookie (sent after erasing the session's data or logging out). */
export const CLEAR_SESSION_COOKIE = "rl_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";

function hex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(s: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}

function sessionToken(req: Request) {
  return req.headers.get("cookie")?.match(TOKEN)?.[1] ?? null;
}

function sessionCookie(req: Request, token: string) {
  const secure = new URL(req.url).protocol === "https:" ? "Secure; " : "";
  return `rl_session=${token}; HttpOnly; ${secure}SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

/** The hash of the request's session cookie, live or not, else null (for logging out). */
export async function cookieSession(req: Request) {
  const token = sessionToken(req);
  return token ? sha256Hex(token) : null;
}

/** The session hash for a request with a live session cookie, else null. */
export async function currentSession(req: Request) {
  const hash = await cookieSession(req);
  if (!hash) return null;
  return (await sessionExists(hash, Date.now())) ? hash : null;
}

/** Stores a new session and returns its Set-Cookie header value. */
export async function createSession(req: Request) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await insertSession(await sha256Hex(token), Date.now());
  return sessionCookie(req, token);
}

/**
 * For a request with a live session cookie: moves the session's last_seen to
 * now when it is more than a day old, and returns the same cookie re-issued
 * with a one-year Max-Age (which also upgrades the 30-day cookies issued
 * before V3-c). Null without a live session: nothing is created or written.
 */
export async function refreshSession(req: Request) {
  const token = sessionToken(req);
  if (!token) return null;
  const hash = await sha256Hex(token);
  const now = Date.now();
  const lastSeen = await sessionLastSeen(hash, now);
  if (lastSeen === null) return null;
  if (lastSeen < now - DAY) await touchSession(hash, now);
  return sessionCookie(req, token);
}
