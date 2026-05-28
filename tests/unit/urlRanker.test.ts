import { describe, it, expect, vi } from "vitest";
import { rankUrls, type UrlCandidate } from "../../server/lib/factAgent/v2/urlRanker";

const CANDIDATES: UrlCandidate[] = [
  { url: "https://example.com/", source: "sitemap" },
  { url: "https://example.com/about", source: "nav", label: "about us" },
  { url: "https://example.com/pricing", source: "nav", label: "pricing" },
  { url: "https://example.com/blog", source: "nav", label: "blog" },
  { url: "https://example.com/privacy", source: "footer", label: "privacy policy" },
];

describe("rankUrls", () => {
  it("returns empty array for empty candidate list", async () => {
    const llm = vi.fn();
    expect(await rankUrls([], { brandUrl: "x", maxResults: 5 }, llm)).toEqual([]);
    expect(llm).not.toHaveBeenCalled();
  });

  it("sends candidates to LLM and returns sorted ranked URLs", async () => {
    const llm = vi.fn(async () =>
      JSON.stringify({
        ranked: [
          { url: "https://example.com/about", score: 10, reason: "identity page" },
          { url: "https://example.com/pricing", score: 8, reason: "pricing page" },
          { url: "https://example.com/", score: 7, reason: "homepage" },
          { url: "https://example.com/blog", score: 2, reason: "blog" },
          { url: "https://example.com/privacy", score: 0, reason: "policy" },
        ],
      }),
    );
    const out = await rankUrls(
      CANDIDATES,
      { brandUrl: "https://example.com/", maxResults: 3 },
      llm,
    );
    expect(out).toHaveLength(3);
    expect(out[0].url).toBe("https://example.com/about");
    expect(out[1].url).toBe("https://example.com/pricing");
    expect(out[2].url).toBe("https://example.com/");
    expect(out[0].score).toBe(10);
  });

  it("drops URLs not in the candidate set (anti-hallucination)", async () => {
    const llm = vi.fn(async () =>
      JSON.stringify({
        ranked: [
          { url: "https://example.com/about", score: 10, reason: "" },
          { url: "https://example.com/INVENTED", score: 9, reason: "" }, // not in candidates
        ],
      }),
    );
    const out = await rankUrls(
      CANDIDATES,
      { brandUrl: "https://example.com/", maxResults: 5 },
      llm,
    );
    expect(out.find((r) => r.url.includes("INVENTED"))).toBeUndefined();
  });

  it("clamps scores to [0,10]", async () => {
    const llm = vi.fn(async () =>
      JSON.stringify({
        ranked: [
          { url: "https://example.com/about", score: 25, reason: "" },
          { url: "https://example.com/pricing", score: -5, reason: "" },
        ],
      }),
    );
    const out = await rankUrls(
      CANDIDATES,
      { brandUrl: "https://example.com/", maxResults: 5 },
      llm,
    );
    expect(out.find((r) => r.url.endsWith("/about"))!.score).toBe(10);
    expect(out.find((r) => r.url.endsWith("/pricing"))!.score).toBe(0);
  });

  it("dedupes ranked array by URL, keeping highest score", async () => {
    const llm = vi.fn(async () =>
      JSON.stringify({
        ranked: [
          { url: "https://example.com/about", score: 5, reason: "" },
          { url: "https://example.com/about", score: 10, reason: "" },
        ],
      }),
    );
    const out = await rankUrls(
      CANDIDATES,
      { brandUrl: "https://example.com/", maxResults: 5 },
      llm,
    );
    expect(out.filter((r) => r.url.endsWith("/about"))).toHaveLength(1);
    expect(out[0].score).toBe(10);
  });

  it("rethrows when LLM call itself fails", async () => {
    const llm = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(
      rankUrls(CANDIDATES, { brandUrl: "https://example.com/", maxResults: 5 }, llm),
    ).rejects.toThrow("network down");
  });

  it("throws when LLM returns non-JSON", async () => {
    const llm = vi.fn(async () => "not json");
    await expect(
      rankUrls(CANDIDATES, { brandUrl: "https://example.com/", maxResults: 5 }, llm),
    ).rejects.toThrow(/non-JSON|JSON/);
  });

  it("throws when response missing ranked array", async () => {
    const llm = vi.fn(async () => JSON.stringify({ wrong: [] }));
    await expect(
      rankUrls(CANDIDATES, { brandUrl: "https://example.com/", maxResults: 5 }, llm),
    ).rejects.toThrow(/ranked/);
  });

  it("respects maxResults cap", async () => {
    const llm = vi.fn(async () =>
      JSON.stringify({
        ranked: CANDIDATES.map((c, i) => ({
          url: c.url,
          score: 10 - i,
          reason: "",
        })),
      }),
    );
    const out = await rankUrls(
      CANDIDATES,
      { brandUrl: "https://example.com/", maxResults: 2 },
      llm,
    );
    expect(out).toHaveLength(2);
  });
});
