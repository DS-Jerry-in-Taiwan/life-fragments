"use client";
import { useRouter } from "next/navigation";

/**
 * Client navigation that scrolls to the top, as v1's tab switch did:
 * smoothly, or at once under prefers-reduced-motion (base.css's
 * `scroll-behavior: auto` doesn't reach an explicit `behavior: "smooth"`).
 */
export function useGo() {
  const router = useRouter();
  return (href: string) => {
    router.push(href, { scroll: false });
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
  };
}
