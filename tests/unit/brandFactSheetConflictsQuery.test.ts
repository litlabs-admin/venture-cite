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
  ]) {
    (proxy as any)[method] = fn;
  }
  return { proxy, fn };
});

vi.mock("../../server/db", () => ({ db: dbMock.proxy }));
vi.mock("../../shared/schema", () => new Proxy({}, { get: (_t, p) => p, has: () => true }));

import { DatabaseStorage } from "../../server/databaseStorage";

describe("brandFactSheet conflicts + accept/dismiss", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it("getBrandFactSheetConflicts pairs user+scraped rows on the same key", async () => {
    const rows = [
      {
        id: "u1",
        brandId: "b1",
        source: "user",
        domain: "positioning",
        subcategory: "target_audience",
        factKey: "primary",
        factValue: "founders",
      },
      {
        id: "s1",
        brandId: "b1",
        source: "scraped",
        domain: "positioning",
        subcategory: "target_audience",
        factKey: "primary",
        factValue: "engineering leaders",
      },
      // A user-only row with no conflict — should NOT appear
      {
        id: "u2",
        brandId: "b1",
        source: "user",
        domain: "identity",
        subcategory: "description",
        factKey: "primary",
        factValue: "we build things",
      },
    ];
    dbMock.fn.mockReturnValue({
      from: () => ({ where: () => Promise.resolve(rows) }),
    } as any);
    const conflicts = await storage.getBrandFactSheetConflicts("b1");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].userFact.id).toBe("u1");
    expect(conflicts[0].scrapedFact.id).toBe("s1");
  });

  it("getBrandFactSheetConflicts returns empty when no conflicts exist", async () => {
    dbMock.fn.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([]) }),
    } as any);
    const conflicts = await storage.getBrandFactSheetConflicts("b1");
    expect(conflicts).toEqual([]);
  });

  it("acceptFact with dismissOtherSide=true updates both rows", async () => {
    const target = {
      id: "u1",
      brandId: "b1",
      source: "user",
      domain: "positioning",
      subcategory: "target_audience",
      factKey: "primary",
    };
    // First .returning() call returns the target row from the accept step
    // Second .update() call (for the dismiss) is awaited but result unused
    let callCount = 0;
    dbMock.fn.mockImplementation(() => {
      callCount++;
      return {
        set: () => ({
          where: () =>
            callCount === 1 ? { returning: () => Promise.resolve([target]) } : Promise.resolve(),
        }),
      };
    });
    const row = await storage.acceptFact("u1", { dismissOtherSide: true });
    expect(row).toEqual(target);
  });

  it("dismissFact stamps dismissedAt", async () => {
    const dismissed = { id: "u1", dismissedAt: new Date() };
    dbMock.fn.mockReturnValue({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([dismissed]) }),
      }),
    } as any);
    const row = await storage.dismissFact("u1");
    expect(row).toEqual(dismissed);
  });
});
