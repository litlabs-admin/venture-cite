// Direct tests for server/onboardingSession/insight.ts. The OpenRouter client
// is mocked at getOpenAIClient (server/lib/factAgent/v2/openrouterClient.ts),
// the same seam server/ask/briefWebsiteDraft.ts's tests use, so no network or
// LLM call happens.
import { describe, it, expect, vi, beforeEach } from "vitest";

const openrouterStubs = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("../../server/lib/openaiClient", () => ({
  getOpenAIClient: () => ({
    chat: { completions: { create: openrouterStubs.create } },
  }),
}));

const { buildInsight } = await import("../../server/onboardingSession/insight");

const PROFILE = { name: "Acme", industry: "PR", descriptor: "", description: "", audience: "" };
const READINESS = {
  crawlers: [{ bot: "GPTBot" as const, allowed: false }],
  llmsTxt: false,
  sitemap: true,
  schemaTypes: ["Organization"],
};
const PAGE_TEXT = "Acme is the leading PR agency for disruptive technology companies worldwide.";

function chatResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

beforeEach(() => {
  openrouterStubs.create.mockReset();
});

describe("buildInsight", () => {
  it("returns the parsed insight when the quote is verbatim in pageText", async () => {
    openrouterStubs.create.mockResolvedValue(
      chatResponse(
        JSON.stringify({
          headline: "GPTBot is blocked",
          detail: "Unblock GPTBot in robots.txt so ChatGPT can index this site.",
          evidenceQuote:
            "Acme is the leading PR agency for disruptive technology companies worldwide.",
          tone: "gap",
        }),
      ),
    );

    const result = await buildInsight({
      domain: "acme.com",
      profile: PROFILE,
      readiness: READINESS,
      pageText: PAGE_TEXT,
    });

    expect(result.tone).toBe("gap");
    expect(result.evidenceQuote).toBe(
      "Acme is the leading PR agency for disruptive technology companies worldwide.",
    );
  });

  it("sets evidenceQuote to null when the model's quote is not an exact substring of pageText", async () => {
    openrouterStubs.create.mockResolvedValue(
      chatResponse(
        JSON.stringify({
          headline: "Strong positioning",
          detail: "The homepage clearly states its niche.",
          evidenceQuote: "Acme is the world's best PR agency ever",
          tone: "positive",
        }),
      ),
    );

    const result = await buildInsight({
      domain: "acme.com",
      profile: PROFILE,
      readiness: READINESS,
      pageText: PAGE_TEXT,
    });

    expect(result.evidenceQuote).toBeNull();
  });

  it("accepts an empty evidenceQuote as null (a readiness-only finding)", async () => {
    openrouterStubs.create.mockResolvedValue(
      chatResponse(
        JSON.stringify({
          headline: "No sitemap declared",
          detail: "Add a sitemap so crawlers can find every page.",
          evidenceQuote: "",
          tone: "gap",
        }),
      ),
    );

    const result = await buildInsight({
      domain: "acme.com",
      profile: PROFILE,
      readiness: { ...READINESS, sitemap: false },
      pageText: PAGE_TEXT,
    });

    expect(result.evidenceQuote).toBeNull();
  });

  it("throws when the model returns invalid JSON", async () => {
    openrouterStubs.create.mockResolvedValue(chatResponse("not json at all"));

    await expect(
      buildInsight({
        domain: "acme.com",
        profile: PROFILE,
        readiness: READINESS,
        pageText: PAGE_TEXT,
      }),
    ).rejects.toThrow();
  });

  it("throws when the model's JSON fails schema validation", async () => {
    openrouterStubs.create.mockResolvedValue(
      chatResponse(
        JSON.stringify({
          headline: "Missing tone",
          detail: "This response has an invalid tone value.",
          evidenceQuote: "",
          tone: "neutral",
        }),
      ),
    );

    await expect(
      buildInsight({
        domain: "acme.com",
        profile: PROFILE,
        readiness: READINESS,
        pageText: PAGE_TEXT,
      }),
    ).rejects.toThrow();
  });

  it("throws when the client is not configured", async () => {
    vi.resetModules();
    vi.doMock("../../server/lib/openaiClient", () => ({
      getOpenAIClient: () => null,
    }));
    const { buildInsight: buildInsightNoClient } =
      await import("../../server/onboardingSession/insight");

    await expect(
      buildInsightNoClient({
        domain: "acme.com",
        profile: PROFILE,
        readiness: READINESS,
        pageText: PAGE_TEXT,
      }),
    ).rejects.toThrow();
  });
});
