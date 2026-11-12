"use client";
import { useEffect, useState } from "react";
import * as api from "../../lib/api-client";
import { DEMO_STORIES } from "../../data/demo-stories";
import { formatStoryMeta, type FeedbackKind, type Story } from "../../lib/stories";
import { useAction } from "../../lib/use-action";
import StatusMessage from "../common/StatusMessage";
import StoryExtra from "../story/StoryExtra";

/** 先前公開信箱: approved stories (or the demos) one at a time, with reader feedback. */
export default function ArchiveReader({ onWrite }: { onWrite: () => void }) {
  const action = useAction();
  const { busy, setError, setNotice } = action;
  const [stories, setStories] = useState<Story[]>([]),
    [index, setIndex] = useState(0),
    [loading, setLoading] = useState(true),
    [feedbackConsent, setFeedbackConsent] = useState(false),
    [note, setNote] = useState(""),
    [sent, setSent] = useState<string[]>([]);
  const list = stories.length ? stories : DEMO_STORIES;
  const current = list[index % list.length];
  useEffect(() => {
    api
      .listApprovedStories()
      .then(setStories)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function react(kind: FeedbackKind) {
    if (!feedbackConsent) {
      setError("請先勾選同意保存本次體驗回饋。你也可以不留回饋，直接閱讀下一篇。");
      return;
    }
    return action.run(async () => {
      await api.sendFeedback(current.id, kind, note);
      setNotice(kind === "report" ? "已收到問題回報，管理者會查看。" : "謝謝，你的回饋已保存。");
      setSent([...sent, current.id + kind]);
      setNote("");
      if (kind === "more") {
        setIndex(index + 1);
        setNotice("翻到另一段故事。");
      }
    });
  }
  return (
    <>
      <StatusMessage action={action} />
      <section className="reading">
        <div className="section-intro">
          <p className="eyebrow">時光信箱</p>
          <h1>
            <span className="heading-phrase">有一段生活，</span>
            <span className="heading-phrase">在這裡等你。</span>
          </h1>
          <p>
            {loading
              ? "正在查看信箱…"
              : stories.length
                ? "以下是作者同意分享、經審閱的真實片段。"
                : "信箱剛剛開啟。先讀一段示範，感受這裡的節奏。"}
          </p>
        </div>
        <article className="story-paper">
          <div className="story-top">
            <span>
              {current.source === "demo" ? "示範故事 · AI 虛構創作" : "真人投稿 · 經作者同意"}
            </span>
            <span>✦</span>
          </div>
          <p className="era">{formatStoryMeta(current)}</p>
          <h2>{current.title}</h2>
          <div className="story-body">{current.body}</div>
          <StoryExtra story={current} />
          <div className="story-end">· · ·</div>
          {current.source === "demo" && (
            <p className="demo-note">
              這不是使用者投稿，也不代表真實事件。這段文字僅用來試讀介面。
            </p>
          )}
        </article>
        <div className="reader-actions">
          <button
            className="secondary"
            onClick={() => {
              setIndex(index + 1);
              setNotice("");
              setError("");
            }}
          >
            再讀一封 →
          </button>
          <button className="text-btn" onClick={onWrite}>
            留下我的片段
          </button>
        </div>
        <details className="feedback-box">
          <summary>願意告訴我們讀起來如何嗎？</summary>
          <label className="check">
            <input
              type="checkbox"
              checked={feedbackConsent}
              onChange={(e) => setFeedbackConsent(e.target.checked)}
            />
            我已滿 18 歲，同意保存本次回饋供團隊測試分析，提供 30
            天存取，過期不再顯示並於後續清理。可在「我的片段」刪除。
          </label>
          <div className="chips">
            {(
              [
                ["resonate", "有一點共鳴"],
                ["neutral", "沒有特別感覺"],
                ["more", "想繼續讀"],
              ] as const
            ).map(([k, t]) => (
              <button
                disabled={busy || sent.includes(current.id + k)}
                key={k}
                onClick={() => react(k)}
              >
                {sent.includes(current.id + k) ? "✓ 已記錄" : t}
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
          <div className="reader-actions">
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
      </section>
    </>
  );
}
