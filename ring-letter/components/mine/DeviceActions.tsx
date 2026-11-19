import styles from "./DeviceActions.module.css";

/**
 * The end of 我的片段: 在這台裝置登出 (#4 §6.2, for shared devices) and
 * 刪除我的所有資料, one note and one row of buttons, with or without stories.
 */
export default function DeviceActions({
  busy,
  onLogout,
  onErase,
}: {
  busy: boolean;
  onLogout: () => void;
  onErase: () => void;
}) {
  return (
    <div className={styles.device}>
      <p>
        <span className="sentence">
          用的是共用裝置？登出後投稿仍保留，只是不會再出現在這個瀏覽器；回饋與試寫紀錄會在 30
          天後自動清除。
        </span>
        <span className="sentence">也可以一次刪除這個瀏覽器的全部投稿與體驗回饋。</span>
      </p>
      <div className={styles.buttons}>
        <button className="secondary" disabled={busy} onClick={onLogout}>
          在這台裝置登出
        </button>
        <button className="danger" disabled={busy} onClick={onErase}>
          刪除我的所有資料
        </button>
      </div>
    </div>
  );
}
