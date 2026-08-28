import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => {
  const query = vi.fn();

  return {
    query,
  };
});

vi.mock("../../server/db", () => ({
  db: {},
  pool: { query: stubs.query },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

import { storage } from "../../server/storage";
import { dynamicLockNamespaces, withDynamicAdvisoryLock } from "../../server/lib/advisoryLock";

const releaseQuery = "delete from job_leases where lease_key = $1 and holder_token = $2";

beforeEach(() => {
  stubs.query.mockReset();
});

describe("full fact-scrape lease", () => {
  it("uses atomic lease queries for full fact-scrape acquisition and release", async () => {
    stubs.query
      .mockResolvedValueOnce({ rows: [{ holder_token: "holder" }] })
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
    expect(stubs.query).toHaveBeenCalledTimes(2);
    expect(stubs.query.mock.calls[0]?.[0]).toMatch(/insert into job_leases/i);
    expect(stubs.query.mock.calls[0]?.[0]).toMatch(/on conflict \(lease_key\) do update/i);
    expect(stubs.query).toHaveBeenNthCalledWith(2, releaseQuery, [
      expect.stringMatching(/^job-lease:dynamic:920002:/),
      expect.any(String),
    ]);
    expect(stubs.query.mock.calls[1]?.[1]).toEqual([
      stubs.query.mock.calls[0]?.[1]?.[0],
      stubs.query.mock.calls[0]?.[1]?.[1],
    ]);
  });

  it("releases the full fact-scrape lease when the work throws", async () => {
    stubs.query
      .mockResolvedValueOnce({ rows: [{ holder_token: "holder" }] })
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

    expect(stubs.query).toHaveBeenNthCalledWith(2, releaseQuery, [
      expect.stringMatching(/^job-lease:dynamic:920002:/),
      expect.any(String),
    ]);
    expect(stubs.query.mock.calls[1]?.[1]).toEqual([
      stubs.query.mock.calls[0]?.[1]?.[0],
      stubs.query.mock.calls[0]?.[1]?.[1],
    ]);
  });

  it("does not expose unpinned fact-scrape locks from storage", () => {
    expect("tryAcquireScrapeLock" in storage).toBe(false);
    expect("releaseScrapeLock" in storage).toBe(false);
  });
});
