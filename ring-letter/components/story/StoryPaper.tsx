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
  /** Top-left line, e.g. 示範故事 · AI 虛構創作. */
  label: React.ReactNode;
  /** Top-right mark: ✦ or the scenario. */
  mark: React.ReactNode;
  children: React.ReactNode;
  /** Shown below the closing · · ·. */
  after?: React.ReactNode;
} & { [key: `data-${string}`]: string }) {
  return (
    <article className={className ? `story-paper ${className}` : "story-paper"} {...data}>
      <div className="story-top">
        <span>{label}</span>
        <span>{mark}</span>
      </div>
      {children}
      <div className="story-end">· · ·</div>
      {after}
    </article>
  );
}
