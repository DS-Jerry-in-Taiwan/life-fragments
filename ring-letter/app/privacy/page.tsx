import PrivacyContent from "../../components/privacy/PrivacyContent";
import styles from "../../components/privacy/Privacy.module.css";

// The same notice the forms open as a dialog, at a linkable address.
export default function PrivacyPage() {
  return (
    <section className={`${styles.modal} ${styles.page}`} aria-labelledby="privacy-page-title">
      <PrivacyContent page />
    </section>
  );
}
