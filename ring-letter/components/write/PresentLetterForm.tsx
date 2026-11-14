import { BODY_COUNT_ID } from "./BodyCount";
import type { Draft } from "./useDraft";

/** Fields of the 當下信 form. */
export default function PresentLetterForm({
  body,
  onBodyChange,
  draft,
  count,
}: {
  body: string;
  onBodyChange: (body: string) => void;
  /** Restored values of the uncontrolled inputs (useDraft.ts). */
  draft?: Draft["fields"];
  /** The live length of the body (BodyCount), shown under it. */
  count: React.ReactNode;
}) {
  return (
    <>
      <label htmlFor="body">剛剛發生了什麼？</label>
      <textarea
        id="body"
        required
        maxLength={1500}
        rows={4}
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder="今天一句話。想多說一點，也可以接著寫。"
        aria-describedby={BODY_COUNT_ID}
      />
      {count}
      <label htmlFor="mood">現在的感覺</label>
      <input
        id="mood"
        name="mood"
        defaultValue={draft?.mood}
        required
        maxLength={60}
        list="moods"
        placeholder="選一個，或用自己的話說"
      />
      <datalist id="moods">
        {["開心", "疲倦", "焦慮", "平靜", "說不上來"].map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <p className="quiet">一兩句就可以，沒有最低字數。送出時會標示今天的日期。</p>
    </>
  );
}
