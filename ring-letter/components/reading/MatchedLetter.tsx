"use client";
import type { MatchLetter } from "../../data/matching";
import StoryPaper from "../story/StoryPaper";
import paper from "../story/StoryPaper.module.css";
import FormLink from "./FormLink";
import styles from "./MatchedLetter.module.css";

/** The letter being read, with 有回應到我 / 再讀一封 / 留下回音. */
export default function MatchedLetter({
  letter,
  resonated,
  onResonate,
  nextLetter,
}: {
  letter: MatchLetter;
  resonated: string[];
  onResonate: () => void;
  nextLetter: () => void;
}) {
  return (
    <StoryPaper
      className={styles.matchedLetter}
      data-letter-id={letter.id}
      data-scenario={letter.scenario}
      label={letter.isExample ? "範例信 · 虛構示範" : "經授權的去識別化信件"}
      mark={letter.scenario}
      after={
        <>
          <div className={styles.actions}>
            <button
              className="secondary"
              data-event="match_resonated"
              aria-pressed={resonated.includes(letter.id)}
              onClick={onResonate}
            >
              有回應到我
            </button>
            <button className="secondary" data-event="match_next" onClick={nextLetter}>
              再讀一封
            </button>
            <FormLink kind="echo" className="secondary" onPaper>
              留下回音
            </FormLink>
          </div>
          {resonated.includes(letter.id) && (
            <p className={paper.demoNote} role="status">
              謝謝你停下來讀這封信。這個選擇只留在這次頁面中，尚未送出或儲存。
            </p>
          )}
        </>
      }
    >
      <dl className={styles.metadata}>
        <div>
          <dt>寫作年份</dt>
          <dd>
            寫於 {letter.year} 年{letter.isExample ? "（範例設定）" : ""}
          </dd>
        </div>
        <div>
          <dt>作者當時的情境</dt>
          <dd>{letter.situation}</dd>
        </div>
        <div>
          <dt>媒合理由</dt>
          <dd>{letter.matchReason}</dd>
        </div>
      </dl>
      <div className={paper.body}>{letter.body}</div>
    </StoryPaper>
  );
}
