"use client";
import { useMemo, useState } from "react";
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
    [admin, setAdmin] = useState(false);
  const shell = useMemo(
    () => ({ openPrivacy: () => setPrivacy(true), setAdmin, turnstileSiteKey }),
    [turnstileSiteKey],
  );
  return (
    <ShellContext.Provider value={shell}>
      <ConfirmProvider>
        <div className={styles.sky}>
          <div className={styles.stars} aria-hidden="true" />
          <SiteHeader />
          <main className={styles.main}>{children}</main>
          <SiteFooter admin={admin} onOpenPrivacy={shell.openPrivacy} />
          {privacy && <PrivacyDialog onClose={() => setPrivacy(false)} />}
        </div>
      </ConfirmProvider>
    </ShellContext.Provider>
  );
}
