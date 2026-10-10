import { test, expect, type Page } from "@playwright/test";
import { buildDiscoveries } from "../../lib/discoveries";
import { buildRecommendations } from "../../lib/recommendations";
import { getCatalogue } from "../../lib/catalogue";
import { feedbackInputSchema, type FeedbackRecord, type ReflectionRecord } from "../../lib/schemas";
import { feedback, reflection } from "../fixtures";
import { historyPage, readRange } from "../../lib/journey";
import { browseCatalogue } from "../../lib/catalogue-browser";

async function mockApi(page: Page, fail = false) {
  const records: ReflectionRecord[] = [], rows: FeedbackRecord[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()), path = url.pathname;
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value });
    if (path === "/api/account") return json({ authenticated: true, loginId: "test_student", storage: "local", profile: { displayName: "", consentAt: null }, retentionDays: 0 });
    if (path === "/api/session") return json({ ready: true });
    if (path === "/api/reflections") {
      if (route.request().method() === "GET") return json(historyPage(records, url.searchParams));
      if (fail) return json({ error: { message: "Insights are temporarily unavailable." } }, 503);
      const input: { text: string } = route.request().postDataJSON();
      const record = reflection(["digital systems", "computer architecture"], { id: crypto.randomUUID(), text: input.text, createdAt: new Date().toISOString() }); records.push(record);
      return json({ reflection: { id: record.id, text: record.text, createdAt: record.createdAt }, analysis: record.analysis }, 201);
    }
    if (path === "/api/discoveries") return json(buildDiscoveries(records, readRange(url.searchParams)));
    if (path === "/api/journey") return json({ status: "none", summary: null, generatedAt: null, providerLabel: "OpenAI", reflectionCount: records.length, evidenceCount: 0, cached: false });
    if (path === "/api/recommendations") return json(buildRecommendations(records, rows, getCatalogue(), true));
    if (path === "/api/catalogue") return json(browseCatalogue(url.searchParams, rows));
    if (path === "/api/feedback") {
      const input = feedbackInputSchema.parse(route.request().postDataJSON());
      const index = rows.findIndex((r) => r.opportunityId === input.opportunityId);
      const row = feedback(input.opportunityId, input.status); if (index < 0) rows.push(row); else rows[index] = row;
      return json(input);
    }
    return route.abort();
  });
}
test("mocked AI APIs: authenticated reflection/evidence/save/dismiss/complete journey", async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await mockApi(page); await page.goto("/");
  await page.getByLabel("Your reflection").fill(reflection().text);
  await page.getByRole("checkbox", { name: /I consent/ }).check();
  await page.getByRole("button", { name: "Find my insights" }).click();
  await expect(page).toHaveURL(/\/discoveries$/);
  await expect(page.getByText("digital systems", { exact: true })).toBeVisible();
  await page.getByText("Why am I seeing this?", { exact: true }).first().click();
  await expect(page.getByText(reflection().text, { exact: true }).first()).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Your Next Steps" }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.getByRole("article", { name: "Boolean Logic Practice Plan", exact: true }).getByRole("button", { name: "Save", exact: true }).click();
  const saved = page.getByRole("region", { name: "Saved", exact: true });
  await expect(saved.getByRole("article")).toHaveCount(1); await page.reload();
  await saved.getByRole("button", { name: "Mark completed" }).click();
  await expect(saved.getByRole("article")).toHaveCount(0);
  await page.getByRole("navigation").getByRole("link", { name: "Daily Check-in" }).click();
  await page.getByLabel("Your reflection").fill("I enjoyed another digital systems lab today."); await page.getByRole("checkbox", { name: /I consent/ }).check();
  await page.getByRole("button", { name: "Find my insights" }).click();
  await expect(page.getByText("Based on 2 reflections", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText("2 matching reflections", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("next-steps.png"), fullPage: true });
});
test("mocked AI outage preserves authenticated student's draft", async ({ page }) => {
  await mockApi(page, true); await page.goto("/");
  await page.getByLabel("Your reflection").fill(reflection().text); await page.getByRole("checkbox", { name: /I consent/ }).check();
  await page.getByRole("button", { name: "Find my insights" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByLabel("Your reflection")).toHaveValue(reflection().text);
});
async function registerUi(page: Page, id = `student_${crypto.randomUUID().slice(0,8)}`) {
  await page.goto("/"); await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Login ID", { exact: true }).fill(id);
  await page.getByLabel("Password", { exact: true }).fill("secure-test-password");
  await page.getByLabel("Confirm password", { exact: true }).fill("secure-test-password");
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByRole("heading", { name: "Daily Check-in", exact: true })).toBeVisible();
  return id;
}
test("real SQLite: register/logout/login restores profile; guest access is blocked", async ({ page }) => {
  await page.goto("/discoveries"); await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect((await page.request.get("/api/reflections")).status()).toBe(401);
  const id = await registerUi(page);
  await page.getByRole("button", { name: "Account & privacy", exact: true }).click();
  await page.getByLabel("Display name (optional)").fill("Persistent Student"); await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Hello, Persistent Student", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect((await page.request.get("/api/privacy")).status()).toBe(401);
  await page.getByLabel("Login ID", { exact: true }).fill(id); await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Log in to AfterClass" }).click(); await expect(page.getByRole("main").getByRole("alert")).toContainText("incorrect");
  await page.getByLabel("Password", { exact: true }).fill("secure-test-password"); await page.getByRole("button", { name: "Log in to AfterClass" }).click();
  await expect(page.getByLabel("Your reflection")).toBeVisible();
  await page.getByRole("button", { name: "Account & privacy", exact: true }).click();
  await expect(page.getByText("Hello, Persistent Student", { exact: false })).toBeVisible();
});
test("real SQLite: consent, missing key, profile and export/delete work after registration", async ({ page }) => {
  await registerUi(page); await page.getByLabel("Your reflection").fill(reflection().text);
  await page.getByRole("button", { name: "Find my insights" }).click(); await expect(page.getByRole("main").getByRole("alert")).toContainText("Please consent");
  await page.getByRole("checkbox", { name: /I consent/ }).check(); await page.getByRole("button", { name: "Find my insights" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("AI is not configured");
  await page.getByRole("button", { name: "Account & privacy", exact: true }).click();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export my data" }).click();
  expect((await download).suggestedFilename()).toBe("afterclass-my-data.json");
  await page.getByLabel("Type DELETE to permanently remove my AfterClass data").fill("DELETE");
  await page.getByRole("button", { name: "Delete my data", exact: true }).click();
  await expect(page.getByLabel("Your reflection")).toBeVisible();
});

test("paper-cut design: responsive surfaces, keyboard focus and all discovery views", async ({ page }, testInfo) => {
  await mockApi(page); await page.goto("/");
  await expect(page.getByRole("heading", { name: "Daily Check-in", exact: true })).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(240, 246, 255)");
  await expect(page.locator(".paper-shapes")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".paper-shape")).toHaveCount(8);
  await expect(page.locator(".page-hero")).toHaveCSS("border-radius", "24px");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-weight", "400");
  const submit = page.getByRole("button", { name: "Find my insights", exact: true });
  await expect(submit).toHaveCSS("background-color", "rgb(39, 39, 230)");
  await expect(submit).toHaveCSS("border-radius", "48px");
  await expect(submit).toHaveCSS("box-shadow", "rgb(17, 17, 24) 0px 4px 0px 0px");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByLabel("Your reflection").fill(reflection().text);
  await page.getByRole("checkbox", { name: /I consent/ }).check();
  await submit.click();
  await expect(page).toHaveURL(/\/discoveries$/);
  await page.getByRole("tab", { name: "Overview" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Patterns" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "Your reflection history" })).toBeVisible();
  await page.getByLabel("Date range", { exact: true }).selectOption("custom");
  await expect(page.getByLabel("Start date")).toBeVisible();
  await expect(page.getByLabel("End date")).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Your Next Steps" }).click();
  await page.getByRole("button", { name: "Browse ideas", exact: true }).click();
  await page.getByLabel("Search activities").fill("logic");
  await page.getByRole("button", { name: "Find ideas", exact: true }).click();
  await expect(page.getByRole("article").first()).toBeVisible();
  const gridColumns = await page.locator(".grid").first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(gridColumns).toBe(testInfo.project.name === "mobile" ? 1 : 3);
  await expect(page.locator(".activity-art").first()).toHaveAttribute("aria-hidden", "true");
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: testInfo.outputPath("paper-cut-catalogue.png"), fullPage: true });
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "Find ideas", exact: true })).toHaveCSS("transition-duration", "0s");
});

test("paper-cut login: readable inputs and no horizontal overflow at narrow widths", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Login ID", { exact: true })).toHaveCSS("border-radius", "5000px");
  await page.screenshot({ path: testInfo.outputPath("paper-cut-login.png"), fullPage: true });
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByLabel("Confirm password", { exact: true })).toBeVisible();
  }
});