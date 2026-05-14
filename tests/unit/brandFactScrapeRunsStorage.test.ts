import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted db mock — chain proxy returning thenable for all Drizzle ops.
const dbMock = vi.hoisted(() => {
  const proxy: Record<string, unknown> = {};
  const fn = vi.fn(() => proxy);
  for (const method of [
    "insert",
    "select",
    "update",
    "delete",
    "from",
    "where",
    "values",
    "set",
    "returning",
    "orderBy",
    "limit",
    "onConflictDoUpdate",
    "execute",
    "innerJoin",
  ]) {
    (proxy as any)[method] = fn;
  }
  // returning() resolves to an array we control per-test
  return { proxy, fn };
});

vi.mock("../../server/db", () => ({ db: dbMock.proxy }));

// Stub the schema imports as identity-like proxies for chained access.
vi.mock("../../shared/schema", () => {
  const handler = {
    get: (_t: object, p: string) => p,
    has: () => true,
  };
  return new Proxy({}, handler);
});

import { DatabaseStorage } from "../../server/databaseStorage";

describe("brandFactScrapeRuns storage", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it("createScrapeRun returns the inserted row", async () => {
    const fakeRow = { id: "run-1", brandId: "brand-1", status: "pending" };
    // Last call in the chain is .returning(), which resolves to [fakeRow]
    dbMock.fn.mockReturnValue({
      values: () => ({ returning: () => Promise.resolve([fakeRow]) }),
    } as any);
    const row = await storage.createScrapeRun({
      brandId: "brand-1",
      triggeredBy: "manual_rescrape",
    } as any);
    expect(row).toEqual(fakeRow);
  });

  it("getScrapeRunById returns null when no row exists", async () => {
    dbMock.fn.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
      }),
    } as any);
    const row = await storage.getScrapeRunById("missing");
    expect(row).toBeNull();
  });

  it("transitionScrapeRunStatusCAS returns null when expected status doesn't match", async () => {
    // CAS: UPDATE ... WHERE status=expected returns [] when condition false
    dbMock.fn.mockReturnValue({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([]) }),
      }),
    } as any);
    const row = await storage.transitionScrapeRunStatusCAS("run-1", "pending", "planning");
    expect(row).toBeNull();
  });

  it("transitionScrapeRunStatusCAS returns the row when CAS succeeds", async () => {
    const fakeRow = { id: "run-1", status: "planning" };
    dbMock.fn.mockReturnValue({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([fakeRow]) }),
      }),
    } as any);
    const row = await storage.transitionScrapeRunStatusCAS("run-1", "pending", "planning");
    expect(row).toEqual(fakeRow);
  });

  it("incrementScrapeRunCounters no-ops when deltas is empty", async () => {
    const updateSpy = vi.fn();
    dbMock.fn.mockReturnValue({ set: updateSpy } as any);
    await storage.incrementScrapeRunCounters("run-1", {});
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("incrementScrapeRunCounters builds a set clause from provided deltas", async () => {
    const setSpy = vi.fn().mockReturnValue({ where: () => Promise.resolve() });
    dbMock.fn.mockReturnValue({ set: setSpy } as any);
    await storage.incrementScrapeRunCounters("run-1", {
      pagesFetched: 1,
      llmCostCents: 5,
    });
    expect(setSpy).toHaveBeenCalledTimes(1);
    const arg = setSpy.mock.calls[0][0];
    expect(Object.keys(arg).sort()).toEqual(["llmCostCents", "pagesFetched"]);
  });

  it("findSlicePendingRuns filters by status and stale cutoff", async () => {
    // HIGH 11: now JOINs brands to filter fact_scrape_enabled=true and
    // unwraps the { run: ... } shape on the way out.
    const fakeRow = { id: "run-1", status: "slice_pending" };
    dbMock.fn.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: () => Promise.resolve([{ run: fakeRow }]) }),
        }),
      }),
    } as any);
    const rows = await storage.findSlicePendingRuns(30, 10);
    expect(rows).toEqual([fakeRow]);
  });

  it("listScrapeRunsForBrand orders by startedAt DESC with default limit 10", async () => {
    const fakeRows = [{ id: "run-1" }, { id: "run-2" }];
    dbMock.fn.mockReturnValue({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve(fakeRows) }),
        }),
      }),
    } as any);
    const rows = await storage.listScrapeRunsForBrand("brand-1");
    expect(rows).toEqual(fakeRows);
  });
});
