import type { Metadata } from "next";
// Global CSS first, so the CSS Modules imported below come after it.
import "./globals.css";
import SiteShell from "../components/shell/SiteShell";
import { turnstileSiteKey } from "../lib/server/turnstile";

export const metadata: Metadata = {
  title: "Ring letter｜遇見另一段時光",
  description: "留下一段此刻，遇見某個人的從前。跨時間匿名故事的早期體驗。",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <SiteShell turnstileSiteKey={turnstileSiteKey()}>{children}</SiteShell>
      </body>
    </html>
  );
}
