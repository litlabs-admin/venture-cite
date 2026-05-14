import { describe, it, expect, vi } from "vitest";
import {
  buildExtractionPrompt,
  parseFactsWithRepair,
} from "../../server/lib/factAgent/v2/extractionPrompt";

describe("buildExtractionPrompt", () => {
  it("wraps payload in <scraped_data> tags with explicit injection guard", () => {
    const built = buildExtractionPrompt("Some page text", {
      brandUrl: "https://example.com",
    });
    expect(built.system).toMatch(/Under no circumstances/i);
    expect(built.system).toMatch(/passive text/i);
    expect(built.user).toContain("<scraped_data>");
    expect(built.user).toContain("Some page text");
    expect(built.user).toContain("</scraped_data>");
    expect(built.user).toContain("example.com");
  });

  it("includes the soft-404 negative constraint in the system prompt", () => {
    const built = buildExtractionPrompt("x", { brandUrl: "https://x.com" });
    expect(built.system).toMatch(/404|not found|coming soon/i);
  });
});

describe("parseFactsWithRepair", () => {
  it("returns facts on a clean response", async () => {
    const llm = vi.fn().mockResolvedValueOnce(
      JSON.stringify({
        facts: [
          {
            domain: "identity",
            subcategory: "description",
            factKey: "tagline",
            factValue: "We build AI.",
            valueType: "string",
            confidence: 0.9,
            sourceExcerpt: "We build AI.",
          },
        ],
      }),
    );
    const out = await parseFactsWithRepair("any prompt", llm);
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0].factKey).toBe("tagline");
    expect(out.repairUsed).toBe(false);
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it("retries once on a malformed response, succeeds on retry", async () => {
    const llm = vi
      .fn()
      .mockResolvedValueOnce("{ facts: [trailing comma,] }")
      .mockResolvedValueOnce(
        JSON.stringify({
          facts: [
            {
              domain: "identity",
              subcategory: "description",
              factKey: "tagline",
              factValue: "Acme",
              valueType: "string",
              confidence: 0.8,
              sourceExcerpt: "",
            },
          ],
        }),
      );
    const out = await parseFactsWithRepair("any prompt", llm);
    expect(out.facts).toHaveLength(1);
    expect(out.repairUsed).toBe(true);
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it("returns empty facts after two failed attempts", async () => {
    const llm = vi.fn().mockResolvedValueOnce("garbage one").mockResolvedValueOnce("garbage two");
    const out = await parseFactsWithRepair("any prompt", llm);
    expect(out.facts).toEqual([]);
    expect(out.repairUsed).toBe(true);
  });

  it("treats a mixed valid+invalid facts response as a parse failure and retries", async () => {
    const llm = vi.fn().mockResolvedValueOnce(
      JSON.stringify({
        facts: [
          {
            domain: "identity",
            subcategory: "x",
            factKey: "y",
            factValue: "z",
            valueType: "string",
            confidence: 0.9,
            sourceExcerpt: "",
          },
          {
            domain: "NOT_A_DOMAIN",
            subcategory: "x",
            factKey: "y",
            factValue: "z",
            valueType: "string",
            confidence: 0.9,
            sourceExcerpt: "",
          },
        ],
      }),
    );
    const out = await parseFactsWithRepair("any prompt", llm);
    expect(out.repairUsed).toBe(true);
  });
});
