import { formatStoryMeta, type Story } from "../../lib/stories";

/** Letter type, event and date under a story title. */
export default function StoryMeta({ story }: { story: Story }) {
  return <p className="era">{formatStoryMeta(story)}</p>;
}
