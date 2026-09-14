import { describe, expect, it } from "vitest";
import {
  summarizeCitationExplorer,
  summarizePortfolio,
  summarizeQuestionDetail,
} from "../../server/services/v2QuestionViews";
import type { BrandPrompt, GeoRanking } from "@shared/schema";

function prompt(overrides: Partial<BrandPrompt> = {}): BrandPrompt {
  return {
    id: "prompt-1",
    brandId: "brand-1",
    generationId: null,
    prompt:
      "What services should I look for in a public relations firm for a disruptive tech company?",
    rationale: null,
    orderIndex: 0,
    isActive: 1,
    status: "tracked",
    category: "public relations",
    funnelStage: "TOFU",
    region: "global",
    paused: false,
    createdAt: new Date("2026-07-23T00:00:00.000Z"),
    ...overrides,
  };
}

function row(overrides: Partial<GeoRanking> = {}): GeoRanking {
  return {
    id: "row-1",
    articleId: null,
    brandPromptId: "prompt-1",
    brandId: "brand-1",
    runId: "run-1",
    aiPlatform: "ChatGPT",
    prompt:
      "What services should I look for in a public relations firm for a disruptive tech company?",
    rank: null,
    isCited: 0,
    citationContext: "Not cited",
    citingOutletUrl: null,
    citingOutletName: null,
    citedUrls: null,
    sentiment: "neutral",
    sentimentScore: "0",
    sourceType: null,
    authorityScore: null,
    relevanceScore: null,
    checkedAt: new Date(),
    outcome: null,
    reDetectedAt: null,
    metadata: null,
    mentionedBrands: null,
    ...overrides,
  } as GeoRanking;
}

describe("summarizePortfolio", () => {
  it("counts active engines from the latest row per engine, not every row", () => {
    const rows = [
      row({ id: "r1", aiPlatform: "ChatGPT", isCited: 1, checkedAt: new Date("2026-08-01") }),
      // A later ChatGPT run that did NOT mention the brand should win over the
      // earlier one - "latest visibility" reads the most recent result.
      row({ id: "r2", aiPlatform: "ChatGPT", isCited: 0, checkedAt: new Date("2026-08-20") }),
      row({ id: "r3", aiPlatform: "Claude", isCited: 1, checkedAt: new Date("2026-08-20") }),
    ];
    const summary = summarizePortfolio([prompt()], rows, new Map(), null);
    const q = summary.questions[0];
    expect(q.activeEngineCount).toBe(2);
    expect(q.latestVisibilityCount).toBe(1); // Claude mentions, latest ChatGPT does not.
    expect(q.latestVisibilityDenominator).toBe(2);
  });

  it("excludes archived prompts and reports the tracked-question allowance", () => {
    const summary = summarizePortfolio(
      [prompt({ id: "p1", status: "tracked" }), prompt({ id: "p2", status: "archived" })],
      [],
      new Map(),
      null,
    );
    expect(summary.questions).toHaveLength(1);
    expect(summary.allowance.used).toBe(1);
    expect(summary.allowance.limit).toBe(10);
  });

  it("attaches real audience names, never a fabricated market or language", () => {
    const summary = summarizePortfolio(
      [prompt()],
      [],
      new Map([["prompt-1", ["Startup founders"]]]),
      { score: 78, verdict: "Good" },
    );
    expect(summary.questions[0].audienceNames).toEqual(["Startup founders"]);
    expect(summary.setHealth).toEqual({ score: 78, verdict: "Good" });
    expect(summary.questions[0]).not.toHaveProperty("market");
    expect(summary.questions[0]).not.toHaveProperty("language");
  });
});

describe("summarizeQuestionDetail", () => {
  it("splits mention, citation and failure counts the same way the report does", () => {
    const rows = [
      row({ id: "r1", isCited: 1, citingOutletUrl: "https://venturepr.com" }), // cited
      row({ id: "r2", isCited: 1 }), // mentioned, not cited
      row({ id: "r3", citationContext: "Check failed: timeout" }), // failed
    ];
    const detail = summarizeQuestionDetail(prompt(), rows);
    expect(detail.metrics).toEqual({
      mentionCount: 2,
      citationCount: 1,
      failedCount: 1,
      attemptCount: 3,
    });
    // All three rows land in the current week's bucket (the `row()` default
    // checkedAt). The failure rate must be measured against every attempt,
    // not just the answered ones, or a failed call would vanish from the
    // trend instead of showing as a real failure.
    const currentWeek = detail.trend.at(-1);
    expect(currentWeek).toEqual({
      weekStart: currentWeek?.weekStart,
      mentionRate: 100,
      citationRate: 50,
      failureRate: 33,
    });
  });

  it("builds one engine record per platform with its own failed count", () => {
    const rows = [
      row({
        id: "r1",
        aiPlatform: "ChatGPT",
        isCited: 1,
        citingOutletUrl: "https://venturepr.com",
      }),
      row({ id: "r2", aiPlatform: "ChatGPT", citationContext: "Check failed: timeout" }),
      row({ id: "r3", aiPlatform: "Claude", isCited: 0 }),
    ];
    const detail = summarizeQuestionDetail(prompt(), rows);
    const chatgpt = detail.engineRecords.find((entry) => entry.engine === "ChatGPT");
    expect(chatgpt).toEqual({
      engine: "ChatGPT",
      total: 2,
      answered: 1,
      mentioned: 1,
      cited: 1,
      failed: 1,
    });
  });

  it("never attributes a competitor mention to the tracked brand's own name", () => {
    const rows = [
      row({
        isCited: 1,
        mentionedBrands: [
          { name: "Edelman", cited: true },
          { name: prompt().prompt, cited: true },
        ],
      }),
    ];
    const detail = summarizeQuestionDetail(prompt(), rows);
    expect(detail.competitors).toEqual([{ name: "Edelman", mentions: 1, engines: ["ChatGPT"] }]);
  });
});

describe("summarizeCitationExplorer", () => {
  it("classifies each row into cited, mentioned, not_mentioned or failed", () => {
    const rows = [
      row({
        id: "r1",
        isCited: 1,
        citingOutletUrl: "https://venturepr.com",
        sourceType: "Company site",
      }),
      row({ id: "r2", isCited: 1 }),
      row({ id: "r3", isCited: 0 }),
      row({ id: "r4", citationContext: "Check failed: timeout" }),
    ];
    const summary = summarizeCitationExplorer(rows, [prompt()], "venturepr.com");
    const states = summary.records.map((record) => record.state).sort();
    expect(states).toEqual(["cited", "failed", "mentioned", "not_mentioned"]);
    expect(summary.summary).toEqual({ mentions: 2, citations: 1, failures: 1, attempts: 4 });
  });

  it("splits first-party and third-party share by the brand's own domain", () => {
    const rows = [
      row({ id: "r1", isCited: 1, citingOutletUrl: "https://venturepr.com/blog" }),
      row({ id: "r2", isCited: 1, citingOutletUrl: "https://techcrunch.com/article" }),
    ];
    const summary = summarizeCitationExplorer(rows, [prompt()], "venturepr.com");
    expect(summary.firstPartyShare).toBe(50);
    expect(summary.thirdPartyShare).toBe(50);
  });

  it("never fabricates a source domain or type for a row that was not cited", () => {
    const rows = [row({ id: "r1", isCited: 1, sourceType: "Company site" })];
    const summary = summarizeCitationExplorer(rows, [prompt()], "venturepr.com");
    expect(summary.records[0].sourceDomain).toBeNull();
    expect(summary.records[0].sourceType).toBeNull();
  });
});
