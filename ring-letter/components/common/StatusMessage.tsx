import type { Action } from "../../lib/use-action";

/** The error / notice banner at the top of a screen. */
export default function StatusMessage({ action }: { action: Action }) {
  const { error, notice, setError } = action;
  return (
    <>
      {error && (
        <div role="alert" className="message error">
          {error}
          <button onClick={() => setError("")} aria-label="關閉錯誤">
            ×
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="message">
          {notice}
        </div>
      )}
    </>
  );
}
