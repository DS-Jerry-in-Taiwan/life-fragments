"use client";
import NavButton from "./NavButton";

export default function SiteFooter({
  admin,
  onOpenPrivacy,
}: {
  admin: boolean;
  onOpenPrivacy: () => void;
}) {
  return (
    <footer>
      <span>
        Ring letter <span className="footer-phrase">把片刻，留給時間。</span>
      </span>
      <div>
        <NavButton to="/mine">先前投稿與撤回</NavButton>
        <NavButton to="/archive">先前公開信箱</NavButton>
        <button onClick={onOpenPrivacy}>先前投稿資料說明</button>
        {admin ? (
          <NavButton to="/admin">管理信箱</NavButton>
        ) : (
          // A full page load, so Cloudflare Access can run its sign-in.
          <a href="/admin">管理者登入</a>
        )}
      </div>
    </footer>
  );
}
