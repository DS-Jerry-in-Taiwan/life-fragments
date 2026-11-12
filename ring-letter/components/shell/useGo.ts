"use client";
import { useRouter } from "next/navigation";

/** Client navigation that scrolls smoothly to the top, as v1's tab switch did. */
export function useGo() {
  const router = useRouter();
  return (href: string) => {
    router.push(href, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
}
