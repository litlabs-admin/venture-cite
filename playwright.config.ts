// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";
import {
  localE2EOwnerDatabaseUrl,
  localE2ESupabaseEnvironment,
} from "./tests/e2e/support/local-database-access";

const STORAGE_STATE = "playwright/.auth/state.json";

// The app listens on PORT (default 5000 - see server/index.ts:53).
// NOTE: data-testid attributes are stripped when NODE_ENV=production
// (vite.config.ts:29-33), so e2e MUST run against the dev server.
const PORT = process.env.PORT || "5000";
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;
const USE_LOCAL_FAKE_CONTENT_PROVIDER = !process.env.E2E_BASE_URL;
const LOCAL_FLOW_SPECS =
  /(?:article-flow|content-generation-fake|distribution-flow|brand-deletion-safety)\.spec\.ts/;

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function definedEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

export function buildLocalFlowServerCommand(baseUrl: string): string {
  if (!isLoopbackUrl(baseUrl)) {
    throw new Error(`Local E2E requires a loopback base URL, received: ${baseUrl}`);
  }
  return [
    "cross-env",
    "NODE_ENV=development",
    "CONTENT_GENERATION_PROVIDER=fake",
    `CONTENT_GENERATION_FAKE_BASE_URL=${baseUrl}`,
    "DISABLE_IN_PROCESS_SCHEDULER=true",
    "DISABLE_STARTUP_AUTOPILOT=true",
    "DISABLE_STRIPE_SETUP=true",
    "STRIPE_PRODUCT_SYNC=false",
    "STRIPE_SECRET_KEY=",
    "STRIPE_WEBHOOK_SECRET=",
    "OPENAI_API_KEY=local-e2e-disabled",
    "OPENROUTER_API_KEY=",
    "RESEND_API_KEY=",
    "RESEND_FROM_ADDRESS=",
    "SENTRY_DSN=http://local@127.0.0.1:9/1",
    "VITE_SENTRY_DSN=http://local@127.0.0.1:9/1",
    "npx tsx scripts/prepareLocalE2EDatabase.ts && npm run dev",
  ].join(" ");
}

if (USE_LOCAL_FAKE_CONTENT_PROVIDER && !isLoopbackUrl(BASE_URL)) {
  throw new Error(`Local E2E requires a loopback base URL, received: ${BASE_URL}`);
}

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/support/global-teardown.ts",
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
      testIgnore: LOCAL_FLOW_SPECS,
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
    {
      name: "local-flows",
      testMatch: LOCAL_FLOW_SPECS,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Local E2E runs use a deterministic provider. The server rejects
        // this mode unless its base URL is a loopback URL.
        command: USE_LOCAL_FAKE_CONTENT_PROVIDER
          ? buildLocalFlowServerCommand(BASE_URL)
          : "npm run dev",
        env: USE_LOCAL_FAKE_CONTENT_PROVIDER
          ? {
              ...definedEnvironment(),
              ...localE2ESupabaseEnvironment(process.env),
              DATABASE_URL: localE2EOwnerDatabaseUrl(process.env.E2E_LOCAL_DATABASE_URL),
              CONTENT_GENERATION_PROVIDER: "fake",
              CONTENT_GENERATION_FAKE_BASE_URL: BASE_URL,
              DISABLE_IN_PROCESS_SCHEDULER: "true",
              DISABLE_STARTUP_AUTOPILOT: "true",
              DISABLE_STRIPE_SETUP: "true",
              STRIPE_PRODUCT_SYNC: "false",
              STRIPE_SECRET_KEY: "",
              STRIPE_WEBHOOK_SECRET: "",
              OPENAI_API_KEY: "local-e2e-disabled",
              OPENROUTER_API_KEY: "",
              RESEND_API_KEY: "",
              RESEND_FROM_ADDRESS: "",
              SENTRY_DSN: "http://local@127.0.0.1:9/1",
              VITE_SENTRY_DSN: "http://local@127.0.0.1:9/1",
            }
          : definedEnvironment(),
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
