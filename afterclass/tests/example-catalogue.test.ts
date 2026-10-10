import { describe, expect, it } from "vitest";
import { getCatalogue } from "@/lib/catalogue";
import { browseCatalogue } from "@/lib/catalogue-browser";
import { buildRecommendations } from "@/lib/recommendations";
import { normalizeTag } from "@/lib/tags";
import { canonicalTags } from "@/lib/analysis";
import { feedback, reflection } from "./fixtures";

describe("broad static example catalogue", () => {
  it("covers every canonical subject with a valid local example", () => {
    const catalogue = getCatalogue();
    for (const subject of canonicalTags) expect(catalogue.some((o) => o.relevant_interests.includes(subject)), subject).toBe(true);
    expect(catalogue.every((o) => o.is_example && o.url === null && !o.verified_at)).toBe(true);
  });
  it.each(["geography", "history", "chemistry", "biology", "physics", "mathematics", "economics", "music", "languages", "psychology", "sports", "architecture", "finance", "photography", "dance"])("matches %s without unrelated filler", (tag) => {
    const result = buildRecommendations([reflection([tag])], [], getCatalogue(), true);
    expect(result.recommendations.length).toBeGreaterThanOrEqual(2);
    expect(result.recommendations.every((o) => o.isExample && o.whyMatch.includes(tag))).toBe(true);
  });
  it("handles common subject aliases", () => {
    expect(normalizeTag("Maths")).toBe("mathematics");
    const result = buildRecommendations([reflection(["earth science"])], [], getCatalogue(), true);
    expect(result.recommendations.every((o) => o.whyMatch.includes("geology"))).toBe(true);
  });
  it("supports subject filters, text search and bounded pagination", () => {
    const result = browseCatalogue(new URLSearchParams("subject=geography"), []);
    expect(result.total).toBe(2); expect(result.catalogueTotal).toBe(100);
    expect(result.activities.map((a) => a.title)).toContain("Map Your Neighbourhood");
    expect(browseCatalogue(new URLSearchParams("q=river"), []).activities.some((a) => a.title === "Compare Two River Landscapes")).toBe(true);
    expect(browseCatalogue(new URLSearchParams("page=2"), []).activities).toHaveLength(12);
    expect(browseCatalogue(new URLSearchParams("q=nonexistent-activity"), []).activities).toEqual([]);
    expect(() => browseCatalogue(new URLSearchParams("page=0"), [])).toThrow();
    expect(() => browseCatalogue(new URLSearchParams("subject=invented"), [])).toThrow();
  });
  it("keeps browse feedback and marks browsing honestly rather than claiming a personal match", () => {
    const id = "example-geography-project";
    const result = browseCatalogue(new URLSearchParams("subject=geography"), [feedback(id, "saved")]);
    expect(result.activities.find((a) => a.id === id)?.status).toBe("saved");
    expect(result.activities[0].whyMatch).toContain("not a personal recommendation");
  });
  it("uses natural activity copy without changing static-data labels", () => {
    for (const activity of getCatalogue()) {
      expect(activity.description).not.toMatch(/an example|example activity|example estimate/i);
      expect(activity.estimated_effort_label).not.toContain("example");
      expect(activity.is_example).toBe(true);
    }
    const result = buildRecommendations([reflection(["geography"])], [feedback("example-geography-project", "saved")], getCatalogue(), true);
    expect(result.saved[0].whyMatch).toBe("You saved this idea to explore later.");
    expect(result.recommendations[0].whyMatch).toContain("This activity offers a way to explore it");
  });
});