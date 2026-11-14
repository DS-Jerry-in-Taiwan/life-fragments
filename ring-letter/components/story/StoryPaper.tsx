import styles from "./StoryPaper.module.css";

/** The letter-paper frame shared by the archive and the reading page. */
export default function StoryPaper({
  className = "",
  label,
  mark,
  children,
  after,
  ...data
}: {
  className?: string;
  /** Top-left line, e.g. 真人投稿 · 經作者同意. */
  label: React.ReactNode;
  /** Top-right mark: ✦ or the scenario. */
  mark: React.ReactNode;
  children: React.ReactNode;
  /** Shown below the closing · · ·. */
  after?: React.ReactNode;
} & { [key: `data-${string}`]: string }) {
  return (
    <article
      className={className ? `${styles.storyPaper} ${className}` : styles.storyPaper}
      {...data}
    >
      <div className={styles.top}>
        <span>{label}</span>
        <span>{mark}</span>
      </div>
      {children}
      <div className={styles.end}>· · ·</div>
      {after}
    </article>
  );
}
