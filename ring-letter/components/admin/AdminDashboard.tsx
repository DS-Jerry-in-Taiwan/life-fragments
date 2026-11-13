"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as api from "../../lib/api-client";
import type { AdminStory, AdminSummary, ModerationAction } from "../../lib/stories";
import { useAction } from "../../lib/use-action";
import SectionIntro from "../common/SectionIntro";
import StatusMessage from "../common/StatusMessage";
import { useShell } from "../shell/ShellContext";
import EventLog from "./EventLog";
import FeedbackList from "./FeedbackList";
import {
  filterQuery,
  NO_FILTER,
  parseFilter,
  scrollToStory,
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
    [eventsKey, setEventsKey] = useState(0);
  const jumpTo = useRef<string | null>(null);
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
    return action.run(async () => {
      note(s.id);
      try {
        await api.moderateStory(s.id, status, status === "delete" ? undefined : s);
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
          <StoryFilters key={query} filter={filter} summary={summary} onChange={setFilter} />
          <StoryList
            stories={stories.items}
            notes={notes.key === query ? notes.byId : {}}
            loaded={stories.loaded}
            loading={stories.loading}
            more={stories.more}
            busy={busy}
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
