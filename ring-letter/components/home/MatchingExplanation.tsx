import styles from "./MatchingExplanation.module.css";

export default function MatchingExplanation() {
  return (
    <section className={styles.matchingExplanation}>
      <h2>這封信，會怎麼來到你面前？</h2>
      <p>
        <span className="sentence">
          當你留下現在的困擾，如果有一封來自過去的信，寫的人遇過和你類似的事，我們會把那封信送給你，作為給你的回應。
        </span>
        <span className="sentence">測試期間由真人人工媒合，不是即時回覆，大約需要 1–3 天。</span>
        <span className="sentence">
          如果目前沒有相似的信，我們會先告訴你，不會隨便拿一封不像的湊給你。
        </span>
      </p>
    </section>
  );
}
