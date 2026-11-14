import { env } from "cloudflare:workers";
import { verifyAdmin } from "./auth";
import { readJsonBody, reply } from "./http";
import { sameOrigin } from "./same-origin";
import { currentSession } from "./session";
import { verifyTurnstile } from "./turnstile";
import type { TurnstileAction } from "./turnstile-siteverify";
import { jsonObject } from "./validation";

// Guards shared by the route handlers under app/api/. Each route composes
// them in the same order the v1 action dispatcher used, so status codes and
// messages stay the same: origin, then body, then session or admin identity.
// Submitting a letter or feedback adds Turnstile between body and session
// (#4 §5.1), so a bot never reaches the DB.

export const READ_FAILED = "暫時無法讀取資料，請稍後再試。";
export const SAVE_FAILED = "這次沒有成功儲存，請保留文字並稍後重試。";
export const ADMIN_SAVE_FAILED = "這次沒有成功儲存，請稍後重試。";
const BAD_ORIGIN = "來源驗證失敗";
const SESSION_EXPIRED = "體驗工作階段已過期，請重新整理頁面。";
const FORBIDDEN = "只有管理者可以使用。";

/** Body limit (characters) for the public routes. */
export const MAX_BODY = 12000;

/** Body limit for one admin decision, `{status, statusAt?, consentEvents?}`. */
export const MAX_MODERATION_BODY = 4000;

/** Body limit for a batch admin decision: up to 50 `{id, statusAt, consentEvents}` items. */
export const MAX_BATCH_MODERATION_BODY = 12000;

/** Read handlers: any failure becomes a 503 with the read message. */
export async function guardRead(run: () => Promise<Response>) {
  try {
    return await run();
  } catch {
    return reply({ error: READ_FAILED }, 503);
  }
}

/** State-changing handlers (POST, PATCH, DELETE): same-origin check, failures → 503. */
export async function guardWrite(
  req: Request,
  run: () => Promise<Response>,
  failed: string = SAVE_FAILED,
) {
  try {
    if (!sameOrigin(req)) return reply({ error: BAD_ORIGIN }, 403);
    return await run();
  } catch {
    return reply({ error: failed }, 503);
  }
}

/**
 * Parses the JSON body as an object (415/413/400) and only then requires a
 * live session (401), the order the v1 POST dispatcher checked them in.
 */
export async function withBodyAndSession(
  req: Request,
  run: (body: Record<string, unknown>, who: string) => Promise<Response>,
) {
  return withBody(req, (body) => withSession(req, (who) => run(body, who)));
}

/** withBodyAndSession() with the Turnstile check (403/503) between the two. */
export async function withBodyTurnstileAndSession(
  req: Request,
  action: TurnstileAction,
  run: (body: Record<string, unknown>, who: string) => Promise<Response>,
) {
  return withBody(req, (body) =>
    withTurnstile(req, action, () => withSession(req, (who) => run(body, who))),
  );
}

/** Parses the JSON body as an object: 415 / 413 / 400. */
export async function withBody(
  req: Request,
  run: (body: Record<string, unknown>) => Promise<Response>,
) {
  const parsed = await readJsonBody(req, MAX_BODY);
  if (!parsed.ok) return parsed.response;
  const object = jsonObject.safeParse(parsed.body);
  if (!object.success) return reply({ error: "格式不正確" }, 400);
  return run(object.data);
}

/**
 * Requires a Turnstile token for `action` in `X-Turnstile-Token` (#4 §5.1).
 * Refusals carry `code: "turnstile"` so the frontend can fetch a new token
 * and retry once: 403 missing or failed, 503 siteverify unavailable or no
 * secret configured (fail closed).
 */
export async function withTurnstile(
  req: Request,
  action: TurnstileAction,
  run: () => Promise<Response>,
) {
  const result = await verifyTurnstile(req, action);
  if (!result.ok) return reply({ error: result.error, code: "turnstile" }, result.status);
  return run();
}

/** Requires a live anonymous session (401 otherwise). */
export async function withSession(req: Request, run: (who: string) => Promise<Response>) {
  const who = await currentSession(req);
  if (!who) return reply({ error: SESSION_EXPIRED }, 401);
  return run(who);
}

/** Requires the admin identity from verifyAdmin() (403 otherwise). */
export async function withAdmin(req: Request, run: (email: string) => Promise<Response>) {
  const email = await verifyAdmin(req, env);
  if (!email) return reply({ error: FORBIDDEN }, 403);
  return run(email);
}

/** Next/Vinext route context for a `[id]` segment (params is a Promise). */
export type IdContext = { params: Promise<{ id: string }> };
