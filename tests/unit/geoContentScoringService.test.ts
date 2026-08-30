// Direct, no-HTTP tests for server/services/geoContentScoring.ts.
//
// HTTP-level behavior for POST /api/geo-signals/analyze and
// /chunk-analysis is covered by tests/unit/geoSignalsAnalyzePersistence.test.ts;
// this file proves the extracted computeSignals/computeChunks functions
// themselves work when called directly. Only the OpenAI-backed embedBatch
// is stubbed - every other scoring helper (detectHeadings, detectBylines,
// detectCitations, detectFactualClaims, countContentWords,
// stopwordFilterQuery, bucketize, cosineSimilarity) runs for real, so this
// exercises the genuine scoring logic end to end.

import { describe, it, expect, vi } from "vitest";

// geoSignalsScoring.ts imports `openai` from routesShared, which pulls in
// db.ts (requires DATABASE_URL). Stub both so vi.importActual below can
// load the real scoring helpers without a database.
vi.mock("../../server/lib/routesShared", async () => {
  const { asyncHandler } = await import("../../server/lib/asyncHandler");
  return {
    asyncHandler,
    openai: { embeddings: { create: vi.fn() }, chat: { completions: { create: vi.fn() } } },
    MAX_CONTENT_LENGTH: 40_000,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    sendError: vi.fn(),
    safeParseJson: vi.fn(),
  };
});
vi.mock("../../server/db", () => ({ db: {}, pool: {} }));

vi.mock("../../server/lib/geoSignalsScoring", async () => {
  const actual = await vi.importActual<typeof import("../../server/lib/geoSignalsScoring")>(
    "../../server/lib/geoSignalsScoring",
  );
  return {
    ...actual,
    embedBatch: vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0])),
  };
});

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { computeSignals, computeChunks } = await import("../../server/services/geoContentScoring");

const RICH_CONTENT = `## What is GEO?

GEO is generative engine optimization. It means making content that AI systems can cite easily.

## How does it work?

According to research, well-structured content with headings gets cited more often. Studies show that clear answers rank higher.

By Jane Doe, GEO analyst.

Visit https://example.com/research and https://another-source.com/study for more.
`.repeat(1);

describe("computeSignals", () => {
  it("scores rich, well-structured content higher than thin content", async () => {
    const rich = await computeSignals(RICH_CONTENT, "what is GEO");
    const thin = await computeSignals("Too short.", "what is GEO");

    expect(rich.overallScore).toBeGreaterThan(thin.overallScore);
    expect(rich.wordCount).toBeGreaterThan(thin.wordCount);
    expect(rich.signals).toHaveLength(7);
    expect(rich.signals.map((s) => s.signal)).toEqual([
      "Content Depth",
      "Semantic Similarity",
      "Query-Term Coverage",
      "Exact-Phrase Match",
      "Structure Extractability",
      "Authority Signals",
      "Freshness",
    ]);
  });

  it("drops Freshness from the denominator when no articleUpdatedAt is given", async () => {
    const result = await computeSignals(RICH_CONTENT, "what is GEO");
    const freshness = result.signals.find((s) => s.signal === "Freshness")!;
    expect(freshness.maxScore).toBe(0);
  });

  it("scores Freshness as excellent for a recent timestamp", async () => {
    const result = await computeSignals(RICH_CONTENT, "what is GEO", new Date().toISOString());
    const freshness = result.signals.find((s) => s.signal === "Freshness")!;
    expect(freshness.maxScore).toBe(10);
    expect(freshness.status).toBe("excellent");
  });

  it("credits schema completeness into Authority when provided", async () => {
    const withoutSchema = await computeSignals(RICH_CONTENT, "what is GEO");
    const withSchema = await computeSignals(RICH_CONTENT, "what is GEO", undefined, 1);
    const authorityWithout = withoutSchema.signals.find((s) => s.signal === "Authority Signals")!;
    const authorityWith = withSchema.signals.find((s) => s.signal === "Authority Signals")!;
    expect(authorityWith.maxScore).toBe(15);
    expect(authorityWithout.maxScore).toBe(11);
    expect(authorityWith.score).toBeGreaterThanOrEqual(authorityWithout.score);
  });

  it("computes term coverage ratio against stopword-filtered query terms", async () => {
    const result = await computeSignals("This mentions apples and oranges.", "apples oranges");
    expect(result.termCoverageRatio).toBe(1);
  });
});

describe("computeChunks", () => {
  it("returns empty stats for empty content", () => {
    const { chunks, stats } = computeChunks("");
    expect(chunks).toEqual([]);
    expect(stats).toEqual({ totalChunks: 0, extractableChunks: 0, avgTokens: 0 });
  });

  it("marks a heading + direct-answer chunk under the token limit as extractable", () => {
    const content = `## What is GEO?\n\nGEO is generative engine optimization and it helps content get cited by AI systems more reliably.`;
    const { chunks, stats } = computeChunks(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].hasHeading).toBe(true);
    expect(chunks[0].hasDirectAnswer).toBe(true);
    expect(chunks[0].extractable).toBe(true);
    expect(stats.extractableChunks).toBe(1);
  });

  it("flags a chunk with no heading as not extractable and records the issue", () => {
    const content = `Just a plain paragraph with no heading structure at all, going on for a while.`;
    const { chunks } = computeChunks(content);
    expect(chunks[0].hasHeading).toBe(false);
    expect(chunks[0].extractable).toBe(false);
    expect(chunks[0].issues).toContain("No heading structure detected");
  });

  it("splits long content into multiple chunks once a paragraph run exceeds ~375 words", () => {
    const bigPara = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    const content = `## First\n\n${bigPara}\n\n## Second\n\nShort answer here that is long enough to read as direct.`;
    const { chunks } = computeChunks(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});
