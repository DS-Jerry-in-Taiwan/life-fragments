import type { Metadata } from "next";
import PrivacyContent from "../../components/privacy/PrivacyContent";
import styles from "../../components/privacy/Privacy.module.css";

export const metadata: Metadata = { title: "資料使用說明" };

// The same notice the forms open as a dialog, at a linkable address.
export default function PrivacyPage() {
  return (
    <section className={`${styles.modal} ${styles.page}`} aria-labelledby="privacy-page-title">
      <PrivacyContent page />
    </section>
  );
}
