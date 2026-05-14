import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => {
  const proxy: Record<string, unknown> = {};
  const executeSpy = vi.fn();
  (proxy as any).execute = executeSpy;
  return { proxy, executeSpy };
});

vi.mock("../../server/db", () => ({ db: dbMock.proxy }));
vi.mock("../../shared/schema", () => new Proxy({}, { get: (_t, p) => p, has: () => true }));

import { DatabaseStorage } from "../../server/databaseStorage";

describe("scrape advisory lock", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  // node-postgres `db.execute()` returns a QueryResult shape `{ rows: [...] }`,
  // not a bare array. The implementation reads `result.rows?.[0]`, so the mock
  // must match that shape.
  it("tryAcquireScrapeLock returns true when pg_try_advisory_lock returns true", async () => {
    dbMock.executeSpy.mockResolvedValue({ rows: [{ got: true }] });
    const got = await storage.tryAcquireScrapeLock("brand-1");
    expect(got).toBe(true);
  });

  it("tryAcquireScrapeLock returns false when pg_try_advisory_lock returns false", async () => {
    dbMock.executeSpy.mockResolvedValue({ rows: [{ got: false }] });
    const got = await storage.tryAcquireScrapeLock("brand-1");
    expect(got).toBe(false);
  });
});
