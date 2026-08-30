// Direct, no-HTTP test for server/services/listicles.ts (phase B7-13
// service extraction).

import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  getListicles: vi.fn(),
  scanBrandListicles: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: { getListicles: stubs.getListicles },
}));

vi.mock("../../server/lib/listicleScanner", () => ({
  scanBrandListicles: stubs.scanBrandListicles,
}));

const { discoverBrandListicles } = await import("../../server/services/listicles");

beforeEach(() => {
  stubs.getListicles.mockReset();
  stubs.scanBrandListicles.mockReset();
});

describe("discoverBrandListicles", () => {
  it("shapes the scan report into the legacy response fields", async () => {
    stubs.scanBrandListicles.mockResolvedValueOnce({ inserted: 2, found: 3 });
    stubs.getListicles.mockResolvedValueOnce([{ id: "l-1" }, { id: "l-2" }]);

    const data = await discoverBrandListicles("brand-1", "Acme");

    expect(stubs.scanBrandListicles).toHaveBeenCalledWith("brand-1");
    expect(data).toMatchObject({
      brand: { id: "brand-1", name: "Acme" },
      inserted: 2,
      candidates: 3,
      reason: "ok",
      listicles: [{ id: "l-1" }, { id: "l-2" }],
    });
    expect(data.tips.length).toBeGreaterThan(0);
  });

  it("reports no_candidates when the scan finds nothing", async () => {
    stubs.scanBrandListicles.mockResolvedValueOnce({ inserted: 0, found: 0 });
    stubs.getListicles.mockResolvedValueOnce([]);

    const data = await discoverBrandListicles("brand-1", "Acme");

    expect(data.reason).toBe("no_candidates");
  });
});
