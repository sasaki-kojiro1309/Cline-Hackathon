import { endpoint, ApiError } from "@/lib/api";
import { browseCatalogue } from "@/lib/catalogue-browser";
import { listFeedback } from "@/lib/storage";
export const runtime = "nodejs";
export const GET = endpoint(async (request, ownerId) => {
  const feedback = await listFeedback(ownerId);
  try { return browseCatalogue(request.nextUrl.searchParams, feedback); }
  catch { throw new ApiError(400, "INVALID_QUERY", "Choose a valid subject, search and catalogue page."); }
});