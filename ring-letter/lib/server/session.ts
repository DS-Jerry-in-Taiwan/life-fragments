import { AGE } from "./db/index";
import { insertSession, sessionExists } from "./db/sessions";

// Anonymous sessions: a random 32-byte token in the HttpOnly `rl_session`
// cookie; the database only stores its SHA-256.

const MAX_AGE_SECONDS = 2592000; // 30 days, same as AGE
const TOKEN = /(?:^|;\s*)rl_session=([a-f0-9]{64})(?:;|$)/;

/** Expires the cookie (sent after erasing the session's data). */
export const CLEAR_SESSION_COOKIE = "rl_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";

function hex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(s: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}

/** The session hash for a request with a live session cookie, else null. */
export async function currentSession(req: Request) {
  const token = req.headers.get("cookie")?.match(TOKEN)?.[1];
  if (!token) return null;
  const hash = await sha256Hex(token);
  return (await sessionExists(hash, Date.now() - AGE)) ? hash : null;
}

/** Stores a new session and returns its Set-Cookie header value. */
export async function createSession(req: Request) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await insertSession(await sha256Hex(token), Date.now());
  const secure = new URL(req.url).protocol === "https:" ? "Secure; " : "";
  return `rl_session=${token}; HttpOnly; ${secure}SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}
