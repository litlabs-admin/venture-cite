// Direct, no-HTTP tests for server/services/geoSignals.ts.
//
// HTTP-level behavior for POST /api/geo-signals/analyze is covered by
// tests/unit/geoSignalsAnalyzePersistence.test.ts; this file proves the
// extracted analyzeGeoSignals/optimizeContentChunks/simulatePipeline
// functions work when called directly, with no Express request/response
// involved.

import { describe, it, expect, vi, beforeEach } from "vitest";

const storageStubs = vi.hoisted(() => ({
  getArticleById: vi.fn(),
  recordGeoSignalRun: vi.fn(),
}));
vi.mock("../../server/storage", () => ({ storage: { ...storageStubs } }));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("../../server/db", () => ({ db: {}, pool: {} }));

const openaiStub = vi.hoisted(() => ({
  chat: { completions: { create: vi.fn() } },
}));
vi.mock("../../server/lib/routesShared", async () => {
  const { asyncHandler } = await import("../../server/lib/asyncHandler");
  return {
    asyncHandler,
    openai: openaiStub,
    MAX_CONTENT_LENGTH: 40_000,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    sendError: vi.fn(),
    safeParseJson: vi.fn(),
  };
});

const schemaAuditStubs = vi.hoisted(() => ({
  resolveSchemaCompletenessForArticle: vi.fn(),
}));
vi.mock("../../server/services/schemaAudit", () => ({
  resolveSchemaCompletenessForArticle: schemaAuditStubs.resolveSchemaCompletenessForArticle,
}));

// Real geoSignalsScoring (minus the OpenAI-backed embedBatch) so
// computeSignals inside analyzeGeoSignals/simulatePipeline exercises real
// scoring logic, matching the approach in geoContentScoringService.test.ts.
vi.mock("../../server/lib/geoSignalsScoring", async () => {
  const actual = await vi.importActual<typeof import("../../server/lib/geoSignalsScoring")>(
    "../../server/lib/geoSignalsScoring",
  );
  return {
    ...actual,
    embedBatch: vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0])),
  };
});

const { analyzeGeoSignals, optimizeContentChunks, simulatePipeline } =
  await import("../../server/services/geoSignals");

const BRAND = {
  id: "brand-1",
  name: "Acme",
  industry: "SaaS",
  website: "https://acme.com",
} as any;

beforeEach(() => {
  storageStubs.getArticleById.mockReset();
  storageStubs.recordGeoSignalRun.mockReset();
  schemaAuditStubs.resolveSchemaCompletenessForArticle.mockReset();
  openaiStub.chat.completions.create.mockReset();
});

describe("analyzeGeoSignals", () => {
  it("computes signals and persists a run when a brand is provided", async () => {
    storageStubs.recordGeoSignalRun.mockResolvedValue({ id: "run-1" });

    const result = await analyzeGeoSignals({
      content: "## What is GEO?\n\nGEO helps content get cited by AI systems.",
      targetQuery: "what is GEO",
      brand: BRAND,
      articleId: null,
    });

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(storageStubs.recordGeoSignalRun).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: BRAND.id, articleId: null }),
    );
  });

  it("does not persist when brand is null (ad-hoc usage)", async () => {
    await analyzeGeoSignals({
      content: "Some content about GEO topics for scoring purposes here.",
      targetQuery: "GEO topics",
      brand: null,
      articleId: null,
    });

    expect(storageStubs.recordGeoSignalRun).not.toHaveBeenCalled();
  });

  it("drops articleId when it does not belong to the brand", async () => {
    storageStubs.getArticleById.mockResolvedValue({
      id: "article-1",
      brandId: "some-other-brand",
      externalUrl: "https://acme.com/post",
    });
    storageStubs.recordGeoSignalRun.mockResolvedValue({ id: "run-1" });

    await analyzeGeoSignals({
      content: "Some content about GEO topics for scoring purposes here.",
      targetQuery: "GEO topics",
      brand: BRAND,
      articleId: "article-1",
    });

    expect(storageStubs.recordGeoSignalRun).toHaveBeenCalledWith(
      expect.objectContaining({ articleId: null }),
    );
    // Because the article was dropped, its externalUrl must not be used to
    // look up schema completeness.
    expect(schemaAuditStubs.resolveSchemaCompletenessForArticle).not.toHaveBeenCalled();
  });

  it("resolves schema completeness from the matched article's externalUrl when not overridden", async () => {
    storageStubs.getArticleById.mockResolvedValue({
      id: "article-1",
      brandId: BRAND.id,
      externalUrl: "https://acme.com/post",
    });
    schemaAuditStubs.resolveSchemaCompletenessForArticle.mockResolvedValue(0.5);
    storageStubs.recordGeoSignalRun.mockResolvedValue({ id: "run-1" });

    await analyzeGeoSignals({
      content: "## What is GEO?\n\nSome content about GEO topics for scoring purposes here.",
      targetQuery: "GEO topics",
      brand: BRAND,
      articleId: "article-1",
    });

    expect(schemaAuditStubs.resolveSchemaCompletenessForArticle).toHaveBeenCalledWith(
      "https://acme.com/post",
      "article-1",
    );
  });

  it("still returns signals when persistence fails", async () => {
    storageStubs.recordGeoSignalRun.mockRejectedValue(new Error("db down"));

    const result = await analyzeGeoSignals({
      content: "Some content about GEO topics for scoring purposes here.",
      targetQuery: "GEO topics",
      brand: BRAND,
      articleId: null,
    });

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });
});

describe("optimizeContentChunks", () => {
  it("returns the model's rewritten content", async () => {
    openaiStub.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: "## Rewritten\n\nBetter structured content." } }],
    });

    const result = await optimizeContentChunks("Some raw content.", BRAND);

    expect(result).toBe("## Rewritten\n\nBetter structured content.");
    const call = openaiStub.chat.completions.create.mock.calls[0][0];
    expect(call.messages.some((m: any) => m.content?.includes("Brand: Acme"))).toBe(true);
  });

  it("returns null when the model returns an empty response", async () => {
    openaiStub.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: "   " } }],
    });

    const result = await optimizeContentChunks("Some raw content.", null);

    expect(result).toBeNull();
  });
});

describe("simulatePipeline", () => {
  it("builds four stages with the query echoed back", async () => {
    const { stages, query } = await simulatePipeline(
      "## What is GEO?\n\nGEO is generative engine optimization for AI search.",
      "what is GEO",
    );

    expect(query).toBe("what is GEO");
    expect(stages.map((s) => s.stage)).toEqual(["Prepare", "Retrieve", "Signal", "Serve"]);
    for (const stage of stages) {
      expect(["pass", "warning", "fail"]).toContain(stage.status);
    }
  });
});
