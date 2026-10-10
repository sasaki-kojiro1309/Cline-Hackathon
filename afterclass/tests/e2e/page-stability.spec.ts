import { test, expect } from "@playwright/test";
import { browseCatalogue } from "../../lib/catalogue-browser";
import { buildRecommendations } from "../../lib/recommendations";
import { getCatalogue } from "../../lib/catalogue";
import { reflection } from "../fixtures";

test("login keeps typed input without automatic document reloads", async ({ page }) => {
  let documents = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByLabel("Login ID", { exact: true }).fill("steady_student");
  // Compile/read another route while the login page remains open.
  expect((await page.request.get("/api/health")).status()).toBe(200);
  // Deliberately observe an idle interval: a reload loop can start after hydration.
  await page.waitForTimeout(3000);
  await expect(page.getByLabel("Login ID", { exact: true })).toHaveValue("steady_student");
  expect(documents).toBe(1);
});

test("Next Steps keeps catalogue filters without repeated reloads or requests", async ({ page }) => {
  const records = [reflection(["geography"])];
  const reads = new Map<string, number>();
  let documents = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    reads.set(url.pathname, (reads.get(url.pathname) ?? 0) + 1);
    const json = (data: unknown) => route.fulfill({ json: data });
    if (url.pathname === "/api/account") return json({ authenticated: true, loginId: "steady_student", storage: "local", profile: { displayName: "", consentAt: null }, retentionDays: 0 });
    if (url.pathname === "/api/session") return json({ ready: true });
    if (url.pathname === "/api/recommendations") return json(buildRecommendations(records, [], getCatalogue(), true));
    if (url.pathname === "/api/catalogue") return json(browseCatalogue(url.searchParams, []));
    return route.abort();
  });
  await page.goto("/next-steps");
  await expect(page.getByRole("article", { name: "Map Your Neighbourhood" })).toBeVisible();
  await page.getByRole("button", { name: "Browse ideas", exact: true }).click();
  await expect(page.getByText("100 exploration ideas", { exact: false })).toBeVisible();
  await page.getByLabel("Subject or area").selectOption("geography");
  await expect(page.getByRole("region", { name: "Exploration catalogue" }).getByRole("article")).toHaveCount(2);
  await page.getByLabel("Search activities").fill("my unsent search");
  const settledReads = [...reads.entries()];
  await page.waitForTimeout(3000);
  await expect(page.getByLabel("Subject or area")).toHaveValue("geography");
  await expect(page.getByLabel("Search activities")).toHaveValue("my unsent search");
  expect([...reads.entries()]).toEqual(settledReads);
  expect(documents).toBe(1);
});