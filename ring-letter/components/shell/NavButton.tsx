"use client";
import { useGo } from "./useGo";

/**
 * A button that navigates. V1 keeps v1's <button> markup so the screens stay
 * pixel-identical; turning these into real links (<a>) is V5 design work.
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
  return (
    <button className={className} onClick={() => go(to)}>
      {children}
    </button>
  );
}
