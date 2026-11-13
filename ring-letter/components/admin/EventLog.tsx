import { useState } from "react";
import * as api from "../../lib/api-client";
import type { AdminEvent } from "../../lib/stories";
import admin from "./AdminDashboard.module.css";
import feedbackStyles from "./FeedbackList.module.css";
import { taipeiTime } from "./filters";
import { usePagedList } from "./usePagedList";

const ACTION_NAME: Record<AdminEvent["action"], string> = {
  approve: "核准分享",
  reject: "暫不分享／下架",
  delete_story: "永久刪除故事",
  delete_feedback: "刪除回饋",
};

/**
 * 操作紀錄 (GET /api/admin/events): who approved, rejected or deleted what,
 * newest first. A story still in the system links to its card; a deleted
 * one shows 「（已刪除）」. Only ids are kept, never content.
 */
export default function EventLog({
  enabled,
  refreshKey,
  onOpenStory,
  onError,
}: {
  enabled: boolean;
  /** Changes after every operation: reload. */
  refreshKey: number;
  onOpenStory: (id: string) => void;
  onError: (e: unknown) => void;
}) {
  const [adminEmail, setAdminEmail] = useState("");
  const [admins, setAdmins] = useState<string[]>([]);
  const list = usePagedList<AdminEvent>(
    `${adminEmail}|${refreshKey}`,
    enabled,
    async (cursor) => {
      const d = await api.listAdminEvents(adminEmail, cursor);
      setAdmins(d.admins);
      return { items: d.events, nextCursor: d.nextCursor };
    },
    onError,
  );
  return (
    <>
      <h2>操作紀錄</h2>
      {admins.length > 0 && (
        <label className={admin.sectionFilter}>
          管理者
          <select value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}>
            <option value="">全部</option>
            {admins.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
      )}
      {list.loaded && list.items.length === 0 && <p className={admin.emptySmall}>尚無操作紀錄。</p>}
      {list.items.map((e) => (
        <article className={feedbackStyles.item} key={e.id}>
          <span>{ACTION_NAME[e.action]}</span>
          <small>
            {taipeiTime(e.created)} · {e.adminEmail}
          </small>
          <p>
            {e.targetType === "story" ? "故事 " : "回饋 "}
            {e.targetType === "story" && e.targetExists ? (
              <button className={feedbackStyles.title} onClick={() => onOpenStory(e.targetId)}>
                {e.targetId}
              </button>
            ) : (
              e.targetId
            )}
            {!e.targetExists && "（已刪除）"}
          </p>
        </article>
      ))}
      {list.more && (
        <button className="secondary" disabled={list.loading} onClick={list.loadMore}>
          載入更多紀錄
        </button>
      )}
    </>
  );
}
