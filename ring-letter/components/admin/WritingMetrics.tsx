import type { WritingMetric } from "../../lib/stories";
import styles from "./WritingMetrics.module.css";

export default function WritingMetrics({ metrics }: { metrics: WritingMetric[] }) {
  return (
    <>
      <h2>兩種寫法的試寫情況</h2>
      <div className={styles.metrics}>
        <table>
          <thead>
            <tr>
              <th>寫法</th>
              <th>開始</th>
              <th>完成</th>
              <th>同意分享</th>
            </tr>
          </thead>
          <tbody>
            {["past", "present"].map((type) => {
              const m = metrics.find((x) => x.letterType === type);
              return (
                <tr key={type}>
                  <th>{type === "past" ? "回憶信" : "當下信"}</th>
                  <td>{m?.starts || 0}</td>
                  <td>{m?.completions || 0}</td>
                  <td>{m?.shares || 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="quiet">
        最近 30
        天的試寫次數，不是人數。「開始」指選擇寫法進入表單；「完成」包含未公開投稿；「同意分享」不代表已核准。單封撤回保留完成次數，刪除所有資料會移除對應紀錄。早期投稿未納入。
      </p>
    </>
  );
}
