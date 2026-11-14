import { listApprovedStories } from "../../../lib/server/db/stories";
import { guardRead } from "../../../lib/server/handler";
import { reply } from "../../../lib/server/http";

/** Approved public stories (retention rules in lib/server/db/stories.ts). */
export async function GET() {
  return guardRead(async () => reply({ stories: await listApprovedStories(Date.now()) }));
}
