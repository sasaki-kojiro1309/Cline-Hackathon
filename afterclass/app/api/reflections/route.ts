import { endpoint, jsonBody } from "@/lib/api";
import { analyzeReflection } from "@/lib/ai";
import { insertReflection, listReflections, getProfile, saveProfile } from "@/lib/storage";
import { consentInputSchema } from "@/lib/schemas";
import { enforceLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const GET = endpoint(async (_request, sessionId) => ({
  reflections: (await listReflections(sessionId)).map(({ id, text, createdAt }) => ({ id, text, createdAt })),
}));
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