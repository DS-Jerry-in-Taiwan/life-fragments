import { useId } from "react";
import type { LetterType } from "../../lib/stories";
import styles from "./ModeChooser.module.css";

/**
 * One card per way of writing: the heading and description are plain
 * content, and the card's one button (named by its action and the card's
 * heading) chooses it. The button's hit area covers the whole card.
 */
function ModeCard({
  mode,
  tag,
  title,
  action,
  busy,
  onChoose,
  children,
}: {
  mode: LetterType;
  tag: string;
  title: React.ReactNode;
  action: string;
  busy: boolean;
  onChoose: (mode: LetterType) => void;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={styles.card}>
      <span>{tag}</span>
      <h2 id={`${id}-title`}>{title}</h2>
      <p>{children}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => onChoose(mode)}
        aria-labelledby={`${id}-action ${id}-title`}
      >
        <span id={`${id}-action`}>{action}</span> <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

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
        <ModeCard
          mode="past"
          tag="回憶信"
          title={
            <>
              有一段過去，
              <br />
              我還記得
            </>
          }
          action="回想一段經歷"
          busy={busy}
          onChoose={onChoose}
        >
          <span className="sentence">幾個小問題，陪你回想一件事。</span>
          <span className="sentence">想不起來的部分，可以留白。</span>
        </ModeCard>
        <ModeCard
          mode="present"
          tag="當下信"
          title={
            <>
              今天，
              <br />
              我有一點感受
            </>
          }
          action="記下此刻"
          busy={busy}
          onChoose={onChoose}
        >
          <span className="sentence">寫下剛剛發生的事和現在的心情。</span>
          <span className="sentence">一兩句也可以。</span>
        </ModeCard>
      </div>
      <p className="quiet">
        選擇寫法時，會記錄本次開始與是否完成，供團隊比較試寫流程。未送出的文字只暫存在這個分頁，不會傳到伺服器。紀錄提供
        30 天存取，可在「我的片段」刪除。
      </p>
    </>
  );
}
