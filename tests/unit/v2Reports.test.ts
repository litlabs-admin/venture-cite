import { describe, expect, it } from "vitest";
import { summarizeReport } from "../../server/services/v2Report";
import type { BrandPrompt, GeoRanking } from "@shared/schema";

// Shapes mirror the real rows captured from the local database for brand
// 470b15fe-606b-4d96-ab62-69a01e08b237 (Venture PR) via
// GET /api/dashboard/cited-urls and GET /api/brand-prompts - see
// .superpowers/sdd/live/reports/vis-deep.md for the captured payloads.

function prompt(overrides: Partial<BrandPrompt> = {}): BrandPrompt {
  return {
    id: "prompt-1",
    brandId: "brand-1",
    generationId: null,
    prompt: "What should I consider when choosing a public relations firm for my startup?",
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
    prompt: "What should I consider when choosing a public relations firm for my startup?",
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
    checkedAt: new Date("2026-08-31T02:39:51.841Z"),
    outcome: null,
    reDetectedAt: null,
    metadata: null,
    mentionedBrands: null,
    ...overrides,
  } as GeoRanking;
}

describe("summarizeReport", () => {
  it("reports 'never measured' when every row is a failed provider call", () => {
    const rows = [row({ citationContext: "Check failed: timeout" })];
    const summary = summarizeReport(rows, [prompt()], "Venture PR");
    expect(summary.period).toBeNull();
    expect(summary.buyerQuestions).toEqual([]);
    expect(summary.citedDomains).toEqual([]);
  });

  it("separates a mention from a citation with a source link", () => {
    const rows = [
      // Mentioned only - no outlet URL, no cited URLs.
      row({ id: "r1", isCited: 1, citingOutletUrl: null, citedUrls: null }),
      // Mentioned AND cited with a link.
      row({
        id: "r2",
        isCited: 1,
        citingOutletUrl: "https://venturepr.com",
        checkedAt: new Date("2026-08-31T03:00:00.000Z"),
      }),
    ];
    const summary = summarizeReport(rows, [prompt()], "Venture PR");
    const question = summary.buyerQuestions.find((q) => q.id === "prompt-1");
    expect(question?.attempts).toBe(2);
    expect(question?.mentions).toBe(2);
    expect(question?.cited).toBe(1);
    expect(summary.citedDomains).toEqual([{ domain: "venturepr.com", citations: 1, share: 100 }]);
    // The top-line tiles must never show more citations than mentions.
    expect(summary.observedMentions).toBe(2);
    expect(summary.observedAttempts).toBe(2);
    expect(summary.citedWithLink).toBe(1);
    expect(summary.citedWithLink).toBeLessThanOrEqual(summary.observedMentions);
  });

  it("excludes failed calls from every count", () => {
    const rows = [
      row({ id: "r1", citationContext: "Check failed: no response" }),
      row({ id: "r2", isCited: 1, citingOutletUrl: "https://venturepr.com" }),
    ];
    const summary = summarizeReport(rows, [prompt()], "Venture PR");
    const question = summary.buyerQuestions[0];
    expect(question?.attempts).toBe(1);
  });

  it("names a brand omission only when a competitor is cited and the brand is not", () => {
    const p2 = prompt({ id: "prompt-2", prompt: "Best PR agencies for climate tech startups" });
    const rows = [
      row({
        id: "r1",
        brandPromptId: "prompt-2",
        aiPlatform: "Claude",
        isCited: 0,
        mentionedBrands: [
          { name: "Edelman", cited: true, rank: 1 },
          { name: "Venture PR", cited: false, rank: null },
        ],
      }),
    ];
    const summary = summarizeReport(rows, [prompt(), p2], "Venture PR");
    expect(summary.omissions).toEqual([
      {
        questionId: "prompt-2",
        text: "Best PR agencies for climate tech startups",
        engineCount: 1,
        engineTotal: 1,
        competitorCount: 1,
        competitorNames: ["Edelman"],
      },
    ]);
  });

  it("does not call it an omission when the tracked brand itself was cited", () => {
    const rows = [
      row({
        isCited: 1,
        citingOutletUrl: "https://venturepr.com",
        mentionedBrands: [
          { name: "Edelman", cited: true, rank: 2 },
          { name: "Venture PR", cited: true, rank: 1 },
        ],
      }),
    ];
    const summary = summarizeReport(rows, [prompt()], "Venture PR");
    expect(summary.omissions).toEqual([]);
  });

  it("scopes buyer-question and domain counts to the most recent 14-day period", () => {
    const inWindow = row({
      id: "r1",
      isCited: 1,
      citingOutletUrl: "https://venturepr.com",
      checkedAt: new Date("2026-08-31T00:00:00.000Z"),
    });
    const outsideWindow = row({
      id: "r2",
      isCited: 1,
      citingOutletUrl: "https://forbes.com",
      checkedAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    const summary = summarizeReport([inWindow, outsideWindow], [prompt()], "Venture PR");
    expect(summary.period).toEqual({ start: "2026-08-18", end: "2026-08-31" });
    expect(summary.citedDomains).toEqual([{ domain: "venturepr.com", citations: 1, share: 100 }]);
  });
});
