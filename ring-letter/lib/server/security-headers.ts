/**
 * Security headers (#63, E2 PR 1). Pure functions, no Worker imports, so they
 * can be unit tested; worker/index.ts applies them to every response.
 *
 * - Every response: `X-Content-Type-Options: nosniff` and
 *   `Referrer-Policy: strict-origin-when-cross-origin` (enforced).
 * - HTML responses: `X-Frame-Options: DENY` plus an enforced
 *   `Content-Security-Policy: frame-ancestors 'none'` (frame-ancestors is
 *   ignored inside a Report-Only policy, so it gets its own enforced header),
 *   and the measured policy as `Content-Security-Policy-Report-Only`.
 *
 * Scripts: vinext streams the RSC payload as ~20 inline <script> per page
 * (dynamic, so no hash can cover them) and React adds its Suspense `$RC`
 * scripts. vinext puts a nonce on all of them, and on its own <script src>
 * and modulepreload tags, when the *request* carries a CSP header with
 * `'nonce-…'` in script-src (vinext/dist/server/csp.js, the Next.js
 * convention) — `nonceRequest()` sets that. Turnstile's api.js is the only
 * external script; it is inserted by components/common/Turnstile.tsx, which
 * the host allowlist covers (no 'strict-dynamic', so the allowlist counts).
 */

/** Cloudflare Turnstile: api.js and its challenge iframe. */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/** A fresh per-request nonce: 16 random bytes, base64. */
export function newNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The Report-Only policy. `dev` adds what only `npm run dev` needs, as
 * measured: Vite's client injects every CSS module as a <style> element
 * (@vite/client updateStyle), and React's development Flight client
 * (react-server-dom-webpack) eval()s code to rebuild server stack frames.
 * The production build needs neither. (Vite's HMR WebSocket is same-origin,
 * which CSP Level 3 'self' already allows.)
 */
export function contentSecurityPolicy(nonce: string, dev = false) {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, TURNSTILE_ORIGIN],
    "style-src": ["'self'"],
    "img-src": ["'self'"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "frame-src": [TURNSTILE_ORIGIN],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
  };
  if (dev) {
    directives["script-src"].push("'unsafe-eval'");
    // A nonce in style-src would make browsers ignore 'unsafe-inline'.
    directives["style-src"].push("'unsafe-inline'");
  }
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

/** Enforced from the start: nothing of ours is ever meant to be framed. */
export const FRAME_ANCESTORS = "frame-ancestors 'none'";

/**
 * The request handed to vinext: a CSP request header that tells it which
 * nonce to put on the scripts it renders. Any client-sent CSP request header
 * is replaced, so a visitor can't choose the nonce.
 */
export function nonceRequest(request: Request, nonce: string) {
  const headers = new Headers(request.headers);
  headers.delete("content-security-policy-report-only");
  headers.set("content-security-policy", `script-src 'nonce-${nonce}'`);
  return new Request(request, { headers });
}

/** Adds the headers to a (mutable) response's headers. */
export function applySecurityHeaders(headers: Headers, nonce: string, dev = false) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!/^text\/html\b/i.test(headers.get("Content-Type") ?? "")) return;
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy", FRAME_ANCESTORS);
  headers.set("Content-Security-Policy-Report-Only", contentSecurityPolicy(nonce, dev));
}
