import type { AdminSummary } from "../../lib/stories";
import chips from "../common/Chips.module.css";
import { isStoryId, NO_FILTER, STATUS_FILTERS, type StoryFilter } from "./filters";
import styles from "./StoryFilters.module.css";

/**
 * Status chips with their counts, 重新申請分享 / 即將到期, consent version,
 * and the search form (title or body text, or a pasted story id; Taipei
 * date range). Every change goes to the URL through `onChange`; the
 * dashboard remounts this with the URL's values, so back/forward restore it.
 * Disabled while a moderation is on its way, so its results (notes on the
 * cards, the selection) land on the list they were made for.
 */
export default function StoryFilters({
  filter,
  summary,
  disabled,
  onChange,
}: {
  filter: StoryFilter;
  summary: AdminSummary | null;
  /** While a moderation is on its way: its results belong to these filters. */
  disabled: boolean;
  onChange: (next: StoryFilter) => void;
}) {
  const counts = summary?.counts;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;
  const days = String(summary?.expiringDays ?? 7);
  const set = (patch: Partial<StoryFilter>) => onChange({ ...filter, ...patch });
  function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = String(form.get("q") ?? "").trim();
    const range = { from: String(form.get("from") ?? ""), to: String(form.get("to") ?? "") };
    // An id lookup drops every other condition: the story is found whatever its state.
    if (isStoryId(text)) onChange({ ...NO_FILTER, status: "all", id: text.toLowerCase() });
    else set({ ...range, q: text, id: "" });
  }
  return (
    <div className={styles.filters} role="search" aria-label="篩選投稿">
      <div className={chips.chips} role="group" aria-label="狀態">
        {STATUS_FILTERS.map(({ value, label }) => {
          const n = value === "all" ? total : counts?.[value];
          return (
            <button
              key={value}
              aria-pressed={filter.status === value}
              disabled={disabled}
              onClick={() => set({ status: value })}
            >
              {label}
              {n !== undefined && `（${n}）`}
            </button>
          );
        })}
      </div>
      <div className={styles.row}>
        <label className="check">
          <input
            type="checkbox"
            disabled={disabled}
            defaultChecked={filter.reshare}
            onChange={(e) => set({ reshare: e.target.checked })}
          />
          重新申請分享
        </label>
        <label className="check">
          <input
            type="checkbox"
            disabled={disabled}
            defaultChecked={filter.expiring !== ""}
            onChange={(e) => set({ expiring: e.target.checked ? days : "" })}
          />
          {/* Another number of days from the URL shows as it is, ticked. */}
          即將到期（{filter.expiring || days} 天）
          {summary && (filter.expiring || days) === days && `（${summary.expiring}）`}
        </label>
        <label className={styles.consent}>
          同意版本
          <select
            disabled={disabled}
            defaultValue={filter.consent}
            onChange={(e) => set({ consent: e.target.value as StoryFilter["consent"] })}
          >
            <option value="">全部</option>
            <option value="v2">舊條款 v2（30 天）</option>
            <option value="v3">新條款 v3（核准後保留）</option>
          </select>
        </label>
      </div>
      <form className={styles.search} onSubmit={search}>
        <label className={styles.text}>
          標題或內文（貼上故事 id 可精確查詢）
          <input
            name="q"
            type="search"
            maxLength={100}
            defaultValue={filter.id || filter.q}
            disabled={disabled}
          />
        </label>
        <label>
          投稿日期從
          <input name="from" type="date" defaultValue={filter.from} disabled={disabled} />
        </label>
        <label>
          到
          <input name="to" type="date" defaultValue={filter.to} disabled={disabled} />
        </label>
        <button className="secondary" disabled={disabled}>
          搜尋
        </button>
      </form>
      {filter.id && (
        <p className="quiet">
          只顯示故事 {filter.id}。
          <button className="text-btn" disabled={disabled} onClick={() => set({ id: "" })}>
            顯示全部
          </button>
        </p>
      )}
    </div>
  );
}
