// Direct, no-HTTP tests for server/services/onboardingActivation.ts (B7
// service extraction). HTTP-level behavior for the retry endpoint is
// already covered by tests/unit/autopilotRetry.test.ts; this file proves
// all four extracted functions - confirm, retry, advance, status - work
// when called directly, including that confirm/retry detach the autopilot
// kickoff via waitUntil while advance awaits it directly.

import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  waitUntil: vi.fn(),
  runOnboardingAutopilot: vi.fn(),
  withBrandQuota: vi.fn(),
  isUsageLimitError: vi.fn(),
  createCompetitor: vi.fn(),
  transitionAutopilotFromFailedToPending: vi.fn(),
  getBrandByIdForUser: vi.fn(),
  captureAndFlush: vi.fn(),
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: (p: Promise<unknown>) => {
    stubs.waitUntil(p);
    if (p && typeof (p as Promise<unknown>).then === "function") {
      (p as Promise<unknown>).catch(() => {});
    }
  },
}));

vi.mock("../../server/lib/onboardingAutopilot", () => ({
  runOnboardingAutopilot: stubs.runOnboardingAutopilot,
}));

vi.mock("../../server/lib/usageLimit", () => ({
  withBrandQuota: stubs.withBrandQuota,
  isUsageLimitError: stubs.isUsageLimitError,
}));

vi.mock("../../server/storage", () => ({
  storage: {
    createCompetitor: stubs.createCompetitor,
    transitionAutopilotFromFailedToPending: stubs.transitionAutopilotFromFailedToPending,
    getBrandByIdForUser: stubs.getBrandByIdForUser,
  },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: stubs.captureAndFlush,
}));

const {
  confirmOnboardingBrand,
  retryOnboardingAutopilot,
  advanceOnboardingAutopilot,
  getOnboardingAutopilotStatus,
} = await import("../../server/services/onboardingActivation");

beforeEach(() => {
  for (const s of Object.values(stubs)) s.mockReset();
  stubs.runOnboardingAutopilot.mockResolvedValue(undefined);
  stubs.isUsageLimitError.mockReturnValue(false);
});

describe("confirmOnboardingBrand", () => {
  function stubQuota(row: Record<string, unknown>) {
    stubs.withBrandQuota.mockImplementation(async (_userId: string, _tier: unknown, fn: any) => {
      const tx = {
        insert: () => ({
          values: () => ({
            returning: async () => [row],
          }),
        }),
      };
      return fn(tx);
    });
  }

  it("creates the brand, inserts valid competitors, and kicks off the autopilot detached", async () => {
    stubQuota({ id: "brand-1", industry: "General" });

    const result = await confirmOnboardingBrand({
      userId: "user-1",
      tier: "free" as any,
      brandName: "Acme",
      website: "https://acme.com",
      brandData: {},
      competitors: [{ name: "Rival Co", domain: "rival.com" }, { name: "" }, null],
    });

    expect(result).toEqual({ kind: "confirmed", brandId: "brand-1" });
    expect(stubs.createCompetitor).toHaveBeenCalledTimes(1);
    expect(stubs.createCompetitor).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: "brand-1", name: "Rival Co" }),
    );
    // The autopilot kickoff is fired via waitUntil, not awaited - confirm
    // must return before the pipeline finishes.
    expect(stubs.waitUntil).toHaveBeenCalledTimes(1);
    expect(stubs.runOnboardingAutopilot).toHaveBeenCalledWith(
      "brand-1",
      "user-1",
      expect.objectContaining({ deadlineMs: expect.any(Number) }),
    );
  });

  it("returns quota_exceeded without inserting competitors or kicking off autopilot", async () => {
    stubs.withBrandQuota.mockRejectedValue(new Error("Brand limit reached"));
    stubs.isUsageLimitError.mockReturnValue(true);

    const result = await confirmOnboardingBrand({
      userId: "user-1",
      tier: "free" as any,
      brandName: "Acme",
      website: "https://acme.com",
      brandData: {},
      competitors: [],
    });

    expect(result).toEqual({ kind: "quota_exceeded", message: "Brand limit reached" });
    expect(stubs.createCompetitor).not.toHaveBeenCalled();
    expect(stubs.runOnboardingAutopilot).not.toHaveBeenCalled();
  });

  it("rethrows an error that is not a usage-limit error", async () => {
    stubs.withBrandQuota.mockRejectedValue(new Error("db exploded"));
    stubs.isUsageLimitError.mockReturnValue(false);

    await expect(
      confirmOnboardingBrand({
        userId: "user-1",
        tier: "free" as any,
        brandName: "Acme",
        website: "https://acme.com",
        brandData: {},
        competitors: [],
      }),
    ).rejects.toThrow("db exploded");
  });

  it("tolerates a competitor insert failure without failing confirm", async () => {
    stubQuota({ id: "brand-1", industry: "General" });
    stubs.createCompetitor.mockRejectedValue(new Error("insert failed"));

    const result = await confirmOnboardingBrand({
      userId: "user-1",
      tier: "free" as any,
      brandName: "Acme",
      website: "https://acme.com",
      brandData: {},
      competitors: [{ name: "Rival Co" }],
    });

    expect(result).toEqual({ kind: "confirmed", brandId: "brand-1" });
  });
});

describe("retryOnboardingAutopilot", () => {
  it("returns not_failed without kicking off autopilot when the CAS loses", async () => {
    stubs.transitionAutopilotFromFailedToPending.mockResolvedValue(false);

    const result = await retryOnboardingAutopilot(
      { id: "brand-1", autopilotStatus: "running_citations" },
      "user-1",
    );

    expect(result).toEqual({ kind: "not_failed" });
    expect(stubs.runOnboardingAutopilot).not.toHaveBeenCalled();
  });

  it("kicks off the autopilot detached when the CAS wins", async () => {
    stubs.transitionAutopilotFromFailedToPending.mockResolvedValue(true);

    const result = await retryOnboardingAutopilot(
      { id: "brand-1", autopilotStatus: "failed" },
      "user-1",
    );

    expect(result).toEqual({ kind: "retrying" });
    expect(stubs.waitUntil).toHaveBeenCalledTimes(1);
    expect(stubs.runOnboardingAutopilot).toHaveBeenCalledWith(
      "brand-1",
      "user-1",
      expect.objectContaining({ deadlineMs: expect.any(Number) }),
    );
  });
});

describe("advanceOnboardingAutopilot", () => {
  it("returns not_found when the brand isn't owned by this user", async () => {
    stubs.getBrandByIdForUser.mockResolvedValue(undefined);
    const result = await advanceOnboardingAutopilot("brand-1", "user-1");
    expect(result).toEqual({ kind: "not_found" });
  });

  it("returns idle without advancing when the brand isn't in flight", async () => {
    stubs.getBrandByIdForUser.mockResolvedValue({ id: "brand-1", autopilotStatus: "completed" });
    const result = await advanceOnboardingAutopilot("brand-1", "user-1");
    expect(result).toEqual({ kind: "idle", status: "completed" });
    expect(stubs.runOnboardingAutopilot).not.toHaveBeenCalled();
  });

  it("advances the pipeline (awaited, not detached) and returns the post-advance state", async () => {
    stubs.getBrandByIdForUser
      .mockResolvedValueOnce({
        id: "brand-1",
        autopilotStatus: "running_citations",
        autopilotStep: 2,
      })
      .mockResolvedValueOnce({
        id: "brand-1",
        autopilotStatus: "completed",
        autopilotStep: 3,
        autopilotProgress: { x: 1 },
        autopilotError: null,
      });

    const result = await advanceOnboardingAutopilot("brand-1", "user-1");

    expect(stubs.runOnboardingAutopilot).toHaveBeenCalledWith(
      "brand-1",
      "user-1",
      expect.objectContaining({ deadlineMs: expect.any(Number) }),
    );
    // Unlike confirm/retry, advance is client-driven and must await the
    // slice directly rather than detach it via waitUntil.
    expect(stubs.waitUntil).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "advanced",
      status: "completed",
      step: 3,
      progress: { x: 1 },
      error: null,
    });
  });
});

describe("getOnboardingAutopilotStatus", () => {
  it("returns null when the brand isn't owned by this user", async () => {
    stubs.getBrandByIdForUser.mockResolvedValue(undefined);
    const result = await getOnboardingAutopilotStatus("brand-1", "user-1");
    expect(result).toBeNull();
  });

  it("returns the current status shape", async () => {
    stubs.getBrandByIdForUser.mockResolvedValue({
      id: "brand-1",
      autopilotStatus: "running_citations",
      autopilotStep: 2,
      autopilotProgress: { phase: "citations" },
      autopilotError: null,
      autopilotStartedAt: "2026-01-01T00:00:00Z",
      autopilotCompletedAt: null,
    });

    const result = await getOnboardingAutopilotStatus("brand-1", "user-1");

    expect(result).toEqual({
      status: "running_citations",
      step: 2,
      progress: { phase: "citations" },
      error: null,
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: null,
    });
  });
});
