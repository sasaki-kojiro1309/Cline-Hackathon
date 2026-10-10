import { analysisSchema, type Analysis } from "./schemas";

export const canonicalTags = ["computer architecture", "digital systems", "electronics", "robotics", "programming", "web development", "data science", "artificial intelligence", "cybersecurity", "mathematics", "problem solving", "research", "physics", "biology", "environment", "design", "product design", "writing", "public speaking", "entrepreneurship", "community service", "creative arts", "hardware", "collaboration"];
export function normalizeTag(value: string): string {
  const tag = value.trim().toLowerCase().replace(/\s+/g, " ");
  const synonyms: Record<string, string> = { coding: "programming", circuits: "digital systems", "web design": "web development" };
  return synonyms[tag] ?? tag;
}
function bounded(value: string, limit: number): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= limit) return text;
  const part = text.slice(0, limit);
  return part.slice(0, Math.max(0, part.lastIndexOf(" "))).trim();
}
export function explicitTimeBudget(text: string): number | null {
  // Deliberately conservative: a class duration is not available exploration time.
  const match = text.match(/\bi (?:can spend|can spare|have)\s+(?:about |only |up to )?(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\s+(?:available|free|to (?:try|explore|spend|work|learn)|(?:for|on) (?:a |an |this |my )?(?:project|activity|challenge|learning|exploration))/i);
  if (!match) return null;
  const hours = Number(match[1]) / (/^m/i.test(match[2]) ? 60 : 1);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}
export function sanitizeAnalysis(input: unknown, reflection: string): Analysis {
  const parsed = analysisSchema.parse(input);
  const tags = (values: string[]) => [...new Set(values.map((v) => normalizeTag(bounded(v, 80))).filter(Boolean))].slice(0, 6);
  const insight = bounded(parsed.short_insight, 370);
  return analysisSchema.parse({
    enjoyed: tags(parsed.enjoyed), disliked: tags(parsed.disliked), interests: tags(parsed.interests),
    possible_skills: tags(parsed.possible_skills), curiosities: tags(parsed.curiosities),
    short_insight: insight ? `One possibility: ${insight}` : "",
    future_directions: [...new Set(parsed.future_directions.map((v) => bounded(v, 120)).filter(Boolean))].slice(0, 3),
    time_budget_hours: explicitTimeBudget(reflection),
  });
}