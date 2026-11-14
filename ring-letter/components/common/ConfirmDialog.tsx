"use client";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styles from "./ConfirmDialog.module.css";

export type ConfirmOptions = {
  /** Short heading, the dialog's accessible name; without one the message is. */
  title?: string;
  /** The question itself (line breaks are kept). */
  message: string;
  /** A verb for what happens, e.g. 確定刪除 / 登出. */
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive: the confirm button is `.danger`. */
  danger?: boolean;
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(async () => false);

/**
 * `const confirm = useConfirm(); if (!(await confirm({…}))) return;` — the
 * site's replacement for window.confirm() (#4 §4.7, V5). Resolves true only
 * for the confirm button; 取消, Esc, a click on the backdrop and leaving
 * the page resolve false.
 */
export const useConfirm = () => useContext(ConfirmContext);

type Request = ConfirmOptions & {
  id: number;
  resolve: (ok: boolean) => void;
  opener: Element | null;
};

/** Holds the one open confirm; in SiteShell, so every route can ask. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const current = useRef<Request | null>(null),
    count = useRef(0);
  const settle = useCallback((ok: boolean) => {
    const r = current.current;
    if (!r) return;
    current.current = null;
    setRequest(null);
    // Back to whatever asked (a button that is still there and usable).
    if (r.opener instanceof HTMLElement && r.opener.isConnected) r.opener.focus();
    r.resolve(ok);
  }, []);
  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        settle(false); // a newer question replaces an unanswered one
        const r = { ...options, id: ++count.current, resolve, opener: document.activeElement };
        current.current = r;
        setRequest(r);
      }),
    [settle],
  );
  // A route change answers no.
  const pathname = usePathname();
  useEffect(() => () => settle(false), [pathname, settle]);
  // So does back/forward that only changes the query (/write?mode=…, the
  // /admin filters). The modal blocks in-page links, so history is the only
  // other way the page under the dialog can change. A popstate listener
  // rather than useSearchParams(), which would need a Suspense boundary
  // around the whole shell.
  useEffect(() => {
    const no = () => settle(false);
    window.addEventListener("popstate", no);
    return () => window.removeEventListener("popstate", no);
  }, [settle]);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && <ConfirmDialog key={request.id} request={request} onClose={settle} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ request, onClose }: { request: Request; onClose: (ok: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId(),
    messageId = useId();
  useLayoutEffect(() => {
    const el = dialog.current!;
    if (!el.open) el.showModal();
    // The safe answer has focus.
    cancel.current?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={request.title ? titleId : messageId}
      aria-describedby={request.title ? messageId : undefined}
      // The buttons close it through the form (returnValue); Esc closes it with "".
      onClose={(e) => onClose(e.currentTarget.returnValue === "confirm")}
      onClick={(e) => {
        // Only the backdrop: the box itself is the inner div.
        if (e.target === e.currentTarget) e.currentTarget.close("cancel");
      }}
    >
      <form method="dialog" className={styles.box}>
        {request.title && <h2 id={titleId}>{request.title}</h2>}
        <p id={messageId}>{request.message}</p>
        <div className={styles.actions}>
          <button ref={cancel} className="secondary" value="cancel">
            {request.cancelLabel ?? "取消"}
          </button>
          <button className={request.danger ? "danger" : "primary"} value="confirm">
            {request.confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
