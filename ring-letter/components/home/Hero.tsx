import HeroIllustration from "./HeroIllustration";

export default function Hero({ onRead, onWrite }: { onRead: () => void; onWrite: () => void }) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">
          <span /> 匿名文字分享 · 回憶與此刻
        </p>
        <h1>
          <span className="headline-sentence">
            <span>寫下你的</span>
            <span>經歷與心情，</span>
          </span>
          <em className="headline-sentence">
            <span>讀讀</span>
            <span>陌生人的故事。</span>
          </em>
        </h1>
        <div className="intro">
          <p>在 Ring letter，你可以回想一段過去，也可以記錄今天的感受。</p>
          <p>如果有相似的過去經歷，我們會試著讓那封信回應現在的你。</p>
          <p>你也可以先讀，不必先寫。</p>
        </div>
        <div className="hero-actions">
          <button className="primary" onClick={onRead}>
            先讀一封 <span>↗</span>
          </button>
          <button className="text-btn" onClick={onWrite}>
            我想寫一封 <span>→</span>
          </button>
        </div>
        <p className="quiet">不必認識彼此，也不必立刻回應。</p>
      </div>
      <HeroIllustration />
    </section>
  );
}
