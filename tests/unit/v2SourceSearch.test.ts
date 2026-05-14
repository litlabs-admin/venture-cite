import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/llmConcurrency", () => ({
  withSlot: vi.fn(async (_p: string, _r: string | undefined, fn: () => Promise<unknown>) => fn()),
  PROVIDER_LIMITS: { openai: 20, anthropic: 20, perplexity: 10, gemini: 30 },
}));

const mockCreate = vi.fn();
vi.mock("../../server/lib/factAgent/v2/openrouterClient", () => ({
  getOpenrouterClient: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getFactScrapeCache: vi.fn(),
    upsertFactScrapeCache: vi.fn(),
  },
}));

import { storage } from "../../server/storage";
import { getOpenrouterClient } from "../../server/lib/factAgent/v2/openrouterClient";
import { runSearchSource } from "../../server/lib/factAgent/v2/sourceSearch";

const baseArgs = {
  brandId: "brand-1",
  brandUrl: "https://example.com",
  brandName: "Example",
  industry: "saas" as string | null,
  runId: "run-1",
};

describe("runSearchSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getFactScrapeCache).mockResolvedValue(null);
    vi.mocked(getOpenrouterClient).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as never);
  });

  it("returns cache hit without calling OpenRouter", async () => {
    vi.mocked(storage.getFactScrapeCache).mockResolvedValue({
      cacheKey: "x",
      valueJson: {
        facts: [
          {
            domain: "identity",
            subcategory: "x",
            factKey: "y",
            factValue: "z",
            valueType: "string",
            confidence: 0.9,
            sourceExcerpt: "",
            sourceUrl: "https://example.com/about",
          },
        ],
      },
      expiresAt: new Date(Date.now() + 1000),
    });
    const out = await runSearchSource(baseArgs);
    expect(out.status).toBe("done");
    expect(out.facts).toHaveLength(1);
    expect(out.diagnostics.cacheHit).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("calls Perplexity via OpenRouter on cache miss, drops off-allowlist facts", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              facts: [
                {
                  domain: "identity",
                  subcategory: "x",
                  factKey: "real",
                  factValue: "v",
                  valueType: "string",
                  confidence: 0.9,
                  sourceExcerpt: "",
                  sourceUrl: "https://example.com/about",
                },
                {
                  domain: "identity",
                  subcategory: "x",
                  factKey: "fake",
                  factValue: "v",
                  valueType: "string",
                  confidence: 0.9,
                  sourceExcerpt: "",
                  sourceUrl: "https://wikipedia.org/wiki/Example",
                },
              ],
            }),
          },
        },
      ],
    });
    const out = await runSearchSource(baseArgs);
    expect(out.status).toBe("done");
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0].factKey).toBe("real");
    expect(out.diagnostics.cacheHit).toBe(false);
    expect(storage.upsertFactScrapeCache).toHaveBeenCalled();
  });

  it("caps social-allowlist facts at confidence 0.5", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              facts: [
                {
                  domain: "team",
                  subcategory: "founders",
                  factKey: "ceo",
                  factValue: "Alice",
                  valueType: "string",
                  confidence: 0.95,
                  sourceExcerpt: "",
                  sourceUrl: "https://www.linkedin.com/company/example",
                },
              ],
            }),
          },
        },
      ],
    });
    const out = await runSearchSource(baseArgs);
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0].confidence).toBe(0.5);
  });

  it("returns done with empty facts and short TTL on no-grounded-results", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ facts: [] }) } }],
    });
    const out = await runSearchSource(baseArgs);
    expect(out.status).toBe("done");
    expect(out.facts).toEqual([]);
    const call = vi.mocked(storage.upsertFactScrapeCache).mock.calls[0][0];
    expect(call.expiresAt.getTime()).toBeLessThan(Date.now() + 2 * 60 * 60 * 1000);
  });

  it("returns status=failed on OpenRouter provider error (no cache write)", async () => {
    mockCreate.mockRejectedValueOnce(
      Object.assign(new Error("Service unavailable"), { status: 503 }),
    );
    const out = await runSearchSource(baseArgs);
    expect(out.status).toBe("failed");
    expect(out.errorKind).toBe("llm_unavailable");
    expect(storage.upsertFactScrapeCache).not.toHaveBeenCalled();
  });

  it("returns status=skipped when OPENROUTER client is unavailable", async () => {
    vi.mocked(getOpenrouterClient).mockReturnValueOnce(null);
    const out = await runSearchSource(baseArgs);
    expect(out.status).toBe("skipped");
    expect(out.errorKind).toBe("provider_unconfigured");
  });
});
