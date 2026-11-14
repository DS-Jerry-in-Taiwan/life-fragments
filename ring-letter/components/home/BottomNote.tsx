import styles from "./BottomNote.module.css";

export default function BottomNote() {
  return (
    <section className={styles.bottomNote}>
      <div>
        <span className={styles.tinyStar} aria-hidden="true">✦</span>
        <p>讓真實的片段留下來</p>
      </div>
      <p>
        這裡沒有追蹤與私訊。
        <br />
        只有文字，和願意停留片刻的你。
      </p>
      <div className={styles.badge}>
        早期體驗版 <span aria-hidden="true">·</span> 手機也能閱讀
      </div>
    </section>
  );
}
