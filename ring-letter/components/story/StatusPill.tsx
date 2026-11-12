import { STATUS_NAME } from "../../lib/stories";

export default function StatusPill({ status }: { status?: string }) {
  return <span className="pill">{STATUS_NAME[status || "pending"]}</span>;
}
