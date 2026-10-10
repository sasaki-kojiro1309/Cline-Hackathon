import { endpoint, jsonBody } from "@/lib/api";
import { analyzeReflection } from "@/lib/ai";
import { insertReflection, listReflections } from "@/lib/local-store";
import { reflectionInputSchema } from "@/lib/schemas";
export const runtime = "nodejs";
export const GET = endpoint(async (_request, sessionId) => ({
  reflections: (await listReflections(sessionId)).map(({ id, text, createdAt }) => ({ id, text, createdAt })),
}));
export const POST = endpoint(async (request, sessionId) => {
  const { text } = await jsonBody(request, reflectionInputSchema);
  const analysis = await analyzeReflection(text);
  const { id, createdAt } = await insertReflection(sessionId, text, analysis);
  return { reflection: { id, text, createdAt }, analysis };
}, 201);