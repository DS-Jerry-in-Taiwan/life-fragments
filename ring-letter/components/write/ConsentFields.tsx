import { CONTACT_EMAIL } from "../../lib/contact";
import CheckboxField from "../common/CheckboxField";
import styles from "./ConsentFields.module.css";

// The current consent wording (CONSENT_VERSION in lib/server/db/stories.ts),
// shared by the write form and 我的片段's 改為分享 (components/mine/ShareToggle.tsx).

/** Share consent; optional when submitting, required when asking to share later. */
export function ShareCheckbox({ optional = false }: { optional?: boolean }) {
  return (
    <CheckboxField name="share" required={!optional}>
      我願意讓這份原文經人工審閱後，匿名分享給本網站的其他讀者。
      {optional && "（可不勾選）"}
    </CheckboxField>
  );
}

export function AdultCheckbox() {
  return (
    <CheckboxField name="adult" required>
      我已滿 18 歲，內容是我的真實經歷，且有權分享。
    </CheckboxField>
  );
}

export function PrivacyCheckbox() {
  return (
    <CheckboxField name="privacy" required>
      我了解團隊可閱讀投稿。未公開的文字在最後一次狀態變更 30
      天後刪除；經審閱公開的文字會保留，直到我撤回或管理者刪除。我可在這個瀏覽器的「我的片段」刪除，或寫信到{" "}
      {CONTACT_EMAIL} 請管理者代刪；已被截圖或轉傳的內容無法收回。
    </CheckboxField>
  );
}

export default function ConsentFields({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  return (
    <div className={styles.consent}>
      <ShareCheckbox optional />
      <p>
        <span className="sentence">未勾選時不會公開，管理團隊仍可閱讀。</span>
        <span className="sentence">之後可在「我的片段」改為分享或停止分享。</span>
        <span className="sentence">審閱不會改寫原文。</span>
        <span className="sentence">請移除姓名、公司、地址與第三人的私密資訊。</span>
      </p>
      <AdultCheckbox />
      <PrivacyCheckbox />
      <button type="button" className={styles.inlineLink} onClick={onOpenPrivacy}>
        完整資料使用說明
      </button>
    </div>
  );
}
