import styles from "./EraseAll.module.css";

export default function EraseAll({ busy, onErase }: { busy: boolean; onErase: () => void }) {
  return (
    <div className={styles.erase}>
      <p>也可以一次刪除這個瀏覽器的全部投稿與體驗回饋。</p>
      <button className="danger" disabled={busy} onClick={onErase}>
        刪除我的所有資料
      </button>
    </div>
  );
}
