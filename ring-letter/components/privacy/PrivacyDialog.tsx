"use client";
import { useLayoutEffect, useRef } from "react";
import PrivacyContent from "./PrivacyContent";
import styles from "./Privacy.module.css";

/**
 * The data-use notice as a modal, like ConfirmDialog (V5-c4): a native
 * <dialog> opened with showModal(), so the page under it is inert, Esc
 * closes it, focus starts inside and goes back to the button that opened
 * it. While a modal dialog is open the page under it doesn't scroll (base.css).
 */
export default function PrivacyDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null),
    close = useRef<HTMLButtonElement>(null),
    opener = useRef<Element | null>(null);
  useLayoutEffect(() => {
    const el = dialog.current!;
    // Before showModal() moves focus: the button that opened it.
    opener.current = document.activeElement;
    if (!el.open) el.showModal();
    close.current?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`${styles.modal} ${styles.dialog}`}
      aria-labelledby="privacy-title"
      // Both buttons close it through the form; Esc closes it directly.
      onClose={() => {
        const back = opener.current;
        if (back instanceof HTMLElement && back.isConnected) back.focus();
        onClose();
      }}
    >
      <form method="dialog">
        <button ref={close} className={styles.close} aria-label="關閉說明">
          ×
        </button>
        <PrivacyContent />
        <button className="primary">我了解了</button>
      </form>
    </dialog>
  );
}
