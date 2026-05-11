// Plan 5 Task 1: geo_signal_runs storage methods.
//
// Verifies the storage contract that powers the `lastSignalsScanAt` input
// on the recommendations engine (rule #8 `rerun-geo-signals`):
//   1. recordGeoSignalRun inserts and returns the persisted row.
//   2. getLastGeoSignalRunAt returns null when the brand has no runs.
//   3. getLastGeoSignalRunAt returns the most recent ranAt for the brand.
//
// Mocking pattern mirrors tests/unit/articlesAIGenerated.test.ts — wrap
// db with a Drizzle-chain proxy that captures .values()/.where() so we
// can assert on payload + steer the returned rows.

import { describe, it, expect, vi, beforeEach } from "vitest";

const stubs = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  capturedValues: null as Record<string, unknown> | null,
  selectRows: [] as unknown[],
  insertRows: [] as unknown[],
}));

vi.mock("../../server/db", () => ({
  db: {
    insert: stubs.insert,
    update: vi.fn(),
    select: stubs.select,
    delete: vi.fn(),
    execute: vi.fn(),
  },
  pool: {},
}));

vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), flush: vi.fn(async () => true) },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { DatabaseStorage } from "../../server/databaseStorage";

function drizzleChain(rows: unknown[]) {
  function fn(..._args: unknown[]) {
    return thenable;
  }
  const thenable: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(rows);
        }
        if (prop === "catch" || prop === "finally") {
          return Promise.resolve(rows)[prop as "catch" | "finally"].bind(Promise.resolve(rows));
        }
        if (prop === "values") {
          return (payload: Record<string, unknown>) => {
            stubs.capturedValues = payload;
            return thenable;
          };
        }
        return fn;
      },
    },
  );
  return thenable;
}

let storage: DatabaseStorage;

beforeEach(() => {
  storage = new DatabaseStorage();
  stubs.capturedValues = null;
  stubs.selectRows = [];
  stubs.insertRows = [];
  vi.clearAllMocks();
});

describe("recordGeoSignalRun", () => {
  it("inserts and returns a row with brand + score", async () => {
    const persisted = {
      id: "run-1",
      brandId: "brand-1",
      articleId: "article-1",
      ranAt: new Date(),
      overallScore: 87,
      payload: { signals: [] },
    };
    stubs.insert.mockReturnValue(drizzleChain([persisted]));

    const result = await storage.recordGeoSignalRun({
      brandId: "brand-1",
      articleId: "article-1",
      overallScore: 87,
      payload: { signals: [] },
    });

    expect(stubs.insert).toHaveBeenCalled();
    expect(stubs.capturedValues).toMatchObject({
      brandId: "brand-1",
      articleId: "article-1",
      overallScore: 87,
    });
    expect(result.id).toBe("run-1");
    expect(result.brandId).toBe("brand-1");
    expect(result.ranAt).toBeInstanceOf(Date);
  });
});

describe("getLastGeoSignalRunAt", () => {
  it("returns null when no runs exist for the brand", async () => {
    stubs.select.mockReturnValue(drizzleChain([]));

    const result = await storage.getLastGeoSignalRunAt("brand-empty");

    expect(stubs.select).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("returns the most recent ranAt for the brand", async () => {
    // The DAO uses ORDER BY ran_at DESC LIMIT 1, so the chain only ever
    // sees the top row. Simulate the DB returning the newest of three.
    const newest = new Date("2026-05-12T10:00:00Z");
    stubs.select.mockReturnValue(drizzleChain([{ ranAt: newest }]));

    const result = await storage.getLastGeoSignalRunAt("brand-1");

    expect(stubs.select).toHaveBeenCalled();
    expect(result).toEqual(newest);
  });
});
