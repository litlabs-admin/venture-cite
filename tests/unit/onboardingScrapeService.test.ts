// Direct, no-HTTP tests for server/services/onboardingScrape.ts (B7 service
// extraction). Proves the extracted pipeline - homepage read, logo scrape,
// LLM call, thin-result sitemap fallback, outcome classification - works
// when driven directly with a plain `emit` callback instead of an SSE
// response.

import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  safeFetchText: vi.fn(),
  scrapeLogoUrl: vi.fn(),
  downloadAndStoreLogo: vi.fn(),
  extractPageContent: vi.fn(),
  extractBodyText: vi.fn(),
  getOpenrouterClient: vi.fn(),
  chatCreate: vi.fn(),
}));

vi.mock("../../server/lib/ssrf", () => ({
  safeFetchText: stubs.safeFetchText,
}));

vi.mock("../../server/lib/logoScraper", () => ({
  scrapeLogoUrl: stubs.scrapeLogoUrl,
}));

vi.mock("../../server/lib/logoStorage", () => ({
  downloadAndStoreLogo: stubs.downloadAndStoreLogo,
}));

vi.mock("../../server/lib/pageText", () => ({
  extractPageContent: stubs.extractPageContent,
  extractBodyText: stubs.extractBodyText,
}));

vi.mock("../../server/lib/factAgent/v2/openrouterClient", () => ({
  getOpenrouterClient: stubs.getOpenrouterClient,
}));

vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: { brandAutofill: "test-model" },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { runOnboardingBrandScrape } = await import("../../server/services/onboardingScrape");

function events(emit: ReturnType<typeof vi.fn>) {
  return emit.mock.calls.map((c) => c[0]);
}

beforeEach(() => {
  for (const s of Object.values(stubs)) s.mockReset();
  stubs.getOpenrouterClient.mockReturnValue({
    chat: { completions: { create: stubs.chatCreate } },
  });
});

describe("runOnboardingBrandScrape", () => {
  it("returns success from a single rich homepage pass, with progress events emitted", async () => {
    stubs.safeFetchText.mockResolvedValueOnce({
      status: 200,
      text: "<html>lots of content</html>",
    });
    stubs.extractPageContent.mockReturnValue({ text: "a".repeat(300) });
    stubs.scrapeLogoUrl.mockResolvedValue("https://example.com/logo.png");
    stubs.downloadAndStoreLogo.mockResolvedValue("https://storage.example.com/logo.png");
    stubs.chatCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              name: "Acme",
              companyName: "Acme Inc",
              industry: "Widget Manufacturing",
              description: "Makes widgets.",
              targetAudience: "Widget buyers",
              brandVoice: "Direct",
              products: ["Widget Pro"],
              keyValues: ["Quality"],
              uniqueSellingPoints: ["Fast shipping"],
            }),
          },
          finish_reason: "stop",
        },
      ],
    });

    const emit = vi.fn();
    const outcome = await runOnboardingBrandScrape("acme.com", "https://acme.com", emit);

    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.data.brandName).toBe("Acme");
      expect(outcome.data.logoUrl).toBe("https://storage.example.com/logo.png");
      expect(outcome.data.industry).toBe("Widget Manufacturing");
    }
    // Rich enough on the first pass (factsCount >= 3) - no sitemap fallback.
    expect(stubs.chatCreate).toHaveBeenCalledTimes(1);
    expect(events(emit)).toContainEqual({
      type: "log",
      icon: "check",
      message: "Detected brand logo.",
    });
  });

  it("reports llm_failed when every strategy's LLM call throws", async () => {
    stubs.safeFetchText.mockImplementation(async (url: string) => {
      if (url.includes("sitemap.xml")) throw new Error("no sitemap");
      return { status: 200, text: "<html>content</html>" };
    });
    stubs.extractPageContent.mockReturnValue({ text: "a".repeat(300) });
    stubs.scrapeLogoUrl.mockResolvedValue(null);
    stubs.chatCreate.mockRejectedValue(new Error("upstream timeout"));

    const outcome = await runOnboardingBrandScrape("acme.com", "https://acme.com", vi.fn());

    expect(outcome).toEqual({ kind: "llm_failed" });
  });

  it("reports unreachable when the homepage cannot be fetched at all", async () => {
    stubs.safeFetchText.mockRejectedValue(new Error("network down"));
    stubs.extractPageContent.mockReturnValue({ text: "" });

    const outcome = await runOnboardingBrandScrape("acme.com", "https://acme.com", vi.fn());

    expect(outcome).toEqual({ kind: "unreachable", domain: "acme.com" });
    expect(stubs.chatCreate).not.toHaveBeenCalled();
  });

  it("merges a sitemap-driven second pass onto a thin first result", async () => {
    stubs.safeFetchText.mockImplementation(async (url: string) => {
      if (url === "https://acme.com/sitemap.xml") {
        return {
          status: 200,
          text: "<urlset><url><loc>https://acme.com/about</loc></url></urlset>",
        };
      }
      if (url === "https://acme.com/about") {
        return { status: 200, text: "<html>about page</html>" };
      }
      return { status: 200, text: "<html>thin</html>" };
    });
    stubs.extractPageContent.mockReturnValue({ text: "a".repeat(300) });
    stubs.extractBodyText.mockReturnValue("about page text");
    stubs.scrapeLogoUrl.mockResolvedValue(null);
    stubs.chatCreate
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ name: "Acme" }) }, finish_reason: "stop" },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: "Acme",
                industry: "Widgets",
                description: "d",
                targetAudience: "t",
                brandVoice: "v",
              }),
            },
            finish_reason: "stop",
          },
        ],
      });

    const outcome = await runOnboardingBrandScrape("acme.com", "https://acme.com", vi.fn());

    expect(stubs.chatCreate).toHaveBeenCalledTimes(2);
    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.data.industry).toBe("Widgets");
    }
  });

  it("clears a first-pass LLM failure when the sitemap-driven second pass succeeds", async () => {
    stubs.safeFetchText.mockImplementation(async (url: string) => {
      if (url === "https://acme.com/sitemap.xml") {
        return {
          status: 200,
          text: "<urlset><url><loc>https://acme.com/about</loc></url></urlset>",
        };
      }
      if (url === "https://acme.com/about") {
        return { status: 200, text: "<html>about</html>" };
      }
      return { status: 200, text: "<html>thin</html>" };
    });
    stubs.extractPageContent.mockReturnValue({ text: "a".repeat(300) });
    stubs.extractBodyText.mockReturnValue("about text");
    stubs.scrapeLogoUrl.mockResolvedValue(null);
    stubs.chatCreate.mockRejectedValueOnce(new Error("first pass timeout")).mockResolvedValueOnce({
      choices: [
        {
          message: { content: JSON.stringify({ name: "Acme", industry: "Widgets" }) },
          finish_reason: "stop",
        },
      ],
    });

    const outcome = await runOnboardingBrandScrape("acme.com", "https://acme.com", vi.fn());

    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.data.brandName).toBe("Acme");
    }
  });
});
