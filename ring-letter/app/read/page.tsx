import type { Metadata } from "next";
import MatchExperience from "../../components/reading/MatchExperience";

export const metadata: Metadata = { title: "讀一封信" };

export default function ReadPage() {
  return <MatchExperience />;
}
