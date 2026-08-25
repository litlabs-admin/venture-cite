import { afterEach, expect, it, vi } from "vitest";

const reconcileOrphanCitationRuns = vi.hoisted(() => vi.fn());

vi.mock("../../server/setupProducts", () => ({ setupStripeProducts: vi.fn() }));
vi.mock("../../server/scheduler", () => ({ initScheduler: vi.fn() }));
vi.mock("../../server/lib/citationReconciliation", () => ({
  reconcileOrphanCitationRuns,
}));
vi.mock("../../server/lib/onboardingAutopilot", () => ({
  resumeInFlightAutopilots: vi.fn(),
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), close: vi.fn() },
}));

function stubProductionWithoutSchedulerOwner(): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", "https://venturecite.test");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@database.test:5432/venturecite");
  vi.stubEnv("DATABASE_CA_CERT_PATH", "");
  vi.stubEnv("DATABASE_SSL_REJECT_UNAUTHORIZED", "true");
  vi.stubEnv("SUPABASE_URL", "https://venturecite.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
  vi.stubEnv("DISABLE_IN_PROCESS_SCHEDULER", "true");
  vi.stubEnv("EXTERNAL_CRON_ORCHESTRATOR_ENABLED", "false");
  vi.stubEnv("VERCEL", "");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

it("rejects invalid scheduler ownership before Nitro startup work", async () => {
  stubProductionWithoutSchedulerOwner();

  await expect(import("../../server/nitroBoot")).rejects.toThrow(
    "Production scheduler disablement requires EXTERNAL_CRON_ORCHESTRATOR_ENABLED=true",
  );
  expect(reconcileOrphanCitationRuns).not.toHaveBeenCalled();
});
