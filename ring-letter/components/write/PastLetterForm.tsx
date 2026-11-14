import type { Draft } from "./useDraft";

/** Fields of the 回憶信 form; `source` picks guided questions or pasted original text. */
export default function PastLetterForm({
  source,
  onSourceChange,
  body,
  onBodyChange,
  draft,
}: {
  source: string;
  onSourceChange: (source: string) => void;
  body: string;
  onBodyChange: (body: string) => void;
  /** Restored values of the uncontrolled inputs (useDraft.ts). */
  draft?: Draft["fields"];
}) {
  return (
    <>
      <label htmlFor="era">這件事大約發生在什麼時候？</label>
      <input
        id="era"
        name="era"
        defaultValue={draft?.era}
        required
        maxLength={40}
        placeholder="例如：高中時／約三年前／記不清了"
      />
      <label htmlFor="source">你想怎麼寫？</label>
      <select id="source" value={source} onChange={(e) => onSourceChange(e.target.value)}>
        <option value="recollection">跟著提問，現在回憶書寫</option>
        <option value="original">貼上當時留下的原文</option>
      </select>
      {source === "recollection" ? (
        <>
          <p className="quiet">
            以下三題可自由選答，至少填一項，合計最多 1,500
            字。記不清楚可以直接說，不需要補成完整故事。
          </p>
          <label htmlFor="event">你想起的是哪一件事？</label>
          <textarea
            name="event"
            defaultValue={draft?.event}
            id="event"
            maxLength={700}
            rows={3}
            placeholder="從一件小事開始也可以。"
          />
          <label htmlFor="scene">如果只留下一個畫面，你會寫下哪個瞬間？</label>
          <textarea name="scene" id="scene" defaultValue={draft?.scene} maxLength={700} rows={3} />
          <label htmlFor="feeling">那時候，你最在意或最不確定的是什麼？</label>
          <textarea
            name="feeling"
            defaultValue={draft?.feeling}
            id="feeling"
            maxLength={700}
            rows={3}
            placeholder="寫當時記得的感覺，不必用現在的答案解釋。"
          />
        </>
      ) : (
        <>
          <label htmlFor="body">當時的原文</label>
          <textarea
            id="body"
            required
            maxLength={1500}
            rows={8}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
          />
        </>
      )}
      <label htmlFor="reflection">現在回頭看，有什麼跟當時想的不一樣？（選填）</label>
      <textarea
        name="reflection"
        defaultValue={draft?.reflection}
        id="reflection"
        maxLength={800}
        rows={3}
        placeholder="沒有改變、還不明白，或不想回答，都可以。"
      />
      <p className="quiet">這段會另外標示為「現在回頭看」，與當時的感受分開呈現。</p>
    </>
  );
}
