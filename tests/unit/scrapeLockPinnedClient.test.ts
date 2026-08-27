import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const client = { query, release };

  return {
    client,
    connect: vi.fn(),
    query,
    release,
  };
});

vi.mock("../../server/db", () => ({
  db: {},
  pool: { connect: stubs.connect },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

import { DatabaseStorage } from "../../server/databaseStorage";
import { dynamicLockNamespaces, withDynamicAdvisoryLock } from "../../server/lib/advisoryLock";

const acquireQuery = "SELECT pg_try_advisory_lock($1, $2) AS pg_try_advisory_lock";
const releaseQuery = "SELECT pg_advisory_unlock($1, $2)";

beforeEach(() => {
  stubs.connect.mockReset();
  stubs.query.mockReset();
  stubs.release.mockReset();
  stubs.connect.mockResolvedValue(stubs.client);
});

describe("full fact-scrape advisory lock", () => {
  it("uses one pinned client for full fact-scrape lock acquisition and release", async () => {
    stubs.query
      .mockResolvedValueOnce({ rows: [{ pg_try_advisory_lock: true }] })
      .mockResolvedValueOnce({ rows: [] });
    const work = vi.fn(async () => "completed");

    const result = await withDynamicAdvisoryLock(
      dynamicLockNamespaces.fullBrandScrape,
      "brand-1",
      "full-scrape:brand-1",
      work,
    );

    expect(result).toEqual({ ran: true, result: "completed" });
    expect(work).toHaveBeenCalledOnce();
    expect(stubs.connect).toHaveBeenCalledOnce();
    expect(stubs.query).toHaveBeenNthCalledWith(1, acquireQuery, [
      dynamicLockNamespaces.fullBrandScrape,
      expect.any(Number),
    ]);
    expect(stubs.query).toHaveBeenNthCalledWith(2, releaseQuery, [
      dynamicLockNamespaces.fullBrandScrape,
      expect.any(Number),
    ]);
    expect(stubs.query.mock.calls[1]?.[1]).toEqual(stubs.query.mock.calls[0]?.[1]);
    expect(stubs.release).toHaveBeenCalledOnce();
  });

  it("releases the full fact-scrape lock when the work throws", async () => {
    stubs.query
      .mockResolvedValueOnce({ rows: [{ pg_try_advisory_lock: true }] })
      .mockResolvedValueOnce({ rows: [] });
    const failure = new Error("source fetch failed");

    await expect(
      withDynamicAdvisoryLock(
        dynamicLockNamespaces.fullBrandScrape,
        "brand-1",
        "full-scrape:brand-1",
        async () => {
          throw failure;
        },
      ),
    ).rejects.toThrow(failure);

    expect(stubs.connect).toHaveBeenCalledOnce();
    expect(stubs.query).toHaveBeenNthCalledWith(2, releaseQuery, [
      dynamicLockNamespaces.fullBrandScrape,
      expect.any(Number),
    ]);
    expect(stubs.query.mock.calls[1]?.[1]).toEqual(stubs.query.mock.calls[0]?.[1]);
    expect(stubs.release).toHaveBeenCalledOnce();
  });

  it("does not expose unpinned fact-scrape locks from storage", () => {
    const storage = new DatabaseStorage();

    expect("tryAcquireScrapeLock" in storage).toBe(false);
    expect("releaseScrapeLock" in storage).toBe(false);
  });
});
