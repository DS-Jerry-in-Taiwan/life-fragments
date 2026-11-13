import type { AdminStory, ModerationAction } from "../../lib/stories";
import chips from "../common/Chips.module.css";
import StatusPill from "../story/StatusPill";
import StoryExtra from "../story/StoryExtra";
import StoryMeta from "../story/StoryMeta";
import own from "../story/OwnStory.module.css";
import pill from "../story/StatusPill.module.css";
import admin from "./AdminDashboard.module.css";
import { daysLeft, storyAnchor, taipeiDate } from "./filters";

/** "v3-2026-11-12:adult,privacy,share" → "v3-2026-11-12"; early stories have none. */
function consentVersion(consent: string) {
  const i = consent.indexOf(":");
  return i > 0 ? consent.slice(0, i) : "早期（無版本）";
}

/**
 * One story for review. The id and submission date are what an admin checks
 * against an author's deletion request; 剩 N 天 is when the retention job
 * deletes it (nothing for a story kept until withdrawn).
 */
export default function StoryCard({
  story: s,
  busy,
  note,
  selected,
  selectable,
  onSelect,
  onModerate,
  onShowFeedback,
}: {
  story: AdminStory;
  busy: boolean;
  /** Ticked for a batch action (BatchBar). */
  selected: boolean;
  selectable: boolean;
  onSelect: (id: string, on: boolean) => void;
  /** Why the card was just refreshed (409: 這篇剛剛改變了; a batch's 未處理 reason). */
  note?: string;
  onModerate: (story: AdminStory, status: ModerationAction) => void;
  onShowFeedback: (story: AdminStory) => void;
}) {
  return (
    <article className={own.ownStory} id={storyAnchor(s.id)} tabIndex={-1}>
      {note && (
        <p role="status" className={admin.cardNote}>
          {note}
        </p>
      )}
      <label className={`check ${admin.select}`}>
        <input
          type="checkbox"
          checked={selected}
          disabled={!selectable}
          aria-label={`勾選《${s.title}》`}
          onChange={(e) => onSelect(s.id, e.target.checked)}
        />
        勾選
      </label>
      <StatusPill status={s.status} />
      {s.status === "pending" && s.shareRequests > 0 && (
        <span className={`${pill.pill} ${admin.reshare}`}>重新申請分享</span>
      )}
      <p className={admin.consentHistory}>
        <span className={admin.storyId}>{s.id}</span> · 投稿 {taipeiDate(s.created)} · 同意版本{" "}
        {consentVersion(s.consent)}（{s.terms === "v3" ? "新條款" : "舊條款"}）
        {s.expiresAt !== null && ` · 剩 ${daysLeft(s.expiresAt)} 天`}
      </p>
      <StoryMeta story={s} />
      {s.consentEvents > 1 && (
        <p className={admin.consentHistory}>
          授權紀錄 {s.consentEvents} 筆（送出後申請分享 {s.shareRequests} 次）
        </p>
      )}
      <h3>{s.title}</h3>
      <p className="prewrap">{s.body}</p>
      <StoryExtra story={s} />
      <div className={chips.chips}>
        {s.status !== "private" && (
          <>
            <button disabled={busy} onClick={() => onModerate(s, "approved")}>
              核准分享原文
            </button>
            <button disabled={busy} onClick={() => onModerate(s, "rejected")}>
              暫不分享／下架
            </button>
          </>
        )}
        {s.feedbackCount > 0 && (
          <button onClick={() => onShowFeedback(s)}>看回饋（{s.feedbackCount}）</button>
        )}
        <button className="danger" disabled={busy} onClick={() => onModerate(s, "delete")}>
          永久刪除
        </button>
      </div>
    </article>
  );
}
