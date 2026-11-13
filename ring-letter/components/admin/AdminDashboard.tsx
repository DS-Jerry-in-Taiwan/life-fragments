"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as api from "../../lib/api-client";
import type { AdminStory, AdminSummary, ModerationAction } from "../../lib/stories";
import { useAction } from "../../lib/use-action";
import SectionIntro from "../common/SectionIntro";
import StatusMessage from "../common/StatusMessage";
import { useShell } from "../shell/ShellContext";
import BatchBar, { canReject } from "./BatchBar";
import EventLog from "./EventLog";
import FeedbackList from "./FeedbackList";
import {
  filterQuery,
  NO_FILTER,
  parseFilter,
  scrollToStory,
  stillListed,
  type StoryFilter,
  taipeiDate,
} from "./filters";
import StoryFilters from "./StoryFilters";
import StoryList from "./StoryList";
import SummaryBar from "./SummaryBar";
import { usePagedList } from "./usePagedList";
import WritingMetrics from "./WritingMetrics";
import styles from "./AdminDashboard.module.css";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A batch item left as it was: the note on its card, and its part of the notice. */
const BATCH_ERROR: Record<api.BatchError, { note: string; count: string }> = {
  conflict: { note: "未處理：這篇剛剛改變了，請再看一次。", count: "剛剛改變了" },
  not_allowed: { note: "未處理：這個狀態不能不通過。", count: "這個狀態不能不通過" },
  missing: { note: "未處理：已不存在。", count: "已不存在" },
};
/** An unknown or missing reason (an older or newer API) still gets a note. */
const batchError = (r: api.BatchResult) =>
  (r.error && BATCH_ERROR[r.error]) || { note: "未處理，請再看一次。", count: "原因不明" };

/** 《a》《b》《c》等: the first few titles for a batch confirm. */
function someTitles(stories: AdminStory[], n = 3) {
  const titles = stories
    .slice(0, n)
    .map((s) => `《${s.title}》`)
    .join("");
  return stories.length > n ? titles + "等" : titles;
}

/**
 * 摘要 → 篩選列 → 故事清單 → 回饋 → 操作紀錄 (#4 §5.2). The story filters
 * live in the URL (/admin?status=approved&q=…). Only rendered once
 * /api/admin/summary accepts the viewer (Cloudflare Access + ADMIN_EMAILS);
 * the shell then lets the footer show 管理信箱.
 */
export default function AdminDashboard() {
  const { setAdmin: onAuthorized } = useShell();
  const router = useRouter();
  const filter = parseFilter(useSearchParams());
  const query = filterQuery(filter);
  const action = useAction(true);
  const { busy, setNotice } = action;
  const [admin, setAdmin] = useState(false),
    [summary, setSummary] = useState<AdminSummary | null>(null),
    // Per story id: why its card was just refreshed; only for the filters they were made under.
    [notes, setNotes] = useState<{ key: string; byId: Record<string, string> }>({
      key: "",
      byId: {},
    }),
    [feedbackStory, setFeedbackStory] = useState<{ id: string; title: string } | null>(null),
    // Bumped to reload the feedback list / the operation log from the top.
    [feedbackKey, setFeedbackKey] = useState(0),
    [eventsKey, setEventsKey] = useState(0),
    // Ticked cards for a batch action; only for the filters they were ticked under.
    [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({
      key: "",
      ids: new Set(),
    });
  const jumpTo = useRef<string | null>(null);
  // A batch request is on its way: refuse a second one before `busy` renders.
  const batching = useRef(false);
  // The filters now, for a moderation that finishes after back/forward
  // changed them: its outcome must not be applied to the new list.
  const currentQuery = useRef(query);
  useEffect(() => {
    currentQuery.current = query;
  }, [query]);
  const showError = (e: unknown) => action.setError(message(e));
  const stories = usePagedList<AdminStory>(
    query,
    admin,
    async (cursor) => {
      const d = await api.listAdminStories(new URLSearchParams(query), cursor);
      return { items: d.stories, nextCursor: d.nextCursor };
    },
    showError,
  );

  async function loadSummary() {
    try {
      setSummary(await api.getAdminSummary());
      setAdmin(true);
      onAuthorized(true);
    } catch (e) {
      setAdmin(false);
      onAuthorized(false);
      throw e;
    }
  }
  useEffect(() => {
    action.run(loadSummary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A story opened from feedback or the log that wasn't loaded: its card
  // shows once the id filter's page arrives (or it is gone by then).
  useEffect(() => {
    if (!jumpTo.current || stories.listedKey !== query) return;
    if (!scrollToStory(jumpTo.current)) setNotice("找不到這篇故事，可能已過期或被刪除。");
    jumpTo.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories.items, stories.listedKey]);

  // The cards shown were listed under other filters (the new ones' first page
  // is on its way): nothing is ticked or sent until it arrives.
  const listing = stories.listedKey !== query;
  // Changing the filters clears the selection for good: returning to the
  // earlier filters must not bring its ticks back (adjust-state-during-render).
  if (selection.key !== query && selection.ids.size > 0)
    setSelection({ key: query, ids: new Set() });
  // A card that left the list (deleted, gone, another page) drops out of the selection.
  const ticked = selection.key === query ? selection.ids : new Set<string>();
  const selected = stories.items.filter((s) => ticked.has(s.id));
  const selectedIds = new Set(selected.map((s) => s.id));
  function select(ids: string[], on: boolean) {
    setSelection((prev) => {
      const next = new Set(prev.key === query ? prev.ids : []);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return { key: query, ids: next };
    });
  }

  function setFilter(next: StoryFilter) {
    const qs = filterQuery(next);
    router.push(qs ? `/admin?${qs}` : "/admin", { scroll: false });
  }
  function openStory(id: string) {
    if (scrollToStory(id)) return;
    const target: StoryFilter = { ...NO_FILTER, status: "all", id };
    if (filterQuery(target) === query) {
      setNotice("找不到這篇故事，可能已過期或被刪除。");
      return;
    }
    jumpTo.current = id;
    setFilter(target);
  }
  function showFeedback(s: AdminStory) {
    setFeedbackStory({ id: s.id, title: s.title });
    requestAnimationFrame(() => document.getElementById("admin-feedback")?.focus());
  }
  function note(id: string, text?: string) {
    setNotes((prev) => {
      const byId = prev.key === query ? { ...prev.byId } : {};
      if (text) byId[id] = text;
      else delete byId[id];
      return { key: query, byId };
    });
  }
  /** New counts after a story changed. */
  async function refreshSummary() {
    setSummary(await api.getAdminSummary());
  }
  /** Fetches a story again after a single decision; its card stays and shows the result. */
  async function refreshCard(id: string) {
    const current = await api.getAdminStory(id);
    if (current) stories.replace(current);
  }

  function moderate(s: AdminStory, status: ModerationAction) {
    if (
      status === "delete" &&
      !confirm(`永久刪除《${s.title}》（${taipeiDate(s.created)}）及其回饋與授權紀錄？無法復原。`)
    )
      return;
    const started = query;
    return action.run(async () => {
      note(s.id);
      try {
        await api.moderateStory(s.id, status, status === "delete" ? undefined : s);
        if (currentQuery.current !== started) {
          // The filters changed meanwhile (back/forward): reload that list instead.
          stories.reload();
          setEventsKey((k) => k + 1);
          if (status === "delete") setFeedbackKey((k) => k + 1);
          setNotice(
            status === "delete"
              ? `已刪除《${s.title}》（${taipeiDate(s.created)}）`
              : "已更新文章狀態。",
          );
          await refreshSummary();
          return;
        }
      } catch (e) {
        // 409: changed since listed; 400: e.g. expired meanwhile. Look at this
        // one story again instead of reloading the list (filters, scroll).
        if (!(e instanceof api.ApiError) || (e.status !== 409 && e.status !== 400)) throw e;
        const current = await api.getAdminStory(s.id);
        if (!current) {
          stories.remove(s.id);
          setNotice(`《${s.title}》已不在系統中（可能已過期或被刪除），已從清單移除。`);
        } else if (e.status === 409) {
          stories.replace(current);
          note(s.id, "這篇剛剛改變了，請再看一次。");
          setNotice("這篇剛剛改變了，請再看一次。");
        } else throw e;
        await refreshSummary();
        return;
      }
      // Logged: the operation log reloads. Only a delete takes feedback with it.
      setEventsKey((k) => k + 1);
      if (status === "delete") {
        stories.remove(s.id);
        if (feedbackStory?.id === s.id) setFeedbackStory(null);
        setFeedbackKey((k) => k + 1);
        setNotice(`已刪除《${s.title}》（${taipeiDate(s.created)}）`);
      } else {
        await refreshCard(s.id);
        setNotice("已更新文章狀態。");
      }
      await refreshSummary();
    });
  }

  /**
   * 不通過或下架 (the ticked pending / approved ones) or 永久刪除 (all ticked).
   * The outcome is applied as soon as the POST answers: deleted cards leave
   * the list, and so do rejected ones unless the status filter lists
   * rejected stories (暫不分享 or 全部), where they are fetched again. Refused
   * ones stay ticked with the reason on the card and are fetched again (new
   * statusAt / consentEvents for the next try); gone ones leave. A fetch that
   * fails keeps the card as it was, with a note.
   */
  function moderateSelected(status: "rejected" | "delete") {
    if (batching.current || listing) return;
    const targets = status === "delete" ? selected : selected.filter(canReject);
    if (targets.length === 0) return;
    if (targets.length > api.MAX_BATCH) {
      action.setError(`一次最多處理 ${api.MAX_BATCH} 篇，目前要處理 ${targets.length} 篇。`);
      return;
    }
    const titles = someTitles(targets);
    const question =
      status === "delete"
        ? `永久刪除 ${targets.length} 篇（含回饋與授權紀錄），無法復原：${titles}`
        : `不通過或下架 ${targets.length} 篇：${titles}` +
          (targets.length < selected.length
            ? `\n（勾選的另外 ${selected.length - targets.length} 篇不是等待審閱或已匿名分享，不受影響。）`
            : "");
    if (!confirm(question)) return;
    // Rejected stories are fetched again on a list that can show them (and
    // leave it if other filters, e.g. expiring, no longer match); any other
    // list drops them at once.
    const keepRejected = filter.status === "rejected" || filter.status === "all";
    const started = query;
    const moved = () => currentQuery.current !== started;
    batching.current = true;
    void action
      .run(async () => {
        for (const s of targets) note(s.id);
        const results = await api.moderateStories(status, targets);
        const done = results.filter((r) => r.ok).map((r) => r.id);
        const failed = results.filter((r) => !r.ok);

        if (moved()) {
          // The filters changed meanwhile (back/forward): this outcome belongs
          // to the earlier list, so the current one is loaded again instead.
          stories.reload();
          if (done.length) {
            setEventsKey((k) => k + 1);
            if (status === "delete") setFeedbackKey((k) => k + 1);
          }
          setNotice(
            `${status === "delete" ? "已永久刪除" : "已不通過或下架"} ${done.length} 篇` +
              (failed.length ? `；${failed.length} 篇未處理` : "") +
              "。清單已依目前的篩選重新載入。",
          );
          await refreshSummary();
          return;
        }
        // The outcome first, so a failing fetch below can't leave it unshown.
        const refetchDone = status === "rejected" && keepRejected;
        const leaving = refetchDone ? [] : done;
        for (const id of leaving) stories.remove(id);
        for (const r of failed) note(r.id, batchError(r).note);
        // Only the refused ones stay ticked.
        select(
          targets.map((s) => s.id),
          false,
        );
        select(
          failed.map((r) => r.id),
          true,
        );
        const verb = status === "delete" ? "已永久刪除" : "已不通過或下架";
        const counts = new Map<string, number>();
        for (const r of failed) {
          const { count } = batchError(r);
          counts.set(count, (counts.get(count) ?? 0) + 1);
        }
        const summaryText =
          `${verb} ${done.length} 篇` +
          (failed.length
            ? `；${failed.length} 篇未處理（${[...counts].map(([c, n]) => `${n} 篇${c}`).join("、")}）`
            : "");
        setNotice(summaryText + "。");
        if (done.length) {
          // Logged: the operation log reloads. Only a delete takes feedback with it.
          setEventsKey((k) => k + 1);
          if (status === "delete") {
            if (feedbackStory && done.includes(feedbackStory.id)) setFeedbackStory(null);
            setFeedbackKey((k) => k + 1);
          }
        }

        // Then fetch again what stays on the list: rejected ones shown here, and every refused one.
        const again = [...(refetchDone ? done : []), ...failed.map((r) => r.id)];
        const [counted, ...fetched] = await Promise.allSettled([
          refreshSummary(),
          ...again.map((id) => api.getAdminStory(id)),
        ]);
        if (moved()) {
          stories.reload();
          if (counted.status === "rejected") throw counted.reason;
          return;
        }
        const isFailed = new Set(failed.map((r) => r.id));
        let removed = 0,
          stale = 0;
        fetched.forEach((f, i) => {
          const id = again[i];
          if (f.status === "rejected") {
            stale++;
            const reason = isFailed.has(id)
              ? batchError(failed.find((r) => r.id === id)!).note
              : "";
            note(id, `${reason}（未能重新載入這篇，請按「重新整理」。）`);
          } else if (f.value && (isFailed.has(id) || stillListed(f.value, filter)))
            // Refused ones stay to show why; decided ones only while the filters match.
            stories.replace(f.value);
          else {
            stories.remove(id);
            if (isFailed.has(id)) removed++;
          }
        });
        let text = summaryText;
        if (removed)
          text += removed === failed.length ? "，已從清單移除" : `，其中 ${removed} 篇已從清單移除`;
        if (stale) text += `；${stale} 篇未能重新載入，請按「重新整理」`;
        setNotice(text + "。");
        if (counted.status === "rejected") throw counted.reason;
      })
      .finally(() => {
        batching.current = false;
      });
  }

  return (
    <>
      <StatusMessage action={action} />
      {admin && (
        <section className={styles.admin}>
          <SectionIntro eyebrow="管理者專用" title="把關每一封來信">
            <span className="sentence">只審核原文。</span>
            <span className="sentence">不同意分享的片段不能公開。</span>
            <span className="sentence">
              核准公開的投稿保留到撤回（舊版同意者仍為送出後 30 天）；未公開投稿、回饋與試寫紀錄 30
              天後清除。
            </span>
          </SectionIntro>
          <SummaryBar summary={summary} />
          <p className="quiet">
            投稿依送出時間由新到舊，每次載入 50
            篇；回饋與試寫是事件筆數，不是獨立人數。示範故事回饋會標示，不當成真實內容需求證據。
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              action.run(async () => {
                await loadSummary();
                await stories.reload();
                setFeedbackKey((k) => k + 1);
                setEventsKey((k) => k + 1);
              })
            }
          >
            重新整理
          </button>
          <WritingMetrics metrics={summary?.metrics ?? []} />
          <StoryFilters
            key={query}
            filter={filter}
            summary={summary}
            disabled={busy}
            onChange={setFilter}
          />
          <StoryList
            stories={stories.items}
            notes={notes.key === query ? notes.byId : {}}
            loaded={stories.loaded}
            loading={stories.loading}
            more={stories.more}
            busy={busy || listing}
            selectable={!busy && !listing}
            selected={selectedIds}
            onSelect={(id, on) => select([id], on)}
            batchBar={
              <BatchBar
                loaded={stories.items.length}
                allTicked={stories.items
                  .slice(0, api.MAX_BATCH)
                  .every((s) => selectedIds.has(s.id))}
                selected={selected}
                disabled={busy || listing}
                onSelectAll={() =>
                  select(
                    stories.items.slice(0, api.MAX_BATCH).map((s) => s.id),
                    true,
                  )
                }
                onClear={() => setSelection({ key: query, ids: new Set() })}
                onModerate={moderateSelected}
              />
            }
            onMore={stories.loadMore}
            onModerate={moderate}
            onShowFeedback={showFeedback}
          />
          <FeedbackList
            enabled={admin}
            story={feedbackStory}
            refreshKey={feedbackKey}
            action={action}
            onClearStory={() => setFeedbackStory(null)}
            onOpenStory={openStory}
            onDeleted={(f) => {
              // Removed from the feedback list itself; the card's count and the log change.
              refreshCard(f.story).catch(showError);
              setEventsKey((k) => k + 1);
            }}
          />
          <EventLog
            enabled={admin}
            refreshKey={eventsKey}
            onOpenStory={openStory}
            onError={showError}
          />
        </section>
      )}
    </>
  );
}
