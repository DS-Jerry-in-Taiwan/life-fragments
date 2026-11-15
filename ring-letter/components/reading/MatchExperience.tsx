"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MATCH_LETTERS, type Scenario } from "../../data/matching";
import DistressEntry from "./DistressEntry";
import MatchedLetter from "./MatchedLetter";
import MatchingCare from "./MatchingCare";
import ScenarioFilter from "./ScenarioFilter";
import styles from "./MatchExperience.module.css";

const noSubscribe = () => () => {};
/** False while the server renders and during hydration, true after: the random letter is client-only. */
const useMounted = () =>
  useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

export default function MatchExperience() {
  const mounted = useMounted();
  const [scenario, setScenario] = useState<Scenario | null>(null),
    // Only read once mounted, so the server's pick never reaches the page.
    [index, setIndex] = useState(() => Math.floor(Math.random() * MATCH_LETTERS.length)),
    [resonated, setResonated] = useState<string[]>([]),
    // Bumped when the reader asks for another letter; not on the first one.
    [shown, setShown] = useState(0);
  const article = useRef<HTMLElement>(null);
  const letters = scenario ? MATCH_LETTERS.filter((l) => l.scenario === scenario) : MATCH_LETTERS;
  const letter = letters[index % letters.length];
  useEffect(() => {
    const el = article.current;
    if (!shown || !el) return;
    el.focus({ preventScroll: true });
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  }, [shown]);
  function nextLetter() {
    setIndex((current) =>
      letters.length > 1
        ? (current + 1 + Math.floor(Math.random() * (letters.length - 1))) % letters.length
        : 0,
    );
    setShown((n) => n + 1);
  }
  function filter(next: Scenario | null) {
    const pool = next ? MATCH_LETTERS.filter((l) => l.scenario === next) : MATCH_LETTERS;
    setScenario(next);
    setIndex(Math.floor(Math.random() * pool.length));
    setShown((n) => n + 1);
  }
  return (
    <section className={styles.matchExperience} id="match-experience" aria-labelledby="match-title">
      <div className={styles.intro}>
        <p className="eyebrow">跨時間的相遇</p>
        <h1 id="match-title">先讀一封，不必先寫</h1>
        <p>先讓一封信來到你面前。想換個故事，就再讀一封。</p>
        <p className="quiet">
          這是隨機試讀的範例信，不是針對你的困擾所做的媒合。閱讀時不會自動換信。
        </p>
      </div>
      <ScenarioFilter scenario={scenario} filter={filter} />
      {!mounted ? (
        <div className={styles.letterPlaceholder}>
          <noscript>
            <p className="quiet">請啟用 JavaScript 以閱讀範例信。</p>
          </noscript>
        </div>
      ) : (
        letter && (
          <MatchedLetter
            ref={article}
            letter={letter}
            resonated={resonated}
            onResonate={() =>
              setResonated((v) =>
                v.includes(letter.id) ? v.filter((id) => id !== letter.id) : [...v, letter.id],
              )
            }
            nextLetter={nextLetter}
          />
        )
      )}
      <DistressEntry />
      <MatchingCare />
    </section>
  );
}
