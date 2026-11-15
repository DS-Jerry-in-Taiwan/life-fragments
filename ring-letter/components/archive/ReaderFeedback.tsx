"use client";
import { useId, useRef, useState } from "react";
import * as api from "../../lib/api-client";
import type { FeedbackKind } from "../../lib/stories";
import type { Action } from "../../lib/use-action";
import CheckboxField from "../common/CheckboxField";
import chips from "../common/Chips.module.css";
import StatusMessage from "../common/StatusMessage";
import Turnstile, { type TurnstileHandle } from "../common/Turnstile";
import reader from "./ArchiveReader.module.css";
import styles from "./ReaderFeedback.module.css";

/**
 * Optional reader feedback on the story being shown. Its buttons stay
 * disabled, described by the consent line, until that is ticked; errors and
 * results show inside the box, next to the buttons (V5-c6, #33).
 */
export default function ReaderFeedback({
  storyId,
  action,
  onMore,
}: {
  storyId: string;
  action: Action;
  /** 想繼續讀 also turns to the next story; absent when there is only one. */
  onMore?: () => void;
}) {
  const { busy, setNotice } = action;
  const [feedbackConsent, setFeedbackConsent] = useState(false),
    [note, setNote] = useState(""),
    [sent, setSent] = useState<string[]>([]),
    // Turnstile loads once the box is opened, not for every reader.
    [opened, setOpened] = useState(false);
  const turnstile = useRef<TurnstileHandle>(null);
  const consentId = useId();
  // Until the consent is ticked, every button points at it.
  const describedBy = feedbackConsent ? undefined : consentId;
  function react(kind: FeedbackKind) {
    if (!feedbackConsent) return;
    return action.run(async () => {
      try {
        await api.sendFeedback(storyId, kind, note, () => turnstile.current!.getToken());
      } finally {
        turnstile.current?.reset();
      }
      setNotice(kind === "report" ? "已收到問題回報，管理者會查看。" : "謝謝，你的回饋已保存。");
      setSent([...sent, storyId + kind]);
      setNote("");
      if (kind === "more" && onMore) {
        onMore();
        setNotice("翻到另一段故事。");
      }
    });
  }
  return (
    <details
      className={styles.feedbackBox}
      onToggle={(e) => {
        const box = e.currentTarget;
        if (box.open) setOpened(true);
        // Closing while sending would hide an interactive Turnstile challenge
        // (its deadline is paused then), so keep the box open until it's done.
        else if (busy) box.open = true;
      }}
    >
      <summary>願意告訴我們讀起來如何嗎？</summary>
      <CheckboxField
        checked={feedbackConsent}
        onChange={(e) => setFeedbackConsent(e.target.checked)}
      >
        <span id={consentId}>
          我已滿 18 歲，同意保存本次回饋供團隊測試分析，提供 30
          天存取，過期不再顯示並於後續清理。可在「我的片段」刪除。
        </span>
      </CheckboxField>
      <div className={chips.chips}>
        {(
          [
            ["resonate", "有一點共鳴"],
            ["neutral", "沒有特別感覺"],
            ["more", "想繼續讀"],
          ] as const
        ).map(([k, t]) => (
          <button
            disabled={!feedbackConsent || busy || sent.includes(storyId + k)}
            aria-describedby={describedBy}
            key={k}
            onClick={() => react(k)}
          >
            {sent.includes(storyId + k) ? "✓ 已記錄" : t}
          </button>
        ))}
      </div>
      <label htmlFor="note">有沒有哪個細節留下印象？也可以說哪裡不適合。</label>
      <textarea
        id="note"
        maxLength={500}
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="可不填。請不要留下姓名或聯絡方式。"
      />
      {opened && <Turnstile action="feedback" ref={turnstile} />}
      <div className={reader.actions}>
        <button
          className="secondary"
          disabled={!feedbackConsent || busy || !note.trim()}
          aria-describedby={describedBy}
          onClick={() => react("comment")}
        >
          送出回饋
        </button>
        <button
          className="text-btn"
          disabled={!feedbackConsent || busy}
          aria-describedby={describedBy}
          onClick={() => react("report")}
        >
          回報這篇有問題
        </button>
      </div>
      <StatusMessage action={action} />
    </details>
  );
}
