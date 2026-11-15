/**
 * The phone lines shown wherever the site says it is not a counselling or
 * emergency service (issue #34): /read's MatchingCare, /write and the privacy
 * notice. Plain text and tel: links only — nothing is sent anywhere.
 *
 * Returns block-level sentences (`.sentence` spans) for the caller to put
 * inside its own <p>, so they take that paragraph's size and colour.
 */
const LINES = [
  { number: "1925", name: "安心專線", note: "（24 小時）" },
  { number: "1995", name: "生命線", note: "" },
  { number: "1980", name: "張老師", note: "" },
];

export default function CrisisLines() {
  return (
    <>
      <span className="sentence">如果你現在很難受，可以撥打這些專線：</span>
      {LINES.map((line) => (
        <span className="sentence" key={line.number}>
          <a href={`tel:${line.number}`}>
            {line.number} {line.name}
          </a>
          {line.note}
        </span>
      ))}
    </>
  );
}
