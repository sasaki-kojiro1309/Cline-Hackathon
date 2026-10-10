import { describe, expect, it } from "vitest";
import { getCatalogue, getOpportunityById } from "@/lib/catalogue";
import { buildDiscoveries } from "@/lib/discoveries";
import { buildRecommendations, rankOpportunities } from "@/lib/recommendations";
import { explicitTimeBudget, sanitizeAnalysis } from "@/lib/analysis";
import { feedbackInputSchema, opportunitySchema, reflectionInputSchema } from "@/lib/schemas";
import { signSession, verifySession } from "@/lib/session-signing";
import { emptyAnalysis, feedback, reflection } from "./fixtures";

describe("catalogue", () => {
  it("contains exactly 24 valid, unique examples without invented URLs", () => {
    const items = getCatalogue();
    expect(items).toHaveLength(24); expect(new Set(items.map((o) => o.id)).size).toBe(24);
    items.forEach((o) => { expect(opportunitySchema.safeParse(o).success).toBe(true); expect(o.is_example).toBe(true); expect(o.url).toBeNull(); });
  });
  it("does not find invented IDs", () => expect(getOpportunityById("not-real")).toBeUndefined());
});
describe("validation and grounded sanitation", () => {
  it.each(["", "   ", "short", "x".repeat(1501), 42, null])("rejects invalid reflection %s", (text) => expect(reflectionInputSchema.safeParse({ text }).success).toBe(false));
  it("rejects client-supplied session IDs and invalid feedback statuses", () => {
    expect(reflectionInputSchema.safeParse({ text: reflection().text, sessionId: "other" }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ opportunityId: "opp-01", status: "unknown" }).success).toBe(false);
  });
  it("deduplicates, trims and bounds signals without padding skills", () => {
    const result = sanitizeAnalysis({ ...emptyAnalysis, interests: [" Writing ", "writing", "", ...Array.from({ length: 8 }, (_, i) => `tag ${i}`)], short_insight: "word ".repeat(150), future_directions: ["direction ".repeat(100)] }, reflection().text);
    expect(result.interests[0]).toBe("writing"); expect(result.interests).toHaveLength(6); expect(result.possible_skills).toEqual([]);
    expect(result.short_insight.length).toBeLessThanOrEqual(400); expect(result.future_directions[0].length).toBeLessThanOrEqual(120);
  });
  it("does not accept invalid AI structure", () => expect(() => sanitizeAnalysis({ interests: 2 }, "test")).toThrow());
  it("ignores an invented budget and class durations", () => {
    expect(sanitizeAnalysis({ ...emptyAnalysis, time_budget_hours: 10 }, "Our class lasted 2 hours.").time_budget_hours).toBeNull();
    expect(explicitTimeBudget("I have 30 minutes available to explore.")).toBe(.5);
    expect(explicitTimeBudget("I can spend 2 hours on a project.")).toBe(2);
    expect(explicitTimeBudget("I have 2 hours for a project.")).toBe(2);
  });
  it("accepts signed sessions but rejects tampering, extra segments and corrupt UUIDs", () => {
    const secret = "s".repeat(32), id = reflection().sessionId;
    const signed = signSession(id, secret);
    expect(verifySession(signed, secret)).toBe(id);
    expect(verifySession(signed, "wrong")).toBeNull(); expect(verifySession(`${signed}.extra`, secret)).toBeNull();
    expect(verifySession(signSession("invalid", secret), secret)).toBeNull(); expect(verifySession(undefined, secret)).toBeNull();
  });
});
describe("discoveries", () => {
  it("returns a genuine empty state", () => expect(buildDiscoveries([]).hasReflections).toBe(false));
  it("labels a single reflection early and counts a tag only once", () => {
    const result = buildDiscoveries([reflection(["digital systems", " DIGITAL SYSTEMS "])]);
    expect(result.interests[0].count).toBe(1); expect(result.observations[0].kind).toBe("early");
  });
  it("recurring patterns reference actual evidence IDs", () => {
    const second = reflection(["digital systems"], { id: "550e8400-e29b-41d4-a716-446655440002", createdAt: "2026-10-11T08:00:00.000Z" });
    const result = buildDiscoveries([reflection(["digital systems"]), second]);
    expect(result.interests[0].count).toBe(2); expect(result.observations[0].kind).toBe("recurring");
    expect(result.observations[0].sourceReflectionIds).toEqual([second.id, reflection().id]);
  });
  it("does not invent recurrence between unrelated reflections; latest insight wins", () => {
    const second = reflection(["writing"], { id: "550e8400-e29b-41d4-a716-446655440002", createdAt: "2026-10-11T08:00:00.000Z", analysis: { ...emptyAnalysis, interests: ["writing"], short_insight: "You may enjoy writing." } });
    const result = buildDiscoveries([reflection(["digital systems"]), second]);
    expect(result.observations.every((o) => o.kind === "early")).toBe(true); expect(result.interests[0].tag).toBe("writing");
    expect(result.shortInsight).toBe(second.analysis.short_insight); expect(result.evidence[0].text).toBe(second.text);
  });
  it("caps tags without inventing extras and orders ties alphabetically", () => {
    expect(buildDiscoveries([reflection(["writing", "design"])]).interests.map((i) => i.tag)).toEqual(["design", "writing"]);
    expect(buildDiscoveries([reflection(["writing"])]).interests).toHaveLength(1);
  });
});
describe("recommendations", () => {
  const catalogue = getCatalogue();
  it("ranks logic-related examples for logic reflections, returning exactly three", () => {
    const result = buildRecommendations([reflection(["digital systems", "computer architecture"])], [], catalogue);
    expect(result.recommendations.map((r) => r.id)).toEqual(["opp-17", "opp-09", "opp-01"]);
    result.recommendations.forEach((r) => expect(r.whyMatch).toContain(r.nextAction));
  });
  it("ranks writing above hardware", () => expect(rankOpportunities([reflection(["writing"])], [], catalogue)[0].opportunity.id).toBe("opp-23"));
  it("is deterministic", () => expect(rankOpportunities([reflection(["programming"])], [], catalogue)).toEqual(rankOpportunities([reflection(["programming"])], [], catalogue)));
  it("excludes all feedback statuses and retains only saved cards", () => {
    const result = buildRecommendations([reflection(["digital systems"])], [feedback("opp-01", "not_interested"), feedback("opp-09", "saved"), feedback("opp-17", "completed")], catalogue);
    expect(result.recommendations.every((r) => !["opp-01", "opp-09", "opp-17"].includes(r.id))).toBe(true);
    expect(result.saved.map((r) => r.id)).toEqual(["opp-09"]);
  });
  it("saved and dismissed affinity change other related entries", () => {
    const score = (status?: "saved" | "not_interested") => rankOpportunities([reflection(["programming"])], status ? [feedback("opp-02", status)] : [], catalogue).find((r) => r.opportunity.id === "opp-18")!.score;
    expect(score("saved")).toBe(score() + 2); expect(score("not_interested")).toBe(score() - 2);
  });
  it("time is neutral when absent, and penalizes effort above explicit budgets", () => {
    const noBudget = rankOpportunities([reflection(["digital systems"])], [], catalogue);
    const withBudget = rankOpportunities([reflection([], { analysis: { ...emptyAnalysis, interests: ["digital systems"], time_budget_hours: 2 } })], [], catalogue);
    expect(withBudget.find((r) => r.opportunity.id === "opp-17")!.score).toBe(noBudget.find((r) => r.opportunity.id === "opp-17")!.score + 2);
    expect(withBudget.find((r) => r.opportunity.id === "opp-09")!.score).toBe(noBudget.find((r) => r.opportunity.id === "opp-09")!.score - 3);
  });
  it("never treats unproven skills as fulfilled prerequisites", () => {
    const opportunity = { ...catalogue[0], required_skills: ["soldering"] };
    expect(rankOpportunities([reflection([])], [], [opportunity])[0].score).toBe(0);
    expect(rankOpportunities([reflection([], { analysis: { ...emptyAnalysis, possible_skills: ["soldering"] } })], [], [opportunity])[0].score).toBe(1);
  });
  it("uses honest exploration fallback without pretending relevance", () => {
    const result = buildRecommendations([reflection(["ancient history"])], [], catalogue);
    expect(result.recommendations).toHaveLength(3); result.recommendations.forEach((r) => expect(r.whyMatch).toContain("not yet shown a strong match"));
  });
  it("returns empty suggestions before reflection or after catalogue exhaustion", () => {
    expect(buildRecommendations([], [], catalogue).recommendations).toEqual([]);
    expect(buildRecommendations([reflection()], catalogue.map((o) => feedback(o.id, "not_interested")), catalogue).recommendations).toEqual([]);
  });
});