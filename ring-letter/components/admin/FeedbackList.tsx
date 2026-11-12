import type { Feedback, FeedbackKind, Story } from "../../lib/stories";

const KIND_NAME: Record<FeedbackKind, string> = {
  more: "想繼續讀",
  resonate: "有共鳴",
  neutral: "無特別感覺",
  comment: "文字回饋",
  report: "⚑ 問題回報",
};

export default function FeedbackList({
  feedback,
  review,
}: {
  feedback: Feedback[];
  review: Story[];
}) {
  return (
    <>
      <h2>閱讀回饋與回報</h2>
      {feedback.length === 0 && <p className="empty-small">尚無回饋。</p>}
      {feedback.map((f) => (
        <article className="feedback-item" key={f.id}>
          <span>{KIND_NAME[f.kind]}</span>
          <small>
            {f.story.startsWith("demo-")
              ? "示範故事"
              : review.find((s) => s.id === f.story)?.title || "文章 " + f.story}{" "}
            · {new Date(f.created).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
          </small>
          <p>{f.note || "未留文字"}</p>
        </article>
      ))}
    </>
  );
}
