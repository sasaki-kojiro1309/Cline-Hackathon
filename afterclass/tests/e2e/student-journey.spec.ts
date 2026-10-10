import { test, expect, type Page } from "@playwright/test";
import { buildDiscoveries } from "../../lib/discoveries";
import { buildRecommendations } from "../../lib/recommendations";
import { getCatalogue } from "../../lib/catalogue";
import { feedbackInputSchema, type FeedbackRecord, type ReflectionRecord } from "../../lib/schemas";
import { feedback, reflection } from "../fixtures";

async function mockApi(page: Page, options: { failReflection?: boolean; failFeedback?: boolean } = {}) {
  const reflections: ReflectionRecord[] = [];
  const feedbackRows: FeedbackRecord[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === "/api/session") return json({ ready: true });
    if (path === "/api/reflections") {
      if (options.failReflection) return json({ error: { code: "AI_UNAVAILABLE", message: "Insights are temporarily unavailable. Please retry." } }, 503);
      const input: { text: string } = route.request().postDataJSON();
      const record = reflection(["digital systems", "computer architecture"], { text: input.text });
      record.analysis.future_directions = ["Explore a beginner logic circuit project"];
      reflections.push(record);
      return json({ reflection: { id: record.id, text: record.text, createdAt: record.createdAt }, analysis: record.analysis }, 201);
    }
    if (path === "/api/discoveries") return json(buildDiscoveries(reflections));
    if (path === "/api/recommendations") return json(buildRecommendations(reflections, feedbackRows, getCatalogue()));
    if (path === "/api/feedback") {
      if (options.failFeedback) return json({ error: { code: "STORAGE_ERROR", message: "Unable to save feedback." } }, 500);
      const input = feedbackInputSchema.parse(route.request().postDataJSON());
      const index = feedbackRows.findIndex((f) => f.opportunityId === input.opportunityId);
      const row = feedback(input.opportunityId, input.status);
      if (index < 0) feedbackRows.push(row); else feedbackRows[index] = row;
      return json(input);
    }
    return route.abort();
  });
}
test("mocked API: reflection, evidence, three cards, dismiss/save/complete, reload", async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await mockApi(page); await page.goto("/");
  await expect(page.getByRole("navigation").getByRole("link")).toHaveCount(3);
  await page.getByLabel("Your reflection").fill(reflection().text);
  await page.getByRole("button", { name: "Find my insights" }).click();
  await expect(page).toHaveURL(/\/discoveries$/);
  await expect(page.getByText("digital systems", { exact: true })).toBeVisible();
  await expect(page.getByText("Early observations", { exact: false })).toBeVisible();
  await page.getByText("Why am I seeing this?", { exact: true }).first().click();
  await expect(page.getByText(reflection().text, { exact: true }).first()).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Your Next Steps" }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByText("Example opportunity", { exact: true })).toHaveCount(3);
  await page.getByRole("article", { name: "Logic Circuit Mini Challenge", exact: true }).getByRole("button", { name: "Not interested" }).click();
  await expect(page.getByRole("article", { name: "Logic Circuit Mini Challenge", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("article", { name: "Logic Circuit Mini Challenge", exact: true })).toHaveCount(0);
  await page.getByRole("article", { name: "Tiny Processor Model", exact: true }).getByRole("button", { name: "Save", exact: true }).click();
  const saved = page.getByRole("region", { name: "Saved", exact: true });
  await expect(saved.getByRole("article", { name: "Tiny Processor Model", exact: true })).toBeVisible();
  await page.reload();
  await saved.getByRole("button", { name: "Mark completed" }).click();
  await expect(saved.getByRole("article")).toHaveCount(0);
  await expect(page.getByRole("article")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("next-steps.png"), fullPage: true });
  expect(errors).toEqual([]);
});
test("mocked API: submission failure preserves the draft and allows retry", async ({ page }) => {
  await mockApi(page, { failReflection: true }); await page.goto("/");
  await page.getByLabel("Your reflection").fill(reflection().text);
  await page.getByRole("button", { name: "Find my insights" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByLabel("Your reflection")).toHaveValue(reflection().text);
  await expect(page.getByRole("button", { name: "Find my insights" })).toBeEnabled();
});
test("mocked API: empty states and keyboard navigation work", async ({ page }) => {
  await mockApi(page); await page.goto("/");
  await page.keyboard.press("Tab"); await expect(page.getByText("Skip to content", { exact: true })).toBeFocused();
  await page.getByRole("navigation").getByRole("link", { name: "My Discoveries" }).click();
  await expect(page.getByRole("link", { name: "Write a reflection" })).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Your Next Steps" }).click();
  await expect(page.getByRole("link", { name: "Write a reflection" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test("mocked API: failed feedback leaves the card unsaved", async ({ page }) => {
  await mockApi(page, { failFeedback: true }); await page.goto("/");
  await page.getByLabel("Your reflection").fill(reflection().text);
  await page.getByRole("button", { name: "Find my insights" }).click(); await expect(page).toHaveURL(/\/discoveries$/);
  await page.getByRole("navigation").getByRole("link", { name: "Your Next Steps" }).click();
  await page.getByRole("article", { name: "Tiny Processor Model", exact: true }).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Unable to save feedback");
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Saved", exact: true }).getByRole("article")).toHaveCount(0);
});
test("real local API: new session is empty and missing AI key is an honest error", async ({ page }) => {
  await page.goto("/"); await page.getByLabel("Your reflection").fill(reflection().text);
  await page.getByRole("button", { name: "Find my insights" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("AI is not configured");
  await expect(page.getByLabel("Your reflection")).toHaveValue(reflection().text);
  await page.getByRole("navigation").getByRole("link", { name: "My Discoveries" }).click();
  await expect(page.getByRole("link", { name: "Write a reflection" })).toBeVisible();
});