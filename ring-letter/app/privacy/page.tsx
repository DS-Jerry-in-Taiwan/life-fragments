import PrivacyContent from "../../components/privacy/PrivacyContent";

// The same notice the forms open as a dialog, at a linkable address.
export default function PrivacyPage() {
  return (
    <section className="modal privacy-page" aria-labelledby="privacy-page-title">
      <PrivacyContent page />
    </section>
  );
}
