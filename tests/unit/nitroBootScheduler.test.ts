import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boot = vi.hoisted(() => ({
  initScheduler: vi.fn(),
  reconcileOrphanCitationRuns: vi.fn<() => Promise<void>>(),
  resumeInFlightAutopilots: vi.fn(),
  schedulerEnvironment: {
    NODE_ENV: "production" as const,
    DISABLE_IN_PROCESS_SCHEDULER: false,
    EXTERNAL_CRON_ORCHESTRATOR_ENABLED: false,
  },
}));

vi.mock("../../server/setupProducts", () => ({ setupStripeProducts: vi.fn() }));
vi.mock("../../server/scheduler", () => ({ initScheduler: boot.initScheduler }));
vi.mock("../../server/lib/citationReconciliation", () => ({
  reconcileOrphanCitationRuns: boot.reconcileOrphanCitationRuns,
}));
vi.mock("../../server/lib/onboardingAutopilot", () => ({
  resumeInFlightAutopilots: boot.resumeInFlightAutopilots,
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), close: vi.fn() },
}));
vi.mock("../../server/env", () => ({ env: boot.schedulerEnvironment }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "");
  boot.schedulerEnvironment.NODE_ENV = "production";
  boot.schedulerEnvironment.DISABLE_IN_PROCESS_SCHEDULER = false;
  boot.schedulerEnvironment.EXTERNAL_CRON_ORCHESTRATOR_ENABLED = false;
  boot.reconcileOrphanCitationRuns.mockResolvedValue();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Nitro scheduler startup", () => {
  it("starts the in-process scheduler once per process", async () => {
    const { default: nitroBoot } = await import("../../server/nitroBoot");

    nitroBoot();
    nitroBoot();

    await vi.waitFor(() => expect(boot.initScheduler).toHaveBeenCalledTimes(1));
    expect(boot.reconcileOrphanCitationRuns).toHaveBeenCalledTimes(1);
  });

  it("does not start the in-process scheduler for an external owner", async () => {
    boot.schedulerEnvironment.DISABLE_IN_PROCESS_SCHEDULER = true;
    boot.schedulerEnvironment.EXTERNAL_CRON_ORCHESTRATOR_ENABLED = true;
    const { default: nitroBoot } = await import("../../server/nitroBoot");

    nitroBoot();

    await vi.waitFor(() => expect(boot.reconcileOrphanCitationRuns).toHaveBeenCalledTimes(1));
    expect(boot.initScheduler).not.toHaveBeenCalled();
  });

  it("skips all long-lived startup work on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    const { default: nitroBoot } = await import("../../server/nitroBoot");

    nitroBoot();

    expect(boot.reconcileOrphanCitationRuns).not.toHaveBeenCalled();
    expect(boot.initScheduler).not.toHaveBeenCalled();
  });

  it("keeps the Nitro production plugin inactive during local development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { default: nitroBoot } = await import("../../server/nitroBoot");

    nitroBoot();

    expect(boot.reconcileOrphanCitationRuns).not.toHaveBeenCalled();
    expect(boot.initScheduler).not.toHaveBeenCalled();
  });
});
