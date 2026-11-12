import type { LetterType } from "../../lib/stories";
import styles from "./ModeChooser.module.css";

export default function ModeChooser({
  busy,
  onChoose,
}: {
  busy: boolean;
  onChoose: (mode: LetterType) => void;
}) {
  return (
    <>
      <div className={styles.options}>
        <button disabled={busy} onClick={() => onChoose("past")}>
          <span>回憶信</span>
          <h2>
            有一段過去，
            <br />
            我還記得
          </h2>
          <p>
            <span className="sentence">幾個小問題，陪你回想一件事。</span>
            <span className="sentence">想不起來的部分，可以留白。</span>
          </p>
          <strong>回想一段經歷 →</strong>
        </button>
        <button disabled={busy} onClick={() => onChoose("present")}>
          <span>當下信</span>
          <h2>
            今天，
            <br />
            我有一點感受
          </h2>
          <p>
            <span className="sentence">寫下剛剛發生的事和現在的心情。</span>
            <span className="sentence">一兩句也可以。</span>
          </p>
          <strong>記下此刻 →</strong>
        </button>
      </div>
      <p className="quiet">
        選擇寫法時，會記錄本次開始與是否完成，供團隊比較試寫流程。未送出的文字不會儲存。紀錄提供 30
        天存取，可在「我的片段」刪除。
      </p>
    </>
  );
}
