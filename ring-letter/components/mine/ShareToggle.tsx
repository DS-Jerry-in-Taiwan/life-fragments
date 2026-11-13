"use client";
import { useState } from "react";
import type { Story } from "../../lib/stories";
import { AdultCheckbox, PrivacyCheckbox, ShareCheckbox } from "../write/ConsentFields";
import styles from "./ShareToggle.module.css";

/** Matches MAX_SHARE_REQUESTS in lib/server/db/consent-events.ts. */
const MAX_SHARE_REQUESTS = 3;

/**
 * The sharing action for one of this browser's stories (#4 §6.1): private or
 * rejected → 改為分享 / 再次申請分享, after ticking the current consent again;
 * pending or approved → 停止分享. Keyed on the status by its parent, so the
 * open confirm form closes once the status changes.
 */
export default function ShareToggle({
  story,
  busy,
  onShare,
  onStop,
}: {
  story: Story;
  busy: boolean;
  onShare: (id: string, consent: { adult: boolean; privacy: boolean; share: boolean }) => void;
  onStop: (story: Story) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const status = story.status || "pending";
  if (status === "pending" || status === "approved")
    return (
      <div className={styles.toggle}>
        <button className="secondary" disabled={busy} onClick={() => onStop(story)}>
          停止分享
        </button>
      </div>
    );
  if (status !== "private" && status !== "rejected") return null;

  const label = status === "private" ? "改為分享" : "再次申請分享";
  const left = story.shareRequestsLeft ?? 0;
  if (left <= 0)
    return (
      <div className={styles.toggle}>
        <button className="secondary" disabled>
          {label}
        </button>
        <p className={styles.note}>
          這篇已申請分享 {MAX_SHARE_REQUESTS} 次，已達上限，無法再申請；仍可保持不公開，或撤回刪除。
        </p>
      </div>
    );
  if (!confirming)
    return (
      <div className={styles.toggle}>
        <button className="secondary" disabled={busy} onClick={() => setConfirming(true)}>
          {label}
        </button>
      </div>
    );
  return (
    <form
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
      <div className={styles.buttons}>
        <button type="submit" className="secondary" disabled={busy}>
          確認申請分享
        </button>
        <button
          type="button"
          className="text-btn"
          disabled={busy}
          onClick={() => setConfirming(false)}
        >
          取消
        </button>
      </div>
    </form>
  );
}
