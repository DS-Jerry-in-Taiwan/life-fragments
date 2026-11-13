export type LetterType = "past" | "present";

export type Story = {
  id: string;
  title: string;
  body: string;
  era: string;
  source: string;
  status?: string;
  created?: number;
  letterType?: string;
  mood?: string;
  reflection?: string;
  /** 我的片段: how many more times this story may ask to be shared (#4 §6.1). */
  shareRequestsLeft?: number;
  /** Admin queue: last status change, sent back with a decision (409 if it changed since). */
  statusAt?: number;
  /** Admin queue: share requests after submission, and consent events in all. */
  shareRequests?: number;
  consentEvents?: number;
};

export type FeedbackKind = "more" | "resonate" | "neutral" | "report" | "comment";

export type Feedback = {
  id: string;
  story: string;
  kind: FeedbackKind;
  note: string;
  created: number;
};

export type WritingMetric = {
  letterType: string;
  starts: number;
  completions: number;
  shares: number;
};

export type ModerationAction = "approved" | "rejected" | "delete";

export const STATUS_NAME: Record<string, string> = {
  pending: "等待審閱",
  approved: "已匿名分享",
  private: "未公開保存",
  rejected: "暫不分享",
};

/** One-line description under a story title (type, event, date). */
export function formatStoryMeta(s: Story) {
  const date = s.created
    ? new Date(s.created).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })
    : "";
  return s.source === "demo"
    ? s.era
    : s.letterType === "present"
      ? `當下信 · ${date} 記錄`
      : `${s.letterType === "past" ? "回憶信" : "早期投稿"} · 事件：${s.era} · ${s.source === "original" ? "當時原文／" + date + " 收錄" : date + " 回憶書寫"}`;
}
