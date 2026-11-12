# Ring letter MVP

Mobile-first anonymous story reading and submissions. Vinext + D1. All sample stories are marked AI fiction. Only author-consented, manually approved submissions are publicly readable. No AI API calls, messaging, or external analytics.

Public users receive a 30-day HttpOnly random session cookie; only its SHA-256 hash is stored. Losing this cookie loses self-service access. User records are excluded after 30 days, and expired rows are purged when a new session is created. No background cleanup guarantee. Limits are per session, not a bot-defense guarantee.

Admin access: the admin UI is /admin and the admin API is /api/admin. In production both are behind a Cloudflare Access application, and the Worker independently verifies the Access JWT and requires the email to be in the ADMIN_EMAILS secret (lib/server/auth.ts, lib/server/access-jwt.ts); missing config denies all admin requests. Plan and progress: GitHub issue #2. In `npm run dev` there is no Access: an identity is only granted to requests carrying the per-run dev secret (.wrangler/dev-admin-token), never based on source address, because tunnels and port forwards arrive from loopback. Anonymous sessions can submit at most 5 stories and 30 feedback events per day. Private stories cannot be approved. No admin text editing: changed author consent would otherwise be needed.

Browser QA and API checks are local. tests/api.mjs uses the dev-only admin identity header ONLY against the local dev server (production builds compile that path out); never enable any header-spoofing convenience route in production. Test stories are removed after tests.

Before wider release: add stronger abuse prevention, recoverable author identity if needed, scoped reviewer membership, explicit retention jobs, an operations contact, and a real author content library. Readership is not automatically measured: feedback counts are events, not unique people or retention.

## Human cross-time matching pilot (2026-11-05)

The home page and default reading experience use components/reading/MatchExperience.tsx and data/matching.ts, with no API requests, cookies, database writes, matching algorithm, or third-party analytics. Existing legacy submissions/database are retained; footer links explicitly expose prior submissions/withdrawal and the prior public inbox. Never reuse old consent for the new manual matching process.

Update FORM_URL_DISTRESS and FORM_URL_ECHO at the top of data/matching.ts to activate external forms. Both currently equal '#'; clicking them shows an unavailable message, not a fake submission. Forms should supply the contact/removal path mentioned in the UI, separately collect receiving-match consent and future de-identified reuse consent, and identify the letter being echoed. Echo does not automatically send to an author.

MATCH_LETTERS holds eight fictional samples (two per SCENARIOS category). Replace id, scenario, year, situation, matchReason and body; set isExample=false only for consented, reviewed, de-identified real letters. These bundled letters are publicly readable; do not place confidential source originals here. Keep at least two letters per scenario for the next-letter interaction. Match reasons are authored copy, not computed personalization.

Browser QA: all four scenario buttons opened their first letter and next switched to the second letter in the same scenario. Both '#' form links displayed explicit unavailable notices; event attributes were verified. Home and reader had no horizontal/text overflow at 320, 390, 768, 1024, 1440 CSS pixels. TypeScript and production build passed. Data-event hooks are present only; there is no persistent event count yet.

## Restored submission entry and random reading

Main navigation, hero, and reader now lead to the original working writing form. Both past and present submission modes and My fragments remain available. Matching registration is a secondary expandable entry and does not implicitly enroll site submissions. Reader opens a random sample immediately; next chooses another without immediate repeats. Scenario controls are optional and collapsed by default. No timed automatic changes. Browser verified random transitions, optional filter, and opening the present form; API regression covers both submission modes, permissions and cleanup.
