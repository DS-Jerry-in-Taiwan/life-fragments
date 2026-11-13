import { useState } from "react";
import * as api from "../../lib/api-client";
import type { AdminFeedback, FeedbackKind } from "../../lib/stories";
import type { Action } from "../../lib/use-action";
import chips from "../common/Chips.module.css";
import admin from "./AdminDashboard.module.css";
import styles from "./FeedbackList.module.css";
import filterStyles from "./StoryFilters.module.css";
import { taipeiTime } from "./filters";
import { usePagedList } from "./usePagedList";

const KIND_NAME: Record<FeedbackKind, string> = {
  more: "想繼續讀",
  resonate: "有共鳴",
  neutral: "無特別感覺",
  comment: "文字回饋",
  report: "⚑ 問題回報",
};

const KINDS: FeedbackKind[] = ["report", "comment", "more", "resonate", "neutral"];

/**
 * The last 30 days of feedback (GET /api/admin/feedback), problem reports
 * first. Filtered by kind here, and by story from a card's 看回饋 button.
 */
export default function FeedbackList({
  enabled,
  story,
  refreshKey,
  action,
  onClearStory,
  onOpenStory,
  onDeleted,
}: {
  enabled: boolean;
  /** Only this story's feedback (from a card), or all. */
  story: { id: string; title: string } | null;
  /** Changes when a moderation may have removed feedback: reload. */
  refreshKey: number;
  /** The dashboard's busy / error / notice. */
  action: Action;
  onClearStory: () => void;
  /** Go to the story's card (or look it up when not loaded). */
  onOpenStory: (id: string) => void;
  onDeleted: (f: AdminFeedback) => void;
}) {
  const [kind, setKind] = useState<FeedbackKind | "">("");
  const list = usePagedList<AdminFeedback>(
    `${kind}|${story?.id ?? ""}|${refreshKey}`,
    enabled,
    async (cursor) => {
      const d = await api.listAdminFeedback({ kind: kind || undefined, story: story?.id }, cursor);
      return { items: d.feedback, nextCursor: d.nextCursor };
    },
    (e) => action.setError(e instanceof Error ? e.message : String(e)),
  );
  function remove(f: AdminFeedback) {
    if (!confirm(`刪除這筆${KIND_NAME[f.kind]}（${taipeiTime(f.created)}）？無法復原。`)) return;
    return action.run(async () => {
      try {
        await api.deleteFeedback(f.id);
      } catch (e) {
        if (e instanceof api.ApiError && e.status === 404) list.remove(f.id);
        throw e;
      }
      list.remove(f.id);
      action.setNotice("已刪除這筆回饋。");
      onDeleted(f);
    });
  }
  return (
    <>
      <h2 id="admin-feedback" tabIndex={-1}>
        閱讀回饋與回報
      </h2>
      <div className={`${chips.chips} ${filterStyles.filters} ${admin.sectionFilter}`}>
        <button aria-pressed={kind === ""} onClick={() => setKind("")}>
          全部（問題回報在前）
        </button>
        {KINDS.map((k) => (
          <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {KIND_NAME[k]}
          </button>
        ))}
      </div>
      {story && (
        <p className="quiet">
          只顯示《{story.title}》的回饋。
          <button className="text-btn" onClick={onClearStory}>
            顯示全部回饋
          </button>
        </p>
      )}
      {list.loaded && list.items.length === 0 && <p className={admin.emptySmall}>尚無回饋。</p>}
      {list.items.map((f) => (
        <article className={styles.item} key={f.id}>
          <span>{KIND_NAME[f.kind]}</span>
          <small>
            {f.story.startsWith("demo-") ? (
              "示範故事"
            ) : f.storyTitle !== null ? (
              <button className={styles.title} onClick={() => onOpenStory(f.story)}>
                《{f.storyTitle}》
              </button>
            ) : (
              "文章已不在系統中"
            )}{" "}
            · {taipeiTime(f.created)}
          </small>
          <p>{f.note || "未留文字"}</p>
          <button className="danger" disabled={action.busy} onClick={() => remove(f)}>
            刪除這筆回饋
          </button>
        </article>
      ))}
      {list.more && (
        <button className="secondary" disabled={list.loading} onClick={list.loadMore}>
          載入更多回饋
        </button>
      )}
    </>
  );
}
