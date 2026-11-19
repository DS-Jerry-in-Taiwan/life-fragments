"use client";
import { useEffect, useRef, useState } from "react";
import * as api from "../../lib/api-client";
import type { Story } from "../../lib/stories";
import { useAction } from "../../lib/use-action";
import Arrow from "../common/Arrow";
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
  // The banner at the top is only for loading the list; the feedback box
  // shows its own errors and results (V5-c6, #33).
  const load = useAction();
  const feedback = useAction();
  const { setError } = load;
  const [stories, setStories] = useState<Story[]>([]),
    [index, setIndex] = useState(0),
    [state, setState] = useState<"loading" | "loaded" | "failed">("loading"),
    // Bumped when the reader turns to another story; not on the first one.
    [shown, setShown] = useState(0);
  const article = useRef<HTMLElement>(null);
  const current = stories.length ? stories[index % stories.length] : null;
  // 再讀一封 only when there is another story to turn to.
  const more = stories.length > 1;
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
  // Same as /read (MatchExperience): bring the new story into view and move
  // focus to it, so keyboard and screen-reader users land on it too.
  useEffect(() => {
    const el = article.current;
    if (!shown || !el) return;
    el.focus({ preventScroll: true });
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  }, [shown]);
  function next() {
    setIndex((i) => i + 1);
    setShown((n) => n + 1);
  }
  return (
    <>
      <StatusMessage action={load} />
      <section className={styles.reading}>
        <div className={styles.intro}>
          <h1>
            <span className={styles.headingPhrase}>有一段生活，</span>
            <span className={styles.headingPhrase}>在這裡等你。</span>
          </h1>
          <p>
            {state === "loading"
              ? "正在查看信箱…"
              : state === "failed"
                ? "暫時打不開信箱，請稍後再試。"
                : current
                  ? "以下是作者同意分享、經審閱的真實片段。"
                  : "這裡只放作者同意分享、經審閱的真實片段。"}
          </p>
        </div>
        {state === "loaded" && !current && (
          <div className={styles.empty}>
            <span className={styles.moon} aria-hidden="true" />
            <h2>信箱還在等第一封信</h2>
            <p>
              <span className="sentence">還沒有公開的片段。</span>
              <span className="sentence">
                可以先讀一封範例信，或留下你的片段；經你同意並審閱後，它才會出現在這裡。
              </span>
            </p>
            <div className={styles.actions}>
              <NavButton to="/read" className="secondary">
                讀一封範例信 <Arrow />
              </NavButton>
              <NavButton to="/write" className="text-btn">
                留下我的片段
              </NavButton>
            </div>
          </div>
        )}
        {current && (
          <>
            <p className={styles.envelope}>真人投稿 · 經作者同意</p>
            <StoryPaper ref={article} tabIndex={-1} data-story-id={current.id}>
              <StoryMeta story={current} onPaper />
              <h2>{current.title}</h2>
              <div className={paper.body}>{current.body}</div>
              <StoryExtra story={current} onPaper />
            </StoryPaper>
            <div className={styles.actions}>
              {more && (
                <button
                  className="primary"
                  onClick={() => {
                    next();
                    feedback.setNotice("");
                    feedback.setError("");
                  }}
                >
                  再讀一封 <Arrow />
                </button>
              )}
              <NavButton to="/write" className="text-btn">
                留下我的片段
              </NavButton>
            </div>
            <ReaderFeedback
              storyId={current.id}
              action={feedback}
              onMore={more ? next : undefined}
            />
          </>
        )}
      </section>
    </>
  );
}
