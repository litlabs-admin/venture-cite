// Direct, no-HTTP tests for server/services/reDetect.ts.
//
// The cooldown itself already has route-level coverage in
// tests/unit/reDetectAllCooldown.test.ts (mounting the real Express route).
// This file proves the service function is callable and correct without an
// HTTP layer, and covers the re-scan behaviour the route test leaves empty.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { RAW_RESPONSE_DELIMITER } from "../../server/lib/citationContextFormat";

const BRAND_ID = "brand-1";
const BRAND = {
  id: BRAND_ID,
  name: "Acme",
  nameVariations: ["Acme Inc"],
  website: "https://acme.com",
} as any;

const storageStubs = vi.hoisted(() => ({
  getReDetectAllLastRunAt: vi.fn(),
  setReDetectAllLastRunAt: vi.fn(),
  getCompetitors: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
  getGeoRankingsByBrandPromptIds: vi.fn(),
  updateGeoRanking: vi.fn(),
  recomputeCitationRunAggregate: vi.fn(),
  getListicles: vi.fn(),
  updateListicle: vi.fn(),
  getWikipediaMentions: vi.fn(),
  updateWikipediaMention: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { reDetectAllForBrand } = await import("../../server/services/reDetect");

beforeEach(() => {
  vi.clearAllMocks();
  storageStubs.getReDetectAllLastRunAt.mockResolvedValue(null);
  storageStubs.setReDetectAllLastRunAt.mockResolvedValue(undefined);
  storageStubs.getCompetitors.mockResolvedValue([]);
  storageStubs.getBrandPromptsByBrandId.mockResolvedValue([]);
  storageStubs.getListicles.mockResolvedValue([]);
  storageStubs.getWikipediaMentions.mockResolvedValue([]);
});

describe("reDetectAllForBrand", () => {
  it("blocks a re-run inside the cooldown window without recording a new run", async () => {
    storageStubs.getReDetectAllLastRunAt.mockResolvedValue(new Date(Date.now() - 5_000));
    const result = await reDetectAllForBrand(BRAND);
    expect(result.outcome).toBe("cooldown");
    if (result.outcome === "cooldown") {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
    expect(storageStubs.setReDetectAllLastRunAt).not.toHaveBeenCalled();
  });

  it("flips a geo_ranking row to cited when the matcher now finds the brand", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([{ id: "p1" }]);
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      {
        id: "r1",
        runId: "run-1",
        isCited: 0,
        rank: null,
        citationContext: `Not cited${RAW_RESPONSE_DELIMITER}\nAcme Inc is the best tool.`,
      },
    ]);

    const result = await reDetectAllForBrand(BRAND);
    expect(result.outcome).toBe("ok");
    if (result.outcome === "ok") {
      expect(result.data.counts).toEqual({
        rankings: 1,
        listicles: 0,
        wikipedia: 0,
        newlyCited: 1,
      });
    }
    expect(storageStubs.updateGeoRanking).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ isCited: 1, rank: null, reDetectedAt: expect.any(Date) }),
    );
    expect(storageStubs.recomputeCitationRunAggregate).toHaveBeenCalledWith("run-1");
    expect(storageStubs.setReDetectAllLastRunAt).toHaveBeenCalledWith(BRAND_ID, expect.any(Date));
  });

  it("leaves an unchanged row alone", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([{ id: "p1" }]);
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      {
        id: "r1",
        runId: "run-1",
        isCited: 1,
        rank: 1,
        citationContext: `Cited${RAW_RESPONSE_DELIMITER}\nAcme Inc is the best tool.`,
      },
    ]);

    const result = await reDetectAllForBrand(BRAND);
    expect(result.outcome).toBe("ok");
    if (result.outcome === "ok") {
      expect(result.data.counts).toEqual({
        rankings: 0,
        listicles: 0,
        wikipedia: 0,
        newlyCited: 0,
      });
    }
    expect(storageStubs.updateGeoRanking).not.toHaveBeenCalled();
    expect(storageStubs.recomputeCitationRunAggregate).not.toHaveBeenCalled();
  });
});
