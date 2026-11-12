"use client";
import { useEffect, useState } from "react";
import * as api from "../../lib/api-client";
import { DEMO_STORIES } from "../../data/demo-stories";
import type { Story } from "../../lib/stories";
import { useAction } from "../../lib/use-action";
import StatusMessage from "../common/StatusMessage";
import NavButton from "../shell/NavButton";
import StoryExtra from "../story/StoryExtra";
import StoryMeta from "../story/StoryMeta";
import StoryPaper from "../story/StoryPaper";
import ReaderFeedback from "./ReaderFeedback";

/** 先前公開信箱: approved stories (or the demos) one at a time, with reader feedback. */
export default function ArchiveReader() {
  const action = useAction();
  const { setError, setNotice } = action;
  const [stories, setStories] = useState<Story[]>([]),
    [index, setIndex] = useState(0),
    [loading, setLoading] = useState(true);
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
        <StoryPaper
          label={current.source === "demo" ? "示範故事 · AI 虛構創作" : "真人投稿 · 經作者同意"}
          mark="✦"
          after={
            current.source === "demo" && (
              <p className="demo-note">
                這不是使用者投稿，也不代表真實事件。這段文字僅用來試讀介面。
              </p>
            )
          }
        >
          <StoryMeta story={current} />
          <h2>{current.title}</h2>
          <div className="story-body">{current.body}</div>
          <StoryExtra story={current} />
        </StoryPaper>
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
          <NavButton to="/write" className="text-btn">
            留下我的片段
          </NavButton>
        </div>
        <ReaderFeedback storyId={current.id} action={action} onMore={() => setIndex(index + 1)} />
      </section>
    </>
  );
}
