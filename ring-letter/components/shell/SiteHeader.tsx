"use client";
import { usePathname } from "next/navigation";
import NavButton from "./NavButton";

const NAV = [
  ["/read", "讀一封信"],
  ["/write", "寫一封信"],
  ["/mine", "我的片段"],
] as const;

export default function SiteHeader() {
  const pathname = usePathname();
  return (
    <header>
      <NavButton to="/" className="brand">
        <span className="logo">☾</span> Ring letter<span className="brand-small">時光來信</span>
      </NavButton>
      <nav aria-label="主要導覽">
        {NAV.map(([to, label]) => (
          <NavButton key={to} to={to} className={pathname === to ? "active" : ""}>
            {label}
          </NavButton>
        ))}
      </nav>
    </header>
  );
}
