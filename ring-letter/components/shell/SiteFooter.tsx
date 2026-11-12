import type { Tab } from "../ring-letter-app";

export default function SiteFooter({
  admin,
  go,
  onOpenPrivacy,
}: {
  admin: boolean;
  go: (t: Tab) => void;
  onOpenPrivacy: () => void;
}) {
  return (
    <footer>
      <span>
        Ring letter <span className="footer-phrase">把片刻，留給時間。</span>
      </span>
      <div>
        <button onClick={() => go("mine")}>先前投稿與撤回</button>
        <button onClick={() => go("archive")}>先前公開信箱</button>
        <button onClick={onOpenPrivacy}>先前投稿資料說明</button>
        {admin ? (
          <button onClick={() => go("admin")}>管理信箱</button>
        ) : (
          <a href="/admin">管理者登入</a>
        )}
      </div>
    </footer>
  );
}
