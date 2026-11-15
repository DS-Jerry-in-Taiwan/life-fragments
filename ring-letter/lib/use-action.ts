import { useEffect, useState } from "react";

/*
 * How many screens have a request in flight. While any has, <html> carries
 * `data-busy`, and base.css shows the `wait` cursor on disabled buttons;
 * otherwise a disabled button shows `not-allowed` (V5-c7). A data attribute,
 * not aria-busy: on the root (or a screen's container) aria-busy would tell
 * screen readers to hold back the live regions inside it, such as
 * 「正在處理…」 and the error alerts.
 */
let inFlight = 0;

/** Marks the page busy (see above) while `busy` is true. */
export function useBusyCursor(busy: boolean) {
  useEffect(() => {
    if (!busy) return;
    inFlight++;
    document.documentElement.dataset.busy = "";
    return () => {
      if (--inFlight === 0) delete document.documentElement.dataset.busy;
    };
  }, [busy]);
}

/**
 * busy / error / notice for one screen (#4 §4.4), replacing the page-wide
 * state that let one screen's message overwrite another's.
 */
export function useAction(initialBusy = false) {
  const [busy, setBusy] = useState(initialBusy);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useBusyCursor(busy);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, notice, setError, setNotice, run };
}

export type Action = ReturnType<typeof useAction>;
