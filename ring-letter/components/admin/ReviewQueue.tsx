import { STATUS_NAME, formatStoryMeta, type ModerationAction, type Story } from "../../lib/stories";
import StoryExtra from "../story/StoryExtra";

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
      {review.length === 0 && <p className="empty-small">尚無投稿，收到後會出現在這裡。</p>}
      {review.map((s) => (
        <article className="own-story" key={s.id}>
          <span className="pill">{STATUS_NAME[s.status || "pending"]}</span>
          <p className="era">{formatStoryMeta(s)}</p>
          <h3>{s.title}</h3>
          <p className="prewrap">{s.body}</p>
          <StoryExtra story={s} />
          <div className="chips">
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
