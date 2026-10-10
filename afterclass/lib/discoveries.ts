import { aggregateSignals, buildJourney, calendarTrends, filterReflections, resolveRange, sortedReflections, type RangeInput } from "./journey";
import type { Discoveries, ReflectionRecord } from "./schemas";

export function recentReflections(reflections: ReflectionRecord[]) {
  return sortedReflections(reflections);
}
export function buildDiscoveries(input: ReflectionRecord[], selection: RangeInput = { range: "all" }, now = new Date()): Discoveries {
  const range = resolveRange(selection, now);
  const reflections = filterReflections(input, range);
  const signals = aggregateSignals(reflections, "interests");
  const interests = signals.slice(0, 4).map(({ tag, count, sourceReflectionIds }) => ({ tag, count, sourceReflectionIds }));
  const union = (key: "possible_skills" | "future_directions") => [...new Set(reflections.flatMap((r) => r.analysis[key]))].slice(0, 3);
  const latestInsight = reflections.find((r) => r.analysis.short_insight);
  const themeChanges = calendarTrends(reflections, range.end).changes;
  const journey = buildJourney(reflections, range);
  const ids = new Set([...Object.values(journey.signals).flatMap((items) => items.flatMap((s) => s.sourceReflectionIds)),
    ...themeChanges.flatMap((s) => s.sourceReflectionIds), ...(latestInsight ? [latestInsight.id] : [])]);
  return {
    hasReflections: reflections.length > 0, reflectionCount: reflections.length, historyCount: input.length, interests, themeChanges, journey,
    observations: signals.slice(0, 4).map(({ tag, count, dayCount, sourceReflectionIds }) => ({
      text: dayCount >= 2 ? `You have mentioned ${tag} in ${count} reflections across ${dayCount} different days.` : `Early observation: ${tag} appeared in ${count} reflection${count === 1 ? "" : "s"} on one day. More days may help reveal a pattern.`,
      kind: dayCount >= 2 ? "recurring" : "early", sourceReflectionIds,
    })),
    shortInsight: latestInsight?.analysis.short_insight ?? null, insightReflectionId: latestInsight?.id ?? null,
    possibleSkills: union("possible_skills"), futureDirections: union("future_directions"),
    evidence: reflections.filter((r) => ids.has(r.id)).map((r) => ({ reflectionId: r.id, text: r.text, createdAt: r.createdAt })),
  };
}