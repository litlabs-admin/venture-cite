// Direct, no-HTTP tests for server/services/factSheetFacts.ts (phase B7-16
// service extraction). HTTP-level behavior is already covered by
// tests/unit/factSheetFactsAcceptDismiss.test.ts and factSheetDiff.test.ts;
// this file proves the extracted service functions themselves can be called
// without an Express app, request, or response.

import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getBrandFactById: vi.fn(),
  acceptFact: vi.fn(),
  dismissFact: vi.fn(),
  getBrandFactSheetConflicts: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageMock }));

const {
  getFactSheetFactById,
  acceptFactSheetFact,
  dismissFactSheetFact,
  bulkAcceptFactSheetConflicts,
  getFactSheetDiff,
} = await import("../../server/services/factSheetFacts");

beforeEach(() => {
  for (const stub of Object.values(storageMock)) stub.mockReset();
});

describe("getFactSheetFactById", () => {
  it("delegates to storage.getBrandFactById", async () => {
    storageMock.getBrandFactById.mockResolvedValue({ id: "fact-1" });
    const result = await getFactSheetFactById("fact-1");
    expect(storageMock.getBrandFactById).toHaveBeenCalledWith("fact-1");
    expect(result).toEqual({ id: "fact-1" });
  });
});

describe("acceptFactSheetFact", () => {
  it("forwards dismissOtherSide and returns the updated fact", async () => {
    storageMock.acceptFact.mockResolvedValue({ id: "fact-1", acceptedAt: "now" });
    const result = await acceptFactSheetFact(
      { id: "fact-1", brandId: "brand-1", domain: "positioning" } as any,
      true,
    );
    expect(storageMock.acceptFact).toHaveBeenCalledWith("fact-1", { dismissOtherSide: true });
    expect(result).toEqual({ id: "fact-1", acceptedAt: "now" });
  });
});

describe("dismissFactSheetFact", () => {
  it("dismisses the fact by id", async () => {
    storageMock.dismissFact.mockResolvedValue({ id: "fact-1", dismissedAt: "now" });
    const result = await dismissFactSheetFact({ id: "fact-1", brandId: "brand-1" });
    expect(storageMock.dismissFact).toHaveBeenCalledWith("fact-1");
    expect(result).toEqual({ id: "fact-1", dismissedAt: "now" });
  });
});

describe("bulkAcceptFactSheetConflicts", () => {
  const conflicts = [
    {
      userFact: { id: "u1", domain: "positioning" },
      scrapedFact: { id: "s1", domain: "positioning", runId: "run-1" },
    },
    {
      userFact: { id: "u2", domain: "pricing" },
      scrapedFact: { id: "s2", domain: "pricing", runId: "run-2" },
    },
  ];

  beforeEach(() => {
    storageMock.getBrandFactSheetConflicts.mockResolvedValue(conflicts);
    storageMock.acceptFact.mockResolvedValue({});
    storageMock.dismissFact.mockResolvedValue({});
  });

  it("resolves every conflict keeping the user side when no filters given", async () => {
    const affected = await bulkAcceptFactSheetConflicts({ brandId: "brand-1", side: "user" });
    expect(affected).toBe(2);
    expect(storageMock.acceptFact).toHaveBeenCalledWith("u1", { dismissOtherSide: false });
    expect(storageMock.acceptFact).toHaveBeenCalledWith("u2", { dismissOtherSide: false });
    expect(storageMock.dismissFact).toHaveBeenCalledWith("s1");
    expect(storageMock.dismissFact).toHaveBeenCalledWith("s2");
  });

  it("scopes to a single domain when provided", async () => {
    const affected = await bulkAcceptFactSheetConflicts({
      brandId: "brand-1",
      side: "scraped",
      domain: "positioning",
    });
    expect(affected).toBe(1);
    expect(storageMock.acceptFact).toHaveBeenCalledWith("s1", { dismissOtherSide: false });
    expect(storageMock.dismissFact).toHaveBeenCalledWith("u1");
    expect(storageMock.acceptFact).not.toHaveBeenCalledWith("s2", expect.anything());
  });

  it("scopes to a single runId when provided", async () => {
    const affected = await bulkAcceptFactSheetConflicts({
      brandId: "brand-1",
      side: "user",
      runId: "run-2",
    });
    expect(affected).toBe(1);
    expect(storageMock.acceptFact).toHaveBeenCalledWith("u2", { dismissOtherSide: false });
    expect(storageMock.acceptFact).not.toHaveBeenCalledWith("u1", expect.anything());
  });
});

describe("getFactSheetDiff", () => {
  it("groups the flat conflict list by domain", async () => {
    const pair1 = { userFact: { id: "u1", domain: "positioning" }, scrapedFact: { id: "s1" } };
    const pair2 = { userFact: { id: "u2", domain: "pricing" }, scrapedFact: { id: "s2" } };
    storageMock.getBrandFactSheetConflicts.mockResolvedValue([pair1, pair2]);
    const result = await getFactSheetDiff("brand-1");
    expect(result).toEqual({ positioning: [pair1], pricing: [pair2] });
  });

  it("returns an empty object when there are no conflicts", async () => {
    storageMock.getBrandFactSheetConflicts.mockResolvedValue([]);
    const result = await getFactSheetDiff("brand-1");
    expect(result).toEqual({});
  });
});
