import "server-only";
import { withDatabase } from "./sqlite-db";
import { z } from "zod/v4";

// Read-only export of retired search data. Never used for recommendations or AI.
export function readLegacyExploreData(ownerId: string): unknown {
  z.uuid().parse(ownerId);
  return withDatabase((db) => {
    const row = z.object({ state: z.string() }).optional().parse(db.prepare("SELECT state FROM student_explore_state WHERE owner_id=?").get(ownerId));
    return row ? JSON.parse(row.state) : null;
  });
}