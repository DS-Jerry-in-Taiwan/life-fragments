"use client";
import { usePathname } from "next/navigation";
import { useGo } from "./useGo";

/**
 * An in-site link (V5-nav, #36). A real <a href>, so readers can open it in a
 * new tab or copy its address; a plain left click is turned into client
 * navigation (useGo: router.push + smooth scroll to the top, as v1's tab
 * switch did). Middle clicks, other buttons and Ctrl/Cmd/Shift/Alt clicks are
 * left to the browser.
 *
 * The link carries `aria-current="page"` when it points at the current route
 * (the pathname, ignoring any query: /write?mode=past still marks /write);
 * SiteHeader styles its active item from that attribute.
 *
 * `nav-link` (utilities.css) gives the link a <button>'s box, so screens that
 * styled these as buttons (.primary, .secondary, .text-btn, header, footer)
 * look the same.
 */
export default function NavButton({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: React.ReactNode;
}) {
  const go = useGo();
  const pathname = usePathname();
  const current = pathname === to.split(/[?#]/)[0];
  return (
    <a
      href={to}
      className={className ? `nav-link ${className}` : "nav-link"}
      aria-current={current ? "page" : undefined}
      onClick={(e) => {
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return;
        }
        e.preventDefault();
        go(to);
      }}
    >
      {children}
    </a>
  );
}
