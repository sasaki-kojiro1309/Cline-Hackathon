import { ApiError, endpoint, jsonBody } from "@/lib/api";
import { getOpportunityById } from "@/lib/catalogue";
import { upsertFeedback } from "@/lib/local-store";
import { feedbackInputSchema } from "@/lib/schemas";
export const runtime = "nodejs";
export const POST = endpoint(async (request, sessionId) => {
  const { opportunityId, status } = await jsonBody(request, feedbackInputSchema);
  if (!getOpportunityById(opportunityId)) throw new ApiError(400, "INVALID_OPPORTUNITY", "Choose an opportunity from the catalogue.");
  return upsertFeedback(sessionId, opportunityId, status);
});