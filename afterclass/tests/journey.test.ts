import { describe, expect, it } from "vitest";
import { buildDiscoveries } from "@/lib/discoveries";
import { aggregateSignals, calendarTrends, filterReflections, historyPage, readRange, resolveRange, summaryEvidence, validateSummary, weekStart } from "@/lib/journey";
import { rankOpportunities } from "@/lib/recommendations";
import { getCatalogue } from "@/lib/catalogue";
import { emptyAnalysis, reflection } from "./fixtures";

const now = new Date("2026-10-14T08:00:00Z");
const row = (day: string, index: number, tags = ["programming"]) => reflection(tags, { id: `550e8400-e29b-41d4-a716-${String(index).padStart(12, "0")}`, createdAt: `${day}T08:00:00.000Z` });
describe("all-history journey aggregation", () => {
  it("includes history beyond both old 50 and 200 row limits", () => {
    const rows = Array.from({ length: 251 }, (_, i) => row("2026-10-10", i));
    rows.push(row("2025-01-01", 252, ["geography"]));
    const result = buildDiscoveries(rows, { range: "all" }, now);
    expect(result.reflectionCount).toBe(252); expect(result.historyCount).toBe(252);
    expect(result.interests.find((s) => s.tag === "geography")?.count).toBe(1);
    expect(result.journey?.activeDays).toBe(2);
    expect(result.interests.find((s) => s.tag === "programming")?.sourceReflectionIds).toHaveLength(5);
  });
  it("counts duplicate tags once and same-day submissions as one distinct day", () => {
    const rows = [row("2026-10-10", 1, ["coding", "programming"]), row("2026-10-10", 2)];
    expect(aggregateSignals(rows, "interests")[0]).toMatchObject({ count: 2, dayCount: 1 });
    expect(buildDiscoveries(rows, { range: "all" }, now).observations[0].kind).toBe("early");
    expect(buildDiscoveries([...rows, row("2026-10-11", 3)], { range: "all" }, now).observations[0].kind).toBe("recurring");
  });
  it("filters inclusive UTC calendar dates at day boundaries", () => {
    const rows = [row("2026-10-07", 1), row("2026-10-08", 2), { ...row("2026-10-14", 3), createdAt: "2026-10-14T23:59:59.999Z" }, row("2026-10-15", 4)];
    const range = resolveRange({ range: "7" }, now);
    expect(range.start).toBe("2026-10-08"); expect(filterReflections(rows, range).map((r) => r.id)).toEqual([rows[2].id, rows[1].id]);
    expect(resolveRange({ range: "30" }, now).start).toBe("2026-09-15");
  });
  it.each(["range=unknown", "range=custom", "range=custom&start=2026-10-15&end=2026-10-01", "range=custom&start=2026-02-30&end=2026-03-01"])("rejects invalid range %s", (query) => {
    expect(() => readRange(new URLSearchParams(query))).toThrow();
  });
  it("preserves enjoyed and difficult experiences without removing interest", () => {
    const rows = [row("2026-10-10", 1), { ...row("2026-10-11", 2), analysis: { ...emptyAnalysis, interests: ["programming"], enjoyed: ["programming"], disliked: ["coding"], curiosities: ["debugging"], possible_skills: ["problem solving"] } }];
    const result = buildDiscoveries(rows, { range: "all" }, now);
    expect(result.journey?.mixedExperiences[0].tag).toBe("programming");
    expect(result.journey?.signals.possible_skills[0].tag).toBe("problem solving");
    expect(result.journey?.prompts.join(" ")).toContain("challenging");
  });
  it("compares 7-day windows, including less-mentioned themes and missing-data safeguards", () => {
    const rows = [row("2026-10-14", 1, ["writing"]), row("2026-10-13", 2, ["writing"]), row("2026-10-07", 3, ["programming"]), row("2026-10-06", 4, ["programming"])];
    const trends = calendarTrends(rows, "2026-10-14");
    expect(trends.changes.find((s) => s.tag === "writing")).toMatchObject({ direction: "new", recentCount: 2, previousCount: 0 });
    expect(trends.changes.find((s) => s.tag === "programming")).toMatchObject({ direction: "less-mentioned", recentCount: 0, previousCount: 2 });
    expect(calendarTrends(rows.slice(0, 2), "2026-10-14").changes).toEqual([]);
  });
  it("groups Monday–Sunday weeks across year boundaries", () => {
    expect(weekStart("2026-01-01")).toBe("2025-12-29");
    const result = buildDiscoveries([row("2025-12-31", 1), row("2026-01-04", 2), row("2026-01-05", 3)], { range: "all" }, now);
    expect(result.journey?.weeks).toHaveLength(2); expect(result.journey?.weeks[1].reflectionCount).toBe(2);
  });
  it("searches and paginates complete history without leaking analysis or owner IDs", () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ ...row("2026-10-10", i), text: i % 2 ? "I enjoyed geography class today." : "I enjoyed programming class today." }));
    const result = historyPage(rows, new URLSearchParams("q=geography&page=2"));
    expect(result.total).toBe(22); expect(result.reflections).toHaveLength(2);
    expect(JSON.stringify(result)).not.toMatch(/sessionId|analysis/);
    expect(historyPage(rows, new URLSearchParams(`id=${rows[0].id}`)).reflections).toHaveLength(1);
    expect(() => historyPage(rows, new URLSearchParams("page=0"))).toThrow();
  });
  it("bounds AI representative evidence while counting all rows and rejecting fake citations", () => {
    const rows = Array.from({ length: 300 }, (_, i) => row(i % 2 ? "2026-10-10" : "2026-10-11", i));
    const payload = summaryEvidence(rows, resolveRange({ range: "all" }, now));
    expect(payload.reflectionCount).toBe(300); expect(payload.evidence.length).toBeLessThanOrEqual(30);
    expect(payload.evidence.every((e) => e.excerpt.length <= 320)).toBe(true);
    const ids = new Set(payload.evidence.map((e) => e.id));
    const summary = { overview: { text: "You may enjoy programming.", sourceReflectionIds: [payload.evidence[0].id] }, patterns: [], nextSteps: [] };
    expect(validateSummary(summary, ids)).toEqual(summary);
    expect(() => validateSummary({ ...summary, overview: { ...summary.overview, sourceReflectionIds: ["invented"] } }, ids)).toThrow();
    expect(() => validateSummary({ ...summary, overview: { ...summary.overview, sourceReflectionIds: [] } }, ids)).toThrow();
  });
  it("recommendations use older retained interests and do not inflate recurrence on one day", () => {
    const catalogue = getCatalogue(), older = row("2025-01-01", 1, ["writing"]), recent = row("2026-10-10", 2, []);
    expect(rankOpportunities([older, recent], [], catalogue)[0].opportunity.id).toBe("opp-23");
    const one = rankOpportunities([row("2026-10-10", 3)], [], catalogue);
    const multiple = rankOpportunities([row("2026-10-10", 3), row("2026-10-10", 4)], [], catalogue);
    expect(one.map((s) => s.score)).toEqual(multiple.map((s) => s.score));
  });
});