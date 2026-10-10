import { z } from "zod/v4";

export const analysisSchema = z.object({
  enjoyed: z.array(z.string()),
  disliked: z.array(z.string()),
  interests: z.array(z.string()),
  possible_skills: z.array(z.string()),
  curiosities: z.array(z.string()),
  short_insight: z.string(),
  future_directions: z.array(z.string()),
  time_budget_hours: z.number().nullable(),
}).strict();
export type Analysis = z.infer<typeof analysisSchema>;

export const reflectionInputSchema = z.object({
  text: z.string().trim().min(20, "Write at least 20 characters.").max(1500, "Keep your reflection under 1,500 characters."),
}).strict();
export const feedbackStatusSchema = z.enum(["saved", "not_interested", "completed"]);
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;
export const feedbackInputSchema = z.object({
  opportunityId: z.string().min(1),
  status: feedbackStatusSchema,
}).strict();

export const reflectionRecordSchema = z.object({
  id: z.uuid(), sessionId: z.uuid(), text: z.string().min(20).max(1500),
  createdAt: z.iso.datetime(), analysis: analysisSchema,
});
export type ReflectionRecord = z.infer<typeof reflectionRecordSchema>;
export const feedbackRecordSchema = feedbackInputSchema.extend({
  sessionId: z.uuid(), updatedAt: z.iso.datetime(),
});
export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;

export const opportunitySchema = z.object({
  id: z.string().min(1), title: z.string().min(1),
  category: z.enum(["competition", "campus_event", "project", "research", "learning_resource", "student_community"]),
  description: z.string().min(1),
  relevant_interests: z.array(z.string().min(1)).min(1).max(4),
  required_skills: z.array(z.string().min(1)).max(3),
  estimated_effort_hours: z.number().positive(),
  estimated_effort_label: z.string().min(1), next_action: z.string().min(1),
  url: z.url().refine((url) => /^https?:\/\//.test(url)).nullable(), is_example: z.boolean(),
}).strict();
export type Opportunity = z.infer<typeof opportunitySchema>;

export const discoveriesSchema = z.object({
  hasReflections: z.boolean(), reflectionCount: z.number(),
  interests: z.array(z.object({ tag: z.string(), count: z.number(), sourceReflectionIds: z.array(z.string()) })),
  observations: z.array(z.object({ text: z.string(), kind: z.enum(["early", "recurring"]), sourceReflectionIds: z.array(z.string()) })),
  shortInsight: z.string().nullable(), insightReflectionId: z.string().nullable(),
  possibleSkills: z.array(z.string()), futureDirections: z.array(z.string()),
  evidence: z.array(z.object({ reflectionId: z.string(), text: z.string(), createdAt: z.string() })),
});
export type Discoveries = z.infer<typeof discoveriesSchema>;
export const recommendationCardSchema = z.object({
  id: z.string(), title: z.string(), category: opportunitySchema.shape.category,
  description: z.string(), whyMatch: z.string(), estimatedEffort: z.string(),
  nextAction: z.string(), url: z.string().nullable(), isExample: z.boolean(),
  status: feedbackStatusSchema.nullable(),
});
export type RecommendationCard = z.infer<typeof recommendationCardSchema>;
export const recommendationsSchema = z.object({
  hasReflections: z.boolean(), recommendations: z.array(recommendationCardSchema), saved: z.array(recommendationCardSchema),
});
export type Recommendations = z.infer<typeof recommendationsSchema>;