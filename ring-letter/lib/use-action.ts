import { useState } from "react";

/**
 * busy / error / notice for one screen (#4 §4.4), replacing the page-wide
 * state that let one screen's message overwrite another's.
 */
export function useAction(initialBusy = false) {
  const [busy, setBusy] = useState(initialBusy);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
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
