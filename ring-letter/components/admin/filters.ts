// The admin story filters (#4 §5.2) live in the URL (/admin?status=approved&q=…),
// so a reload, back/forward or a shared link restores them. The names and
// values are GET /api/admin/stories' own, passed through unchanged.

export type StatusFilter = "pending" | "approved" | "rejected" | "private" | "all";

export type StoryFilter = {
  status: StatusFilter;
  reshare: boolean;
  consent: "" | "v2" | "v3";
  /** Expiring within this many days ("" = any). */
  expiring: string;
  q: string;
  from: string;
  to: string;
  id: string;
};

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "pending", label: "等待審閱" },
  { value: "approved", label: "已匿名分享" },
  { value: "rejected", label: "暫不分享" },
  { value: "private", label: "未公開保存" },
  { value: "all", label: "全部" },
];

const STATUSES = new Set(STATUS_FILTERS.map((s) => s.value));

export function parseFilter(params: URLSearchParams): StoryFilter {
  const status = params.get("status") as StatusFilter;
  const consent = params.get("consent");
  return {
    status: STATUSES.has(status) ? status : "pending",
    reshare: params.get("reshare") === "1",
    consent: consent === "v2" || consent === "v3" ? consent : "",
    expiring: params.get("expiring") ?? "",
    q: params.get("q") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    id: params.get("id") ?? "",
  };
}

/** The filter as a query string, without defaults (pending, unticked, empty). */
export function filterQuery(f: StoryFilter) {
  const q = new URLSearchParams();
  if (f.status !== "pending") q.set("status", f.status);
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
