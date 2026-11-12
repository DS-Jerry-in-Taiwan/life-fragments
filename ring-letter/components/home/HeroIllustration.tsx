export default function HeroIllustration() {
  return (
    <div className="illustration" aria-hidden="true">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="moon" />
      <span className="spark s1">✦</span>
      <span className="spark s2">✧</span>
      <span className="spark s3">·</span>
      <div className="letter-back" />
      <div className="letter-art">
        <div className="paper-date">致，某一天讀到這裡的你</div>
        <p>
          那時候的我，
          <br />
          也還不知道
          <br />
          後來會怎麼樣。
        </p>
        <div className="paper-lines" />
        <span className="seal">rl</span>
      </div>
      <span className="orbit-note">一段生活，另一個時刻。</span>
    </div>
  );
}
