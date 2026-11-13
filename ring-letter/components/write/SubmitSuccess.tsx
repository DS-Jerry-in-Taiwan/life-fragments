import NavButton from "../shell/NavButton";
import styles from "./SubmitSuccess.module.css";

export default function SubmitSuccess() {
  return (
    <div className={styles.success}>
      <span>✦</span>
      <h2>你的文字已留下。</h2>
      <p>
        如果你勾選願意分享，會先經人工審閱，再讓其他讀者看見；未勾選的內容只供你與管理團隊查看。
      </p>
      <p>這台裝置會記得你一年，共用裝置請記得到「我的片段」登出。</p>
      <NavButton to="/mine" className="primary">
        查看我的片段 →
      </NavButton>
    </div>
  );
}
