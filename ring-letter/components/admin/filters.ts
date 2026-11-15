// The admin story filters (#4 §5.2) live in the URL (/admin?status=approved&q=…),
// so a reload, back/forward or a shared link restores them. The names and
// values are GET /api/admin/stories' own, passed through unchanged; their
// rules are lib/admin-contract.ts, which the server validates with too.

import {
  calendarDay,
  CONSENT_FILTERS,
  DEFAULT_STATUS_FILTER,
  EXPIRING_PATTERN,
  isExpiringDays,
  MAX_ID_LENGTH,
  MAX_QUERY,
  STATUS_FILTERS as STATUS_VALUES,
  type StatusFilter,
} from "../../lib/admin-contract";
import type { ConsentTerms } from "../../lib/consent";

export type { StatusFilter };

export type StoryFilter = {
  status: StatusFilter;
  reshare: boolean;
  consent: "" | ConsentTerms;
  /** Expiring within this many days ("" = any). */
  expiring: string;
  q: string;
  from: string;
  to: string;
  id: string;
};

const STATUS_LABELS: Record<StatusFilter, string> = {
  pending: "等待審閱",
  approved: "已匿名分享",
  rejected: "暫不分享",
  private: "未公開保存",
  all: "全部",
};

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = STATUS_VALUES.map(
  (value) => ({ value, label: STATUS_LABELS[value] }),
);

const STATUSES = new Set<string>(STATUS_VALUES);
const CONSENTS = new Set<string>(CONSENT_FILTERS);

/** A real calendar date YYYY-MM-DD, else "". */
function day(value: string | null) {
  return value && calendarDay(value) ? value : "";
}

/**
 * The filter in the URL. Values the API would refuse (a hand-edited or old
 * link) fall back instead of leaving a bare 400: unknown ones are dropped, a
 * reversed date range is swapped, q is cut to 100 characters.
 */
export function parseFilter(params: URLSearchParams): StoryFilter {
  const status = params.get("status") ?? "";
  const consent = params.get("consent") ?? "";
  const expiring = params.get("expiring") ?? "";
  const days = EXPIRING_PATTERN.test(expiring) ? Number(expiring) : 0;
  let from = day(params.get("from")),
    to = day(params.get("to"));
  if (from && to && from > to) [from, to] = [to, from];
  const id = params.get("id") ?? "";
  return {
    status: STATUSES.has(status) ? (status as StatusFilter) : DEFAULT_STATUS_FILTER,
    reshare: params.get("reshare") === "1",
    consent: CONSENTS.has(consent) ? (consent as ConsentTerms) : "",
    expiring: isExpiringDays(days) ? String(days) : "",
    q: [...(params.get("q") ?? "")].slice(0, MAX_QUERY).join(""),
    from,
    to,
    id: id.length <= MAX_ID_LENGTH ? id : "",
  };
}

/** No conditions: pending, nothing ticked, nothing searched. */
export const NO_FILTER: StoryFilter = parseFilter(new URLSearchParams());

/** The filter as a query string, without defaults (pending, unticked, empty). */
export function filterQuery(f: StoryFilter) {
  const q = new URLSearchParams();
  if (f.status !== DEFAULT_STATUS_FILTER) q.set("status", f.status);
  if (f.reshare) q.set("reshare", "1");
  if (f.consent) q.set("consent", f.consent);
  if (f.expiring) q.set("expiring", f.expiring);
  for (const key of ["q", "from", "to", "id"] as const)
    if (f[key].trim()) q.set(key, f[key].trim());
  return q.toString();
}

/** Story ids are UUIDs: pasting one in the search box looks it up exactly, in any status. */
export function isStoryId(text: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text.trim());
}

const DAY = 24 * 60 * 60 * 1000;

export function taipeiDate(ms: number) {
  return new Date(ms).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
}

export function taipeiTime(ms: number) {
  return new Date(ms).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
}

/** Whole days left before the retention job deletes it (at least 1). */
export function daysLeft(expiresAt: number, now = Date.now()) {
  return Math.max(1, Math.ceil((expiresAt - now) / DAY));
}

/** Scrolls to a story's card if it is on the page; false if it isn't loaded. */
export function scrollToStory(id: string) {
  const card = document.getElementById(storyAnchor(id));
  if (!card) return false;
  card.scrollIntoView({ block: "start" });
  card.focus({ preventScroll: true });
  return true;
}

export const storyAnchor = (id: string) => "story-" + id;
