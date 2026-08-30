// Direct, no-HTTP tests for server/services/promptSetHealth.ts.
// See promptPortfolioService.test.ts for why these exist.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SET_HEALTH_COOLDOWN_MS } from "@shared/constants";

const BRAND_ID = "brand-1";
const BRAND = { id: BRAND_ID, name: "Acme" } as any;

const storageStubs = vi.hoisted(() => ({
  getLatestSetHealthRun: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));

const runPromptSetHealthAuditMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/promptSetHealthAuditor", () => ({
  runPromptSetHealthAudit: runPromptSetHealthAuditMock,
}));

const { runSetHealthAuditForBrand } = await import("../../server/services/promptSetHealth");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runSetHealthAuditForBrand", () => {
  it("blocks a re-run inside the cooldown window", async () => {
    storageStubs.getLatestSetHealthRun.mockResolvedValue({
      createdAt: new Date(Date.now() - 1000),
    });
    const result = await runSetHealthAuditForBrand(BRAND);
    expect(result.outcome).toBe("cooldown");
    if (result.outcome === "cooldown") {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
    expect(runPromptSetHealthAuditMock).not.toHaveBeenCalled();
  });

  it("runs the audit once the cooldown has elapsed", async () => {
    storageStubs.getLatestSetHealthRun.mockResolvedValue({
      createdAt: new Date(Date.now() - SET_HEALTH_COOLDOWN_MS - 1000),
    });
    const run = { id: "run-1", brandId: BRAND_ID };
    runPromptSetHealthAuditMock.mockResolvedValue(run);
    const result = await runSetHealthAuditForBrand(BRAND);
    expect(result).toEqual({ outcome: "ok", data: run });
    expect(runPromptSetHealthAuditMock).toHaveBeenCalledWith(BRAND_ID);
  });

  it("runs the audit when there is no prior run", async () => {
    storageStubs.getLatestSetHealthRun.mockResolvedValue(undefined);
    const run = { id: "run-1", brandId: BRAND_ID };
    runPromptSetHealthAuditMock.mockResolvedValue(run);
    const result = await runSetHealthAuditForBrand(BRAND);
    expect(result).toEqual({ outcome: "ok", data: run });
  });
});
