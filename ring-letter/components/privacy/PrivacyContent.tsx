/** The full data-use notice (#4 §4.2: shared by /privacy and the dialog). */
export default function PrivacyContent() {
  return (
    <>
      <h2 id="privacy-title">讓文字安心留下</h2>
      <p>
        <span className="sentence">這是 Ring letter 團隊的小型測試網站，僅供 18 歲以上使用。</span>
        <span className="sentence">
          閱讀不用註冊；投稿與回饋使用隨機的瀏覽器識別 Cookie，不要求姓名、電子郵件或 LINE 帳號。
        </span>
      </p>
      <h3>什麼會被保存？</h3>
      <p>
        <span className="sentence">
          你送出的標題、文字、心情、回顧、時間標示、來源類型、分享同意與時間，以及自願送出的回饋。
        </span>
        <span className="sentence">
          另記錄選擇的寫法、開始與完成時間，供團隊比較流程；未送出的文字不會保存。
        </span>
        <span className="sentence">管理者可閱讀這些資料。</span>
        <span className="sentence">未勾選分享的文字不會公開。</span>
      </p>
      <h3>多久？如何刪除？</h3>
      <p>
        <span className="sentence">
          資料最多供使用 30 天，過期即不再顯示，並於後續建立體驗工作階段時清理。
        </span>
        <span className="sentence">你可隨時在「我的片段」刪除這個瀏覽器的投稿及回饋。</span>
        <span className="sentence">請保留 Cookie；清除後本版沒有跨裝置找回功能。</span>
        <span className="sentence">系統備份與託管平台紀錄依平台機制保存，不保證同步清除。</span>
      </p>
      <h3>匿名分享的邊界</h3>
      <p>
        <span className="sentence">分享後文章可能被任何取得網站連結的人閱讀。</span>
        <span className="sentence">即使沒有姓名，熟悉事件的人仍可能認出作者。</span>
        <span className="sentence">請勿投稿第三人私密資訊；讀者請勿截圖轉傳、辨認作者。</span>
        <span className="sentence">撤回可停止網站顯示，無法收回別人已保存的內容。</span>
      </p>
      <h3>人工審閱，不代寫人生</h3>
      <p>
        <span className="sentence">團隊只核准原文或暫不分享，不改寫投稿。</span>
        <span className="sentence">
          沒有取得同意，不把投稿用於公開宣傳、其他產品或外部 AI 分析。
        </span>
        <span className="sentence">示範故事明確標為 AI 虛構，不是真人投稿。</span>
      </p>
      <p>
        <span className="sentence">此處不是即時對話或緊急支援服務。</span>
        <span className="sentence">若文字讓你不適，可以離開並透過閱讀頁回報。</span>
      </p>
    </>
  );
}
