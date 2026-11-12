"use client";
import { useState } from "react";
import AdminDashboard from "./admin/AdminDashboard";
import ArchiveReader from "./archive/ArchiveReader";
import BottomNote from "./home/BottomNote";
import Hero from "./home/Hero";
import HowItWorks from "./home/HowItWorks";
import MatchingExplanation from "./home/MatchingExplanation";
import MyStories from "./mine/MyStories";
import PrivacyDialog from "./privacy/PrivacyDialog";
import MatchExperience from "./reading/MatchExperience";
import SiteFooter from "./shell/SiteFooter";
import SiteHeader from "./shell/SiteHeader";
import WriteFlow from "./write/WriteFlow";

export type Tab = "home" | "read" | "write" | "mine" | "archive" | "admin";

/**
 * Still one page that switches screens by `tab` (V1-c); V1-d turns each tab
 * into a route. Every screen owns its own state and messages.
 */
export default function RingLetterApp({ initialTab = "home" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab),
    // Bumped to remount the screen (fresh state and messages) when switching
    // tabs. Re-clicking the current tab only scrolls up, except 寫一封信,
    // which v1 always reset to the mode chooser.
    [visit, setVisit] = useState(0),
    [privacy, setPrivacy] = useState(false),
    // Admin footer link appears once /api/admin accepts the viewer.
    [admin, setAdmin] = useState(false);
  function go(t: Tab) {
    if (t !== tab || t === "write") setVisit((v) => v + 1);
    setTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const write = () => go("write");
  const openPrivacy = () => setPrivacy(true);
  return (
    <div className="sky">
      <div className="stars" aria-hidden="true" />
      <SiteHeader tab={tab} go={go} />
      <main key={visit}>
        {tab === "home" && (
          <>
            <Hero onRead={() => go("read")} onWrite={write} />
            <BottomNote />
            <HowItWorks />
            <MatchingExplanation />
            <MatchExperience onWrite={write} />
          </>
        )}
        {tab === "read" && <MatchExperience onWrite={write} />}
        {tab === "archive" && <ArchiveReader onWrite={write} />}
        {tab === "write" && <WriteFlow onViewMine={() => go("mine")} onOpenPrivacy={openPrivacy} />}
        {tab === "mine" && <MyStories onWrite={write} />}
        {tab === "admin" && <AdminDashboard onAuthorized={setAdmin} />}
      </main>
      <SiteFooter admin={admin} go={go} onOpenPrivacy={openPrivacy} />
      {privacy && <PrivacyDialog onClose={() => setPrivacy(false)} />}
    </div>
  );
}
