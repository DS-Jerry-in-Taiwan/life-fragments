import type { ModerationAction, Story } from "../../lib/stories";
import StatusPill from "../story/StatusPill";
import StoryExtra from "../story/StoryExtra";
import StoryMeta from "../story/StoryMeta";

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
          <StatusPill status={s.status} />
          <StoryMeta story={s} />
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
