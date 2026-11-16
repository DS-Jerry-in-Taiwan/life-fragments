"use client";
import type { MatchLetter } from "../../data/matching";
import Arrow from "../common/Arrow";
import StoryPaper from "../story/StoryPaper";
import paper from "../story/StoryPaper.module.css";
import FormLink from "./FormLink";
import styles from "./MatchedLetter.module.css";

/**
 * The letter being read, in DESIGN.md's reading order: the envelope line,
 * then the paper (the writer's situation, the letter, the postscript and
 * 有回應到我), then what comes next: 再讀一封 and 留下回音｜尚未開放. The
 * next step comes after the letter and is never pinned to the screen.
 */
export default function MatchedLetter({
  letter,
  resonated,
  onResonate,
  nextLetter,
  ref,
}: {
  letter: MatchLetter;
  resonated: string[];
  onResonate: () => void;
  nextLetter: () => void;
  /** The article, focused when another letter is shown (MatchExperience). */
  ref?: React.Ref<HTMLElement>;
}) {
  const pressed = resonated.includes(letter.id);
  return (
    <>
      <p className={styles.envelope}>
        <span>{letter.isExample ? "範例信 · 虛構示範" : "經授權的去識別化信件"}</span>
        <span>
          寫於 {letter.year} 年{letter.isExample ? "（範例設定）" : ""} · {letter.scenario}
        </span>
      </p>
      <StoryPaper
        className={styles.matchedLetter}
        ref={ref}
        tabIndex={-1}
        data-letter-id={letter.id}
        data-scenario={letter.scenario}
        after={
          <>
            <dl className={styles.postscript}>
              <dt>這類信的共同處</dt>
              <dd>{letter.matchReason}</dd>
            </dl>
            <div className={styles.mark}>
              <button
                className="secondary"
                data-event="match_resonated"
                aria-pressed={pressed}
                onClick={onResonate}
              >
                有回應到我
              </button>
            </div>
            {pressed && (
              <p className={paper.demoNote} role="status">
                謝謝你停下來讀這封信。這個選擇只留在這次頁面中，尚未送出或儲存。
              </p>
            )}
          </>
        }
      >
        <dl className={styles.situation}>
          <dt>作者當時的情境</dt>
          <dd>{letter.situation}</dd>
        </dl>
        <div className={`${paper.body} ${styles.body}`}>{letter.body}</div>
      </StoryPaper>
      <div className={styles.next}>
        <button className="primary" data-event="match_next" onClick={nextLetter}>
          再讀一封 <Arrow />
        </button>
        <FormLink kind="echo">留下回音</FormLink>
      </div>
    </>
  );
}
