import { endpoint, ApiError } from "@/lib/api";
import { readRange } from "@/lib/journey";
import { buildDiscoveries } from "@/lib/discoveries";
import { listReflections } from "@/lib/storage";
export const runtime = "nodejs";
export const GET = endpoint(async (request, sessionId) => {
  let range;
  try { range = readRange(request.nextUrl.searchParams); } catch { throw new ApiError(400, "INVALID_RANGE", "Choose a valid date range."); }
  return buildDiscoveries(await listReflections(sessionId, true), range);
});