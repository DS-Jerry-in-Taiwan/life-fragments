import { MAX_BODY } from "./letterBody";
import styles from "./WriteFlow.module.css";

/** The id the body textareas point to (aria-describedby), so the count is read with them. */
export const BODY_COUNT_ID = "letter-body-count";

/** Live 「N／1,500」 of the letter body as it will be sent (letterBody.ts); numbers only. */
export default function BodyCount({ length }: { length: number }) {
  return (
    <p id={BODY_COUNT_ID} className={styles.count} data-over={length > MAX_BODY || undefined}>
      {length.toLocaleString("en-US")}／{MAX_BODY.toLocaleString("en-US")}
    </p>
  );
}
