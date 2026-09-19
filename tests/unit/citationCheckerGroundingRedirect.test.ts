// Proves the single citation-URL parse point in runPlatformCitationCheck
// (server/citationChecker.ts) resolves Gemini/OpenRouter grounding-redirect
// URLs before returning structuredCitations - the fix for the 2026-09-19
// incident where all structuredCitations from Gemini were
// vertexaisearch.cloud.google.com redirect wrappers instead of real pages.
//
// Follows the mocking pattern in tests/unit/citationChecker.matcherAuthority.test.ts:
// citationChecker imports storage/db/openai at module load, so those are
// mocked to let the import succeed without a real DB or API key.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/databaseStorage", () => ({ DatabaseStorage: class {} }));
vi.mock("../../server/citationJudge", () => ({ judgeCitation: vi.fn() }));
vi.mock("../../server/lib/aiLogger", () => ({ attachAiLogger: vi.fn() }));
vi.mock("../../server/lib/llmBudget", () => ({
  assertWithinBudget: vi.fn().mockResolvedValue(undefined),
  recordSpend: vi.fn().mockResolvedValue(undefined),
}));

const createMock = vi.fn();
vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: createMock } };
  },
}));

const resolveGroundingRedirectsMock = vi.fn();
vi.mock("../../server/lib/groundingRedirect", () => ({
  resolveGroundingRedirects: resolveGroundingRedirectsMock,
}));

beforeEach(() => {
  vi.resetModules();
  createMock.mockReset();
  resolveGroundingRedirectsMock.mockReset();
  process.env.OPENROUTER_API_KEY = "test-key";
});

describe("runPlatformCitationCheck - grounding redirect resolution", () => {
  it("passes the raw structured citations through resolveGroundingRedirects and returns its result", async () => {
    const rawRedirectUrl =
      "https://vertexaisearch.cloud.google.com/grounding-api-redirect/tokenXYZ";
    const resolvedUrl =
      "https://jiveprdigital.com/top-7-pr-agencies-for-tech-and-consumer-product-launch/";

    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: "Here are the top PR agencies for tech launches.",
            annotations: [{ url_citation: { url: rawRedirectUrl } }],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
      citations: undefined,
    });
    resolveGroundingRedirectsMock.mockResolvedValue([resolvedUrl]);

    const { runPlatformCitationCheck } = await import("../../server/citationChecker");

    const result = await runPlatformCitationCheck(
      "Gemini",
      "What are the top PR agencies for tech launches?",
      null,
      "Acme Widgets",
      [],
      undefined,
      undefined,
      { skipJudge: true },
    );

    // The resolver is the only thing standing between the raw annotation
    // URL and structuredCitations - assert it was called with the
    // unresolved redirect URL, and that its resolved output is what comes
    // back out, not the raw wrapper link.
    expect(resolveGroundingRedirectsMock).toHaveBeenCalledWith([rawRedirectUrl]);
    expect(result.structuredCitations).toEqual([resolvedUrl]);
    expect(result.structuredCitations).not.toContain(rawRedirectUrl);
  });

  it("drops a redirect URL the resolver could not resolve (expired token)", async () => {
    const rawRedirectUrl =
      "https://vertexaisearch.cloud.google.com/grounding-api-redirect/expiredToken";

    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: "Some grounded answer.",
            annotations: [{ url_citation: { url: rawRedirectUrl } }],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    });
    // Resolver drops unresolvable redirects - empty array.
    resolveGroundingRedirectsMock.mockResolvedValue([]);

    const { runPlatformCitationCheck } = await import("../../server/citationChecker");

    const result = await runPlatformCitationCheck(
      "Gemini",
      "prompt",
      null,
      "Acme Widgets",
      [],
      undefined,
      undefined,
      { skipJudge: true },
    );

    expect(result.structuredCitations).toEqual([]);
  });
});
