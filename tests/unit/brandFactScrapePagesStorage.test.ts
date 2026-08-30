import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

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
    "orderBy",
    "limit",
  ]) {
    (proxy as any)[method] = fn;
  }
  return { proxy, fn };
});

vi.mock("../../server/db", () => ({ db: dbMock.proxy }));
// The schema module is NOT mocked: it exports real Drizzle pgTable column
// objects, so `where`/`orderBy` arguments captured below can be rendered to
// SQL text via PgDialect and asserted on directly instead of on a fixture.

import { storage } from "../../server/storage";

function render(fragment: SQL): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(fragment);
  return { sql: query.sql, params: query.params };
}

describe("brandFactScrapePages storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createScrapePage returns the inserted row", async () => {
    const fakeRow = { id: "page-1", runId: "run-1", url: "https://x.com/about" };
    dbMock.fn.mockReturnValue({
      values: () => ({ returning: () => Promise.resolve([fakeRow]) }),
    } as any);
    const row = await storage.createScrapePage({
      runId: "run-1",
      url: "https://x.com/about",
      canonicalUrl: "https://x.com/about",
    } as any);
    expect(row).toEqual(fakeRow);
  });

  it("updateScrapePageStatus returns null when row missing", async () => {
    dbMock.fn.mockReturnValue({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([]) }),
      }),
    } as any);
    const row = await storage.updateScrapePageStatus("missing", "failed");
    expect(row).toBeNull();
  });

  it("updateScrapePageStatus passes through partial fields", async () => {
    const whereSpy = vi.fn().mockReturnValue({
      returning: () => Promise.resolve([{ id: "p1", status: "done" }]),
    });
    const setSpy = vi.fn().mockReturnValue({ where: whereSpy });
    dbMock.fn.mockReturnValue({ set: setSpy } as any);
    await storage.updateScrapePageStatus("p1", "done", {
      bytes: 4096,
      factCount: 5,
    });
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done", bytes: 4096, factCount: 5 }),
    );

    // The update must be scoped to this page id, not applied unconditionally.
    const { sql, params } = render(whereSpy.mock.calls[0]?.[0] as SQL);
    expect(sql).toContain('"brand_fact_scrape_pages"."id" =');
    expect(params).toEqual(["p1"]);
  });

  it("listScrapePagesForRun filters by runId and orders by id ASC", async () => {
    const fakeRows = [{ id: "p1" }, { id: "p2" }];
    const orderBySpy = vi.fn().mockResolvedValue(fakeRows);
    const whereSpy = vi.fn().mockReturnValue({ orderBy: orderBySpy });
    dbMock.fn.mockReturnValue({ from: () => ({ where: whereSpy }) } as any);
    const rows = await storage.listScrapePagesForRun("run-1");
    expect(rows).toEqual(fakeRows);

    // Must be scoped to the requested run - not to every page ever scraped.
    const { sql, params } = render(whereSpy.mock.calls[0]?.[0] as SQL);
    expect(sql).toContain('"brand_fact_scrape_pages"."run_id" =');
    expect(params).toEqual(["run-1"]);

    // And ordered ascending by id, as the test name claims.
    const orderQuery = render(orderBySpy.mock.calls[0]?.[0] as SQL);
    expect(orderQuery.sql).toBe('"brand_fact_scrape_pages"."id" asc');
  });
});
