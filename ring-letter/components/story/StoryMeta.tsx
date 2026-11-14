import { formatStoryMeta, type Story } from "../../lib/stories";
import styles from "./StoryMeta.module.css";

/**
 * Letter type, event and date under a story title. `onPaper` for the light
 * letter paper (公開信箱); otherwise it sits on a dark card.
 */
export default function StoryMeta({ story, onPaper = false }: { story: Story; onPaper?: boolean }) {
  return (
    <p className={onPaper ? `${styles.era} ${styles.onPaper}` : styles.era}>
      {formatStoryMeta(story)}
    </p>
  );
}
