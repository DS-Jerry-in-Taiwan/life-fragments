import type { AdminStory, ModerationAction } from "../../lib/stories";
import admin from "./AdminDashboard.module.css";
import StoryCard from "./StoryCard";

/** The filtered stories, newest first, 50 at a time (載入更多). */
export default function StoryList({
  stories,
  notes,
  loaded,
  loading,
  more,
  busy,
  onMore,
  onModerate,
  onShowFeedback,
}: {
  stories: AdminStory[];
  /** Per story id: why its card was just refreshed. */
  notes: Record<string, string>;
  /** The first page has arrived. */
  loaded: boolean;
  loading: boolean;
  /** There is a next page. */
  more: boolean;
  busy: boolean;
  onMore: () => void;
  onModerate: (story: AdminStory, status: ModerationAction) => void;
  onShowFeedback: (story: AdminStory) => void;
}) {
  return (
    <>
      <h2>投稿審閱</h2>
      {loaded && stories.length === 0 && <p className={admin.emptySmall}>沒有符合條件的投稿。</p>}
      {stories.map((s) => (
        <StoryCard
          key={s.id}
          story={s}
          busy={busy}
          note={notes[s.id]}
          onModerate={onModerate}
          onShowFeedback={onShowFeedback}
        />
      ))}
      {more && (
        <button className="secondary" disabled={loading} onClick={onMore}>
          載入更多
        </button>
      )}
    </>
  );
}
