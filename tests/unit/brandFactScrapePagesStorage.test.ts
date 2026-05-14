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
    "orderBy",
    "limit",
  ]) {
    (proxy as any)[method] = fn;
  }
  return { proxy, fn };
});

vi.mock("../../server/db", () => ({ db: dbMock.proxy }));
vi.mock("../../shared/schema", () => new Proxy({}, { get: (_t, p) => p, has: () => true }));

import { DatabaseStorage } from "../../server/databaseStorage";

describe("brandFactScrapePages storage", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
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
    const setSpy = vi.fn().mockReturnValue({
      where: () => ({ returning: () => Promise.resolve([{ id: "p1", status: "done" }]) }),
    });
    dbMock.fn.mockReturnValue({ set: setSpy } as any);
    await storage.updateScrapePageStatus("p1", "done", {
      bytes: 4096,
      factCount: 5,
    });
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done", bytes: 4096, factCount: 5 }),
    );
  });

  it("listScrapePagesForRun returns rows ordered by id ASC", async () => {
    const fakeRows = [{ id: "p1" }, { id: "p2" }];
    dbMock.fn.mockReturnValue({
      from: () => ({
        where: () => ({ orderBy: () => Promise.resolve(fakeRows) }),
      }),
    } as any);
    const rows = await storage.listScrapePagesForRun("run-1");
    expect(rows).toEqual(fakeRows);
  });
});
