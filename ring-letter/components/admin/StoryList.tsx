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
  selectable,
  selected,
  batchBar,
  onSelect,
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
  /** The checkboxes can change (not while busy, nor before the filters' first page). */
  selectable: boolean;
  /** Ids of the ticked cards. */
  selected: Set<string>;
  /** The batch actions, above the cards when there are any. */
  batchBar: React.ReactNode;
  onSelect: (id: string, on: boolean) => void;
  onMore: () => void;
  onModerate: (story: AdminStory, status: ModerationAction) => void;
  onShowFeedback: (story: AdminStory) => void;
}) {
  return (
    <>
      <h2>投稿審閱</h2>
      {loaded && stories.length === 0 && <p className={admin.emptySmall}>沒有符合條件的投稿。</p>}
      {stories.length > 0 && batchBar}
      {stories.map((s) => (
        <StoryCard
          key={s.id}
          story={s}
          busy={busy}
          note={notes[s.id]}
          selected={selected.has(s.id)}
          selectable={selectable}
          onSelect={onSelect}
          onModerate={onModerate}
          onShowFeedback={onShowFeedback}
        />
      ))}
      {more && (
        <button className="secondary" disabled={loading || busy} onClick={onMore}>
          載入更多
        </button>
      )}
    </>
  );
}
