import { normalizeTag, curiosityTags } from "./analysis";
import { recentReflections } from "./discoveries";
import { aggregateSignals } from "./journey";
import type { FeedbackRecord, Opportunity, RecommendationCard, Recommendations, ReflectionRecord } from "./schemas";

export function rankOpportunities(input: ReflectionRecord[], feedback: FeedbackRecord[], catalogue: Opportunity[]) {
  const reflections = recentReflections(input);
  const frequencies = new Map<string, number>();
  aggregateSignals(reflections, "interests").forEach((s) => frequencies.set(s.tag, s.dayCount));
  const latest = reflections[0]?.createdAt.slice(0, 10);
  const cutoff = latest ? Date.parse(`${latest}T00:00:00Z`) - 29 * 86400000 : 0;
  const recent = reflections.filter((r) => Date.parse(r.createdAt) >= cutoff);
  const curiosities = new Set(recent.flatMap((r) => r.analysis.curiosities.flatMap(curiosityTags)));
  const skills = new Set(reflections.flatMap((r) => r.analysis.possible_skills.map(normalizeTag)));
  const budget = reflections.find((r) => r.analysis.time_budget_hours !== null)?.analysis.time_budget_hours ?? null;
  const affinity = new Map<string, number>();
  feedback.forEach((f) => {
    const opportunity = catalogue.find((o) => o.id === f.opportunityId);
    opportunity?.relevant_interests.forEach((raw) => {
      const tag = normalizeTag(raw);
      affinity.set(tag, (affinity.get(tag) ?? 0) + (f.status === "saved" ? 2 : f.status === "completed" ? 1 : -2));
    });
  });
  const excluded = new Set(feedback.map((f) => f.opportunityId));
  return catalogue.filter((o) => !excluded.has(o.id)).map((opportunity) => {
    const tags = opportunity.relevant_interests.map(normalizeTag);
    const matched = tags.filter((tag) => frequencies.has(tag));
    const curious = tags.filter((tag) => curiosities.has(tag));
    let score = tags.reduce((sum, tag) => sum + (frequencies.has(tag) ? 6 + 2 * Math.min((frequencies.get(tag) ?? 1) - 1, 2) : 0) + (affinity.get(tag) ?? 0), 0);
    if (curious.length) score += 2;
    if (opportunity.required_skills.every((skill) => skills.has(normalizeTag(skill)))) score += 1;
    if (budget !== null) score += opportunity.estimated_effort_hours <= budget ? 2 : -3;
    const whyMatch = matched.length
      ? `Across your retained history, your reflections suggest an interest in ${matched.map((tag) => `${tag} (${frequencies.get(tag)} distinct day${frequencies.get(tag) === 1 ? "" : "s"})`).join(" and ")}. ${curious.length ? "Recent curiosities also support this suggestion. " : ""}This activity offers a way to explore it: ${opportunity.next_action}`
      : curious.length ? `Your reflection suggests curiosity about ${curious.join(" and ")}. Try exploring it: ${opportunity.next_action}`
        : "This is a general exploration idea. Your reflections have not yet shown a strong match to it.";
    return { opportunity, score, whyMatch };
  }).sort((a, b) => b.score - a.score || a.opportunity.estimated_effort_hours - b.opportunity.estimated_effort_hours || a.opportunity.id.localeCompare(b.opportunity.id));
}
function card(o: Opportunity, whyMatch: string, status: RecommendationCard["status"]): RecommendationCard {
  return { id: o.id, title: o.title, category: o.category, description: o.description, whyMatch,
    estimatedEffort: o.estimated_effort_label, nextAction: o.next_action, url: o.url, isExample: o.is_example, status,
    verifiedAt: o.verified_at ?? null, source: o.source ?? null,
    prerequisiteNote: o.required_skills.length ? `Helpful background: ${o.required_skills.join(", ")}. Choose a starting point that feels comfortable; your reflections do not confirm these skills.` : null,
    sourceKind: "example" };
}
export function buildRecommendations(reflections: ReflectionRecord[], feedback: FeedbackRecord[], catalogue: Opportunity[], matchesOnly = false): Recommendations {
  if (!reflections.length) return { hasReflections: false, recommendations: [], saved: [], latestCheckIn: null };
  return {
    hasReflections: true,
    recommendations: rankOpportunities(reflections, feedback, catalogue).filter((r) => !matchesOnly || !r.whyMatch.startsWith("This is a general")).slice(0, 3).map((r) => card(r.opportunity, r.whyMatch, null)),
    latestCheckIn: recentReflections(reflections)[0]?.createdAt ?? null,
    saved: feedback.filter((f) => f.status === "saved").flatMap((f) => {
      const o = catalogue.find((o) => o.id === f.opportunityId);
      return o ? [card(o, "You saved this idea to explore later.", "saved")] : [];
    }),
  };
}