import { test, expect } from "@playwright/test";
import { buildDiscoveries } from "../../lib/discoveries";
import { historyPage, readRange } from "../../lib/journey";
import { emptyAnalysis, reflection } from "../fixtures";

test("mocked API: all-days profile, filters, history search, and explicit journey consent", async ({ page }) => {
  const now = new Date();
  const rows = Array.from({ length: 25 }, (_, i) => reflection(["programming"], {
    id: `550e8400-e29b-41d4-a716-${String(i + 1).padStart(12, "0")}`,
    createdAt: new Date(now.getTime() - i * 86400000).toISOString(),
    text: i === 24 ? "I liked geography and mapping rivers in class." : "I enjoyed programming but debugging felt difficult today.",
    analysis: { ...emptyAnalysis, interests: ["programming"], enjoyed: ["programming"], disliked: ["programming"], curiosities: ["robotics"] },
  }));
  let summaryCalls = 0;
  let generated = false;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (data: unknown, status = 200) => route.fulfill({ json: data, status });
    if (url.pathname === "/api/account") return json({ authenticated: true, loginId: "journey_student", storage: "local", profile: { displayName: "", consentAt: null }, retentionDays: 0 });
    if (url.pathname === "/api/session") return json({ ready: true });
    if (url.pathname === "/api/discoveries") return json(buildDiscoveries(rows, readRange(url.searchParams), now));
    if (url.pathname === "/api/reflections") return json(historyPage(rows, url.searchParams));
    if (url.pathname === "/api/journey") {
      if (route.request().method() === "GET") return json({ status: generated ? "fresh" : "none", summary: generated ? { overview: { text: "You may enjoy programming while finding debugging challenging.", sourceReflectionIds: [rows[0].id] }, patterns: [], nextSteps: [] } : null, generatedAt: generated ? now.toISOString() : null, providerLabel: "Google Gemini", reflectionCount: 25, evidenceCount: generated ? 2 : 0, cached: generated });
      summaryCalls++;
      generated = true;
      expect(route.request().postDataJSON().consent).toBe(true);
      return json({ status: "fresh", summary: { overview: { text: "You may enjoy programming while finding debugging challenging.", sourceReflectionIds: [rows[0].id] }, patterns: [], nextSteps: [] }, generatedAt: now.toISOString(), providerLabel: "Google Gemini", reflectionCount: 25, evidenceCount: 2, cached: false });
    }
    return route.abort();
  });
  await page.goto("/discoveries");
  await expect(page.getByText("Based on 25 reflections", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Patterns" }).click();
  await expect(page.getByRole("heading", { name: "Mixed experiences" })).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByText("Combined journey summary", { exact: true }).click();
  const summary = page.getByRole("region", { name: "Combined AI summary" });
  await expect(summary.getByRole("button", { name: "Analyze my journey" })).toBeDisabled();
  expect(summaryCalls).toBe(0);
  await summary.getByRole("checkbox").check(); await summary.getByRole("button", { name: "Analyze my journey" }).click();
  await expect(summary.getByText("You may enjoy programming while finding debugging challenging.")).toBeVisible();
  await summary.getByText("Supporting reflections", { exact: true }).click();
  await expect(summary.getByText(rows[0].text, { exact: true })).toBeVisible();
  expect(summaryCalls).toBe(1);
  await page.getByRole("tab", { name: "History" }).click();
  const history = page.getByRole("region", { name: "Reflection history" });
  await history.getByRole("button", { name: "Next page" }).click();
  await expect(history.getByText("Page 2 of 2", { exact: false })).toBeVisible();
  await page.getByLabel("Search reflection text").fill("geography"); await history.getByRole("button", { name: "Search history" }).click();
  await expect(history.getByText("1 matching reflection", { exact: false })).toBeVisible();
  await page.getByLabel("Date range", { exact: true }).selectOption("7"); await page.getByRole("button", { name: "Apply date range" }).click();
  await expect(page.getByText("Based on 7 reflections", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByText("Combined journey summary", { exact: true }).click();
  await expect(summary.getByRole("checkbox")).not.toBeChecked();
  await page.getByLabel("Date range", { exact: true }).selectOption("custom");
  await page.getByLabel("Start date", { exact: true }).fill("2020-01-01"); await page.getByLabel("End date", { exact: true }).fill("2020-01-02");
  await page.getByRole("button", { name: "Apply date range" }).click();
  await expect(page.getByRole("heading", { name: "No reflections in this date range" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("mocked API: journey AI failure leaves local discoveries visible", async ({ page }) => {
  const rows = [reflection(["writing"], { createdAt: new Date().toISOString() }), reflection(["writing"], { id: "550e8400-e29b-41d4-a716-446655440002", createdAt: new Date(Date.now() - 86400000).toISOString() })];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (data: unknown, status = 200) => route.fulfill({ json: data, status });
    if (url.pathname === "/api/account") return json({ authenticated: true, loginId: "journey_student", storage: "local", profile: { displayName: "", consentAt: null }, retentionDays: 0 });
    if (url.pathname === "/api/session") return json({ ready: true });
    if (url.pathname === "/api/discoveries") return json(buildDiscoveries(rows));
    if (url.pathname === "/api/reflections") return json(historyPage(rows, url.searchParams));
    if (url.pathname === "/api/journey") return route.request().method() === "GET" ? json({ status: "none", summary: null, generatedAt: null, providerLabel: "OpenAI", reflectionCount: 2, evidenceCount: 0, cached: false }) : json({ error: { message: "No API credits. Local discoveries are unchanged." } }, 503);
    return route.abort();
  });
  await page.goto("/discoveries");
  await page.getByText("Combined journey summary", { exact: true }).click();
  const summary = page.getByRole("region", { name: "Combined AI summary" });
  await summary.getByRole("checkbox").check(); await summary.getByRole("button", { name: "Analyze my journey" }).click();
  await expect(summary.getByRole("alert")).toContainText("No API credits");
  await expect(page.getByRole("heading", { name: "Possible interests", exact: true })).toBeVisible();
  await expect(page.getByText("Based on 2 reflections", { exact: false })).toBeVisible();
  await expect(summary.getByRole("button", { name: "Analyze my journey" })).toBeEnabled();
});