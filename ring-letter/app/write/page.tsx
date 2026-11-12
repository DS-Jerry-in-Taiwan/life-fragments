import { Suspense } from "react";
import WriteFlow from "../../components/write/WriteFlow";

// ?mode=past|present picks the letter type, so each form can be linked to.
export default function WritePage() {
  return (
    <Suspense>
      <WriteFlow />
    </Suspense>
  );
}
