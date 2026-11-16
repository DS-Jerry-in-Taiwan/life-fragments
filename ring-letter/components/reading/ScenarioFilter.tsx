import { SCENARIOS, type Scenario } from "../../data/matching";
import chips from "../common/Chips.module.css";
import styles from "./ScenarioFilter.module.css";

/** Optional: read letters from one scenario only. Always visible, 44px chips. */
export default function ScenarioFilter({
  scenario,
  filter,
}: {
  scenario: Scenario | null;
  filter: (next: Scenario | null) => void;
}) {
  return (
    <div className={styles.scenarioFilter}>
      <p className={styles.label}>想讀特定情境？（選填）</p>
      <div className={`${chips.chips} ${styles.buttons}`} role="group" aria-label="選擇信件情境">
        <button aria-pressed={scenario === null} onClick={() => filter(null)}>
          隨機遇見
        </button>
        {SCENARIOS.map((s) => (
          <button key={s} aria-pressed={s === scenario} onClick={() => filter(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
