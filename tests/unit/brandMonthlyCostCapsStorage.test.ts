import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => {
  const proxy: Record<string, unknown> = {};
  const fn = vi.fn(() => proxy);
  for (const method of [
    "insert",
    "select",
    "update",
    "from",
    "where",
    "values",
    "set",
    "returning",
    "limit",
    "onConflictDoUpdate",
  ]) {
    (proxy as any)[method] = fn;
  }
  return { proxy, fn };
});

vi.mock("../../server/db", () => ({ db: dbMock.proxy }));
vi.mock("../../shared/schema", () => new Proxy({}, { get: (_t, p) => p, has: () => true }));

import { DatabaseStorage } from "../../server/databaseStorage";

describe("brandMonthlyCostCaps storage", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it("getMonthlyCostCap returns null when no row exists for that month", async () => {
    dbMock.fn.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
      }),
    } as any);
    const cap = await storage.getMonthlyCostCap("brand-1", "2026-05");
    expect(cap).toBeNull();
  });

  it("getMonthlyCostCap returns the row when it exists", async () => {
    const fakeRow = {
      brandId: "brand-1",
      monthKey: "2026-05",
      factScrapeCents: 200,
      monthlyCapCents: 500,
    };
    dbMock.fn.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([fakeRow]) }),
      }),
    } as any);
    const cap = await storage.getMonthlyCostCap("brand-1", "2026-05");
    expect(cap).toEqual(fakeRow);
  });

  it("incrementMonthlyCostCents upserts via onConflictDoUpdate", async () => {
    const fakeRow = {
      brandId: "brand-1",
      monthKey: "2026-05",
      factScrapeCents: 25,
      monthlyCapCents: 500,
    };
    const onConflictSpy = vi.fn().mockReturnValue({
      returning: () => Promise.resolve([fakeRow]),
    });
    dbMock.fn.mockReturnValue({
      values: () => ({ onConflictDoUpdate: onConflictSpy }) as any,
    } as any);
    const row = await storage.incrementMonthlyCostCents("brand-1", "2026-05", 25);
    expect(row).toEqual(fakeRow);
    expect(onConflictSpy).toHaveBeenCalledOnce();
  });

  it("incrementMonthlyCostCents seeds the row with monthlyCapCents=500 on first insert", async () => {
    const valuesSpy = vi.fn().mockReturnValue({
      onConflictDoUpdate: () => ({
        returning: () => Promise.resolve([{}]),
      }),
    });
    dbMock.fn.mockReturnValue({ values: valuesSpy } as any);
    await storage.incrementMonthlyCostCents("brand-1", "2026-05", 25);
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: "brand-1",
        monthKey: "2026-05",
        factScrapeCents: 25,
        monthlyCapCents: 500,
      }),
    );
  });
});
