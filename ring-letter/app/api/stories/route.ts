import { listApprovedStories } from "../../../lib/server/db/stories";
import { guardRead } from "../../../lib/server/handler";
import { reply } from "../../../lib/server/http";

/** Approved public stories (they never expire). */
export async function GET() {
  return guardRead(async () => reply({ stories: await listApprovedStories() }));
}
