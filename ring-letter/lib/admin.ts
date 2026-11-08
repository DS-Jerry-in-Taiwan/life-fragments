import { parseEmails, verifyAccessJwt } from "./access-jwt";

/**
 * Returns the admin's email when the request may use the admin API, else null.
 *
 * Production: Cloudflare Access protects /admin* and /api/admin* and adds
 * `Cf-Access-Jwt-Assertion`; we still verify that token ourselves and require
 * the email to be in ADMIN_EMAILS. Any missing config fails closed.
 *
 * Development (`import.meta.env.DEV`, compiled out of production builds):
 * there is no Access, so the identity is the `Cf-Access-Authenticated-User-Email`
 * header. vite.config.ts drops any client-sent copy and only sets it for
 * requests carrying the per-run dev admin secret (see devAdminIdentity()).
 */
export async function verifyAdmin(req: Request, env: Cloudflare.Env): Promise<string | null> {
  if (import.meta.env.DEV) {
    const email = (req.headers.get("cf-access-authenticated-user-email") ?? "").trim().toLowerCase();
    return email || null;
  }

  const token = req.headers.get("cf-access-jwt-assertion");
  const admins = parseEmails(env.ADMIN_EMAILS);
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || admins.length === 0) return null;

  const email = await verifyAccessJwt(token, { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD });
  return email && admins.includes(email) ? email : null;
}
