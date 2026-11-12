import NavButton from "../shell/NavButton";
import FormLink from "./FormLink";

/** 寫一封信, plus the (not yet open) manual matching form. */
export default function DistressEntry() {
  return (
    <div className="distress-entry">
      <NavButton to="/write" className="primary">
        寫一封信
      </NavButton>
      <p className="quiet">
        回想一段經歷，或記下現在的感受。你可以選擇只保存，或同意審閱後匿名分享。
      </p>
      <details className="manual-match-entry">
        <summary>想參加人工媒合？</summary>
        <p className="quiet">
          投稿不會自動報名媒合。人工媒合另需確認收信與文字後續使用的意願；開放後約需 1–3
          天處理，不保證一定有相似的信。
        </p>
        <FormLink kind="distress" className="secondary">
          前往人工媒合表單
        </FormLink>
      </details>
    </div>
  );
}
