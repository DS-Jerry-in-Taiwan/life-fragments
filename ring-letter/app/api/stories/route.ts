import { AGE } from "../../../lib/server/db/index";
import { listApprovedStories } from "../../../lib/server/db/stories";
import { guardRead } from "../../../lib/server/handler";
import { reply } from "../../../lib/server/http";

/** Approved public stories. */
export async function GET() {
  return guardRead(async () => reply({ stories: await listApprovedStories(Date.now() - AGE) }));
}
