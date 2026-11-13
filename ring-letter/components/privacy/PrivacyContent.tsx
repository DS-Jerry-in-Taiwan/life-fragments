import { CONTACT_EMAIL, CONTACT_MAILTO } from "../../lib/contact";

/** The full data-use notice (#4 §4.2: shared by /privacy and the dialog). */
export default function PrivacyContent({ page = false }: { page?: boolean }) {
  return (
    <>
      {page ? (
        <h1 id="privacy-page-title">讓文字安心留下</h1>
      ) : (
        <h2 id="privacy-title">讓文字安心留下</h2>
      )}
      <p>
        <span className="sentence">這是 Ring letter 團隊的小型測試網站，僅供 18 歲以上使用。</span>
        <span className="sentence">
          閱讀不用註冊；投稿與回饋使用隨機的瀏覽器識別 Cookie，不要求姓名、電子郵件或 LINE 帳號。
        </span>
      </p>
      <h3>什麼會被保存？</h3>
      <p>
        <span className="sentence">
          你送出的標題、文字、心情、回顧、時間標示、來源類型、分享同意（含之後的變更）與時間，以及自願送出的回饋。
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
          未公開的投稿（未勾選分享、審閱中或未通過）在最後一次狀態變更 30 天後刪除。
        </span>
        <span className="sentence">經審閱公開的投稿會保留，直到你撤回或管理者刪除。</span>
        <span className="sentence">
          依先前版本同意送出的投稿，仍照當時約定，在送出 30 天後刪除。
        </span>
        <span className="sentence">回饋與試寫紀錄保存 30 天，由每日排程清理。</span>
        <span className="sentence">系統備份與託管平台紀錄依平台機制保存，不保證同步清除。</span>
      </p>
      <h3>這個瀏覽器會記得你</h3>
      <p>
        <span className="sentence">
          投稿的瀏覽器會記得你到最後一次造訪後一年，期間每次回來都會再延長。
        </span>
        <span className="sentence">你可隨時在「我的片段」查看並刪除這個瀏覽器的投稿及回饋。</span>
        <span className="sentence">
          使用共用裝置時，請記得到「我的片段」登出；登出後投稿仍保留，但不會再出現在這個瀏覽器，之後再投稿會以新的身分開始。
        </span>
      </p>
      <h3>找不回時，請管理者代刪</h3>
      <p>
        <span className="sentence">自行管理只限原本投稿的瀏覽器。</span>
        <span className="sentence">
          清除了 Cookie、換了裝置，或超過一年沒有回來，請寫信到{" "}
          <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>
          ，附上要刪除投稿的標題、部分內文或大約投稿日期。
        </span>
        <span className="sentence">管理者找到後會刪除該篇及其回饋，通常 7 天內處理並回信。</span>
      </p>
      <h3>匿名分享的邊界</h3>
      <p>
        <span className="sentence">分享後文章可能被任何取得網站連結的人閱讀。</span>
        <span className="sentence">即使沒有姓名，熟悉事件的人仍可能認出作者。</span>
        <span className="sentence">請勿投稿第三人私密資訊；讀者請勿截圖轉傳、辨認作者。</span>
        <span className="sentence">
          你可在「我的片段」停止分享，文章會立即從網站下架，之後依未公開投稿的期限刪除；未分享的投稿也可改為分享，重新勾選同意並經人工審閱，每篇最多申請
          3 次。
        </span>
        <span className="sentence">撤回或停止分享可停止網站顯示，無法收回別人已保存的內容。</span>
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
