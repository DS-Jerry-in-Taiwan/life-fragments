import type { Story } from "../../lib/stories";
import styles from "./StoryExtra.module.css";

/** Mood (present letters) and 現在回頭看 (past letters). `onPaper` on the light letter paper (公開信箱). */
export default function StoryExtra({
  story: s,
  onPaper = false,
}: {
  story: Story;
  onPaper?: boolean;
}) {
  return (
    <>
      {s.mood && <p className={styles.mood}>此刻心情：{s.mood}</p>}
      {s.reflection && (
        <aside className={onPaper ? `${styles.reflection} ${styles.onPaper}` : styles.reflection}>
          <h3>現在回頭看</h3>
          <p className="prewrap">{s.reflection}</p>
        </aside>
      )}
    </>
  );
}
