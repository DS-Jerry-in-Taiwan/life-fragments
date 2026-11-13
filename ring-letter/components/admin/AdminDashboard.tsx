"use client";
import { useEffect, useState } from "react";
import * as api from "../../lib/api-client";
import type { Feedback, ModerationAction, Story, WritingMetric } from "../../lib/stories";
import { useAction } from "../../lib/use-action";
import SectionIntro from "../common/SectionIntro";
import StatusMessage from "../common/StatusMessage";
import { useShell } from "../shell/ShellContext";
import FeedbackList from "./FeedbackList";
import ReviewQueue from "./ReviewQueue";
import StatsBar from "./StatsBar";
import WritingMetrics from "./WritingMetrics";
import styles from "./AdminDashboard.module.css";

/**
 * Review queue, writing metrics and reader feedback. Only rendered once
 * /api/admin/queue accepts the viewer (Cloudflare Access + ADMIN_EMAILS);
 * the shell then lets the footer show 管理信箱.
 */
export default function AdminDashboard() {
  const { setAdmin: onAuthorized } = useShell();
  const action = useAction(true);
  const { busy, setNotice } = action;
  const [admin, setAdmin] = useState(false),
    [review, setReview] = useState<Story[]>([]),
    [feedback, setFeedback] = useState<Feedback[]>([]),
    [metrics, setMetrics] = useState<WritingMetric[]>([]);
  async function load() {
    try {
      const d = await api.getAdminQueue();
      setReview(d.stories);
      setFeedback(d.feedback);
      setMetrics(d.metrics);
      setAdmin(true);
      onAuthorized(true);
    } catch (e) {
      setAdmin(false);
      onAuthorized(false);
      throw e;
    }
  }
  useEffect(() => {
    action.run(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function moderate(id: string, status: ModerationAction) {
    if (status === "delete" && !confirm("永久刪除這篇及其回饋？")) return;
    return action.run(async () => {
      await api.moderateStory(id, status);
      await load();
      setNotice("已更新文章狀態。");
    });
  }
  return (
    <>
      <StatusMessage action={action} />
      {admin && (
        <section className={styles.admin}>
          <SectionIntro eyebrow="管理者專用" title="把關每一封來信">
            <span className="sentence">只審核原文。</span>
            <span className="sentence">不同意分享的片段不能公開。</span>
            <span className="sentence">
              核准公開的投稿保留到撤回（舊版同意者仍為送出後 30 天）；未公開投稿、回饋與試寫紀錄 30
              天後清除。
            </span>
          </SectionIntro>
          <StatsBar review={review} feedback={feedback} />
          <p className="quiet">
            顯示全部已核准的投稿、最近 200 篇其他投稿與 300
            筆回饋；這些是事件筆數，不是獨立人數。示範故事回饋會標示，不當成真實內容需求證據。
          </p>
          <button className="secondary" disabled={busy} onClick={() => action.run(load)}>
            重新整理
          </button>
          <WritingMetrics metrics={metrics} />
          <ReviewQueue review={review} busy={busy} onModerate={moderate} />
          <FeedbackList feedback={feedback} review={review} />
        </section>
      )}
    </>
  );
}
