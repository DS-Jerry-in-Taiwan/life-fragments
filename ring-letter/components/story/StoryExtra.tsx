import type { Story } from "../../lib/stories";

/** Mood (present letters) and 現在回頭看 (past letters). */
export default function StoryExtra({ story: s }: { story: Story }) {
  return (
    <>
      {s.mood && <p className="mood">此刻心情：{s.mood}</p>}
      {s.reflection && (
        <aside className="reflection">
          <h3>現在回頭看</h3>
          <p className="prewrap">{s.reflection}</p>
        </aside>
      )}
    </>
  );
}
