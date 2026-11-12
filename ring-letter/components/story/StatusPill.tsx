import { STATUS_NAME } from "../../lib/stories";
import styles from "./StatusPill.module.css";

export default function StatusPill({ status }: { status?: string }) {
  return <span className={styles.pill}>{STATUS_NAME[status || "pending"]}</span>;
}
