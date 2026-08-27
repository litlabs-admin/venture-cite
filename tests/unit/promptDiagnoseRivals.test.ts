// diagnosePrompt's rival list must include TRACKED competitors.
//
// Tracked competitors are written to their own table (competitor_geo_rankings,
// one row per competitor per prompt per engine) by citationChecker. The
// diagnosis originally read only geo_rankings and derived rivals from the
// mentioned_brands JSONB blob on the brand's own rows, so every tracked
// competitor was invisible to it and the verdict said "no rival was named"
// on prompts where rivals were in fact being tracked.
//
// The pairing rule is the load-bearing part: a competitor row only counts when
// it belongs to the SAME (runId, aiPlatform) as the brand row being analysed.
// Mixing runs would let a rival from an old run be scored against our absence
// in the current one, which is how you get confidently wrong numbers.
//
// getOpenrouterClient is stubbed to null throughout: that short-circuits the
// narrative half and returns the measured half untouched, which is exactly
// what these tests are about. No LLM is involved.

import { describe, it, expect, beforeEach, vi } from "vitest";

const storageStubs = vi.hoisted(() => ({
  getGeoRankingsByBrandPromptIds: vi.fn(),
  getCompetitorGeoRankingsByPromptRuns: vi.fn(),
  getCompetitors: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));

vi.mock("../../server/lib/factAgent/v2/openrouterClient", () => ({
  getOpenrouterClient: () => null,
}));

// Deterministic standing; these tests assert on rivals, not on scoring.
vi.mock("../../server/lib/promptScoreHistory", () => ({
  resolvePoints: () => 30,
  buildPromptScoreHistory: () => [{ score: 0, rank: null }],
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { diagnosePrompt } = await import("../../server/lib/promptDiagnose");

const BRAND: any = { id: "brand-1", name: "Venture PR", website: "https://venturepr.com" };
const PROMPT: any = { id: "prompt-1", prompt: "best PR agencies for robotics", category: null };

const RUN = "run-1";

/** A brand row: us, on one platform, in one run. `cited` defaults to absent - the
 *  scenario the user hit. */
function brandRow(platform: string, opts: { cited?: boolean; runId?: string | null } = {}) {
  return {
    aiPlatform: platform,
    runId: opts.runId === undefined ? RUN : opts.runId,
    isCited: opts.cited ? 1 : 0,
    checkedAt: new Date("2026-08-26T00:00:00Z"),
    citedUrls: [],
    citingOutletUrl: null,
    mentionedBrands: [],
  };
}

/** A tracked-competitor row, as citationChecker writes it. */
function rivalRow(
  competitorId: string,
  platform: string,
  opts: { rank?: number | null; runId?: string } = {},
) {
  return {
    competitorId,
    aiPlatform: platform,
    runId: opts.runId ?? RUN,
    isCited: 1,
    rank: opts.rank ?? null,
    checkedAt: new Date("2026-08-26T00:00:00Z"),
  };
}

describe("diagnosePrompt rivals", () => {
  beforeEach(() => {
    storageStubs.getGeoRankingsByBrandPromptIds.mockReset();
    storageStubs.getCompetitorGeoRankingsByPromptRuns.mockReset();
    storageStubs.getCompetitors.mockReset();
    storageStubs.getCompetitorGeoRankingsByPromptRuns.mockResolvedValue([]);
    storageStubs.getCompetitors.mockResolvedValue([]);
  });

  it("reports tracked competitors as rivals when we were absent", async () => {
    // The reported scenario: cited by 0 of 6, but rivals ARE tracked.
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      brandRow("chatgpt"),
      brandRow("claude"),
    ]);
    storageStubs.getCompetitors.mockResolvedValue([
      { id: "c1", name: "Rival One", nameVariations: [] },
    ]);
    storageStubs.getCompetitorGeoRankingsByPromptRuns.mockResolvedValue([
      rivalRow("c1", "chatgpt", { rank: 2 }),
      rivalRow("c1", "claude", { rank: 5 }),
    ]);

    const out = await diagnosePrompt(BRAND, PROMPT);

    expect(out.rivals.map((r) => r.name)).toContain("Rival One");
    const rival = out.rivals.find((r) => r.name === "Rival One")!;
    expect(rival.timesNamed).toBe(2);
    expect(rival.bestRank).toBe(2);
    // We were cited in neither response, so both count against us.
    expect(rival.namedWhileWeWereAbsent).toBe(2);
  });

  it("counts namedWhileWeWereAbsent only for responses where we were absent", async () => {
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      brandRow("chatgpt", { cited: true }),
      brandRow("claude"),
    ]);
    storageStubs.getCompetitors.mockResolvedValue([
      { id: "c1", name: "Rival One", nameVariations: [] },
    ]);
    storageStubs.getCompetitorGeoRankingsByPromptRuns.mockResolvedValue([
      rivalRow("c1", "chatgpt"),
      rivalRow("c1", "claude"),
    ]);

    const out = await diagnosePrompt(BRAND, PROMPT);
    const rival = out.rivals.find((r) => r.name === "Rival One")!;
    expect(rival.timesNamed).toBe(2);
    expect(rival.namedWhileWeWereAbsent).toBe(1);
  });

  it("ignores competitor rows from a different run than the analysed one", async () => {
    // The correctness guard. A rival cited in run-0 must not be scored
    // against our absence in run-1.
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([brandRow("chatgpt")]);
    storageStubs.getCompetitors.mockResolvedValue([
      { id: "c1", name: "Rival One", nameVariations: [] },
    ]);
    storageStubs.getCompetitorGeoRankingsByPromptRuns.mockResolvedValue([
      rivalRow("c1", "chatgpt", { runId: "run-0" }),
    ]);

    const out = await diagnosePrompt(BRAND, PROMPT);
    expect(out.rivals).toHaveLength(0);
  });

  it("ignores competitor rows for a platform we have no brand row for", async () => {
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([brandRow("chatgpt")]);
    storageStubs.getCompetitors.mockResolvedValue([
      { id: "c1", name: "Rival One", nameVariations: [] },
    ]);
    storageStubs.getCompetitorGeoRankingsByPromptRuns.mockResolvedValue([rivalRow("c1", "gemini")]);

    const out = await diagnosePrompt(BRAND, PROMPT);
    expect(out.rivals).toHaveLength(0);
  });

  it("skips competitor rows whose competitor is deleted or ignored", async () => {
    // getCompetitors excludes soft-deleted rows, so an unknown id means the
    // user stopped tracking that rival. Showing a bare UUID would be worse
    // than omitting it.
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([brandRow("chatgpt")]);
    storageStubs.getCompetitors.mockResolvedValue([]);
    storageStubs.getCompetitorGeoRankingsByPromptRuns.mockResolvedValue([
      rivalRow("c-deleted", "chatgpt"),
    ]);

    const out = await diagnosePrompt(BRAND, PROMPT);
    expect(out.rivals).toHaveLength(0);
  });

  it("does not double-count a competitor that also appears in mentionedBrands", async () => {
    // The analyzer names rivals in the blob too. A tracked competitor must
    // appear once, from the authoritative row - not twice under two spellings.
    const row: any = brandRow("chatgpt");
    row.mentionedBrands = [{ name: "Rival One Inc.", cited: true, rank: 3 }];
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([row]);
    storageStubs.getCompetitors.mockResolvedValue([
      { id: "c1", name: "Rival One", nameVariations: ["Rival One Inc."] },
    ]);
    storageStubs.getCompetitorGeoRankingsByPromptRuns.mockResolvedValue([
      rivalRow("c1", "chatgpt", { rank: 3 }),
    ]);

    const out = await diagnosePrompt(BRAND, PROMPT);
    expect(out.rivals).toHaveLength(1);
    expect(out.rivals[0].name).toBe("Rival One");
    expect(out.rivals[0].timesNamed).toBe(1);
  });

  it("still surfaces untracked brands from mentionedBrands", async () => {
    // Not a regression target - the blob remains the only source for brands
    // the user does not track, and that behaviour must survive the change.
    const row: any = brandRow("chatgpt");
    row.mentionedBrands = [{ name: "Some Untracked Agency", cited: true, rank: 1 }];
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([row]);

    const out = await diagnosePrompt(BRAND, PROMPT);
    expect(out.rivals.map((r) => r.name)).toContain("Some Untracked Agency");
  });

  it("never lists our own brand as a rival", async () => {
    const row: any = brandRow("chatgpt");
    row.mentionedBrands = [{ name: "Venture PR", cited: true, rank: 1 }];
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([row]);

    const out = await diagnosePrompt(BRAND, PROMPT);
    expect(out.rivals.map((r) => r.name)).not.toContain("Venture PR");
  });

  it("does not query competitor rows when no brand row carries a runId", async () => {
    // Legacy rows can have run_id NULL (ON DELETE SET NULL). There is no safe
    // key to pair them on, so those platforms contribute no tracked rivals
    // rather than being paired by a fuzzy timestamp guess.
    storageStubs.getGeoRankingsByBrandPromptIds.mockResolvedValue([
      brandRow("chatgpt", { runId: null }),
    ]);
    storageStubs.getCompetitors.mockResolvedValue([
      { id: "c1", name: "Rival One", nameVariations: [] },
    ]);

    const out = await diagnosePrompt(BRAND, PROMPT);
    expect(out.rivals).toHaveLength(0);
    expect(storageStubs.getCompetitorGeoRankingsByPromptRuns).not.toHaveBeenCalled();
  });
});
