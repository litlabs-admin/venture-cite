// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE } from "./tests/e2e/support/auth";

// The app listens on PORT (default 5000 - see server/index.ts:53).
// NOTE: data-testid attributes are stripped when NODE_ENV=production
// (vite.config.ts:29-33), so e2e MUST run against the dev server.
const PORT = process.env.PORT || "5000";
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Runs tests/e2e/auth.setup.ts once, ahead of everything else, to
    // authenticate a single time and persist the session to STORAGE_STATE.
    // See auth.setup.ts and tests/e2e/support/auth.ts for why: the login
    // endpoint is rate-limited and a per-test login pattern exhausts it.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      // NOTE: the correct Playwright TestProject option is "dependencies",
      // not "dependsOn" - the latter is silently ignored (not a recognized
      // config key), which meant this project was never actually wired to
      // the "setup" project. It happened to still work for full, unfiltered
      // suite runs only because "setup" is declared first in this array and
      // Playwright otherwise runs projects in declaration order with
      // workers: 1 - but a single-spec run (`npx playwright test
      // tests/e2e/foo.spec.ts`) filters every project's file set
      // independently, so without a real dependency edge "setup" was
      // dropped entirely and STORAGE_STATE was never produced (ENOENT).
      dependencies: ["setup"],
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
