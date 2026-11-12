import styles from "./SectionIntro.module.css";

/** The centred eyebrow, title and intro at the top of a screen. */
export default function SectionIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  /** The intro paragraph's content. */
  children: React.ReactNode;
}) {
  return (
    <div className={styles.sectionIntro}>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  );
}
