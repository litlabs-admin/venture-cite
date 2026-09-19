// Direct tests for server/onboardingSession/firstRead.ts. Mocks
// runPlatformCitationCheck (server/citationChecker.ts) so no network or LLM
// call happens; the real brand/competitor matcher (brandMatcher.ts) and the
// real classifySourceType run unmocked.
import { describe, it, expect, vi, beforeEach } from "vitest";

// server/citationChecker.ts pulls in server/storage.ts -> server/db.ts, which
// throws at import time without DATABASE_URL. Mock the whole module rather
// than vi.importActual it. classifySourceType is reimplemented here matching
// its real (simple, regex-based) behavior exactly - see
// server/citationChecker.ts's own classifySourceType - just without the DB
// import chain.
const citationStubs = vi.hoisted(() => ({
  runPlatformCitationCheck: vi.fn(),
}));

function classifySourceTypeStub(url: string | null | undefined): string | null {
  if (!url) return null;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (/(^|\.)reddit\.com$|(^|\.)quora\.com$/.test(host)) return "community";
  if (/(^|\.)wikipedia\.org$|\.gov$|\.edu$/.test(host)) return "reference";
  if (/(^|\.)youtube\.com$/.test(host)) return "video";
  return "web";
}

vi.mock("../../server/citationChecker", () => ({
  runPlatformCitationCheck: citationStubs.runPlatformCitationCheck,
  classifySourceType: classifySourceTypeStub,
}));

const { runFirstRead } = await import("../../server/onboardingSession/firstRead");

const PROFILE = { name: "Acme", industry: "PR", descriptor: "", description: "", audience: "" };
const COMPETITORS = {
  shown: [
    { name: "Rival Co", domain: "rival.com", faviconUrl: "" },
    { name: "Other Inc", domain: "other.com", faviconUrl: "" },
  ],
  totalFound: 2,
};
const PROMPTS = ["best PR agencies", "top publicists 2026", "who does crisis PR", "extra prompt"];

function okResult(responseText: string, structuredCitations: string[] = []) {
  return {
    isCited: false,
    rank: null,
    relevance: null,
    responseText,
    structuredCitations,
  };
}

beforeEach(() => {
  citationStubs.runPlatformCitationCheck.mockReset();
});

describe("runFirstRead", () => {
  it("only probes the first PROBE_PROMPT_COUNT prompts across PROBE_ENGINES", async () => {
    citationStubs.runPlatformCitationCheck.mockResolvedValue(okResult("nothing relevant here"));

    await runFirstRead({
      domain: "acme.com",
      profile: PROFILE,
      competitors: COMPETITORS,
      prompts: PROMPTS,
    });

    // 3 prompts x 2 engines (Gemini, ChatGPT) = 6 calls, never the 4th prompt.
    expect(citationStubs.runPlatformCitationCheck).toHaveBeenCalledTimes(6);
    const calledPrompts = citationStubs.runPlatformCitationCheck.mock.calls.map((c) => c[1]);
    expect(calledPrompts).not.toContain("extra prompt");
    const calledEngines = new Set(
      citationStubs.runPlatformCitationCheck.mock.calls.map((c) => c[0]),
    );
    expect(calledEngines).toEqual(new Set(["Gemini", "ChatGPT"]));
    // skipJudge must be passed through so no judge LLM call happens downstream.
    expect(citationStubs.runPlatformCitationCheck.mock.calls[0][7]).toEqual({ skipJudge: true });
  });

  it("detects brand and competitor mentions with rank by order of first appearance", async () => {
    citationStubs.runPlatformCitationCheck.mockResolvedValue(
      okResult("Rival Co is popular, but Acme and Other Inc also came up."),
    );

    const result = await runFirstRead({
      domain: "acme.com",
      profile: PROFILE,
      competitors: COMPETITORS,
      prompts: PROMPTS.slice(0, 1),
    });

    const first = result.probe.results[0];
    expect(first.brandCited).toBe(true);
    // "Rival Co" appears before "Acme" appears before "Other Inc".
    expect(first.brandRank).toBe(2);
    const mentionedNames = first.mentioned.map((m) => m.name);
    expect(mentionedNames).toEqual(["Rival Co", "Other Inc"]);
    expect(first.mentioned.find((m) => m.name === "Rival Co")?.rank).toBe(1);
    expect(first.mentioned.find((m) => m.name === "Other Inc")?.rank).toBe(3);
    expect(first.snippet).toBe("Rival Co is popular, but Acme and Other Inc also came up.");
  });

  it("drops a call that errors or times out, but keeps the others; that engine does not count toward promptsTested", async () => {
    citationStubs.runPlatformCitationCheck.mockImplementation(async (engine: string) => {
      if (engine === "Gemini") throw new Error("network error");
      return okResult("Acme was mentioned here.");
    });

    const result = await runFirstRead({
      domain: "acme.com",
      profile: PROFILE,
      competitors: COMPETITORS,
      prompts: PROMPTS.slice(0, 1),
    });

    expect(result.probe.results).toHaveLength(1);
    expect(result.probe.results[0].engine).toBe("ChatGPT");
    expect(result.probe.promptsTested).toBe(1);
  });

  it("also drops a call that resolves with a soft error field set", async () => {
    citationStubs.runPlatformCitationCheck.mockImplementation(async (engine: string) => {
      if (engine === "Gemini") {
        return {
          isCited: false,
          rank: null,
          relevance: null,
          responseText: "",
          structuredCitations: [],
          error: "not configured",
        };
      }
      return okResult("Acme was mentioned here.");
    });

    const result = await runFirstRead({
      domain: "acme.com",
      profile: PROFILE,
      competitors: COMPETITORS,
      prompts: PROMPTS.slice(0, 1),
    });

    expect(result.probe.results).toHaveLength(1);
    expect(result.probe.results[0].engine).toBe("ChatGPT");
  });

  it("throws when every call fails", async () => {
    citationStubs.runPlatformCitationCheck.mockRejectedValue(new Error("down"));

    await expect(
      runFirstRead({
        domain: "acme.com",
        profile: PROFILE,
        competitors: COMPETITORS,
        prompts: PROMPTS.slice(0, 1),
      }),
    ).rejects.toThrow();
  });

  it("groups cited sources by domain, classifies kind, excludes the brand's own domain, and sorts by count desc", async () => {
    citationStubs.runPlatformCitationCheck.mockImplementation(
      async (_engine: string, prompt: string) => {
        if (prompt === "p1") {
          return okResult("no mentions", [
            "https://news.example.com/a",
            "https://acme.com/self-link",
            "https://reddit.com/r/pr/thread",
          ]);
        }
        return okResult("no mentions", ["https://news.example.com/b"]);
      },
    );

    const result = await runFirstRead({
      domain: "acme.com",
      profile: PROFILE,
      competitors: COMPETITORS,
      prompts: ["p1", "p2"],
    });

    const byDomain = new Map(result.sources.map((s) => [s.domain, s]));
    expect(byDomain.has("acme.com")).toBe(false);
    // news.example.com cited twice per prompt x 2 engines = more than reddit.
    expect(byDomain.get("news.example.com")?.count).toBeGreaterThan(
      byDomain.get("reddit.com")?.count ?? 0,
    );
    expect(byDomain.get("reddit.com")?.kind).toBe("social");
    expect(result.sources.length).toBeLessThanOrEqual(6);
    // sorted descending
    const counts = result.sources.map((s) => s.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  // Seen live on venturepr.com: Gemini's grounding returns redirect URLs on
  // this host, which say nothing about where the answer came from.
  it("drops Gemini grounding redirect URLs from sources", async () => {
    citationStubs.runPlatformCitationCheck.mockResolvedValue(
      okResult("no mentions", [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbCdEf",
        "https://prweek.com/article",
      ]),
    );
    const result = await runFirstRead({
      domain: "acme.com",
      profile: PROFILE,
      competitors: COMPETITORS,
      prompts: ["p1"],
    });
    expect(result.sources.map((s) => s.domain)).toEqual(["prweek.com"]);
  });

  it("stores the snippet as plain text, not Markdown", async () => {
    citationStubs.runPlatformCitationCheck.mockResolvedValue(
      okResult(
        "## Picks\n\n1. **Rival Co** offers [strong launches](https://rival.com) and `tech` depth.",
      ),
    );
    const result = await runFirstRead({
      domain: "acme.com",
      profile: PROFILE,
      competitors: COMPETITORS,
      prompts: ["p1"],
    });
    expect(result.probe.results[0].snippet).toBe(
      "Picks Rival Co offers strong launches and tech depth.",
    );
  });
});
