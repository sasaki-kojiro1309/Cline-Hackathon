import { test, expect } from "@playwright/test";
import { getCatalogue } from "../../lib/catalogue";
import { browseCatalogue } from "../../lib/catalogue-browser";
import { buildRecommendations } from "../../lib/recommendations";
import { feedback, reflection } from "../fixtures";
import type { FeedbackRecord } from "../../lib/schemas";

test("mocked API: broad examples, browse filters, save, reload, and no live search", async ({ page }, testInfo) => {
  const rows = [reflection(["geography"], { createdAt: new Date().toISOString() })], votes: FeedbackRecord[] = [];
  const unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()); const json = (data: unknown) => route.fulfill({ json: data });
    if (url.pathname === "/api/account") return json({ authenticated: true, loginId: "examples_student", storage: "local", profile: { displayName: "", consentAt: null }, retentionDays: 0 });
    if (url.pathname === "/api/session") return json({ ready: true });
    if (url.pathname === "/api/recommendations") return json(buildRecommendations(rows, votes, getCatalogue(), true));
    if (url.pathname === "/api/catalogue") return json(browseCatalogue(url.searchParams, votes));
    if (url.pathname === "/api/feedback") { const input = route.request().postDataJSON(); const row = feedback(input.opportunityId, input.status); const i = votes.findIndex((v) => v.opportunityId === row.opportunityId); if (i < 0) votes.push(row); else votes[i] = row; return json(input); }
    unexpected.push(url.pathname); return route.abort();
  });
  await page.goto("/next-steps");
  await expect(page.getByRole("article", { name: "Map Your Neighbourhood" })).toBeVisible();
  await expect(page.getByText("Exploration idea", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Example activity", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Approximate time: About 1 hour", { exact: true })).toBeVisible();
  await expect(page.getByText("not confirmed event or course listings", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search the web" })).toHaveCount(0);
  await page.getByRole("button", { name: "Browse ideas", exact: true }).click();
  await expect(page.getByText("100 exploration ideas", { exact: false })).toBeVisible();
  await page.getByLabel("Subject or area").selectOption("geography");
  const catalogue = page.getByRole("region", { name: "Exploration catalogue" });
  await expect(catalogue.getByRole("article")).toHaveCount(2);
  await catalogue.getByRole("article", { name: "Map Your Neighbourhood" }).getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "For you", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saved", exact: true }).getByRole("article", { name: "Map Your Neighbourhood" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Saved", exact: true }).getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Browse ideas", exact: true }).click();
  await page.getByLabel("Subject or area").selectOption("chemistry");
  await expect(catalogue.getByRole("article", { name: "Molecule Model Sketchbook" })).toBeVisible();
  await page.getByLabel("Subject or area").selectOption("");
  await page.getByLabel("Search activities").fill("nutrition"); await page.getByRole("button", { name: "Find ideas", exact: true }).click();
  await expect(catalogue.getByRole("article")).toHaveCount(2);
  await catalogue.getByRole("article").first().getByText("Why try this?", { exact: true }).click();
  await expect(catalogue.getByRole("article").first().getByText("not a personal recommendation", { exact: false })).toBeVisible();
  expect(unexpected).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("example-catalogue.png"), fullPage: true });
});