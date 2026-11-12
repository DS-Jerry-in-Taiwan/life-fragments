import { SCENARIOS, type Scenario } from "../../data/matching";
import styles from "./ScenarioFilter.module.css";

/** Optional: read letters from one scenario only. */
export default function ScenarioFilter({
  scenario,
  filter,
}: {
  scenario: Scenario | null;
  filter: (next: Scenario | null) => void;
}) {
  return (
    <details className={styles.scenarioFilter}>
      <summary>想讀特定情境？（選填）</summary>
      <div className={styles.buttons} aria-label="選擇信件情境">
        <button className="secondary" aria-pressed={scenario === null} onClick={() => filter(null)}>
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
  );
}
