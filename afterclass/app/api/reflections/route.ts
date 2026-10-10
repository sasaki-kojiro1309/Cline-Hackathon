import { endpoint, jsonBody, ApiError } from "@/lib/api";
import { historyPage } from "@/lib/journey";
import { analyzeReflection } from "@/lib/ai";
import { insertReflection, listReflections, getProfile, saveProfile } from "@/lib/storage";
import { consentInputSchema } from "@/lib/schemas";
import { enforceLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const GET = endpoint(async (request, sessionId) => {
  const rows = await listReflections(sessionId, true);
  try { return historyPage(rows, request.nextUrl.searchParams); }
  catch { throw new ApiError(400, "INVALID_QUERY", "Choose valid history search, page and dates."); }
});
export const POST = endpoint(async (request, sessionId) => {
  const { text } = await jsonBody(request, consentInputSchema);
  await enforceLimit(`ai:${sessionId}`, 10, 3600);
  // Deployment-wide budget guard also limits anonymous cookie resets.
  await enforceLimit("ai:deployment", Number(process.env.AI_HOURLY_LIMIT || 100), 3600);
  const profile = await getProfile(sessionId);
  await saveProfile(sessionId, { ...profile, consentAt: new Date().toISOString() });
  const analysis = await analyzeReflection(text);
  const { id, createdAt } = await insertReflection(sessionId, text, analysis);
  return { reflection: { id, text, createdAt }, analysis };
}, 201);