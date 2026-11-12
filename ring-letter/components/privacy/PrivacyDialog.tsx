import PrivacyContent from "./PrivacyContent";
import styles from "./Privacy.module.css";

export default function PrivacyDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.backdrop}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
      >
        <button className={styles.close} onClick={onClose} aria-label="關閉說明">
          ×
        </button>
        <PrivacyContent />
        <button className="primary" onClick={onClose}>
          我了解了
        </button>
      </section>
    </div>
  );
}
