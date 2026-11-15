import type { Metadata } from "next";
import { Suspense } from "react";
import WriteFlow from "../../components/write/WriteFlow";

export const metadata: Metadata = { title: "寫一封信" };

// ?mode=past|present picks the letter type, so each form can be linked to.
export default function WritePage() {
  return (
    <Suspense>
      <WriteFlow />
    </Suspense>
  );
}
