import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  getBrands: vi.fn(),
  reconcileBrandWorkOpportunities: vi.fn(),
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../server/storage", () => ({
  storage: { getBrands: stubs.getBrands },
}));

vi.mock("../../server/services/work/productionOpportunities", () => ({
  reconcileBrandWorkOpportunities: stubs.reconcileBrandWorkOpportunities,
}));

vi.mock("../../server/lib/logger", () => ({ logger: stubs.logger }));

const { runWorkOpportunityReconciliationJob } =
  await import("../../server/services/work/workOpportunityReconciliationJob");

const BRANDS = [
  { id: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000101" },
  { id: "00000000-0000-4000-8000-000000000002", userId: "00000000-0000-4000-8000-000000000102" },
  { id: "00000000-0000-4000-8000-000000000003", userId: "00000000-0000-4000-8000-000000000103" },
];

beforeEach(() => {
  stubs.getBrands.mockResolvedValue(BRANDS);
  stubs.reconcileBrandWorkOpportunities.mockResolvedValue([]);
  stubs.logger.info.mockClear();
  stubs.logger.error.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  stubs.getBrands.mockReset();
  stubs.reconcileBrandWorkOpportunities.mockReset();
});

describe("work opportunity reconciliation job", () => {
  it("reconciles every active brand with the brand owner's actor", async () => {
    const result = await runWorkOpportunityReconciliationJob();

    expect(result).toEqual({ processed: 3, failed: 0, skipped: false });
    expect(stubs.reconcileBrandWorkOpportunities).toHaveBeenCalledTimes(3);
    expect(stubs.reconcileBrandWorkOpportunities).toHaveBeenNthCalledWith(1, {
      actor: { userId: BRANDS[0].userId },
      brandId: BRANDS[0].id,
    });
    expect(stubs.reconcileBrandWorkOpportunities).toHaveBeenNthCalledWith(2, {
      actor: { userId: BRANDS[1].userId },
      brandId: BRANDS[1].id,
    });
    expect(stubs.reconcileBrandWorkOpportunities).toHaveBeenNthCalledWith(3, {
      actor: { userId: BRANDS[2].userId },
      brandId: BRANDS[2].id,
    });
  });

  it("logs one brand failure and continues with the remaining brands", async () => {
    stubs.reconcileBrandWorkOpportunities
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce([]);

    const result = await runWorkOpportunityReconciliationJob();

    expect(result).toEqual({ processed: 2, failed: 1, skipped: false });
    expect(stubs.reconcileBrandWorkOpportunities).toHaveBeenCalledTimes(3);
    expect(stubs.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: BRANDS[1].id }),
      "work opportunity reconciliation failed for brand",
    );
  });

  it("does not read or reconcile brands when disabled", async () => {
    vi.stubEnv("DISABLE_WORK_OPPORTUNITY_RECONCILIATION", "true");

    const result = await runWorkOpportunityReconciliationJob();

    expect(result).toEqual({ processed: 0, failed: 0, skipped: true });
    expect(stubs.getBrands).not.toHaveBeenCalled();
    expect(stubs.reconcileBrandWorkOpportunities).not.toHaveBeenCalled();
  });
});
