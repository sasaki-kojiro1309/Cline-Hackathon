import { endpoint } from "@/lib/api";
import { getCatalogue } from "@/lib/catalogue";
import { listReflections, listFeedback } from "@/lib/local-store";
import { buildRecommendations } from "@/lib/recommendations";
export const runtime = "nodejs";
export const GET = endpoint(async (_request, sessionId) => {
  const [reflections, feedback] = await Promise.all([listReflections(sessionId), listFeedback(sessionId)]);
  return buildRecommendations(reflections, feedback, getCatalogue());
});