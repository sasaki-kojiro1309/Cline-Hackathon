import { analysisSchema, type Analysis } from "./schemas";
import { normalizeTag } from "./tags";
export { normalizeTag } from "./tags";

export const canonicalTags = ["computer architecture", "digital systems", "electronics", "robotics", "programming", "web development", "data science", "artificial intelligence", "cybersecurity", "mathematics", "problem solving", "research", "physics", "biology", "environment", "design", "product design", "writing", "public speaking", "entrepreneurship", "community service", "creative arts", "hardware", "collaboration", "geography", "history", "chemistry", "geology", "economics", "philosophy", "astronomy", "music", "literature", "languages", "psychology", "sociology", "civics", "law", "finance", "accounting", "business", "marketing", "agriculture", "health", "nutrition", "sports", "mechanical engineering", "civil engineering", "architecture", "education", "photography", "film", "dance"];
export function curiosityTags(value: string): string[] {
  const normalized = normalizeTag(value);
  if (canonicalTags.includes(normalized)) return [normalized];
  const rules: Array<[RegExp, string]> = [
    [/\b(?:processors?|cpu|computer architecture)\b/i, "computer architecture"],
    [/\b(?:logic gates?|logic circuits?|truth tables?)\b/i, "digital systems"],
    [/\b(?:websites?|webpages?|web development)\b/i, "web development"],
    [/\b(?:robots?|robotics)\b/i, "robotics"],
  ];
  return rules.filter(([pattern]) => pattern.test(value)).map(([, tag]) => tag);
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