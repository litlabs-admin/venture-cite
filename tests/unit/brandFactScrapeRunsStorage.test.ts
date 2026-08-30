import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// Hoisted db mock - chain proxy returning thenable for all Drizzle ops.
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

// The schema module is NOT mocked here: it exports real Drizzle pgTable
// column objects. That is what lets the tests below render the actual
// `where`/`orderBy`/`set` arguments to SQL text via PgDialect and assert on
// the predicate, not just on a fixture the mock was told to return.

import { storage } from "../../server/storage";

function render(fragment: SQL): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(fragment);
  return { sql: query.sql, params: query.params };
}

describe("brandFactScrapeRuns storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const whereSpy = vi.fn().mockReturnValue({ returning: () => Promise.resolve([]) });
    const setSpy = vi.fn().mockReturnValue({ where: whereSpy });
    dbMock.fn.mockReturnValue({ set: setSpy } as any);
    const row = await storage.transitionScrapeRunStatusCAS("run-1", "pending", "planning");
    expect(row).toBeNull();

    // The predicate must compare BOTH the run id and the caller-supplied
    // expected status. Without the status equality, the "compare" half of
    // compare-and-swap does not exist: any run matching only the id would
    // be transitioned regardless of its current status.
    const { sql, params } = render(whereSpy.mock.calls[0]?.[0] as SQL);
    expect(sql).toContain('"brand_fact_scrape_runs"."id" =');
    expect(sql).toContain('"brand_fact_scrape_runs"."status" =');
    expect(params).toEqual(["run-1", "pending"]);
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ status: "planning" }));
  });

  it("transitionScrapeRunStatusCAS returns the row when CAS succeeds", async () => {
    const fakeRow = { id: "run-1", status: "planning" };
    const whereSpy = vi.fn().mockReturnValue({ returning: () => Promise.resolve([fakeRow]) });
    const setSpy = vi.fn().mockReturnValue({ where: whereSpy });
    dbMock.fn.mockReturnValue({ set: setSpy } as any);
    const row = await storage.transitionScrapeRunStatusCAS("run-1", "pending", "planning");
    expect(row).toEqual(fakeRow);

    const { sql, params } = render(whereSpy.mock.calls[0]?.[0] as SQL);
    expect(sql).toContain('"brand_fact_scrape_runs"."status" =');
    expect(params).toEqual(["run-1", "pending"]);
  });

  it("incrementScrapeRunCounters no-ops when deltas is empty", async () => {
    const updateSpy = vi.fn();
    dbMock.fn.mockReturnValue({ set: updateSpy } as any);
    await storage.incrementScrapeRunCounters("run-1", {});
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("incrementScrapeRunCounters builds a set clause from provided deltas", async () => {
    const whereSpy = vi.fn().mockReturnValue(Promise.resolve());
    const setSpy = vi.fn().mockReturnValue({ where: whereSpy });
    dbMock.fn.mockReturnValue({ set: setSpy } as any);
    await storage.incrementScrapeRunCounters("run-1", {
      pagesFetched: 1,
      llmCostCents: 5,
    });
    expect(setSpy).toHaveBeenCalledTimes(1);
    const arg = setSpy.mock.calls[0][0];
    expect(Object.keys(arg).sort()).toEqual(["llmCostCents", "pagesFetched"]);

    // The values above must be increment *expressions* (col + delta), not
    // literal replacements. A regression that swaps `sql\`col + delta\`` for
    // a bare `delta` would still satisfy the key-only assertion above.
    const pagesFetched = render(arg.pagesFetched as SQL);
    expect(pagesFetched.sql).toContain('"brand_fact_scrape_runs"."pages_fetched" +');
    expect(pagesFetched.params).toEqual([1]);
    const llmCostCents = render(arg.llmCostCents as SQL);
    expect(llmCostCents.sql).toContain('"brand_fact_scrape_runs"."llm_cost_cents" +');
    expect(llmCostCents.params).toEqual([5]);

    // And the update must be scoped to this run.
    const { sql, params } = render(whereSpy.mock.calls[0]?.[0] as SQL);
    expect(sql).toContain('"brand_fact_scrape_runs"."id" =');
    expect(params).toEqual(["run-1"]);
  });

  it("findSlicePendingRuns filters by status and stale cutoff", async () => {
    // HIGH 11: now JOINs brands to filter fact_scrape_enabled=true and
    // unwraps the { run: ... } shape on the way out.
    const fakeRow = { id: "run-1", status: "slice_pending" };
    const limitSpy = vi.fn().mockResolvedValue([{ run: fakeRow }]);
    const whereSpy = vi.fn().mockReturnValue({ limit: limitSpy });
    const innerJoinSpy = vi.fn().mockReturnValue({ where: whereSpy });
    dbMock.fn.mockReturnValue({ from: () => ({ innerJoin: innerJoinSpy }) } as any);
    const rows = await storage.findSlicePendingRuns(30, 10);
    expect(rows).toEqual([fakeRow]);

    // The join must be against brands (to reach fact_scrape_enabled), and
    // the predicate must require BOTH a matching status and a stale cutoff
    // on lastAdvanceAt/startedAt, plus the brand's fact_scrape_enabled flag.
    // Dropping any one of those and this test must fail.
    const joinCondition = render(innerJoinSpy.mock.calls[0]?.[1] as SQL);
    expect(joinCondition.sql).toContain('"brand_fact_scrape_runs"."brand_id"');
    expect(joinCondition.sql).toContain('"brands"."id"');

    const { sql, params } = render(whereSpy.mock.calls[0]?.[0] as SQL);
    expect(sql).toContain('"brand_fact_scrape_runs"."status" =');
    expect(sql).toContain('"brand_fact_scrape_runs"."last_advance_at" <');
    expect(sql).toContain('"brand_fact_scrape_runs"."started_at" <');
    expect(sql).toContain('"brands"."fact_scrape_enabled" =');
    expect(params).toContain("slice_pending");
    expect(params).toContain("pending");
    expect(params).toContain(true);

    expect(limitSpy).toHaveBeenCalledWith(10);
  });

  it("listScrapeRunsForBrand orders by startedAt DESC with default limit 10", async () => {
    const fakeRows = [{ id: "run-1" }, { id: "run-2" }];
    const limitSpy = vi.fn().mockResolvedValue(fakeRows);
    const orderBySpy = vi.fn().mockReturnValue({ limit: limitSpy });
    const whereSpy = vi.fn().mockReturnValue({ orderBy: orderBySpy });
    dbMock.fn.mockReturnValue({ from: () => ({ where: whereSpy }) } as any);
    const rows = await storage.listScrapeRunsForBrand("brand-1");
    expect(rows).toEqual(fakeRows);

    const { sql, params } = render(whereSpy.mock.calls[0]?.[0] as SQL);
    expect(sql).toContain('"brand_fact_scrape_runs"."brand_id" =');
    expect(params).toEqual(["brand-1"]);

    const orderQuery = render(orderBySpy.mock.calls[0]?.[0] as SQL);
    expect(orderQuery.sql).toBe('"brand_fact_scrape_runs"."started_at" desc');

    expect(limitSpy).toHaveBeenCalledWith(10);
  });
});
