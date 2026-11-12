"use client";
import { useMemo, useState } from "react";
import PrivacyDialog from "../privacy/PrivacyDialog";
import { ShellContext } from "./ShellContext";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

/** Night sky + header + main + footer around every route (#4 §4.3). */
export default function SiteShell({ children }: { children: React.ReactNode }) {
  const [privacy, setPrivacy] = useState(false),
    [admin, setAdmin] = useState(false);
  const shell = useMemo(() => ({ openPrivacy: () => setPrivacy(true), setAdmin }), []);
  return (
    <ShellContext.Provider value={shell}>
      <div className="sky">
        <div className="stars" aria-hidden="true" />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter admin={admin} onOpenPrivacy={shell.openPrivacy} />
        {privacy && <PrivacyDialog onClose={() => setPrivacy(false)} />}
      </div>
    </ShellContext.Provider>
  );
}
