import { normalizeTag } from "./analysis";
import type { Discoveries, ReflectionRecord } from "./schemas";

export function recentReflections(reflections: ReflectionRecord[]) {
  return [...reflections].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(0, 50);
}
export function buildDiscoveries(input: ReflectionRecord[]): Discoveries {
  const reflections = recentReflections(input);
  const tags = new Map<string, { tag: string; count: number; sourceReflectionIds: string[]; recency: number }>();
  reflections.forEach((reflection, index) => {
    new Set(reflection.analysis.interests.map(normalizeTag).filter(Boolean)).forEach((tag) => {
      const entry = tags.get(tag) ?? { tag, count: 0, sourceReflectionIds: [], recency: index };
      entry.count += 1;
      entry.sourceReflectionIds.push(reflection.id);
      tags.set(tag, entry);
    });
  });
  const interests = [...tags.values()].sort((a, b) => b.count - a.count || a.recency - b.recency || a.tag.localeCompare(b.tag))
    .slice(0, 4).map(({ tag, count, sourceReflectionIds }) => ({ tag, count, sourceReflectionIds }));
  const union = (key: "possible_skills" | "future_directions") => [...new Set(reflections.flatMap((r) => r.analysis[key]))].slice(0, 3);
  const latestInsight = reflections.find((r) => r.analysis.short_insight);
  // Compare equally-sized chronological windows, not invented ability growth.
  const windowSize = Math.min(5, Math.floor(reflections.length / 2));
  const recent = reflections.slice(0, windowSize), previous = reflections.slice(windowSize, windowSize * 2);
  const mentions = (rows: ReflectionRecord[], tag: string) => rows.filter((r) => new Set(r.analysis.interests.map(normalizeTag)).has(tag));
  const themeChanges = windowSize >= 2 ? [...tags.keys()].flatMap((tag) => {
    const current = mentions(recent, tag), past = mentions(previous, tag);
    if (current.length === past.length || current.length < 1) return [];
    return [{ tag, recentCount: current.length, previousCount: past.length,
      description: `${tag}: mentioned in ${current.length} of your latest ${windowSize} reflections, compared with ${past.length} of the previous ${windowSize}. This describes mentions, not ability or a permanent preference.`,
      sourceReflectionIds: [...current, ...past].map((r) => r.id) }];
  }).slice(0, 4) : [];
  return {
    hasReflections: reflections.length > 0, reflectionCount: reflections.length, historyCount: input.length, interests, themeChanges,
    observations: interests.map(({ tag, count, sourceReflectionIds }) => ({
      text: count >= 2 ? `You have mentioned ${tag} in ${count} reflections.` : `Early observation: your reflection suggests an interest in ${tag}.`,
      kind: count >= 2 ? "recurring" : "early", sourceReflectionIds,
    })),
    shortInsight: latestInsight?.analysis.short_insight ?? null, insightReflectionId: latestInsight?.id ?? null,
    possibleSkills: union("possible_skills"), futureDirections: union("future_directions"),
    evidence: reflections.map((r) => ({ reflectionId: r.id, text: r.text, createdAt: r.createdAt })),
  };
}