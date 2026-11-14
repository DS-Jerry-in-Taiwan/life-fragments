// Cloudflare Turnstile server-side check (#4 §5.1). No Worker imports, so
// tests/turnstile.test.mjs can run it under plain Node with a mock fetch;
// lib/server/turnstile.ts supplies the keys and the request.

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_HEADER = "x-turnstile-token";
/** Generous for one HTTPS round trip; a slow Cloudflare must not hang a submit. */
export const SITEVERIFY_TIMEOUT_MS = 5000;

export type TurnstileAction = "submit" | "feedback";

export const TURNSTILE_MISSING = "請先完成人機驗證再送出。";
export const TURNSTILE_FAILED = "人機驗證沒有通過，請再試一次。";
export const TURNSTILE_UNAVAILABLE = "人機驗證服務暫時無法使用，請保留文字並稍後重試。";

export type TurnstileConfig = {
  /** Missing or empty: fail closed (503), never skip the check. */
  secret?: string;
  /**
   * Checked against siteverify's `hostname`. Required unless `testKeys`:
   * missing or empty fails closed (503), like a missing secret.
   */
  hostname?: string;
  /**
   * Cloudflare's test secret answers without `action` (and with hostname
   * example.com), so the dev keys can't check them. Production always does.
   */
  testKeys?: boolean;
};

export type TurnstileResult = { ok: true } | { ok: false; status: 403 | 503; error: string };

/**
 * siteverify `error-codes` that mean our side or Cloudflare's is broken, not
 * that the visitor's token is bad: answering 403 would make the client retry
 * a fresh challenge and blame the visitor, so these are 503 like a missing
 * secret. Token problems (invalid-input-response, timeout-or-duplicate, …)
 * and unknown codes stay 403.
 */
const SERVICE_ERRORS = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "bad-request",
  "internal-error",
]);

type Options = { fetcher?: typeof fetch; timeoutMs?: number };

/** Production keys from the Worker env: the secret and the expected hostname. */
export function productionTurnstileConfig(env: {
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_HOSTNAME?: string;
}): TurnstileConfig {
  return {
    secret: env.TURNSTILE_SECRET_KEY?.trim() || undefined,
    hostname: env.TURNSTILE_HOSTNAME?.trim().toLowerCase() || undefined,
  };
}

/** The placeholder TURNSTILE_SITE_KEY in wrangler.jsonc before a real key is set. */
export const SITE_KEY_PLACEHOLDER = "REPLACE_WITH_TURNSTILE_SITE_KEY";

/**
 * What would make production Turnstile fail, given the Worker's `vars` (as
 * built into dist/server/wrangler.json): .github/workflows/deploy.yml refuses
 * to deploy unless this is empty. (The secret is checked there separately:
 * `wrangler secret list` shows its name only.)
 */
export function turnstileVarsProblems(vars: Record<string, unknown> | undefined): string[] {
  const value = (name: string) => {
    const v = vars?.[name];
    return typeof v === "string" ? v.trim() : "";
  };
  const problems: string[] = [];
  const siteKey = value("TURNSTILE_SITE_KEY");
  if (!siteKey) problems.push("wrangler.jsonc vars lack TURNSTILE_SITE_KEY");
  else if (siteKey === SITE_KEY_PLACEHOLDER)
    problems.push("wrangler.jsonc still has the placeholder TURNSTILE_SITE_KEY");
  if (!value("TURNSTILE_HOSTNAME"))
    problems.push("wrangler.jsonc vars lack a non-empty TURNSTILE_HOSTNAME");
  return problems;
}

const refused = (status: 403 | 503, error: string): TurnstileResult => ({
  ok: false,
  status,
  error,
});

/**
 * Asks siteverify about one token. Passes only when `success` is true and
 * the action and hostname are the expected ones (neither is checked with the
 * test keys). Unreachable, timed out or malformed answers are 503, like a
 * missing secret or hostname.
 */
export async function checkTurnstile(
  token: string | null,
  action: TurnstileAction,
  config: TurnstileConfig,
  remoteip: string | null,
  { fetcher = fetch, timeoutMs = SITEVERIFY_TIMEOUT_MS }: Options = {},
): Promise<TurnstileResult> {
  const response = token?.trim();
  if (!response) return refused(403, TURNSTILE_MISSING);
  if (!config.secret || (!config.testKeys && !config.hostname))
    return refused(503, TURNSTILE_UNAVAILABLE);

  const form = new URLSearchParams({
    secret: config.secret,
    response,
    idempotency_key: crypto.randomUUID(),
  });
  if (remoteip) form.set("remoteip", remoteip);

  // A plain timer rather than AbortSignal.timeout(): it is cleared as soon as
  // siteverify answers, and it keeps Node's event loop alive in the tests.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  let outcome: unknown;
  try {
    const r = await fetcher(SITEVERIFY_URL, { method: "POST", body: form, signal: abort.signal });
    if (!r.ok) return refused(503, TURNSTILE_UNAVAILABLE);
    outcome = await r.json();
  } catch {
    return refused(503, TURNSTILE_UNAVAILABLE);
  } finally {
    clearTimeout(timer);
  }
  if (
    !outcome ||
    typeof outcome !== "object" ||
    typeof (outcome as { success?: unknown }).success !== "boolean"
  )
    return refused(503, TURNSTILE_UNAVAILABLE);

  const o = outcome as {
    success: boolean;
    action?: unknown;
    hostname?: unknown;
    "error-codes"?: unknown;
  };
  if (o.success !== true) {
    const codes = Array.isArray(o["error-codes"]) ? o["error-codes"] : [];
    if (codes.some((c) => SERVICE_ERRORS.has(c))) return refused(503, TURNSTILE_UNAVAILABLE);
    return refused(403, TURNSTILE_FAILED);
  }
  if (!config.testKeys && o.action !== action) return refused(403, TURNSTILE_FAILED);
  if (
    !config.testKeys &&
    (typeof o.hostname !== "string" || o.hostname.toLowerCase() !== config.hostname)
  )
    return refused(403, TURNSTILE_FAILED);
  return { ok: true };
}
