import type { AdminSummary } from "../../lib/stories";
import styles from "./SummaryBar.module.css";

/** Live story counts (GET /api/admin/summary); refreshed after every decision. */
export default function SummaryBar({ summary }: { summary: AdminSummary | null }) {
  const c = summary?.counts;
  return (
    <div className={styles.stats}>
      <div>
        <strong>{c?.pending ?? "–"}</strong>待審投稿
      </div>
      <div>
        <strong>{c?.approved ?? "–"}</strong>已分享
      </div>
      <div>
        <strong>{c ? c.rejected + c.private : "–"}</strong>未公開
      </div>
      <div>
        <strong>{summary?.expiring ?? "–"}</strong>
        {summary?.expiringDays ?? 7} 天內到期
      </div>
    </div>
  );
}
