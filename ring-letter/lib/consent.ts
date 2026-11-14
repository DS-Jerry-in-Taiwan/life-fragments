// Consent versions and the terms they promise (#4 §6, §6.1), in one place.
// No server or Worker imports, so the frontend can use it too
// (components/mine/ShareToggle.tsx); the SQL rules built on these live in
// lib/server/db/stories.ts.

/**
 * Consent wording version stored with every new story (and its consent_events
 * rows). Bump it whenever the consent text in components/write/ConsentFields.tsx
 * changes, and add the new version to PERMANENT_CONSENT_VERSIONS when its
 * wording still promises keeping approved stories until withdrawn.
 * v3-2026-11-12 (V3-c): approved public stories kept until withdrawn or
 * deleted by an admin, other statuses 30 days after their last status change.
 */
export const CONSENT_VERSION = "v3-2026-11-12";

/**
 * Consent versions whose wording allows keeping an approved story until it is
 * withdrawn or deleted by an admin (#4 §6). V3-c switched CONSENT_VERSION to
 * the first of them together with the sliding one-year sessions, 「在這台裝置
 * 登出」 and the contact address for admin-assisted deletion, so authors can
 * actually withdraw. Stories under any other version (v2-2026-11-05 and
 * earlier, legacy or empty) keep the terms they were submitted under: 30 days
 * from `created`, whatever their status. Existing consent strings are never
 * rewritten.
 */
export const PERMANENT_CONSENT_VERSIONS: readonly string[] = ["v3-2026-11-12"];

/**
 * The terms a story is kept under, as the admin list shows and filters them:
 * v3, a PERMANENT_CONSENT_VERSIONS version (approved kept until withdrawn);
 * v2, any other version (old, legacy or empty: 30 days after submission).
 */
export const CONSENT_TERMS = ["v2", "v3"] as const;
export type ConsentTerms = (typeof CONSENT_TERMS)[number];

/**
 * Each story may ask to be shared again at most this many times after
 * submission (#4 §6.1): counted as its 'share' events, whether it was
 * private, taken down or rejected before. Stop sharing and withdraw stay
 * available once it is used up.
 */
export const MAX_SHARE_REQUESTS = 3;

/** A stored consent string: `<version>:adult,privacy,<share|private>`. */
export function consentString(version: string, share: boolean) {
  return `${version}:adult,privacy,${share ? "share" : "private"}`;
}

/** Consent wording version of a stored consent string (the whole string without a ':'). */
export function consentVersionOf(consent: string) {
  const i = consent.indexOf(":");
  return i < 0 ? consent : consent.slice(0, i);
}
