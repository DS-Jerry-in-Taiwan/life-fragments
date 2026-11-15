import { FORM_URL_DISTRESS, FORM_URL_ECHO } from "../../data/matching";
import styles from "./FormLink.module.css";

/** Marks an entry that isn't open yet, on the entry itself (#51). */
export function NotOpenTag() {
  return <span className={styles.tag}>尚未開放</span>;
}

/**
 * Link to an external form. While the URL is still "#" it is plain text
 * with 尚未開放 beside it, not a control: nothing to press only to be told
 * no (#51).
 */
export default function FormLink({
  kind,
  children,
  className = "primary",
  onPaper = false,
}: {
  kind: "distress" | "echo";
  children: React.ReactNode;
  className?: string;
  /** Sits on the letter paper: dark text. */
  onPaper?: boolean;
}) {
  const href = kind === "distress" ? FORM_URL_DISTRESS : FORM_URL_ECHO;
  if (href === "#") {
    return (
      <span
        className={onPaper ? `${styles.closed} ${styles.onPaper}` : styles.closed}
        data-form={kind}
      >
        {children}
        <NotOpenTag />
      </span>
    );
  }
  return (
    <a
      className={className}
      href={href}
      data-event={kind === "echo" ? "echo_click" : "distress_click"}
    >
      {children}
    </a>
  );
}
