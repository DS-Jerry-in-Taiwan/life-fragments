import NavButton from "../shell/NavButton";
import HeroIllustration from "./HeroIllustration";
import styles from "./Hero.module.css";

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.copy}>
        <p className="eyebrow">
          <span /> 匿名文字分享 · 回憶與此刻
        </p>
        <h1>
          <span className={styles.headlineSentence}>
            <span>寫下你的</span>
            <span>經歷與心情，</span>
          </span>
          <em className={styles.headlineSentence}>
            <span>讀讀</span>
            <span>陌生人的故事。</span>
          </em>
        </h1>
        <div className={styles.intro}>
          <p>在 Ring letter，你可以回想一段過去，也可以記錄今天的感受。</p>
          <p>如果有相似的過去經歷，我們會試著讓那封信回應現在的你。</p>
          <p>你也可以先讀，不必先寫。</p>
        </div>
        <div className={styles.actions}>
          <NavButton to="/read" className="primary">
            先讀一封 <span aria-hidden="true">→</span>
          </NavButton>
          <NavButton to="/write" className="text-btn">
            我想寫一封 <span aria-hidden="true">→</span>
          </NavButton>
        </div>
        <p className="quiet">不必認識彼此，也不必立刻回應。</p>
      </div>
      <HeroIllustration />
    </section>
  );
}
