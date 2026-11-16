import styles from "./HeroIllustration.module.css";

/** A moon and one sheet of paper (DESIGN.md: no orbits or sparkles). */
export default function HeroIllustration() {
  return (
    <div className={styles.illustration} aria-hidden="true">
      <div className={styles.moon} />
      <div className={styles.sheet}>
        <p className={styles.to}>致，某一天讀到這裡的你</p>
        <p className={styles.line}>
          那時候的我，
          <br />
          也還不知道
          <br />
          後來會怎麼樣。
        </p>
        <p className={styles.from}>一段生活，另一個時刻。</p>
      </div>
    </div>
  );
}
