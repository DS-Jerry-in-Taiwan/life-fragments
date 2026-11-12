export default function SubmitSuccess({ onViewMine }: { onViewMine: () => void }) {
  return (
    <div className="success">
      <span>✦</span>
      <h2>你的文字已留下。</h2>
      <p>
        如果你勾選願意分享，會先經人工審閱，再讓其他讀者看見；未勾選的內容只供你與管理團隊查看。
      </p>
      <p>請保留此瀏覽器的 Cookie，才能查看與刪除。</p>
      <button className="primary" onClick={onViewMine}>
        查看我的片段 →
      </button>
    </div>
  );
}
