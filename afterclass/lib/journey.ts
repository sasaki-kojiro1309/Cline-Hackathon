import { z } from "zod/v4";
import { normalizeTag } from "./tags";
import type { ReflectionRecord } from "./schemas";

const dayMs = 86400000;
export const rangeInputSchema = z.object({ range: z.enum(["all", "7", "30", "custom"]).default("all"), start: z.iso.date().optional(), end: z.iso.date().optional() }).strict()
  .refine((v) => v.range !== "custom" || (!!v.start && !!v.end && v.start <= v.end), "Choose a valid start and end date.");
export type RangeInput = z.infer<typeof rangeInputSchema>;
export function readRange(params: URLSearchParams) {
  return rangeInputSchema.parse({ range: params.get("range") ?? "all", ...(params.has("start") ? { start: params.get("start") } : {}), ...(params.has("end") ? { end: params.get("end") } : {}) });
}
export function resolveRange(input: RangeInput, now = new Date()) {
  const end = input.range === "custom" ? input.end! : now.toISOString().slice(0, 10);
  const start = input.range === "custom" ? input.start! : input.range === "all" ? null : new Date(Date.parse(`${end}T00:00:00Z`) - (Number(input.range) - 1) * dayMs).toISOString().slice(0, 10);
  return { range: input.range, start, end, timezone: "UTC" as const };
}
export function sortedReflections(rows: ReflectionRecord[]) {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
export function filterReflections(rows: ReflectionRecord[], range: ReturnType<typeof resolveRange>) {
  return sortedReflections(rows.filter((r) => { const day = r.createdAt.slice(0, 10); return (!range.start || day >= range.start) && day <= range.end; }));
}
export const signalSchema = z.object({ tag: z.string(), count: z.number(), dayCount: z.number(), firstDate: z.string(), lastDate: z.string(), sourceReflectionIds: z.array(z.string()) });
export type Signal = z.infer<typeof signalSchema>;
export const signalKeys = ["interests", "enjoyed", "disliked", "curiosities", "possible_skills"] as const;
export type SignalKey = typeof signalKeys[number];
// All records contribute to counts. Evidence previews are bounded to five IDs.
export function aggregateSignals(rows: ReflectionRecord[], key: SignalKey): Signal[] {
  const entries = new Map<string, { signal: Signal; days: Set<string> }>();
  for (const row of sortedReflections(rows)) {
    const day = row.createdAt.slice(0, 10);
    for (const tag of new Set(row.analysis[key].map(normalizeTag).filter(Boolean))) {
      const entry = entries.get(tag) ?? { signal: { tag, count: 0, dayCount: 0, firstDate: day, lastDate: day, sourceReflectionIds: [] }, days: new Set<string>() };
      entry.signal.count++; entry.signal.firstDate = day;
      if (entry.signal.sourceReflectionIds.length < 5) entry.signal.sourceReflectionIds.push(row.id);
      entry.days.add(day); entries.set(tag, entry);
    }
  }
  return [...entries.values()].map(({ signal, days }) => ({ ...signal, dayCount: days.size }))
    .sort((a, b) => b.dayCount - a.dayCount || b.count - a.count || b.lastDate.localeCompare(a.lastDate) || a.tag.localeCompare(b.tag));
}
export function calendarTrends(rows: ReflectionRecord[], end: string) {
  const endTime = Date.parse(`${end}T00:00:00Z`);
  const recentStart = new Date(endTime - 6 * dayMs).toISOString().slice(0, 10), previousStart = new Date(endTime - 13 * dayMs).toISOString().slice(0, 10);
  const recent = rows.filter((r) => r.createdAt.slice(0, 10) >= recentStart && r.createdAt.slice(0, 10) <= end);
  const previous = rows.filter((r) => r.createdAt.slice(0, 10) >= previousStart && r.createdAt.slice(0, 10) < recentStart);
  const dayCount = (records: ReflectionRecord[]) => new Set(records.map((r) => r.createdAt.slice(0, 10))).size;
  const current = aggregateSignals(recent, "interests"), past = aggregateSignals(previous, "interests");
  // No entries in a period is missing evidence, not declining interest.
  const changes = recent.length && previous.length ? [...new Set([...current, ...past].map((s) => s.tag))].flatMap((tag) => {
    const a = current.find((s) => s.tag === tag), b = past.find((s) => s.tag === tag);
    const recentCount = a?.dayCount ?? 0, previousCount = b?.dayCount ?? 0;
    if (recentCount === previousCount) return [];
    return [{ tag, recentCount, previousCount, direction: !b ? "new" : recentCount > previousCount ? "more-mentioned" : "less-mentioned",
      description: `${tag}: mentioned on ${recentCount} days in ${recentStart}–${end}, compared with ${previousCount} days in the preceding 7-day period. This describes mentions, not ability or a permanent preference.`,
      sourceReflectionIds: [...new Set([...(a?.sourceReflectionIds ?? []), ...(b?.sourceReflectionIds ?? [])])].slice(0, 5) }];
  }).slice(0, 8) : [];
  return { recentStart, previousStart, end, recentActiveDays: dayCount(recent), previousActiveDays: dayCount(previous), changes };
}
export function weekStart(date: string) {
  const time = new Date(`${date}T00:00:00Z`); time.setUTCDate(time.getUTCDate() - (time.getUTCDay() + 6) % 7);
  return time.toISOString().slice(0, 10);
}
export function weeklyOverview(rows: ReflectionRecord[]) {
  const weeks = new Map<string, ReflectionRecord[]>();
  for (const row of rows) { const key = weekStart(row.createdAt.slice(0, 10)); const group = weeks.get(key) ?? []; group.push(row); weeks.set(key, group); }
  return [...weeks.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([start, records]) => ({
    start, end: new Date(Date.parse(`${start}T00:00:00Z`) + 6 * dayMs).toISOString().slice(0, 10),
    reflectionCount: records.length, dayCount: new Set(records.map((r) => r.createdAt.slice(0, 10))).size,
    interests: aggregateSignals(records, "interests").slice(0, 3), curiosities: aggregateSignals(records, "curiosities").slice(0, 2), challenges: aggregateSignals(records, "disliked").slice(0, 2),
    nextSteps: [...new Set(sortedReflections(records).flatMap((r) => r.analysis.future_directions))].slice(0, 2),
  }));
}
export const journeyDataSchema = z.object({
  range: z.object({ range: z.string(), start: z.string().nullable(), end: z.string(), timezone: z.literal("UTC") }),
  activeDays: z.number(), firstDate: z.string().nullable(), lastDate: z.string().nullable(),
  signals: z.object({ interests: z.array(signalSchema), enjoyed: z.array(signalSchema), disliked: z.array(signalSchema), curiosities: z.array(signalSchema), possible_skills: z.array(signalSchema) }),
  trends: z.object({ recentStart: z.string(), previousStart: z.string(), end: z.string(), recentActiveDays: z.number(), previousActiveDays: z.number() }),
  mixedExperiences: z.array(z.object({ tag: z.string(), text: z.string(), sourceReflectionIds: z.array(z.string()) })),
  weeks: z.array(z.object({ start: z.string(), end: z.string(), reflectionCount: z.number(), dayCount: z.number(), interests: z.array(signalSchema), curiosities: z.array(signalSchema), challenges: z.array(signalSchema), nextSteps: z.array(z.string()) })),
  weekCount: z.number(), prompts: z.array(z.string()),
});
export function buildJourney(rows: ReflectionRecord[], range: ReturnType<typeof resolveRange>) {
  const signals = Object.fromEntries(signalKeys.map((key) => [key, aggregateSignals(rows, key).slice(0, 12)])) as Record<SignalKey, Signal[]>;
  const weeks = weeklyOverview(rows);
  const mixedExperiences = signals.interests.flatMap((interest) => {
    const difficulty = signals.disliked.find((s) => s.tag === interest.tag);
    return difficulty ? [{ tag: interest.tag, text: `You mentioned ${interest.tag} both as an interest and as a difficult or disliked experience. What differed between those experiences?`, sourceReflectionIds: [...new Set([...interest.sourceReflectionIds, ...difficulty.sourceReflectionIds])].slice(0, 5) }] : [];
  });
  const prompts = [...signals.interests.slice(0, 2).map((s) => `What part of ${s.tag} did you enjoy or want to explore further?`),
    ...signals.disliked.slice(0, 1).map((s) => `What made ${s.tag} challenging, and what might help you explore it differently?`),
    ...signals.curiosities.slice(0, 1).map((s) => `What is one small thing you could try to explore ${s.tag}?`)];
  if (!prompts.length) prompts.push("Which specific activity stood out, and what made it interesting or difficult?");
  const sorted = sortedReflections(rows);
  return journeyDataSchema.parse({ range, signals, mixedExperiences, prompts, weeks: weeks.slice(0, 12), weekCount: weeks.length,
    trends: calendarTrends(rows, range.end), activeDays: new Set(rows.map((r) => r.createdAt.slice(0, 10))).size,
    firstDate: sorted.at(-1)?.createdAt.slice(0, 10) ?? null, lastDate: sorted[0]?.createdAt.slice(0, 10) ?? null });
}
export const historySchema = z.object({ reflections: z.array(z.object({ id: z.string(), text: z.string(), createdAt: z.string() })), total: z.number(), page: z.number(), pageSize: z.number() });
export function historyPage(rows: ReflectionRecord[], params: URLSearchParams) {
  const query = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), q: z.string().max(200).default(""), id: z.uuid().optional() })
    .parse({ page: params.get("page") ?? undefined, q: params.get("q") ?? undefined, id: params.get("id") ?? undefined });
  const selected = filterReflections(rows, resolveRange(readRange(params))).filter((r) => (!query.id || r.id === query.id) && r.text.toLowerCase().includes(query.q.toLowerCase().trim()));
  return { reflections: selected.slice((query.page - 1) * 20, query.page * 20).map(({ id, text, createdAt }) => ({ id, text, createdAt })), total: selected.length, page: query.page, pageSize: 20 };
}
export const summaryItemSchema = z.object({ text: z.string(), sourceReflectionIds: z.array(z.string()) }).strict();
export const journeySummarySchema = z.object({ overview: summaryItemSchema, patterns: z.array(summaryItemSchema), nextSteps: z.array(summaryItemSchema) }).strict();
export type JourneySummary = z.infer<typeof journeySummarySchema>;
export const summaryStateSchema = z.object({ status: z.enum(["none", "fresh", "stale"]), summary: journeySummarySchema.nullable(), generatedAt: z.string().nullable(), providerLabel: z.string(), reflectionCount: z.number(), evidenceCount: z.number(), cached: z.boolean() });
// Local counts cover all rows. AI receives top aggregates and at most 30 excerpts.
export function summaryEvidence(rows: ReflectionRecord[], range: ReturnType<typeof resolveRange>) {
  const ordered = sortedReflections(rows), chosen = new Map<string, ReflectionRecord>();
  const add = (row: ReflectionRecord | undefined) => { if (row && chosen.size < 30) chosen.set(row.id, row); };
  add(ordered[0]); add(ordered.at(-1));
  for (const key of signalKeys) for (const signal of aggregateSignals(rows, key).slice(0, 4)) {
    const matches = ordered.filter((r) => r.analysis[key].map(normalizeTag).includes(signal.tag)); add(matches[0]); add(matches.at(-1));
  }
  const evidence = [...chosen.values()].map((r) => ({ id: r.id, date: r.createdAt.slice(0, 10), excerpt: r.text.slice(0, 320), interests: r.analysis.interests.slice(0, 6), enjoyed: r.analysis.enjoyed.slice(0, 6), challenges: r.analysis.disliked.slice(0, 6), curiosities: r.analysis.curiosities.slice(0, 6) }));
  const journey = buildJourney(rows, range);
  // Evidence IDs attached to aggregates must refer only to transmitted excerpts.
  const signals = Object.fromEntries(signalKeys.map((key) => [key, journey.signals[key].map((s) => ({ ...s, sourceReflectionIds: s.sourceReflectionIds.filter((id) => chosen.has(id)) }))]));
  return { reflectionCount: rows.length, activeDays: journey.activeDays, range, signals, evidence };
}
export function validateSummary(input: unknown, allowedIds: Set<string>): JourneySummary {
  const summary = journeySummarySchema.parse(input), items = [summary.overview, ...summary.patterns, ...summary.nextSteps];
  if (summary.patterns.length > 6 || summary.nextSteps.length > 3 || items.some((item) => !item.text.trim() || item.text.length > 800 || !item.sourceReflectionIds.length || item.sourceReflectionIds.length > 5 || item.sourceReflectionIds.some((id) => !allowedIds.has(id)))) throw new Error("Invalid summary evidence or bounds");
  return summary;
}