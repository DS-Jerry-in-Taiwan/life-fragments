"use client";
import { useEffect, useState } from "react";
import { MATCH_LETTERS, type Scenario } from "../../data/matching";
import DistressEntry from "./DistressEntry";
import MatchedLetter from "./MatchedLetter";
import MatchingCare from "./MatchingCare";
import ScenarioFilter from "./ScenarioFilter";

export default function MatchExperience() {
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
      <ScenarioFilter scenario={scenario} filter={filter} />
      {letter && (
        <MatchedLetter
          letter={letter}
          resonated={resonated}
          onResonate={() => setResonated((v) => (v.includes(letter.id) ? v : [...v, letter.id]))}
          nextLetter={nextLetter}
        />
      )}
      <DistressEntry />
      <MatchingCare />
    </section>
  );
}
