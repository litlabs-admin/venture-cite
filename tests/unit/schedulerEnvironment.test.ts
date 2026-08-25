import { afterEach, describe, expect, it, vi } from "vitest";

function stubValidProductionEnvironment(): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", "https://venturecite.test");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@database.test:5432/venturecite");
  vi.stubEnv("DATABASE_CA_CERT_PATH", "");
  vi.stubEnv("DATABASE_SSL_REJECT_UNAUTHORIZED", "true");
  vi.stubEnv("SUPABASE_URL", "https://venturecite.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
  vi.stubEnv("DISABLE_IN_PROCESS_SCHEDULER", "false");
  vi.stubEnv("EXTERNAL_CRON_ORCHESTRATOR_ENABLED", "false");
  vi.stubEnv("VERCEL", "");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("scheduler environment validation", () => {
  it("rejects an invalid scheduler boolean during environment parsing", async () => {
    stubValidProductionEnvironment();
    vi.stubEnv("EXTERNAL_CRON_ORCHESTRATOR_ENABLED", "sometimes");

    await expect(import("../../server/env")).rejects.toThrow(
      "Scheduler environment values must be a scheduler boolean",
    );
  });

  it("rejects a production process without a scheduler owner", async () => {
    stubValidProductionEnvironment();
    vi.stubEnv("DISABLE_IN_PROCESS_SCHEDULER", "true");

    await expect(import("../../server/env")).rejects.toThrow(
      "Production scheduler disablement requires EXTERNAL_CRON_ORCHESTRATOR_ENABLED=true",
    );
  });

  it("accepts trimmed external scheduler switches", async () => {
    stubValidProductionEnvironment();
    vi.stubEnv("DISABLE_IN_PROCESS_SCHEDULER", "  true  ");
    vi.stubEnv("EXTERNAL_CRON_ORCHESTRATOR_ENABLED", "  true  ");

    const { env } = await import("../../server/env");

    expect(env.DISABLE_IN_PROCESS_SCHEDULER).toBe(true);
    expect(env.EXTERNAL_CRON_ORCHESTRATOR_ENABLED).toBe(true);
  });

  it("keeps the in-process scheduler as the default production owner", async () => {
    stubValidProductionEnvironment();
    vi.stubEnv("DISABLE_IN_PROCESS_SCHEDULER", "");
    vi.stubEnv("EXTERNAL_CRON_ORCHESTRATOR_ENABLED", "");

    const { env } = await import("../../server/env");

    expect(env.DISABLE_IN_PROCESS_SCHEDULER).toBe(false);
    expect(env.EXTERNAL_CRON_ORCHESTRATOR_ENABLED).toBe(false);
  });
});
