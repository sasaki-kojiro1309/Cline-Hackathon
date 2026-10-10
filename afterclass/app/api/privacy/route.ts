import { z } from "zod/v4";
import { endpoint, jsonBody } from "@/lib/api";
import { deleteStudentData, getProfile, listFeedback, listReflections, retentionDays } from "@/lib/storage";
export const runtime = "nodejs";
export const GET = endpoint(async (_request, ownerId) => ({
  exportedAt: new Date().toISOString(), retentionDays: retentionDays(), profile: await getProfile(ownerId),
  reflections: (await listReflections(ownerId, true)).map(({ id, text, createdAt, analysis }) => ({ id, text, createdAt, analysis })),
  feedback: (await listFeedback(ownerId)).map(({ opportunityId, status, updatedAt }) => ({ opportunityId, status, updatedAt })),
}));
export const POST = endpoint(async (request, ownerId) => {
  await jsonBody(request, z.object({ confirmation: z.literal("DELETE") }).strict());
  await deleteStudentData(ownerId);
  return { success: true };
});