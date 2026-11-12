import { formatStoryMeta, type Story } from "../../lib/stories";
import styles from "./StoryMeta.module.css";

/** Letter type, event and date under a story title. */
export default function StoryMeta({ story }: { story: Story }) {
  return <p className={styles.era}>{formatStoryMeta(story)}</p>;
}
