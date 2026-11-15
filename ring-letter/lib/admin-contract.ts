// The admin API's rules that both ends apply (#4 §5.2), in one place: the
// story list's filter parameters (GET /api/admin/stories) and the batch
// moderation rules (POST /api/admin/moderation). No server or Worker
// imports and no zod, so the frontend uses it as it is (components/admin/
// filters.ts, BatchBar.tsx, lib/api-client.ts); lib/server/validation.ts
// builds its zod schemas from these, and lib/server/db/stories.ts its SQL.

import { CONSENT_TERMS } from "./consent";

// --- GET /api/admin/stories filters -------------------------------------------

/** `status`: a story status, or all of them. */
export const STATUS_FILTERS = ["pending", "approved", "rejected", "private", "all"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
/** `status` when absent. */
export const DEFAULT_STATUS_FILTER: StatusFilter = "pending";

/** `consent`: the terms a story is kept under (lib/consent.ts). */
export const CONSENT_FILTERS = CONSENT_TERMS;

/** `expiring`: up to 3 digits, a whole number of days in this range. */
export const EXPIRING_PATTERN = /^\d{1,3}$/;
export const MIN_EXPIRING_DAYS = 1;
export const MAX_EXPIRING_DAYS = 365;
export const isExpiringDays = (n: number) => n >= MIN_EXPIRING_DAYS && n <= MAX_EXPIRING_DAYS;

/** `q`: trimmed, at most this many characters (code points). */
export const MAX_QUERY = 100;

/** `id` (and the feedback list's `story`, a batch item's id): at most this long. */
export const MAX_ID_LENGTH = 200;

/** `from` / `to`: YYYY-MM-DD, a real calendar date. */
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** [year, month 1–12, day] of a real calendar date YYYY-MM-DD, else null. */
export function calendarDay(text: string): [number, number, number] | null {
  if (!DAY_PATTERN.test(text)) return null;
  const [y, m, d] = text.split("-").map(Number);
  const back = new Date(Date.UTC(y, m - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d
    ? [y, m, d]
    : null;
}

// --- Moderation -----------------------------------------------------------------

/** POST /api/admin/stories/:id/moderation `status`. */
export const MODERATION_ACTIONS = ["approved", "rejected", "delete"] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

/** POST /api/admin/moderation `status`: never approval (every story is read before it goes public). */
export const BATCH_ACTIONS = ["rejected", "delete"] as const;
export type BatchAction = (typeof BATCH_ACTIONS)[number];

/** At most this many stories per batch request (at least one). */
export const MAX_BATCH = 50;

/** The statuses a batch 不通過或下架 changes (as for a single rejection); 永久刪除 takes any. */
export const BATCH_REJECTABLE_STATUSES = ["pending", "approved"] as const;
export const canReject = (s: { status: string }) =>
  (BATCH_REJECTABLE_STATUSES as readonly string[]).includes(s.status);

/** Why one story of a batch was left as it was. */
export type BatchError = "conflict" | "not_allowed" | "missing";
export type BatchResult = { id: string; ok: boolean; error?: BatchError };
