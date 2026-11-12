import type { Tab } from "../ring-letter-app";

export default function SiteHeader({ tab, go }: { tab: Tab; go: (t: Tab) => void }) {
  return (
    <header>
      <button className="brand" onClick={() => go("home")}>
        <span className="logo">☾</span> Ring letter<span className="brand-small">時光來信</span>
      </button>
      <nav aria-label="主要導覽">
        <button className={tab === "read" ? "active" : ""} onClick={() => go("read")}>
          讀一封信
        </button>
        <button className={tab === "write" ? "active" : ""} onClick={() => go("write")}>
          寫一封信
        </button>
        <button className={tab === "mine" ? "active" : ""} onClick={() => go("mine")}>
          我的片段
        </button>
      </nav>
    </header>
  );
}
