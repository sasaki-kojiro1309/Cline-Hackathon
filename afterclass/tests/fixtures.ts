import type { Analysis, FeedbackRecord, ReflectionRecord } from "@/lib/schemas";
export const emptyAnalysis: Analysis = {
  enjoyed: [], disliked: [], interests: [], possible_skills: [], curiosities: [],
  short_insight: "You may enjoy exploring digital systems.", future_directions: [], time_budget_hours: null,
};
export function reflection(interests: string[] = [], overrides: Partial<ReflectionRecord> = {}): ReflectionRecord {
  return { id: "550e8400-e29b-41d4-a716-446655440001", sessionId: "550e8400-e29b-41d4-a716-446655440000",
    text: "I enjoyed designing logic circuits in our lab today.", createdAt: "2026-10-10T08:00:00.000Z",
    analysis: { ...emptyAnalysis, interests }, ...overrides };
}
export function feedback(opportunityId: string, status: FeedbackRecord["status"]): FeedbackRecord {
  return { opportunityId, status, sessionId: reflection().sessionId, updatedAt: "2026-10-10T08:00:00.000Z" };
}