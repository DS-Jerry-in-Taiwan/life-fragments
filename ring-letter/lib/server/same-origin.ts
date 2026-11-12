/** POSTs must come from this site's own pages (CSRF guard). */
export function sameOrigin(req: Request) {
  return req.headers.get("origin") === new URL(req.url).origin;
}
