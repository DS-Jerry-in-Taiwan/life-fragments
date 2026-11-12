import type { Feedback, Story } from "../../lib/stories";
import styles from "./StatsBar.module.css";

export default function StatsBar({ review, feedback }: { review: Story[]; feedback: Feedback[] }) {
  return (
    <div className={styles.stats}>
      <div>
        <strong>{review.filter((s) => s.status === "pending").length}</strong>待審投稿
      </div>
      <div>
        <strong>{review.filter((s) => s.status === "approved").length}</strong>已分享
      </div>
      <div>
        <strong>{feedback.filter((f) => f.kind === "more").length}</strong>想繼續讀 · 次數
      </div>
      <div>
        <strong>{feedback.length}</strong>回饋筆數
      </div>
    </div>
  );
}
