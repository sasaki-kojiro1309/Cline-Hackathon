import { z } from "zod/v4";
import { normalizeTag } from "./tags";
import { getCatalogue } from "./catalogue";
import type { FeedbackRecord, RecommendationCard } from "./schemas";

export function browseCatalogue(params: URLSearchParams, feedback: FeedbackRecord[]) {
  const query = z.object({ q: z.string().trim().max(200).default(""), subject: z.string().max(80).default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1) }).parse({
      q: params.get("q") ?? undefined, subject: params.get("subject") ?? undefined, page: params.get("page") ?? undefined,
    });
  const catalogue = getCatalogue();
  const subjects = [...new Set(catalogue.flatMap((o) => o.relevant_interests))].sort();
  if (query.subject && !subjects.includes(query.subject)) throw new Error("Unknown subject");
  const entries = catalogue.filter((o) => (!query.subject || o.relevant_interests.map(normalizeTag).includes(normalizeTag(query.subject))) &&
    `${o.title} ${o.description} ${o.relevant_interests.join(" ")}`.toLowerCase().includes(query.q.toLowerCase()));
  const activities: RecommendationCard[] = entries.slice((query.page - 1) * 12, query.page * 12).map((o) => ({
    id: o.id, title: o.title, category: o.category, description: o.description,
    whyMatch: `Explore ${o.relevant_interests.join(" and ")} through this activity. This is a catalogue idea, not a personal recommendation based on your reflections.`,
    estimatedEffort: o.estimated_effort_label, nextAction: o.next_action, url: null, isExample: true,
    status: feedback.find((f) => f.opportunityId === o.id)?.status ?? null,
    verifiedAt: null, source: null, sourceKind: "example", prerequisiteNote: null,
  }));
  return { activities, subjects, total: entries.length, catalogueTotal: catalogue.length, page: query.page, pageSize: 12 };
}