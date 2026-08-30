// Direct, no-HTTP tests for server/services/factSheetRuns.ts (phase B7-16
// service extraction). HTTP-level behavior for the routes that call these
// functions is already covered by tests/unit/factSheetRunsList.test.ts,
// factSheetRunsGet.test.ts, factSheetRunsCancel.test.ts, and
// factSheetEnabledToggle.test.ts; this file proves the extracted service
// functions themselves can be called without an Express app, request, or
// response.

import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  listScrapeRunsForBrand: vi.fn(),
  getLatestCompletedScrapeRun: vi.fn(),
  getScrapeRunById: vi.fn(),
  getScrapePageById: vi.fn(),
  listScrapePagesForRun: vi.fn(),
  transitionScrapeRunStatusCAS: vi.fn(),
  getMonthlyCostCap: vi.fn(),
  setBrandFactScrapeEnabled: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageMock }));

const {
  FACT_SHEET_TERMINAL_STATUSES,
  listFactSheetRuns,
  getLatestCompletedFactSheetRun,
  getFactSheetRunById,
  getFactSheetPageById,
  listFactSheetRunPages,
  cancelFactSheetRun,
  getFactSheetCostStatus,
  setFactSheetScrapeEnabled,
} = await import("../../server/services/factSheetRuns");

beforeEach(() => {
  for (const stub of Object.values(storageMock)) stub.mockReset();
});

describe("listFactSheetRuns", () => {
  it("passes brandId and limit through to storage", async () => {
    storageMock.listScrapeRunsForBrand.mockResolvedValue([{ id: "run-1" }]);
    const result = await listFactSheetRuns("brand-1", 10);
    expect(storageMock.listScrapeRunsForBrand).toHaveBeenCalledWith("brand-1", 10);
    expect(result).toEqual([{ id: "run-1" }]);
  });
});

describe("getLatestCompletedFactSheetRun", () => {
  it("delegates to storage.getLatestCompletedScrapeRun", async () => {
    storageMock.getLatestCompletedScrapeRun.mockResolvedValue({ id: "run-1" });
    const result = await getLatestCompletedFactSheetRun("brand-1");
    expect(storageMock.getLatestCompletedScrapeRun).toHaveBeenCalledWith("brand-1");
    expect(result).toEqual({ id: "run-1" });
  });
});

describe("getFactSheetRunById / getFactSheetPageById / listFactSheetRunPages", () => {
  it("delegate to the matching storage call", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1" });
    storageMock.getScrapePageById.mockResolvedValue({ id: "page-1" });
    storageMock.listScrapePagesForRun.mockResolvedValue([{ id: "page-1" }]);

    expect(await getFactSheetRunById("run-1")).toEqual({ id: "run-1" });
    expect(storageMock.getScrapeRunById).toHaveBeenCalledWith("run-1");

    expect(await getFactSheetPageById("page-1")).toEqual({ id: "page-1" });
    expect(storageMock.getScrapePageById).toHaveBeenCalledWith("page-1");

    expect(await listFactSheetRunPages("run-1")).toEqual([{ id: "page-1" }]);
    expect(storageMock.listScrapePagesForRun).toHaveBeenCalledWith("run-1");
  });
});

describe("cancelFactSheetRun", () => {
  it("returns already_terminal without calling CAS when status is terminal", async () => {
    for (const status of FACT_SHEET_TERMINAL_STATUSES) {
      storageMock.transitionScrapeRunStatusCAS.mockClear();
      const result = await cancelFactSheetRun({ id: "run-1", brandId: "brand-1", status });
      expect(result).toEqual({ outcome: "already_terminal", status });
      expect(storageMock.transitionScrapeRunStatusCAS).not.toHaveBeenCalled();
    }
  });

  it("returns status_changed when the CAS transition fails", async () => {
    storageMock.transitionScrapeRunStatusCAS.mockResolvedValue(null);
    const result = await cancelFactSheetRun({ id: "run-1", brandId: "brand-1", status: "pending" });
    expect(result).toEqual({ outcome: "status_changed" });
    expect(storageMock.transitionScrapeRunStatusCAS).toHaveBeenCalledWith(
      "run-1",
      "pending",
      "cancelled",
    );
  });

  it("returns cancelled when the CAS transition succeeds", async () => {
    storageMock.transitionScrapeRunStatusCAS.mockResolvedValue({
      id: "run-1",
      status: "cancelled",
    });
    const result = await cancelFactSheetRun({ id: "run-1", brandId: "brand-1", status: "pending" });
    expect(result).toEqual({ outcome: "cancelled" });
  });
});

describe("getFactSheetCostStatus", () => {
  it("returns storage values when a cap row exists", async () => {
    storageMock.getMonthlyCostCap.mockResolvedValue({
      factScrapeCents: 123,
      monthlyCapCents: 500,
    });
    const result = await getFactSheetCostStatus("brand-1");
    expect(result).toEqual({ factScrapeCents: 123, monthlyCapCents: 500 });
  });

  it("defaults to 0 spent / 500 cap when no row exists", async () => {
    storageMock.getMonthlyCostCap.mockResolvedValue(null);
    const result = await getFactSheetCostStatus("brand-1");
    expect(result).toEqual({ factScrapeCents: 0, monthlyCapCents: 500 });
  });
});

describe("setFactSheetScrapeEnabled", () => {
  it("delegates to storage and returns the updated value", async () => {
    storageMock.setBrandFactScrapeEnabled.mockResolvedValue(true);
    const result = await setFactSheetScrapeEnabled("brand-1", true);
    expect(storageMock.setBrandFactScrapeEnabled).toHaveBeenCalledWith("brand-1", true);
    expect(result).toBe(true);
  });
});
