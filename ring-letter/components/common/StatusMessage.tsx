import type { Action } from "../../lib/use-action";
import styles from "./StatusMessage.module.css";

/** The error / notice banner at the top of a screen. */
export default function StatusMessage({ action }: { action: Action }) {
  const { error, notice, setError } = action;
  return (
    <>
      {error && (
        <div role="alert" className={`${styles.message} ${styles.error}`}>
          {error}
          <button onClick={() => setError("")} aria-label="關閉錯誤">
            ×
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className={styles.message}>
          {notice}
        </div>
      )}
    </>
  );
}
