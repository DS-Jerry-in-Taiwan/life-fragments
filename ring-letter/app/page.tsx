import BottomNote from "../components/home/BottomNote";
import Hero from "../components/home/Hero";
import HowItWorks from "../components/home/HowItWorks";
import MatchingExplanation from "../components/home/MatchingExplanation";
import MatchExperience from "../components/reading/MatchExperience";

export default function HomePage() {
  return (
    <>
      <Hero />
      <BottomNote />
      <HowItWorks />
      <MatchingExplanation />
      <MatchExperience />
    </>
  );
}
