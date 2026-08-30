// Direct, no-HTTP tests for server/services/wikipedia.ts (phase B7-13
// service extraction).

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const stubs = vi.hoisted(() => ({
  getWikipediaMentions: vi.fn(),
  scanBrandWikipedia: vi.fn(),
  loadBrandGenerationContext: vi.fn(),
  openaiCreate: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: { getWikipediaMentions: stubs.getWikipediaMentions },
}));

vi.mock("../../server/lib/wikipediaScanner", () => ({
  scanBrandWikipedia: stubs.scanBrandWikipedia,
}));

vi.mock("../../server/lib/brandGenerationContext", () => ({
  loadBrandGenerationContext: stubs.loadBrandGenerationContext,
  renderFactsBlock: (facts: unknown[]) => (facts.length ? "FACTS" : ""),
}));

vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: { misc: "gpt-4o-mini" },
}));

vi.mock("../../server/lib/routesShared", async () => {
  const actual = await vi.importActual<any>("../../server/lib/routesShared");
  return {
    ...actual,
    openai: { chat: { completions: { create: stubs.openaiCreate } } },
  };
});

const { scanBrandWikipediaMentions, draftWikipediaMention } =
  await import("../../server/services/wikipedia");

beforeEach(() => {
  for (const stub of Object.values(stubs)) stub.mockReset();
});

describe("scanBrandWikipediaMentions", () => {
  it("shapes the scan report with legacy aliases", async () => {
    stubs.scanBrandWikipedia.mockResolvedValueOnce({
      existing: 1,
      opportunities: 2,
      inserted: 1,
    });
    stubs.getWikipediaMentions.mockResolvedValueOnce([{ id: "m-1" }]);

    const data = await scanBrandWikipediaMentions("brand-1", "Acme");

    expect(stubs.scanBrandWikipedia).toHaveBeenCalledWith("brand-1");
    expect(data).toMatchObject({
      brand: { id: "brand-1", name: "Acme" },
      existing: 1,
      opportunities: 2,
      inserted: 1,
      mentions: [{ id: "m-1" }],
    });
  });
});

describe("draftWikipediaMention", () => {
  it("returns null when the brand no longer exists", async () => {
    stubs.loadBrandGenerationContext.mockResolvedValueOnce(null);

    const result = await draftWikipediaMention(
      { pageTitle: "Acme Corp", mentionContext: "..." },
      "brand-1",
    );

    expect(result).toBeNull();
  });

  it("drafts neutral mention text and includes disclosure notes", async () => {
    stubs.loadBrandGenerationContext.mockResolvedValueOnce({
      brand: { name: "Acme", industry: "SaaS" },
      facts: [],
    });
    stubs.openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Acme is mentioned here (see: company website)." } }],
    });

    const result = await draftWikipediaMention(
      { pageTitle: "Acme Corp", mentionContext: "Some existing text" },
      "brand-1",
    );

    expect(result?.draft).toBe("Acme is mentioned here (see: company website).");
    expect(result?.notes.length).toBeGreaterThan(0);
  });
});
