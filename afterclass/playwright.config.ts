import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }],
  webServer: { command: "npm run dev -- --port 3100", url: "http://localhost:3100", reuseExistingServer: false, timeout: 120000,
    env: { AFTERCLASS_E2E: "1", STORAGE_PROVIDER: "local", DATA_RETENTION_DAYS: "0", SUPABASE_ANON_KEY: "", APP_ORIGIN: "http://localhost:3100", AI_PROVIDER: "openai", AI_API_KEY: "", AI_MODEL: "", OPENAI_API_KEY: "", AFTERCLASS_DATA_DIR: join(tmpdir(), `afterclass-playwright-${Date.now()}`) } },
});