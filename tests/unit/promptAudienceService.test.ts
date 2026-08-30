// Direct, no-HTTP tests for server/services/promptAudiences.ts.
// See promptPortfolioService.test.ts for why these exist.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIENCE_GENERATION_COOLDOWN_MS } from "@shared/constants";

const BRAND_ID = "brand-1";
const BRAND = { id: BRAND_ID, name: "Acme" } as any;

const storageStubs = vi.hoisted(() => ({
  getPromptAudiencesByBrandId: vi.fn(),
  getPromptAudienceCounts: vi.fn(),
  getPromptAudienceMapByBrandId: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
  getGeoRankingsByBrandPromptIds: vi.fn(),
  getLatestAiAudienceCreatedAt: vi.fn(),
  createPromptAudience: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));

const generatePromptAudiencesMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/audienceGenerator", () => ({
  generatePromptAudiences: generatePromptAudiencesMock,
}));

const { listPromptAudiencesWithScores, generatePromptAudiencesForBrand, createPromptAudience } =
  await import("../../server/services/promptAudiences");

beforeEach(() => {
  vi.clearAllMocks();
  storageStubs.getBrandPromptsByBrandId.mockResolvedValue([]);
  storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([]);
});

describe("listPromptAudiencesWithScores", () => {
  it("joins promptCount and a null score when no member prompt has ranking history", async () => {
    storageStubs.getPromptAudiencesByBrandId.mockResolvedValue([{ id: "a1", name: "SMB" }]);
    storageStubs.getPromptAudienceCounts.mockResolvedValue({ a1: 2 });
    storageStubs.getPromptAudienceMapByBrandId.mockResolvedValue({ p1: ["a1"] });
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([{ id: "p1" }]);

    const data = await listPromptAudiencesWithScores(BRAND);
    expect(data).toEqual([{ id: "a1", name: "SMB", promptCount: 2, score: null }]);
  });
});

describe("generatePromptAudiencesForBrand", () => {
  it("blocks generation inside the cooldown window", async () => {
    storageStubs.getLatestAiAudienceCreatedAt.mockResolvedValue(
      new Date(Date.now() - 1000), // just generated
    );
    const result = await generatePromptAudiencesForBrand(BRAND);
    expect(result.outcome).toBe("cooldown");
    if (result.outcome === "cooldown") {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
    expect(generatePromptAudiencesMock).not.toHaveBeenCalled();
  });

  it("generates once the cooldown has elapsed", async () => {
    storageStubs.getLatestAiAudienceCreatedAt.mockResolvedValue(
      new Date(Date.now() - AUDIENCE_GENERATION_COOLDOWN_MS - 1000),
    );
    generatePromptAudiencesMock.mockResolvedValue({ saved: [{ id: "a1" }] });
    const result = await generatePromptAudiencesForBrand(BRAND);
    expect(result).toEqual({ outcome: "ok", data: [{ id: "a1" }] });
  });

  it("surfaces an upstream error with no prior generation", async () => {
    storageStubs.getLatestAiAudienceCreatedAt.mockResolvedValue(null);
    generatePromptAudiencesMock.mockResolvedValue({ saved: [], error: "no key" });
    const result = await generatePromptAudiencesForBrand(BRAND);
    expect(result).toEqual({ outcome: "upstream_error", error: "no key" });
  });
});

describe("createPromptAudience", () => {
  it("refuses a case-insensitive duplicate name", async () => {
    storageStubs.getPromptAudiencesByBrandId.mockResolvedValue([{ id: "a1", name: "SMB" }]);
    const result = await createPromptAudience(BRAND, {
      name: "smb",
      description: null,
      funnelStage: null,
    });
    expect(result).toEqual({ outcome: "duplicate" });
  });

  it("creates the audience when the name is unique", async () => {
    storageStubs.getPromptAudiencesByBrandId.mockResolvedValue([]);
    const created = { id: "a2", name: "Enterprise" };
    storageStubs.createPromptAudience.mockResolvedValue(created);
    const result = await createPromptAudience(BRAND, {
      name: "Enterprise",
      description: "big co",
      funnelStage: "BOFU",
    });
    expect(result).toEqual({ outcome: "created", data: created });
    expect(storageStubs.createPromptAudience).toHaveBeenCalledWith({
      brandId: BRAND_ID,
      name: "Enterprise",
      description: "big co",
      funnelStage: "BOFU",
      generatedBy: "manual",
    });
  });
});
