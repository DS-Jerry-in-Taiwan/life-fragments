"use client";
import { useMemo, useRef, useState } from "react";
import { ConfirmProvider } from "../common/ConfirmDialog";
import PrivacyDialog from "../privacy/PrivacyDialog";
import { ShellContext } from "./ShellContext";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import styles from "./SiteShell.module.css";

/** Night sky + header + main + footer around every route (#4 §4.3). */
export default function SiteShell({
  children,
  turnstileSiteKey,
}: {
  children: React.ReactNode;
  turnstileSiteKey: string;
}) {
  const [privacy, setPrivacy] = useState(false),
    [admin, setAdmin] = useState(false),
    main = useRef<HTMLElement>(null);
  const shell = useMemo(
    () => ({ openPrivacy: () => setPrivacy(true), setAdmin, turnstileSiteKey }),
    [turnstileSiteKey],
  );
  return (
    <ShellContext.Provider value={shell}>
      <ConfirmProvider>
        <div className={styles.sky}>
          <div className={styles.stars} aria-hidden="true" />
          {/* Skip link (#50, WCAG 2.4.1): the first Tab stop, shown only while
              focused. Focus moves to <main> without adding #main to the URL;
              href keeps it working before hydration. */}
          <a
            href="#main"
            className={styles.skip}
            onClick={(e) => {
              e.preventDefault();
              main.current?.focus();
            }}
          >
            跳到主要內容
          </a>
          <SiteHeader />
          <main id="main" ref={main} tabIndex={-1} className={styles.main}>
            {children}
          </main>
          <SiteFooter admin={admin} onOpenPrivacy={shell.openPrivacy} />
          {privacy && <PrivacyDialog onClose={() => setPrivacy(false)} />}
        </div>
      </ConfirmProvider>
    </ShellContext.Provider>
  );
}
