"use client";
import NavButton from "./NavButton";
import styles from "./SiteHeader.module.css";

const NAV = [
  ["/read", "讀一封信"],
  ["/archive", "公開信箱"],
  ["/write", "寫一封信"],
  ["/mine", "我的片段"],
] as const;

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <NavButton to="/" className={styles.brand}>
        <span className={styles.logo} aria-hidden="true">
          ☾
        </span>{" "}
        Ring letter
        <span className={styles.brandSmall}>時光來信</span>
      </NavButton>
      <nav className={styles.nav} aria-label="主要導覽">
        {NAV.map(([to, label]) => (
          <NavButton key={to} to={to}>
            {label}
          </NavButton>
        ))}
      </nav>
    </header>
  );
}
