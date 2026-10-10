import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }],
  webServer: { command: "npm run dev -- --port 3100", url: "http://localhost:3100", reuseExistingServer: false, timeout: 120000,
    env: { OPENAI_API_KEY: "", AFTERCLASS_DATA_DIR: "/tmp/afterclass-playwright-data" } },
});