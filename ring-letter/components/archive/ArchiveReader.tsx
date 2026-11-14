"use client";
import { useEffect, useState } from "react";
import * as api from "../../lib/api-client";
import type { Story } from "../../lib/stories";
import { useAction } from "../../lib/use-action";
import SectionIntro from "../common/SectionIntro";
import StatusMessage from "../common/StatusMessage";
import NavButton from "../shell/NavButton";
import StoryExtra from "../story/StoryExtra";
import StoryMeta from "../story/StoryMeta";
import StoryPaper from "../story/StoryPaper";
import paper from "../story/StoryPaper.module.css";
import ReaderFeedback from "./ReaderFeedback";
import styles from "./ArchiveReader.module.css";

/**
 * 公開信箱 (#4 §10 item 5): the approved stories, one at a time, with reader
 * feedback; an empty state until the first one is approved. Only real,
 * consented and reviewed submissions are shown here: the fictional samples
 * live in /read.
 */
export default function ArchiveReader() {
  const action = useAction();
  const { setError, setNotice } = action;
  const [stories, setStories] = useState<Story[]>([]),
    [index, setIndex] = useState(0),
    [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const current = stories.length ? stories[index % stories.length] : null;
  useEffect(() => {
    api
      .listApprovedStories()
      .then((list) => {
        setStories(list);
        setState("loaded");
      })
      .catch((e: Error) => {
        setError(e.message);
        setState("failed");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <StatusMessage action={action} />
      <section className={styles.reading}>
        <SectionIntro
          eyebrow="時光信箱"
          title={
            <>
              <span className={styles.headingPhrase}>有一段生活，</span>
              <span className={styles.headingPhrase}>在這裡等你。</span>
            </>
          }
        >
          {state === "loading"
            ? "正在查看信箱…"
            : state === "failed"
              ? "暫時打不開信箱，請稍後再試。"
              : current
                ? "以下是作者同意分享、經審閱的真實片段。"
                : "這裡只放作者同意分享、經審閱的真實片段。"}
        </SectionIntro>
        {state === "loaded" && !current && (
          <div className={styles.empty}>
            <span aria-hidden="true">☾</span>
            <h2>信箱還在等第一封信</h2>
            <p>
              <span className="sentence">還沒有公開的片段。</span>
              <span className="sentence">
                可以先讀一封範例信，或留下你的片段；經你同意並審閱後，它才會出現在這裡。
              </span>
            </p>
            <div className={styles.actions}>
              <NavButton to="/read" className="secondary">
                讀一封範例信 →
              </NavButton>
              <NavButton to="/write" className="text-btn">
                留下我的片段
              </NavButton>
            </div>
          </div>
        )}
        {current && (
          <>
            <StoryPaper label="真人投稿 · 經作者同意" mark="✦">
              <StoryMeta story={current} />
              <h2>{current.title}</h2>
              <div className={paper.body}>{current.body}</div>
              <StoryExtra story={current} />
            </StoryPaper>
            <div className={styles.actions}>
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
            <ReaderFeedback
              storyId={current.id}
              action={action}
              onMore={() => setIndex(index + 1)}
            />
          </>
        )}
      </section>
    </>
  );
}
