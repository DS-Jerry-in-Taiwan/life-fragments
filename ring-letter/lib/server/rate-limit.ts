import { countAttemptsInLastDay } from "./db/attempts";
import { countSharingChangesInLastDay } from "./db/consent-events";
import { countFeedbackInLastDay } from "./db/feedback";
import { countStoriesInLastDay } from "./db/stories";

/**
 * Per-session limits over the last 24 hours. `sharing`: changes to sharing
 * (share and unshare, #4 §6.1), counted from the consent_events rows the
 * session wrote (consent_events.owner), which outlive a withdrawn story for
 * that day, so withdrawing does not reset the count.
 */
export const DAILY_LIMITS = { stories: 5, feedback: 30, attempts: 30, sharing: 10 } as const;

const COUNTERS = {
  stories: countStoriesInLastDay,
  feedback: countFeedbackInLastDay,
  attempts: countAttemptsInLastDay,
  sharing: countSharingChangesInLastDay,
} satisfies Record<keyof typeof DAILY_LIMITS, (owner: string, now: number) => Promise<number>>;

export async function overDailyLimit(
  kind: keyof typeof DAILY_LIMITS,
  owner: string,
  now = Date.now(),
) {
  return (await COUNTERS[kind](owner, now)) >= DAILY_LIMITS[kind];
}
