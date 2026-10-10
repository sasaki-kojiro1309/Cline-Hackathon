import "server-only";
import { createHash } from "node:crypto";
import type { JourneySummary, RangeInput } from "./journey";
import type { ReflectionRecord } from "./schemas";

type Entry = { fingerprint: string; summary: JourneySummary; generatedAt: string; sourceIds: string[]; evidenceCount: number; providerLabel: string; expiresAt: number };
const shared = globalThis as typeof globalThis & { afterclassJourneyCache?: Map<string, Entry> };
const cache = shared.afterclassJourneyCache ??= new Map<string, Entry>();
const keyFor = (ownerId: string, range: RangeInput) => `${ownerId}:${JSON.stringify(range)}`;
export function journeyFingerprint(rows: ReflectionRecord[], resolvedRange: unknown) {
  // Contains hashes, not API keys. Configuration changes invalidate the summary.
  const config = [process.env.AI_PROVIDER || "openai", process.env.AI_MODEL || process.env.OPENAI_MODEL || "", process.env.AI_BASE_URL || "", process.env.AI_OUTPUT_MODE || "json_schema",
    createHash("sha256").update(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "").digest("hex")];
  return createHash("sha256").update(JSON.stringify({ version: 1, config, range: resolvedRange, rows: rows.map(({ id, text, createdAt, analysis }) => ({ id, text, createdAt, analysis })) })).digest("hex");
}
export function readJourneyCache(ownerId: string, range: RangeInput, retained: ReflectionRecord[]) {
  const key = keyFor(ownerId, range), entry = cache.get(key);
  if (!entry) return null;
  const ids = new Set(retained.map((r) => r.id));
  // Do not expose stale derived data if ANY original source has been removed.
  if (entry.expiresAt <= Date.now() || entry.sourceIds.some((id) => !ids.has(id))) { cache.delete(key); return null; }
  return entry;
}
export function saveJourneyCache(ownerId: string, range: RangeInput, entry: Omit<Entry, "expiresAt">) {
  const key = keyFor(ownerId, range); cache.delete(key);
  for (const [id, value] of cache) if (value.expiresAt <= Date.now()) cache.delete(id);
  while (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, { ...entry, expiresAt: Date.now() + 3600000 });
}
export function clearJourneyCache(ownerId: string) {
  for (const key of cache.keys()) if (key.startsWith(`${ownerId}:`)) cache.delete(key);
}