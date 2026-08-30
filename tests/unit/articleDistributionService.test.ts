// Direct, no-HTTP tests for server/services/articleDistribution.ts
// (phase B7-15 service extraction).

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const stubs = vi.hoisted(() => ({
  openaiCreate: vi.fn(),
  createMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: { distribution: "gpt-4o-mini" },
}));

vi.mock("../../server/lib/routesShared", async () => {
  const actual = await vi.importActual<any>("../../server/lib/routesShared");
  return {
    ...actual,
    openai: { chat: { completions: { create: stubs.openaiCreate } } },
  };
});

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { metadataWithContent, distributeArticleToPlatforms } =
  await import("../../server/services/articleDistribution");

function fakeDistributions() {
  return { createMany: stubs.createMany, update: stubs.update } as any;
}

beforeEach(() => {
  for (const stub of Object.values(stubs)) stub.mockReset();
});

describe("metadataWithContent", () => {
  it("merges content onto an existing plain-object metadata", () => {
    expect(metadataWithContent({ foo: "bar" }, "new copy")).toEqual({
      foo: "bar",
      content: "new copy",
    });
  });

  it("discards non-object metadata (null, array, primitive) rather than spreading it", () => {
    expect(metadataWithContent(null, "x")).toEqual({ content: "x" });
    expect(metadataWithContent(["a"], "x")).toEqual({ content: "x" });
    expect(metadataWithContent("string", "x")).toEqual({ content: "x" });
  });
});

describe("distributeArticleToPlatforms", () => {
  it("creates a pending row per platform, then marks it success with the AI copy", async () => {
    stubs.createMany.mockImplementation(async (rows: any[]) => [
      { id: `dist-${rows[0].platform}`, ...rows[0] },
    ]);
    stubs.openaiCreate.mockResolvedValue({
      choices: [{ message: { content: "Generated platform copy" } }],
    });

    const results = await distributeArticleToPlatforms({
      article: { id: "article-1", content: "Full article body", title: "Great Title" },
      brand: { companyName: "Acme" },
      platforms: ["LinkedIn", "Twitter"],
      distributions: fakeDistributions(),
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      platform: "LinkedIn",
      status: "success",
      content: "Generated platform copy",
      distributionId: "dist-LinkedIn",
      platformPostId: null,
    });
    expect(stubs.update).toHaveBeenCalledWith(
      "dist-LinkedIn",
      expect.objectContaining({
        status: "success",
        metadata: { content: "Generated platform copy" },
      }),
    );
    // Both platform prompts got a brand mention rendered in.
    const prompts = stubs.openaiCreate.mock.calls.map((call) => call[0].messages[1].content);
    expect(prompts.every((p: string) => p.includes("Brand: Acme"))).toBe(true);
  });

  it("marks the row failed when the model returns empty content", async () => {
    stubs.createMany.mockResolvedValueOnce([{ id: "dist-1", platform: "LinkedIn" }]);
    stubs.openaiCreate.mockResolvedValueOnce({ choices: [{ message: { content: "   " } }] });

    const [result] = await distributeArticleToPlatforms({
      article: { id: "article-1", content: "Body", title: "Title" },
      brand: null,
      platforms: ["LinkedIn"],
      distributions: fakeDistributions(),
    });

    expect(result).toEqual({
      platform: "LinkedIn",
      status: "failed",
      error: "AI returned empty content - try again",
    });
    expect(stubs.update).toHaveBeenCalledWith(
      "dist-1",
      expect.objectContaining({ status: "failed", error: "AI returned empty content" }),
    );
  });

  it("marks the row failed and reports a generic error when the model call throws", async () => {
    stubs.createMany.mockResolvedValueOnce([{ id: "dist-1", platform: "Reddit" }]);
    stubs.openaiCreate.mockRejectedValueOnce(new Error("rate limited"));

    const [result] = await distributeArticleToPlatforms({
      article: { id: "article-1", content: "Body", title: "Title" },
      brand: null,
      platforms: ["Reddit"],
      distributions: fakeDistributions(),
    });

    expect(result).toEqual({
      platform: "Reddit",
      status: "failed",
      error: "Failed to generate platform content",
    });
    expect(stubs.update).toHaveBeenCalledWith(
      "dist-1",
      expect.objectContaining({ status: "failed", error: "rate limited" }),
    );
  });

  it("throws when the distribution insert returns no row", async () => {
    stubs.createMany.mockResolvedValueOnce([]);

    await expect(
      distributeArticleToPlatforms({
        article: { id: "article-1", content: "Body", title: "Title" },
        brand: null,
        platforms: ["LinkedIn"],
        distributions: fakeDistributions(),
      }),
    ).rejects.toThrow("Distribution insert returned no row");
  });
});
