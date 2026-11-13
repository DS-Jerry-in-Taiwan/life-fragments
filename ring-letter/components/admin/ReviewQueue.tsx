import type { ModerationAction, Story } from "../../lib/stories";
import StatusPill from "../story/StatusPill";
import StoryExtra from "../story/StoryExtra";
import StoryMeta from "../story/StoryMeta";
import chips from "../common/Chips.module.css";
import own from "../story/OwnStory.module.css";
import pill from "../story/StatusPill.module.css";
import admin from "./AdminDashboard.module.css";

export default function ReviewQueue({
  review,
  busy,
  onModerate,
}: {
  review: Story[];
  busy: boolean;
  onModerate: (id: string, status: ModerationAction) => void;
}) {
  return (
    <>
      <h2>投稿審閱</h2>
      {review.length === 0 && <p className={admin.emptySmall}>尚無投稿，收到後會出現在這裡。</p>}
      {review.map((s) => (
        <article className={own.ownStory} key={s.id}>
          <StatusPill status={s.status} />
          {s.status === "pending" && (s.shareRequests ?? 0) > 0 && (
            <span className={`${pill.pill} ${admin.reshare}`}>重新申請分享</span>
          )}
          <StoryMeta story={s} />
          {(s.consentEvents ?? 0) > 1 && (
            <p className={admin.consentHistory}>
              授權紀錄 {s.consentEvents} 筆（送出後申請分享 {s.shareRequests ?? 0} 次）
            </p>
          )}
          <h3>{s.title}</h3>
          <p className="prewrap">{s.body}</p>
          <StoryExtra story={s} />
          <div className={chips.chips}>
            {s.status !== "private" && (
              <>
                <button disabled={busy} onClick={() => onModerate(s.id, "approved")}>
                  核准分享原文
                </button>
                <button disabled={busy} onClick={() => onModerate(s.id, "rejected")}>
                  暫不分享／下架
                </button>
              </>
            )}
            <button className="danger" disabled={busy} onClick={() => onModerate(s.id, "delete")}>
              永久刪除
            </button>
          </div>
        </article>
      ))}
    </>
  );
}
