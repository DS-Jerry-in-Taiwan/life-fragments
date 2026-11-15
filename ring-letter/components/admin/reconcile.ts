// How the admin story list changes after a moderation (#4 §5.2): which cards
// leave, which are fetched again and replaced, the notes on them and the
// notice. Pure, with type-only imports, so tests/admin.test.mjs runs it under
// plain Node; components/admin/AdminDashboard.tsx makes the requests and
// applies the outcome to the list (usePagedList), the notes and the selection.

import type { BatchAction, BatchError, BatchResult } from "../../lib/admin-contract";
import type { AdminStory } from "../../lib/stories";
import type { StatusFilter, StoryFilter } from "./filters";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Whether a story fetched again after a moderation still belongs on a list
 * with these filters. A decision can change its status and, by moving
 * status_at, its expiry; the server's rules (GET /api/admin/stories) are
 * applied to the fields that can change. q, dates and id can't.
 */
export function stillListed(s: AdminStory, f: StoryFilter, now = Date.now()) {
  if (f.status !== "all" && s.status !== f.status) return false;
  if (f.reshare && !(s.shareRequests > 0)) return false;
  if (f.consent && s.terms !== f.consent) return false;
  if (f.expiring && (s.expiresAt === null || s.expiresAt > now + Number(f.expiring) * DAY))
    return false;
  return true;
}

// --- One story ------------------------------------------------------------------

/** The note and notice for a story that changed since it was listed (409). */
export const CHANGED = "這篇剛剛改變了，請再看一次。";

/** A refused single decision this module handles: 409 (changed since listed) or 400 (e.g. expired meanwhile). */
export const isRefusal = (httpStatus: number) => httpStatus === 409 || httpStatus === 400;

export type RefusalOutcome =
  /** Gone (expired or deleted): its card leaves. */
  | { kind: "remove"; notice: string }
  /** Changed since listed: its card shows it as it is now, with a note. */
  | { kind: "replace"; story: AdminStory; note: string; notice: string }
  /** Still there and not a 409: the error is shown as it is. */
  | { kind: "rethrow" };

/**
 * A single decision refused with `httpStatus` (isRefusal()), after the story
 * was fetched again by id alone (`current`; null when gone), instead of
 * reloading the list (its filters and scroll stay).
 */
export function afterRefusal(
  title: string,
  httpStatus: number,
  current: AdminStory | null,
): RefusalOutcome {
  if (!current)
    return {
      kind: "remove",
      notice: `《${title}》已不在系統中（可能已過期或被刪除），已從清單移除。`,
    };
  if (httpStatus === 409)
    return { kind: "replace", story: current, note: CHANGED, notice: CHANGED };
  return { kind: "rethrow" };
}

// --- A batch ----------------------------------------------------------------------

/** A batch item left as it was: the note on its card, and its part of the notice. */
const BATCH_ERROR: Record<BatchError, { note: string; count: string }> = {
  conflict: { note: "未處理：這篇剛剛改變了，請再看一次。", count: "剛剛改變了" },
  not_allowed: { note: "未處理：這個狀態不能不通過。", count: "這個狀態不能不通過" },
  missing: { note: "未處理：已不存在。", count: "已不存在" },
};

/** An unknown or missing reason (an older or newer API) still gets a note. */
export const batchError = (r: BatchResult) =>
  (r.error && BATCH_ERROR[r.error]) || { note: "未處理，請再看一次。", count: "原因不明" };

const VERB: Record<BatchAction, string> = {
  delete: "已永久刪除",
  rejected: "已不通過或下架",
};

/** What happens to the list as soon as a batch answers, before anything is fetched again. */
export type BatchPlan = {
  /** Applied ones, and refused ones, in request order. */
  done: string[];
  failed: BatchResult[];
  /** Cards that leave the list at once. */
  remove: string[];
  /** Notes on the refused cards (their reason). */
  notes: Record<string, string>;
  /** The ids that stay ticked: the refused ones. */
  ticked: string[];
  /** Fetched again: rejected ones on a list that can show them, and every refused one. */
  refetch: string[];
  /** 「已不通過或下架 N 篇；M 篇未處理（…）」, without the final 。. */
  summary: string;
};

/**
 * The outcome of a batch `status` on a list whose status filter is
 * `listStatus`. Deleted cards leave, and so do rejected ones unless the
 * list shows rejected stories (暫不分享 or 全部), where they are fetched
 * again (and may still leave, afterBatchRefetch()). Refused ones stay ticked
 * with their reason and are fetched again (a new revision for the next try).
 */
export function planBatch(
  status: BatchAction,
  results: BatchResult[],
  listStatus: StatusFilter,
): BatchPlan {
  const done = results.filter((r) => r.ok).map((r) => r.id);
  const failed = results.filter((r) => !r.ok);
  const refetchDone = status === "rejected" && (listStatus === "rejected" || listStatus === "all");
  const counts = new Map<string, number>();
  for (const r of failed) {
    const { count } = batchError(r);
    counts.set(count, (counts.get(count) ?? 0) + 1);
  }
  return {
    done,
    failed,
    remove: refetchDone ? [] : done,
    notes: Object.fromEntries(failed.map((r) => [r.id, batchError(r).note])),
    ticked: failed.map((r) => r.id),
    refetch: [...(refetchDone ? done : []), ...failed.map((r) => r.id)],
    summary:
      `${VERB[status]} ${done.length} 篇` +
      (failed.length
        ? `；${failed.length} 篇未處理（${[...counts].map(([c, n]) => `${n} 篇${c}`).join("、")}）`
        : ""),
  };
}

/** The notice when the filters changed (back/forward) before the batch answered: that list is reloaded instead. */
export function movedBatchNotice(status: BatchAction, results: BatchResult[]) {
  const done = results.filter((r) => r.ok).length;
  const failed = results.length - done;
  return (
    `${VERB[status]} ${done} 篇` +
    (failed ? `；${failed} 篇未處理` : "") +
    "。清單已依目前的篩選重新載入。"
  );
}

export type RefetchOutcome = {
  /** Cards shown as they are now. */
  replace: AdminStory[];
  /** Cards that leave the list. */
  remove: string[];
  /** Notes on cards that could not be fetched again (they stay as they were). */
  notes: Record<string, string>;
  /** The batch notice, with what the fetches changed. */
  notice: string;
};

/**
 * The plan's refetch ids fetched again (`fetched`, in the same order; a
 * value of null: gone). Refused ones stay to show why; decided ones only
 * while `filter` still matches (stillListed()); gone ones leave. A fetch
 * that failed keeps the card as it was, with a note.
 */
export function afterBatchRefetch(
  plan: BatchPlan,
  fetched: PromiseSettledResult<AdminStory | null>[],
  filter: StoryFilter,
  now = Date.now(),
): RefetchOutcome {
  const reasons = new Map(plan.failed.map((r) => [r.id, batchError(r).note]));
  const out: RefetchOutcome = { replace: [], remove: [], notes: {}, notice: "" };
  let removed = 0,
    stale = 0;
  fetched.forEach((f, i) => {
    const id = plan.refetch[i];
    const refused = reasons.has(id);
    if (f.status === "rejected") {
      stale++;
      out.notes[id] = `${reasons.get(id) ?? ""}（未能重新載入這篇，請按「重新整理」。）`;
    } else if (f.value && (refused || stillListed(f.value, filter, now))) out.replace.push(f.value);
    else {
      out.remove.push(id);
      if (refused) removed++;
    }
  });
  let text = plan.summary;
  if (removed)
    text += removed === plan.failed.length ? "，已從清單移除" : `，其中 ${removed} 篇已從清單移除`;
  if (stale) text += `；${stale} 篇未能重新載入，請按「重新整理」`;
  out.notice = text + "。";
  return out;
}
