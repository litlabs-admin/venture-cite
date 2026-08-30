// Direct, no-HTTP tests for server/services/bofuContent.ts (phase B7-13
// service extraction).

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const stubs = vi.hoisted(() => ({
  createBofuContent: vi.fn(),
  loadBrandGenerationContext: vi.fn(),
  openaiCreate: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: { createBofuContent: stubs.createBofuContent },
}));

vi.mock("../../server/lib/brandGenerationContext", () => ({
  loadBrandGenerationContext: stubs.loadBrandGenerationContext,
  renderFactsBlock: () => "",
  renderCompetitorBlock: () => "",
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

const { generateBofuContent } = await import("../../server/services/bofuContent");

const brand = { name: "Acme", industry: "SaaS", description: "", products: [] };

beforeEach(() => {
  for (const stub of Object.values(stubs)) stub.mockReset();
  stubs.loadBrandGenerationContext.mockResolvedValue({
    brand,
    facts: [],
    competitorsResolved: [],
  });
  stubs.openaiCreate.mockResolvedValue({
    choices: [{ message: { content: "Generated body" } }],
  });
  stubs.createBofuContent.mockImplementation(async (row: any) => ({ id: "bofu-1", ...row }));
});

describe("generateBofuContent", () => {
  it("returns not_found when the brand's grounding context can't be loaded", async () => {
    stubs.loadBrandGenerationContext.mockResolvedValueOnce(null);

    const result = await generateBofuContent({
      brandId: "brand-1",
      contentType: "comparison",
      comparedWith: [],
      keyword: null,
    });

    expect(result).toEqual({ kind: "not_found" });
  });

  it("returns invalid_type for an unrecognized contentType", async () => {
    const result = await generateBofuContent({
      brandId: "brand-1",
      contentType: "not-a-real-type",
      comparedWith: [],
      keyword: null,
    });

    expect(result).toEqual({ kind: "invalid_type" });
    expect(stubs.openaiCreate).not.toHaveBeenCalled();
  });

  it("generates and persists comparison content", async () => {
    const result = await generateBofuContent({
      brandId: "brand-1",
      contentType: "comparison",
      comparedWith: [],
      keyword: null,
    });

    expect(result.kind).toBe("ok");
    expect(stubs.createBofuContent).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: "brand-1",
        contentType: "comparison",
        content: "Generated body",
        status: "draft",
      }),
    );
    if (result.kind === "ok") {
      expect(result.tips.length).toBeGreaterThan(0);
    }
  });
});
