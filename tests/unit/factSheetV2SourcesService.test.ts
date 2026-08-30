// Direct, no-HTTP tests for server/services/factSheetV2Sources.ts (phase
// B7-16 service extraction). HTTP-level behavior is already covered by
// tests/unit/v2ScrapeOneRoute.test.ts, v2SearchLlmRoute.test.ts,
// v2UserEnrichRoute.test.ts, and v2PasteRoute.test.ts; this file proves the
// extracted pipeline-wrapper functions themselves can be called without an
// Express app, request, or response.

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const storageMock = vi.hoisted(() => ({
  updateScrapePageStatus: vi.fn(),
  incrementScrapeRunCounters: vi.fn(),
  insertFactScrapeLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../server/storage", () => ({ storage: storageMock }));

const persistFactsMock = vi.hoisted(() => vi.fn().mockResolvedValue({ inserted: 1 }));
vi.mock("../../server/lib/factAgent/persistFacts", () => ({ persistFacts: persistFactsMock }));

const persistUserFactsMock = vi.hoisted(() => vi.fn().mockResolvedValue({ inserted: 1 }));
vi.mock("../../server/lib/factAgent/v2/persistUserFacts", () => ({
  persistUserFacts: persistUserFactsMock,
}));

const persistPasteFactsMock = vi.hoisted(() => vi.fn().mockResolvedValue({ inserted: 1 }));
vi.mock("../../server/lib/factAgent/v2/persistPasteFacts", () => ({
  persistPasteFacts: persistPasteFactsMock,
}));

const runStaticSourceMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/factAgent/v2/sourceStatic", () => ({
  runStaticSource: runStaticSourceMock,
}));

const runSearchSourceMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/factAgent/v2/sourceSearch", () => ({
  runSearchSource: runSearchSourceMock,
}));

const runUserEnrichSourceMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/factAgent/v2/sourceUserEnrich", () => ({
  runUserEnrichSource: runUserEnrichSourceMock,
}));

const callWithFailoverMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/factAgent/v2/llmFailover", () => ({
  callWithFailover: callWithFailoverMock,
}));

vi.mock("../../server/lib/routesShared", async () => {
  const actual = await vi.importActual<any>("../../server/lib/routesShared");
  return {
    ...actual,
    openai: { chat: { completions: { create: vi.fn() } } },
  };
});

const brand = {
  id: "brand-1",
  name: "Acme",
  website: "https://example.com",
  industry: "saas",
  description: "We build.",
  products: ["X"],
  targetAudience: null,
  uniqueSellingPoints: null,
  keyValues: null,
  brandVoice: null,
  tone: null,
} as any;

const {
  scrapeFactSheetPage,
  searchFactSheetLlm,
  enrichFactSheetFromUser,
  extractFactSheetFromPaste,
} = await import("../../server/services/factSheetV2Sources");

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.insertFactScrapeLog.mockResolvedValue(undefined);
});

describe("scrapeFactSheetPage", () => {
  it("persists facts, updates counters, logs, and shapes the outcome", async () => {
    runStaticSourceMock.mockResolvedValue({
      status: "done",
      facts: [{ domain: "identity", subcategory: "x", factKey: "y", factValue: "z" }],
      statusCode: 200,
      bytes: 1234,
      errorKind: null,
      errorMessage: null,
      canonicalRedirect: null,
      discoveredUrls: [],
      diagnostics: { lang: "en" },
    });

    const result = await scrapeFactSheetPage({
      runId: "run-1",
      brand,
      page: { id: "page-1", url: "https://example.com/about" },
      startedAt: Date.now(),
    });

    expect(persistFactsMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ brandId: "brand-1", runId: "run-1" }),
    );
    expect(storageMock.updateScrapePageStatus).toHaveBeenCalledWith(
      "page-1",
      "done",
      expect.objectContaining({ factCount: 1 }),
    );
    expect(storageMock.incrementScrapeRunCounters).toHaveBeenCalledWith("run-1", {
      pagesFetched: 1,
      pagesFailed: 0,
      factsExtracted: 1,
    });
    expect(storageMock.insertFactScrapeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        source: "static_pages",
        status: "done",
        factCount: 1,
      }),
    );
    expect(result).toEqual({
      status: "done",
      factCount: 1,
      canonicalRedirect: null,
      discoveredUrls: [],
      diagnostics: { lang: "en" },
    });
  });

  it("skips persistFacts when there are no facts and marks the log skipped", async () => {
    runStaticSourceMock.mockResolvedValue({
      status: "skipped_canonical",
      facts: [],
      statusCode: 200,
      bytes: 100,
      errorKind: null,
      errorMessage: null,
      canonicalRedirect: "https://example.com/canonical",
      discoveredUrls: [],
      diagnostics: {},
    });

    const result = await scrapeFactSheetPage({
      runId: "run-1",
      brand,
      page: { id: "page-1", url: "https://example.com/p" },
      startedAt: Date.now(),
    });

    expect(persistFactsMock).not.toHaveBeenCalled();
    expect(storageMock.insertFactScrapeLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "skipped" }),
    );
    expect(result.canonicalRedirect).toBe("https://example.com/canonical");
  });
});

describe("searchFactSheetLlm", () => {
  it("persists facts against the brand website and logs the outcome", async () => {
    runSearchSourceMock.mockResolvedValue({
      status: "done",
      facts: [{ domain: "identity", subcategory: "x", factKey: "y", factValue: "z" }],
      errorKind: null,
      errorMessage: null,
      diagnostics: { provider: "perplexity" },
    });

    const result = await searchFactSheetLlm({ runId: "run-1", brand, startedAt: Date.now() });

    expect(persistFactsMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ brandId: "brand-1", runId: "run-1", sourceUrl: brand.website }),
    );
    expect(storageMock.insertFactScrapeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        source: "search_llm",
        status: "done",
        factCount: 1,
      }),
    );
    expect(result).toEqual({
      status: "done",
      factCount: 1,
      errorKind: null,
      diagnostics: { provider: "perplexity" },
    });
  });

  it("returns provider error info on failure without persisting", async () => {
    runSearchSourceMock.mockResolvedValue({
      status: "failed",
      facts: [],
      errorKind: "llm_unavailable",
      errorMessage: "Service unavailable",
      diagnostics: {},
    });
    const result = await searchFactSheetLlm({ runId: "run-1", brand, startedAt: Date.now() });
    expect(persistFactsMock).not.toHaveBeenCalled();
    expect(result.errorKind).toBe("llm_unavailable");
  });
});

describe("enrichFactSheetFromUser", () => {
  it("maps the brand into the source input and always calls persistUserFacts", async () => {
    runUserEnrichSourceMock.mockResolvedValue({
      status: "done",
      facts: [],
      errorKind: null,
      errorMessage: null,
      diagnostics: { usedFallback: false },
    });

    const withKeyValuesArray = { ...brand, keyValues: ["fast", "reliable"] };
    const result = await enrichFactSheetFromUser({
      runId: "run-1",
      brand: withKeyValuesArray,
      startedAt: Date.now(),
    });

    expect(runUserEnrichSourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: expect.objectContaining({ keyValues: "fast, reliable" }),
        runId: "run-1",
      }),
    );
    // Called even with 0 facts - clears stale user-source rows.
    expect(persistUserFactsMock).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ brandId: "brand-1", runId: "run-1" }),
    );
    expect(result.diagnostics).toEqual({ usedFallback: false });
  });
});

describe("extractFactSheetFromPaste", () => {
  it("extracts, tags sourceUrl with the brand website, and persists", async () => {
    callWithFailoverMock.mockResolvedValue(
      JSON.stringify({
        facts: [
          {
            domain: "identity",
            subcategory: "description",
            factKey: "tagline",
            factValue: "We build AI.",
            valueType: "string",
            confidence: 0.95,
            sourceExcerpt: "We build AI.",
          },
        ],
      }),
    );

    const result = await extractFactSheetFromPaste({
      runId: "run-1",
      brand,
      text: "About: We build AI for everyone.",
      startedAt: Date.now(),
    });

    expect(persistPasteFactsMock).toHaveBeenCalledWith(
      [expect.objectContaining({ sourceUrl: brand.website })],
      expect.objectContaining({ brandId: "brand-1", runId: "run-1" }),
    );
    expect(storageMock.insertFactScrapeLog).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", source: "paste", status: "done", factCount: 1 }),
    );
    expect(result.factCount).toBe(1);
    expect(result.status).toBe("done");
  });
});
