// Tests for the Mentions rebuild storage methods (Task 7).
//
// Strategy: mock `server/db` so no real DB is needed, then exercise the
// DatabaseStorage methods directly. Each test injects the mock return value
// that the underlying Drizzle/sql call would produce and asserts the method
// returns the correct shape.
//
// Drizzle ORM builds fluent chains (select().from().where().orderBy()...),
// which we simulate with a proxy that is also thenable (i.e. awaitable).
// Raw SQL paths use db.execute(), which we mock to return a pg-style result.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted stubs (available inside vi.mock factories) ─────────────────────

const stubs = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: {
    execute: stubs.execute,
    select: stubs.select,
    insert: stubs.insert,
    update: stubs.update,
    delete: stubs.delete,
  },
  pool: {},
}));

vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), flush: vi.fn(async () => true) },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Import AFTER mocks are registered.
import { DatabaseStorage } from "../../server/databaseStorage";

// ── Fluent chain helper ────────────────────────────────────────────────────
//
// Drizzle calls look like:
//   db.select(...).from(...).where(...).orderBy(...).limit(1)
//
// All of those return the same "awaitable proxy" that resolves to `rows` when
// awaited. This covers both `const [row] = await db.select(...)...` and plain
// `return db.select(...)...` patterns.

function drizzleChain(rows: unknown[]) {
  function fn(..._args: unknown[]): typeof thenable {
    return thenable;
  }
  const thenable: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => {
            resolve(rows);
          };
        }
        if (prop === "catch" || prop === "finally") {
          // Make it a real Promise for safety.
          return Promise.resolve(rows)[prop as "catch" | "finally"].bind(Promise.resolve(rows));
        }
        // Any other property access (from/where/orderBy/limit/returning/
        // groupBy/innerJoin/onConflictDoUpdate/onConflictDoNothing/set/values)
        // returns a function that returns `thenable` again.
        return fn;
      },
    },
  );
  return thenable;
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const NOW = new Date("2026-05-05T12:00:00Z");

const makeScanJob = (overrides: Record<string, unknown> = {}) => ({
  id: "job-uuid-1",
  brandId: "brand-1",
  userId: "user-1",
  trigger: "manual",
  status: "queued",
  perSource: {},
  totals: {},
  error: null,
  startedAt: null,
  completedAt: null,
  createdAt: NOW,
  ...overrides,
});

const makeMention = (overrides: Record<string, unknown> = {}) => ({
  id: "mention-1",
  brandId: "brand-1",
  platform: "reddit",
  sourceUrl: "https://reddit.com/r/saas/comments/abc123",
  sourceTitle: "Some post",
  mentionContext: "VentureCite is great",
  sentiment: "positive",
  sentimentScore: "0.90",
  engagementScore: null,
  authorUsername: null,
  isVerified: 0,
  status: "new",
  mentionedAt: null,
  discoveredAt: NOW,
  metadata: null,
  mentionLocation: "post",
  linkStatus: "unknown",
  lastVerifiedAt: null,
  matchedVariation: null,
  matchedField: null,
  source: "scanner",
  scannerVersion: 2,
  sentimentSource: "llm",
  engagementNormalized: null,
  ...overrides,
});

// ── Test setup ─────────────────────────────────────────────────────────────

let storage: DatabaseStorage;

beforeEach(() => {
  storage = new DatabaseStorage();
  vi.clearAllMocks();
});

// ── Scan jobs ──────────────────────────────────────────────────────────────

describe("createScanJob", () => {
  it("inserts a scan_job row and returns it", async () => {
    const job = makeScanJob();
    stubs.insert.mockReturnValue(drizzleChain([job]));

    const result = await storage.createScanJob({
      brandId: "brand-1",
      userId: "user-1",
      trigger: "manual",
    });

    expect(result.brandId).toBe("brand-1");
    expect(result.trigger).toBe("manual");
    expect(result.status).toBe("queued");
    expect(stubs.insert).toHaveBeenCalled();
  });
});

describe("getScanJob", () => {
  it("returns the job when found", async () => {
    stubs.select.mockReturnValue(drizzleChain([makeScanJob()]));
    const result = await storage.getScanJob("job-uuid-1");
    expect(result?.id).toBe("job-uuid-1");
  });

  it("returns undefined when not found", async () => {
    stubs.select.mockReturnValue(drizzleChain([]));
    const result = await storage.getScanJob("missing");
    expect(result).toBeUndefined();
  });
});

describe("getActiveScanJobForBrand", () => {
  it("returns queued/running job for the brand", async () => {
    stubs.select.mockReturnValue(drizzleChain([makeScanJob({ status: "running" })]));
    const result = await storage.getActiveScanJobForBrand("brand-1");
    expect(result?.status).toBe("running");
  });

  it("returns undefined when no active job exists", async () => {
    stubs.select.mockReturnValue(drizzleChain([]));
    expect(await storage.getActiveScanJobForBrand("brand-1")).toBeUndefined();
  });
});

describe("getActiveScanJobsForUser", () => {
  it("returns all active jobs for the user", async () => {
    stubs.select.mockReturnValue(
      drizzleChain([makeScanJob({ id: "j1" }), makeScanJob({ id: "j2", status: "running" })]),
    );
    const result = await storage.getActiveScanJobsForUser("user-1");
    expect(result).toHaveLength(2);
  });
});

describe("updateScanJob", () => {
  it("calls db.update and resolves void", async () => {
    stubs.update.mockReturnValue(drizzleChain([]));
    await expect(
      storage.updateScanJob("job-uuid-1", { status: "running", startedAt: NOW }),
    ).resolves.toBeUndefined();
    expect(stubs.update).toHaveBeenCalled();
  });
});

describe("pruneOldScanJobs", () => {
  it("returns row count from pg-style {rows:[...]} result", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ id: "j1" }, { id: "j2" }] });
    expect(await storage.pruneOldScanJobs(30)).toBe(2);
  });

  it("handles array-style result", async () => {
    stubs.execute.mockResolvedValue([{ id: "j1" }]);
    expect(await storage.pruneOldScanJobs(30)).toBe(1);
  });
});

describe("getMostRecentManualScanForBrand", () => {
  it("returns the most recent manual scan", async () => {
    stubs.select.mockReturnValue(drizzleChain([makeScanJob({ trigger: "manual" })]));
    const result = await storage.getMostRecentManualScanForBrand("brand-1");
    expect(result?.trigger).toBe("manual");
  });

  it("returns undefined when none found", async () => {
    stubs.select.mockReturnValue(drizzleChain([]));
    expect(await storage.getMostRecentManualScanForBrand("brand-1")).toBeUndefined();
  });
});

// ── Source health ──────────────────────────────────────────────────────────

describe("getSourceHealth", () => {
  it("returns the health record", async () => {
    const health = {
      brandId: "brand-1",
      source: "reddit",
      consecutiveFailures: 0,
      lastFailureAt: null,
      lastFailureReason: null,
      pausedUntil: null,
      lastSuccessfulScanAt: NOW,
    };
    stubs.select.mockReturnValue(drizzleChain([health]));
    const result = await storage.getSourceHealth("brand-1", "reddit");
    expect(result?.source).toBe("reddit");
    expect(result?.consecutiveFailures).toBe(0);
  });

  it("returns undefined on miss", async () => {
    stubs.select.mockReturnValue(drizzleChain([]));
    expect(await storage.getSourceHealth("brand-1", "quora")).toBeUndefined();
  });
});

describe("upsertSourceHealth", () => {
  it("calls db.insert and resolves void (conflict path upserts)", async () => {
    stubs.insert.mockReturnValue(drizzleChain([]));
    await expect(
      storage.upsertSourceHealth({
        brandId: "brand-1",
        source: "reddit",
        consecutiveFailures: 1,
        lastFailureAt: NOW,
        lastFailureReason: "rate limited",
        pausedUntil: null,
        lastSuccessfulScanAt: null,
      }),
    ).resolves.toBeUndefined();
    expect(stubs.insert).toHaveBeenCalled();
  });
});

// ── Sentiment cache ────────────────────────────────────────────────────────

describe("getCachedSentiment", () => {
  it("returns cached entry on hit", async () => {
    stubs.select.mockReturnValue(
      drizzleChain([
        { contentHash: "abc", sentiment: "positive", sentimentScore: "0.90", cachedAt: NOW },
      ]),
    );
    const result = await storage.getCachedSentiment("abc");
    expect(result?.sentiment).toBe("positive");
  });

  it("returns undefined on miss", async () => {
    stubs.select.mockReturnValue(drizzleChain([]));
    expect(await storage.getCachedSentiment("miss")).toBeUndefined();
  });
});

describe("upsertCachedSentiment", () => {
  it("calls db.insert with onConflictDoUpdate semantics", async () => {
    stubs.insert.mockReturnValue(drizzleChain([]));
    await expect(
      storage.upsertCachedSentiment({
        contentHash: "abc",
        sentiment: "neutral",
        sentimentScore: "0.50",
      }),
    ).resolves.toBeUndefined();
    expect(stubs.insert).toHaveBeenCalled();
  });
});

describe("pruneOldSentimentCache", () => {
  it("returns count from rows result", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ content_hash: "h1" }, { content_hash: "h2" }] });
    expect(await storage.pruneOldSentimentCache(90)).toBe(2);
  });
});

// ── Sentiment cap counter ──────────────────────────────────────────────────

describe("countSentimentCallsForBrandSince", () => {
  it("returns the aggregated count", async () => {
    stubs.select.mockReturnValue(drizzleChain([{ count: 7 }]));
    expect(await storage.countSentimentCallsForBrandSince("brand-1", new Date("2026-05-01"))).toBe(
      7,
    );
  });

  it("returns 0 when no row returned", async () => {
    stubs.select.mockReturnValue(drizzleChain([]));
    expect(await storage.countSentimentCallsForBrandSince("brand-1", new Date("2026-05-01"))).toBe(
      0,
    );
  });
});

// ── Brand monitoring toggle ────────────────────────────────────────────────

describe("setBrandMonitorMentions", () => {
  it("calls db.update on the brands table", async () => {
    stubs.update.mockReturnValue(drizzleChain([]));
    await expect(storage.setBrandMonitorMentions("brand-1", true)).resolves.toBeUndefined();
    expect(stubs.update).toHaveBeenCalled();
  });
});

describe("listBrandsWithMentionMonitoring", () => {
  it("returns id+userId pairs for opted-in brands", async () => {
    stubs.select.mockReturnValue(
      drizzleChain([
        { id: "brand-1", userId: "user-1" },
        { id: "brand-2", userId: "user-2" },
      ]),
    );
    const result = await storage.listBrandsWithMentionMonitoring();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "brand-1", userId: "user-1" });
  });

  it("returns empty array when none opted in", async () => {
    stubs.select.mockReturnValue(drizzleChain([]));
    expect(await storage.listBrandsWithMentionMonitoring()).toHaveLength(0);
  });
});

// ── Mention helpers ────────────────────────────────────────────────────────

describe("getBrandMention", () => {
  it("returns a single mention by id", async () => {
    stubs.select.mockReturnValue(drizzleChain([makeMention()]));
    const result = await storage.getBrandMention("mention-1");
    expect(result?.id).toBe("mention-1");
  });

  it("returns undefined when not found", async () => {
    stubs.select.mockReturnValue(drizzleChain([]));
    expect(await storage.getBrandMention("gone")).toBeUndefined();
  });
});

describe("deleteManyBrandMentions", () => {
  it("returns 0 and skips db call for empty array", async () => {
    expect(await storage.deleteManyBrandMentions([])).toBe(0);
    expect(stubs.delete).not.toHaveBeenCalled();
  });

  it("returns count of deleted rows", async () => {
    stubs.delete.mockReturnValue(drizzleChain([{ id: "m1" }, { id: "m2" }]));
    expect(await storage.deleteManyBrandMentions(["m1", "m2"])).toBe(2);
  });
});

describe("deleteAllMentionsForBrand", () => {
  it("returns count of rows deleted", async () => {
    stubs.delete.mockReturnValue(drizzleChain([{ id: "m1" }]));
    expect(await storage.deleteAllMentionsForBrand("brand-1")).toBe(1);
  });
});

describe("getOwnedMentionIds", () => {
  it("returns empty array for empty input without hitting db", async () => {
    expect(await storage.getOwnedMentionIds([], "user-1")).toEqual([]);
    expect(stubs.select).not.toHaveBeenCalled();
  });

  it("returns ids belonging to the user", async () => {
    stubs.select.mockReturnValue(drizzleChain([{ id: "m1" }]));
    const result = await storage.getOwnedMentionIds(["m1", "m2"], "user-1");
    expect(result).toEqual(["m1"]);
  });
});

describe("updateBrandMentionStatus", () => {
  it("calls db.update with the new status", async () => {
    stubs.update.mockReturnValue(drizzleChain([]));
    await expect(
      storage.updateBrandMentionStatus("mention-1", "acknowledged"),
    ).resolves.toBeUndefined();
    expect(stubs.update).toHaveBeenCalled();
  });
});

describe("getMentionStatsForBrand", () => {
  it("returns zeroed stats when no mentions exist", async () => {
    stubs.select.mockReturnValue(
      drizzleChain([{ total: 0, positive: 0, neutral: 0, negative: 0 }]),
    );
    const result = await storage.getMentionStatsForBrand("brand-1");
    expect(result.total).toBe(0);
    expect(result.bySentiment).toEqual({ positive: 0, neutral: 0, negative: 0 });
    expect(result.byPlatform).toEqual({});
    expect(result.byStatus).toEqual({});
  });

  it("maps platform and status breakdown correctly", async () => {
    let call = 0;
    stubs.select.mockImplementation(() => {
      call++;
      if (call === 1) return drizzleChain([{ total: 5, positive: 3, neutral: 1, negative: 1 }]);
      if (call === 2)
        return drizzleChain([
          { platform: "reddit", count: 4 },
          { platform: "hackernews", count: 1 },
        ]);
      return drizzleChain([
        { status: "new", count: 3 },
        { status: "acknowledged", count: 2 },
      ]);
    });

    const result = await storage.getMentionStatsForBrand("brand-1");
    expect(result.total).toBe(5);
    expect(result.bySentiment.positive).toBe(3);
    expect(result.byPlatform.reddit).toBe(4);
    expect(result.byPlatform.hackernews).toBe(1);
    expect(result.byStatus.new).toBe(3);
    expect(result.byStatus.acknowledged).toBe(2);
  });
});

// ── listMentionsForBrand (keyset pagination) ───────────────────────────────

describe("listMentionsForBrand", () => {
  it("returns rows and null nextCursor when results < limit", async () => {
    const mentions = [makeMention({ id: "m1" }), makeMention({ id: "m2" })];
    stubs.execute.mockResolvedValue({ rows: mentions });

    const result = await storage.listMentionsForBrand("brand-1", { limit: 25 });
    expect(result.rows).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it("returns nextCursor pointing to last row when results == limit+1", async () => {
    // limit=2 → fetch limit+1=3, slice to 2, cursor = last kept row
    const mentions = [
      makeMention({ id: "m1", discoveredAt: new Date("2026-05-05T12:00:00Z") }),
      makeMention({ id: "m2", discoveredAt: new Date("2026-05-04T12:00:00Z") }),
      makeMention({ id: "m3", discoveredAt: new Date("2026-05-03T12:00:00Z") }),
    ];
    stubs.execute.mockResolvedValue({ rows: mentions });

    const result = await storage.listMentionsForBrand("brand-1", { limit: 2 });
    expect(result.rows).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
    expect(result.nextCursor?.id).toBe("m2");
  });

  it("applies status/platform/sentiment filters (execute called)", async () => {
    stubs.execute.mockResolvedValue({ rows: [] });
    await storage.listMentionsForBrand("brand-1", {
      status: "new",
      platform: "reddit",
      sentiment: "positive",
    });
    expect(stubs.execute).toHaveBeenCalled();
  });

  it("handles sort=oldest", async () => {
    stubs.execute.mockResolvedValue({ rows: [] });
    await storage.listMentionsForBrand("brand-1", { sort: "oldest" });
    expect(stubs.execute).toHaveBeenCalled();
  });

  it("handles sort=engagement", async () => {
    stubs.execute.mockResolvedValue({ rows: [] });
    await storage.listMentionsForBrand("brand-1", { sort: "engagement" });
    expect(stubs.execute).toHaveBeenCalled();
  });

  it("accepts cursor for keyset pagination (newest)", async () => {
    stubs.execute.mockResolvedValue({ rows: [] });
    await storage.listMentionsForBrand("brand-1", {
      cursor: { discoveredAt: new Date("2026-05-05T10:00:00Z"), id: "m5" },
    });
    expect(stubs.execute).toHaveBeenCalled();
  });

  it("supports free-text q filter", async () => {
    stubs.execute.mockResolvedValue({ rows: [] });
    await storage.listMentionsForBrand("brand-1", { q: "VentureCite" });
    expect(stubs.execute).toHaveBeenCalled();
  });

  it("caps limit at 100", async () => {
    stubs.execute.mockResolvedValue({ rows: [] });
    // Should not throw even with an oversized limit
    await storage.listMentionsForBrand("brand-1", { limit: 9999 });
    expect(stubs.execute).toHaveBeenCalled();
  });
});
