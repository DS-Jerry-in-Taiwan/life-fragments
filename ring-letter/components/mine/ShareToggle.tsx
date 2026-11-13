"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Story } from "../../lib/stories";
import { AdultCheckbox, PrivacyCheckbox, ShareCheckbox } from "../write/ConsentFields";
import styles from "./ShareToggle.module.css";

/** Matches MAX_SHARE_REQUESTS in lib/server/db/consent-events.ts. */
const MAX_SHARE_REQUESTS = 3;

export type ShareConsent = { adult: boolean; privacy: boolean; share: boolean };

/**
 * The sharing action for one of this browser's stories (#4 §6.1): private or
 * rejected → 改為分享 / 再次申請分享, after ticking the current consent again;
 * pending or approved → 停止分享. Keyed on the status by its parent, so the
 * open confirm form closes once the status changes.
 *
 * `error`: why this story's last sharing change failed, shown here (next to
 * the form or button) rather than only at the top of the page.
 * `focus`: this story's sharing just changed; take focus once idle, so it
 * doesn't fall back to the page body when the old controls go away; then
 * `onFocused` (the parent clears `focus`).
 */
export default function ShareToggle({
  story,
  busy,
  error,
  focus,
  onFocused,
  onShare,
  onStop,
}: {
  story: Story;
  busy: boolean;
  error?: string;
  focus?: boolean;
  onFocused?: () => void;
  onShare: (id: string, consent: ShareConsent) => void;
  onStop: (story: Story) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const returnFocus = useRef(false);
  const noteId = useId();

  useEffect(() => {
    if (confirming) form.current?.querySelector("input")?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      button.current?.focus();
    }
  }, [confirming]);
  useEffect(() => {
    if (!focus || busy) return;
    if (button.current && !button.current.disabled) button.current.focus();
    else container.current?.focus();
    onFocused?.();
  }, [focus, busy, onFocused]);

  const status = story.status || "pending";
  const errorText = error && (
    <p role="alert" className={`${styles.note} ${styles.error}`}>
      {error}
    </p>
  );
  if (status === "pending" || status === "approved")
    return (
      <div className={styles.toggle} ref={container} tabIndex={-1}>
        <button ref={button} className="secondary" disabled={busy} onClick={() => onStop(story)}>
          停止分享
        </button>
        {errorText}
      </div>
    );
  if (status !== "private" && status !== "rejected") return null;

  const label = status === "private" ? "改為分享" : "再次申請分享";
  const left = story.shareRequestsLeft ?? 0;
  if (left <= 0)
    return (
      <div className={styles.toggle} ref={container} tabIndex={-1}>
        <button ref={button} className="secondary" disabled aria-describedby={noteId}>
          {label}
        </button>
        <p id={noteId} className={styles.note}>
          這篇已申請分享 {MAX_SHARE_REQUESTS} 次，已達上限，無法再申請；仍可保持不公開，或撤回刪除。
        </p>
        {errorText}
      </div>
    );
  if (!confirming)
    return (
      <div className={styles.toggle} ref={container} tabIndex={-1}>
        <button
          ref={button}
          className="secondary"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          {label}
        </button>
        {errorText}
      </div>
    );
  return (
    <form
      ref={form}
      className={`${styles.toggle} ${styles.confirm}`}
      aria-label={label}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onShare(story.id, {
          adult: f.get("adult") === "on",
          privacy: f.get("privacy") === "on",
          share: f.get("share") === "on",
        });
      }}
    >
      <p>
        <span className="sentence">申請分享前，請再確認以下三項。</span>
        <span className="sentence">
          送出後會重新經人工審閱，通過後才會匿名公開；審閱不會改寫原文。
        </span>
        <span className="sentence">這篇還可以申請 {left} 次。</span>
      </p>
      <ShareCheckbox />
      <AdultCheckbox />
      <PrivacyCheckbox />
      {errorText}
      <div className={styles.buttons}>
        <button type="submit" className="secondary" disabled={busy}>
          確認申請分享
        </button>
        <button
          type="button"
          className="text-btn"
          disabled={busy}
          onClick={() => {
            returnFocus.current = true;
            setConfirming(false);
          }}
        >
          取消
        </button>
      </div>
    </form>
  );
}
