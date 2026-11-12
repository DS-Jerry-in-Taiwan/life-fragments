import PrivacyContent from "./PrivacyContent";

export default function PrivacyDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
        <button className="close" onClick={onClose} aria-label="關閉說明">
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
