import styles from "./EraseAll.module.css";

/** 在這台裝置登出 (#4 §6.2): for shared devices. Stories stay; feedback and writing attempts expire after 30 days. */
export default function Logout({ busy, onLogout }: { busy: boolean; onLogout: () => void }) {
  return (
    <div className={styles.erase}>
      <p>
        用的是共用裝置？登出後投稿仍保留，只是不會再出現在這個瀏覽器；回饋與試寫紀錄會在 30
        天後自動清除。
      </p>
      <button className="text-btn" disabled={busy} onClick={onLogout}>
        在這台裝置登出
      </button>
    </div>
  );
}
