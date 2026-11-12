import CheckboxField from "../common/CheckboxField";
import styles from "./ConsentFields.module.css";

export default function ConsentFields({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  return (
    <div className={styles.consent}>
      <CheckboxField name="share">
        我願意讓這份原文經人工審閱後，匿名分享給本網站的其他讀者。（可不勾選）
      </CheckboxField>
      <p>
        <span className="sentence">未勾選時不會公開，管理團隊仍可閱讀。</span>
        <span className="sentence">審閱不會改寫原文。</span>
        <span className="sentence">請移除姓名、公司、地址與第三人的私密資訊。</span>
      </p>
      <CheckboxField name="adult" required>
        我已滿 18 歲，內容是我的真實經歷，且有權分享。
      </CheckboxField>
      <CheckboxField name="privacy" required>
        我了解團隊可閱讀投稿；經審閱公開的內容會持續保留，直到撤回或由管理者刪除，其他資料提供 30
        天存取，過期不再顯示並於後續清理。我可在原瀏覽器刪除，已被截圖或轉傳的內容無法收回。
      </CheckboxField>
      <button type="button" className={styles.inlineLink} onClick={onOpenPrivacy}>
        完整資料使用說明
      </button>
    </div>
  );
}
