"use client";
import { useEffect, useState } from "react";
import { MATCH_LETTERS, SCENARIOS, type Scenario } from "../../data/matching";
import FormLink from "./FormLink";
import MatchingCare from "./MatchingCare";

export default function MatchExperience({ onWrite }: { onWrite: () => void }) {
  const [scenario, setScenario] = useState<Scenario | null>(null),
    [index, setIndex] = useState(0),
    [resonated, setResonated] = useState<string[]>([]);
  const letters = scenario ? MATCH_LETTERS.filter((l) => l.scenario === scenario) : MATCH_LETTERS;
  const letter = letters[index % letters.length];
  useEffect(() => {
    setIndex(Math.floor(Math.random() * MATCH_LETTERS.length));
  }, []);
  function nextLetter() {
    setIndex((current) =>
      letters.length > 1
        ? (current + 1 + Math.floor(Math.random() * (letters.length - 1))) % letters.length
        : 0,
    );
  }
  function filter(next: Scenario | null) {
    const pool = next ? MATCH_LETTERS.filter((l) => l.scenario === next) : MATCH_LETTERS;
    setScenario(next);
    setIndex(Math.floor(Math.random() * pool.length));
  }
  return (
    <section className="match-experience" id="match-experience" aria-labelledby="match-title">
      <div className="match-intro">
        <p className="eyebrow">跨時間的相遇</p>
        <h2 id="match-title">先讀一封，不必先寫</h2>
        <p>先讓一封信來到你面前。想換個故事，就再讀一封。</p>
        <p className="quiet">
          這是隨機試讀的範例信，不是針對你的困擾所做的媒合。閱讀時不會自動換信。
        </p>
      </div>
      <details className="scenario-filter">
        <summary>想讀特定情境？（選填）</summary>
        <div className="scenario-buttons" aria-label="選擇信件情境">
          <button
            className="secondary"
            aria-pressed={scenario === null}
            onClick={() => filter(null)}
          >
            隨機遇見
          </button>
          {SCENARIOS.map((s) => (
            <button
              key={s}
              className="secondary"
              aria-pressed={s === scenario}
              onClick={() => filter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </details>
      {letter && (
        <article
          className="story-paper matched-letter"
          data-letter-id={letter.id}
          data-scenario={letter.scenario}
        >
          <div className="story-top">
            <span>{letter.isExample ? "範例信 · 虛構示範" : "經授權的去識別化信件"}</span>
            <span>{letter.scenario}</span>
          </div>
          <dl className="match-metadata">
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
          <div className="story-body">{letter.body}</div>
          <div className="story-end">· · ·</div>
          <div className="match-actions">
            <button
              className="secondary"
              data-event="match_resonated"
              aria-pressed={resonated.includes(letter.id)}
              onClick={() => setResonated((v) => (v.includes(letter.id) ? v : [...v, letter.id]))}
            >
              有回應到我
            </button>
            <button className="secondary" data-event="match_next" onClick={nextLetter}>
              再讀一封
            </button>
            <FormLink kind="echo" className="secondary">
              留下回音
            </FormLink>
          </div>
          {resonated.includes(letter.id) && (
            <p className="demo-note" role="status">
              謝謝你停下來讀這封信。這個選擇只留在這次頁面中，尚未送出或儲存。
            </p>
          )}
        </article>
      )}
      <div className="distress-entry">
        <button className="primary" onClick={onWrite}>
          寫一封信
        </button>
        <p className="quiet">
          回想一段經歷，或記下現在的感受。你可以選擇只保存，或同意審閱後匿名分享。
        </p>
        <details className="manual-match-entry">
          <summary>想參加人工媒合？</summary>
          <p className="quiet">
            投稿不會自動報名媒合。人工媒合另需確認收信與文字後續使用的意願；開放後約需 1–3
            天處理，不保證一定有相似的信。
          </p>
          <FormLink kind="distress" className="secondary">
            前往人工媒合表單
          </FormLink>
        </details>
      </div>
      <MatchingCare />
    </section>
  );
}
