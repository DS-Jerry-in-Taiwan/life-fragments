import styles from "./SectionIntro.module.css";

/** The centred eyebrow, title and intro at the top of a screen. */
export default function SectionIntro({
  eyebrow,
  title,
  titleRef,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  /** Makes the title focusable from script (tabIndex -1), to move focus to a new screen. */
  titleRef?: React.Ref<HTMLHeadingElement>;
  /** The intro paragraph's content. */
  children: React.ReactNode;
}) {
  return (
    <div className={styles.sectionIntro}>
      <p className="eyebrow">{eyebrow}</p>
      <h1 ref={titleRef} tabIndex={titleRef ? -1 : undefined}>
        {title}
      </h1>
      <p>{children}</p>
    </div>
  );
}
