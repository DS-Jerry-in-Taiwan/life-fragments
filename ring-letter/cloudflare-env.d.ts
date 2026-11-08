declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    /** Cloudflare Access team domain, e.g. `myteam.cloudflareaccess.com`. */
    ACCESS_TEAM_DOMAIN?: string;
    /** Audience (AUD) tag of the Access application protecting /admin*, /api/admin*. */
    ACCESS_AUD?: string;
    /** Comma-separated admin emails. Set as a secret, not in wrangler.jsonc. */
    ADMIN_EMAILS?: string;
  }
}
