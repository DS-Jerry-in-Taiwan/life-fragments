import { env } from "cloudflare:workers";

/** Stories, feedback and sessions older than this are hidden and purged. */
export const AGE = 30 * 24 * 60 * 60 * 1000;

export function db() {
  if (!env.DB) throw new Error("儲存服務尚未就緒");
  return env.DB;
}

export function reply(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function sameOrigin(req: Request) {
  return req.headers.get("origin") === new URL(req.url).origin;
}
