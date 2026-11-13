import { MAX_BATCH } from "../../lib/api-client";
import type { AdminStory } from "../../lib/stories";
import chips from "../common/Chips.module.css";
import admin from "./AdminDashboard.module.css";

/** 不通過或下架 applies to these only (as for a single story); 永久刪除 to any. */
export const canReject = (s: AdminStory) => s.status === "pending" || s.status === "approved";

/**
 * Batch actions on the ticked cards (#4 §5.2). Never approval: every story
 * must be read before it goes public. 全選 ticks the loaded cards only.
 * 不通過或下架 sends only the ticked pending / approved ones and is disabled,
 * with the reason, when there are none; more than MAX_BATCH is refused here
 * rather than cut short.
 */
export default function BatchBar({
  loaded,
  selected,
  busy,
  onSelectAll,
  onClear,
  onModerate,
}: {
  /** The cards on the page. */
  loaded: number;
  selected: AdminStory[];
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onModerate: (status: "rejected" | "delete") => void;
}) {
  const rejectable = selected.filter(canReject).length;
  const tooMany = selected.length > MAX_BATCH;
  const why = (text: string) => (
    <p id="batch-note" className={admin.batchNote}>
      {text}
    </p>
  );
  return (
    <div className={admin.batch} role="group" aria-label="批次操作">
      <div className={chips.chips}>
        <button disabled={busy || selected.length === loaded} onClick={onSelectAll}>
          全選已載入的 {loaded} 篇
        </button>
        <button disabled={busy || selected.length === 0} onClick={onClear}>
          取消全選
        </button>
        <span className={admin.batchCount} aria-live="polite">
          已勾選 {selected.length} 篇
        </span>
      </div>
      {selected.length > 0 && (
        <>
          <div className={chips.chips}>
            <button
              disabled={busy || rejectable === 0 || tooMany}
              aria-describedby={rejectable === 0 || tooMany ? "batch-note" : undefined}
              onClick={() => onModerate("rejected")}
            >
              不通過或下架勾選的 {rejectable} 篇
            </button>
            <button
              className="danger"
              disabled={busy || tooMany}
              aria-describedby={tooMany ? "batch-note" : undefined}
              onClick={() => onModerate("delete")}
            >
              永久刪除勾選的 {selected.length} 篇
            </button>
          </div>
          {tooMany
            ? why(`一次最多處理 ${MAX_BATCH} 篇，目前勾選 ${selected.length} 篇，請先取消一些。`)
            : rejectable === 0
              ? why("勾選的都不是等待審閱或已匿名分享，不能不通過或下架。")
              : rejectable < selected.length &&
                why(
                  `不通過或下架只處理其中等待審閱或已匿名分享的 ${rejectable} 篇，其餘 ${selected.length - rejectable} 篇不受影響。`,
                )}
        </>
      )}
    </div>
  );
}
