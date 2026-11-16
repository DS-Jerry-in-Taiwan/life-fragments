import styles from "./HowItWorks.module.css";

export default function HowItWorks() {
  return (
    <section className={styles.how}>
      <h2>讓現在，遇見一段過去</h2>
      <ol>
        <li>
          <h3>01／留下此刻</h3>
          <p>寫下你現在的情緒，或正在困擾你的事。不用完整，也不用想好答案，先留下來。</p>
        </li>
        <li>
          <h3>
            02／遇見過去 <span className="tag-not-open">尚未開放</span>
          </h3>
          <p>
            如果有一封來自過去的信，寫的人曾經遇過和你很類似的事，我們會把那封信送到你面前。它不是建議，是另一個人在當時留下的真實經歷。這一步由真人人工媒合，目前尚未開放。
          </p>
        </li>
        <li>
          <h3>
            03／留下回音 <span className="tag-not-open">尚未開放</span>
          </h3>
          <p>
            你可以回覆那封信，寫給幾年前的那個人。你的文字，也可能在某一天，被媒合給另一個正在經歷同樣事情的人。
          </p>
        </li>
      </ol>
    </section>
  );
}
