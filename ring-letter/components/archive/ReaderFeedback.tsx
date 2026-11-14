"use client";
import { useRef, useState } from "react";
import * as api from "../../lib/api-client";
import type { FeedbackKind } from "../../lib/stories";
import type { Action } from "../../lib/use-action";
import CheckboxField from "../common/CheckboxField";
import chips from "../common/Chips.module.css";
import Turnstile, { type TurnstileHandle } from "../common/Turnstile";
import reader from "./ArchiveReader.module.css";
import styles from "./ReaderFeedback.module.css";

/** Optional reader feedback on the story being shown (consent first). */
export default function ReaderFeedback({
  storyId,
  action,
  onMore,
}: {
  storyId: string;
  action: Action;
  /** 想繼續讀 also turns to the next story. */
  onMore: () => void;
}) {
  const { busy, setError, setNotice } = action;
  const [feedbackConsent, setFeedbackConsent] = useState(false),
    [note, setNote] = useState(""),
    [sent, setSent] = useState<string[]>([]),
    // Turnstile loads once the box is opened, not for every reader.
    [opened, setOpened] = useState(false);
  const turnstile = useRef<TurnstileHandle>(null);
  function react(kind: FeedbackKind) {
    if (!feedbackConsent) {
      setError("請先勾選同意保存本次體驗回饋。你也可以不留回饋，直接閱讀下一篇。");
      return;
    }
    return action.run(async () => {
      try {
        await api.sendFeedback(storyId, kind, note, () => turnstile.current!.getToken());
      } finally {
        turnstile.current?.reset();
      }
      setNotice(kind === "report" ? "已收到問題回報，管理者會查看。" : "謝謝，你的回饋已保存。");
      setSent([...sent, storyId + kind]);
      setNote("");
      if (kind === "more") {
        onMore();
        setNotice("翻到另一段故事。");
      }
    });
  }
  return (
    <details
      className={styles.feedbackBox}
      onToggle={(e) => e.currentTarget.open && setOpened(true)}
    >
      <summary>願意告訴我們讀起來如何嗎？</summary>
      <CheckboxField
        checked={feedbackConsent}
        onChange={(e) => setFeedbackConsent(e.target.checked)}
      >
        我已滿 18 歲，同意保存本次回饋供團隊測試分析，提供 30
        天存取，過期不再顯示並於後續清理。可在「我的片段」刪除。
      </CheckboxField>
      <div className={chips.chips}>
        {(
          [
            ["resonate", "有一點共鳴"],
            ["neutral", "沒有特別感覺"],
            ["more", "想繼續讀"],
          ] as const
        ).map(([k, t]) => (
          <button disabled={busy || sent.includes(storyId + k)} key={k} onClick={() => react(k)}>
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
          disabled={busy || !note.trim()}
          onClick={() => react("comment")}
        >
          送出回饋
        </button>
        <button className="text-btn" disabled={busy} onClick={() => react("report")}>
          回報這篇有問題
        </button>
      </div>
    </details>
  );
}
