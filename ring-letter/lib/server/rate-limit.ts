import { countAttemptsSince } from "./db/attempts";
import { countSharingChangesSince } from "./db/consent-events";
import { countFeedbackSince } from "./db/feedback";
import { DAY } from "./db/index";
import { countStoriesSince } from "./db/stories";

/**
 * Per-session limits over the last 24 hours. `sharing`: changes to sharing
 * (share and unshare, #4 §6.1), counted from consent_events, so no extra
 * storage is needed.
 */
export const DAILY_LIMITS = { stories: 5, feedback: 30, attempts: 30, sharing: 10 } as const;

const COUNTERS = {
  stories: countStoriesSince,
  feedback: countFeedbackSince,
  attempts: countAttemptsSince,
  sharing: countSharingChangesSince,
} satisfies Record<keyof typeof DAILY_LIMITS, (owner: string, since: number) => Promise<number>>;

export async function overDailyLimit(
  kind: keyof typeof DAILY_LIMITS,
  owner: string,
  now = Date.now(),
) {
  return (await COUNTERS[kind](owner, now - DAY)) >= DAILY_LIMITS[kind];
}
