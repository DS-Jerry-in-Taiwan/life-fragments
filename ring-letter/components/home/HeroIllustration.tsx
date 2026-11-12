import styles from "./HeroIllustration.module.css";

export default function HeroIllustration() {
  return (
    <div className={styles.illustration} aria-hidden="true">
      <div className={styles.orbit} />
      <div className={`${styles.orbit} ${styles.orbitTwo}`} />
      <div className={styles.moon} />
      <span className={`${styles.spark} ${styles.s1}`}>✦</span>
      <span className={`${styles.spark} ${styles.s2}`}>✧</span>
      <span className={`${styles.spark} ${styles.s3}`}>·</span>
      <div className={styles.letterBack} />
      <div className={styles.letterArt}>
        <div className={styles.paperDate}>致，某一天讀到這裡的你</div>
        <p>
          那時候的我，
          <br />
          也還不知道
          <br />
          後來會怎麼樣。
        </p>
        <div className={styles.paperLines} />
        <span className={styles.seal}>rl</span>
      </div>
      <span className={styles.orbitNote}>一段生活，另一個時刻。</span>
    </div>
  );
}
