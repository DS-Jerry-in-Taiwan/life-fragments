import styles from "./MatchingCare.module.css";

export default function MatchingCare() {
  return (
    <div className={styles.matchingCare}>
      <p>願意分享的文字，會先去除姓名、地名等可識別資訊，並經人工審閱。</p>
      <p>站內投稿可在「我的片段」撤回；人工媒合內容則可透過媒合表單中的聯絡方式要求撤下。</p>
      <p>回音會經審閱後處理，不承諾一定能送達原作者。</p>
      <p>這裡不是諮商或緊急求助的地方。</p>
    </div>
  );
}
