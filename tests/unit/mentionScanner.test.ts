// Tests for server/lib/mentionScanner.ts (Task 13 — Mentions Rebuild).
//
// Strategy: vi.mock all heavy dependencies (storage, source scanners, sentiment
// batcher, source health helpers, canonical/engagement utils).  The tests exercise
// the orchestration logic (routing, aggregation, error paths) without hitting the
// network or database.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted stubs ────────────────────────────────────────────────────────────
// vi.mock factories are hoisted before top-level const declarations, so we use
// vi.hoisted() to share mutable handles with the factories.

const stubs = vi.hoisted(() => ({
  // storage
  getBrandById: vi.fn(),
  tryInsertBrandMention: vi.fn(),
  getSourceHealth: vi.fn(),
  countSentimentCallsForBrandSince: vi.fn(),
  // source scanners
  scanRedditSource: vi.fn(),
  scanHackerNewsSource: vi.fn(),
  scanQuoraSource: vi.fn(),
  // sentiment
  judgeSentimentBatch: vi.fn(),
  // source health helpers
  shouldSkipSource: vi.fn(),
  recordSourceSuccess: vi.fn(),
  recordSourceFailure: vi.fn(),
  // logger
  loggerInfo: vi.fn(),
  // sentry
  captureAndFlush: vi.fn(),
  // canonical + engagement
  canonicalizeMentionUrl: vi.fn((_, url: string) => url),
  normalizeEngagement: vi.fn(() => 42),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getBrandById: stubs.getBrandById,
    tryInsertBrandMention: stubs.tryInsertBrandMention,
    getSourceHealth: stubs.getSourceHealth,
    countSentimentCallsForBrandSince: stubs.countSentimentCallsForBrandSince,
  },
}));

vi.mock("../../server/lib/sources/redditSource", () => ({
  scanRedditSource: stubs.scanRedditSource,
}));

vi.mock("../../server/lib/sources/hackerNewsSource", () => ({
  scanHackerNewsSource: stubs.scanHackerNewsSource,
}));

vi.mock("../../server/lib/sources/quoraSource", () => ({
  scanQuoraSource: stubs.scanQuoraSource,
}));

vi.mock("../../server/lib/sentimentBatcher", () => ({
  judgeSentimentBatch: stubs.judgeSentimentBatch,
}));

vi.mock("../../server/lib/sourceHealth", () => ({
  shouldSkipSource: stubs.shouldSkipSource,
  recordSourceSuccess: stubs.recordSourceSuccess,
  recordSourceFailure: stubs.recordSourceFailure,
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: stubs.loggerInfo, warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: stubs.captureAndFlush,
}));

vi.mock("../../server/lib/canonicalUrl", () => ({
  canonicalizeMentionUrl: stubs.canonicalizeMentionUrl,
}));

vi.mock("../../server/lib/engagementScore", () => ({
  normalizeEngagement: stubs.normalizeEngagement,
}));

// Import AFTER mocks are registered.
import { scanBrandMentions } from "../../server/lib/mentionScanner";

// ── Shared helpers ────────────────────────────────────────────────────────────

const BRAND_ID = "brand-uuid-1";
const SCAN_ID = "scan-uuid-1";

const BRAND = {
  id: BRAND_ID,
  name: "LinearApp",
  nameVariations: ["Linear", "Linear App"],
};

/** A minimal valid source mention object shared across tests. */
function makeMention(platform: string, suffix = "") {
  return {
    platform,
    sourceUrl: `https://example.com/${platform}${suffix}`,
    sourceTitle: `A ${platform} title${suffix}`,
    mentionContext: `Some context about LinearApp${suffix}`,
    authorUsername: "testuser",
    mentionedAt: new Date("2026-05-01T10:00:00Z"),
    mentionLocation: "post",
    matchedVariation: "LinearApp",
    matchedField: "title",
    engagementInputs: { ups: 10, comments: 3 },
  };
}

/** Default verdict returned by judgeSentimentBatch for any key. */
function makeVerdict() {
  return {
    sentiment: "neutral" as const,
    sentimentScore: 0,
    source: "llm" as const,
  };
}

// ── beforeEach: reset all stubs to safe defaults ──────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  stubs.getBrandById.mockResolvedValue(BRAND);
  stubs.getSourceHealth.mockResolvedValue(undefined); // no health row → no sinceUnix
  stubs.countSentimentCallsForBrandSince.mockResolvedValue(0);
  stubs.tryInsertBrandMention.mockResolvedValue({ id: "row-1" }); // truthy → inserted
  stubs.shouldSkipSource.mockResolvedValue({ skip: false }); // no skip by default
  stubs.recordSourceSuccess.mockResolvedValue(undefined);
  stubs.recordSourceFailure.mockResolvedValue(undefined);
  stubs.canonicalizeMentionUrl.mockImplementation((_: string, url: string) => url);
  stubs.normalizeEngagement.mockReturnValue(42);
  // Default: each source returns one mention, no failure
  stubs.scanRedditSource.mockResolvedValue({
    mentions: [makeMention("reddit")],
    failed: undefined,
  });
  stubs.scanHackerNewsSource.mockResolvedValue({
    mentions: [makeMention("hackernews")],
    failed: undefined,
  });
  stubs.scanQuoraSource.mockResolvedValue({ mentions: [makeMention("quora")], failed: undefined });
  // Default: judgeSentimentBatch returns neutral verdicts for all keys present
  stubs.judgeSentimentBatch.mockImplementation((_brandName: string, inputs: { key: string }[]) => {
    const out: Record<string, ReturnType<typeof makeVerdict>> = {};
    for (const inp of inputs) out[inp.key] = makeVerdict();
    return Promise.resolve(out);
  });
});

// ── Test 1: empty variations → zero report, log skipped ──────────────────────

describe("empty variations", () => {
  it("returns all-zero report and logs scan.skipped.no_variations", async () => {
    stubs.getBrandById.mockResolvedValue({ ...BRAND, name: "", nameVariations: [] });

    const report = await scanBrandMentions(BRAND_ID, SCAN_ID);

    expect(report.totals).toEqual({ found: 0, inserted: 0, duplicates: 0, failedSources: 0 });
    expect(report.perSource.reddit).toEqual({
      found: 0,
      inserted: 0,
      duplicates: 0,
      failed: false,
    });
    expect(report.perSource.hackernews).toEqual({
      found: 0,
      inserted: 0,
      duplicates: 0,
      failed: false,
    });
    expect(report.perSource.quora).toEqual({ found: 0, inserted: 0, duplicates: 0, failed: false });

    expect(stubs.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: BRAND_ID }),
      "scan.skipped.no_variations",
    );
    // Should not attempt any source scan
    expect(stubs.scanRedditSource).not.toHaveBeenCalled();
    expect(stubs.scanHackerNewsSource).not.toHaveBeenCalled();
    expect(stubs.scanQuoraSource).not.toHaveBeenCalled();
  });
});

// ── Test 2: all three sources succeed → correct totals ───────────────────────

describe("all sources succeed", () => {
  it("counts all found + inserted and populates totals", async () => {
    // Each source returns 2 mentions
    stubs.scanRedditSource.mockResolvedValue({
      mentions: [makeMention("reddit", "1"), makeMention("reddit", "2")],
    });
    stubs.scanHackerNewsSource.mockResolvedValue({
      mentions: [makeMention("hackernews", "1"), makeMention("hackernews", "2")],
    });
    stubs.scanQuoraSource.mockResolvedValue({
      mentions: [makeMention("quora", "1"), makeMention("quora", "2")],
    });
    // All 6 inserts succeed
    stubs.tryInsertBrandMention.mockResolvedValue({ id: "row" });

    const report = await scanBrandMentions(BRAND_ID, SCAN_ID);

    expect(report.perSource.reddit.found).toBe(2);
    expect(report.perSource.reddit.inserted).toBe(2);
    expect(report.perSource.reddit.duplicates).toBe(0);
    expect(report.perSource.reddit.failed).toBe(false);

    expect(report.perSource.hackernews.found).toBe(2);
    expect(report.perSource.hackernews.inserted).toBe(2);

    expect(report.perSource.quora.found).toBe(2);
    expect(report.perSource.quora.inserted).toBe(2);

    expect(report.totals).toEqual({
      found: 6,
      inserted: 6,
      duplicates: 0,
      failedSources: 0,
    });

    expect(stubs.recordSourceSuccess).toHaveBeenCalledWith(BRAND_ID, "reddit");
    expect(stubs.recordSourceSuccess).toHaveBeenCalledWith(BRAND_ID, "hackernews");
    expect(stubs.recordSourceSuccess).toHaveBeenCalledWith(BRAND_ID, "quora");

    expect(stubs.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: BRAND_ID, scanId: SCAN_ID }),
      "scan.complete",
    );
  });
});

// ── Test 3: one source fails → failed perSource, others succeed ──────────────

describe("one source fails", () => {
  it("marks hackernews as failed and records failure; reddit/quora succeed", async () => {
    stubs.scanHackerNewsSource.mockResolvedValue({
      mentions: [],
      failed: "hackernews 503",
    });

    const report = await scanBrandMentions(BRAND_ID, SCAN_ID);

    expect(report.perSource.hackernews).toEqual({
      found: 0,
      inserted: 0,
      duplicates: 0,
      failed: true,
      reason: "hackernews 503",
    });
    expect(stubs.recordSourceFailure).toHaveBeenCalledWith(
      BRAND_ID,
      "hackernews",
      "hackernews 503",
    );
    expect(stubs.recordSourceSuccess).not.toHaveBeenCalledWith(BRAND_ID, "hackernews");

    // Other sources should still succeed
    expect(report.perSource.reddit.failed).toBe(false);
    expect(report.perSource.quora.failed).toBe(false);

    expect(report.totals.failedSources).toBe(1);
  });
});

// ── Test 4: shouldSkipSource returns skip → source skipped, others run ────────

describe("shouldSkipSource gate", () => {
  it("marks reddit as paused, others still run", async () => {
    stubs.shouldSkipSource.mockImplementation((_brandId: string, source: string) => {
      if (source === "reddit") {
        return Promise.resolve({ skip: true, reason: "paused until 2026-05-06T12:00:00Z" });
      }
      return Promise.resolve({ skip: false });
    });

    const report = await scanBrandMentions(BRAND_ID, SCAN_ID);

    expect(report.perSource.reddit).toEqual({
      found: 0,
      inserted: 0,
      duplicates: 0,
      failed: true,
      reason: "paused until 2026-05-06T12:00:00Z",
    });
    expect(stubs.scanRedditSource).not.toHaveBeenCalled();

    // HN and Quora should have been scanned normally
    expect(stubs.scanHackerNewsSource).toHaveBeenCalled();
    expect(stubs.scanQuoraSource).toHaveBeenCalled();

    expect(report.totals.failedSources).toBe(1);
  });
});

// ── Test 5: tryInsertBrandMention returns null (duplicate) ────────────────────

describe("duplicate detection", () => {
  it("increments duplicates counter when tryInsertBrandMention returns null", async () => {
    stubs.scanRedditSource.mockResolvedValue({ mentions: [makeMention("reddit")] });
    stubs.scanHackerNewsSource.mockResolvedValue({ mentions: [] });
    stubs.scanQuoraSource.mockResolvedValue({ mentions: [] });
    stubs.tryInsertBrandMention.mockResolvedValue(null); // duplicate

    const report = await scanBrandMentions(BRAND_ID, SCAN_ID);

    expect(report.perSource.reddit.inserted).toBe(0);
    expect(report.perSource.reddit.duplicates).toBe(1);
    expect(report.totals.duplicates).toBe(1);
    expect(report.totals.inserted).toBe(0);
  });
});

// ── Test 6: sentiment cap — remainingBudget=0 when usage=200 ─────────────────

describe("sentiment budget cap", () => {
  it("passes remainingBudget=0 to judgeSentimentBatch when daily cap is exhausted", async () => {
    stubs.countSentimentCallsForBrandSince.mockResolvedValue(200);
    stubs.scanRedditSource.mockResolvedValue({ mentions: [makeMention("reddit")] });
    stubs.scanHackerNewsSource.mockResolvedValue({ mentions: [] });
    stubs.scanQuoraSource.mockResolvedValue({ mentions: [] });

    await scanBrandMentions(BRAND_ID, SCAN_ID);

    expect(stubs.judgeSentimentBatch).toHaveBeenCalledWith(BRAND.name, expect.any(Array), {
      remainingBudget: 0,
    });
  });

  it("passes remainingBudget=150 when 50 calls used today", async () => {
    stubs.countSentimentCallsForBrandSince.mockResolvedValue(50);
    stubs.scanRedditSource.mockResolvedValue({ mentions: [makeMention("reddit")] });
    stubs.scanHackerNewsSource.mockResolvedValue({ mentions: [] });
    stubs.scanQuoraSource.mockResolvedValue({ mentions: [] });

    await scanBrandMentions(BRAND_ID, SCAN_ID);

    expect(stubs.judgeSentimentBatch).toHaveBeenCalledWith(BRAND.name, expect.any(Array), {
      remainingBudget: 150,
    });
  });
});

// ── Test 7: brand not found → throws ─────────────────────────────────────────

describe("brand not found", () => {
  it("throws when getBrandById returns undefined", async () => {
    stubs.getBrandById.mockResolvedValue(undefined);

    await expect(scanBrandMentions(BRAND_ID)).rejects.toThrow("brand_not_found");
  });
});

// ── Test 8: insert error → captureAndFlush, scan continues ───────────────────

describe("insert error handling", () => {
  it("calls captureAndFlush and continues without propagating the error", async () => {
    stubs.scanRedditSource.mockResolvedValue({
      mentions: [makeMention("reddit", "1"), makeMention("reddit", "2")],
    });
    stubs.scanHackerNewsSource.mockResolvedValue({ mentions: [] });
    stubs.scanQuoraSource.mockResolvedValue({ mentions: [] });

    // First insert throws, second succeeds
    stubs.tryInsertBrandMention
      .mockRejectedValueOnce(new Error("DB constraint"))
      .mockResolvedValueOnce({ id: "row-2" });

    const report = await scanBrandMentions(BRAND_ID, SCAN_ID);

    expect(stubs.captureAndFlush).toHaveBeenCalledOnce();
    expect(stubs.captureAndFlush).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { source: "mention-scanner-insert" } }),
    );
    // Second insert should still count
    expect(report.perSource.reddit.inserted).toBe(1);
  });
});
