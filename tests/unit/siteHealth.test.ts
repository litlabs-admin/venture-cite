// Site health citation-readiness scoring - pure function tests.
//
// Weights (see server/routes/dashboard.ts scoreSiteHealth):
//   discovery (35): robots.txt=10, sitemap.xml=15, llms.txt=10
//   crawler access (35): round(allowed/total*35)
//   crawl success (30): round(pagesFetched/(pagesFetched+pagesFailed)*30),
//     EXCLUDED (not zeroed) when there is no crawl run - rescale over 70.

import { describe, it, expect, vi } from "vitest";

// dashboard.ts transitively touches server/db.ts (real Postgres pool,
// requires DATABASE_URL) and server/lib/routesShared.ts (instantiates an
// OpenAI client, requires OPENAI_API_KEY) via storage.ts / routesShared.
// scoreSiteHealth itself is a pure function with no I/O, so stub those
// modules rather than requiring live credentials just to import this file.
// Mirrors the mock pattern in tests/unit/dashboardRecommendationInputs.test.ts.
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler: (fn: unknown) => fn,
  sendError: vi.fn(),
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/db", () => ({ db: {}, pool: {} }));

const { scoreSiteHealth } = await import("../../server/routes/dashboard");

describe("scoreSiteHealth", () => {
  it("all discovery present + all crawlers allowed + perfect crawl -> 100", () => {
    const score = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: true },
      crawlers: { total: 10, allowed: 10 },
      crawl: { pagesFetched: 20, pagesFailed: 0 },
    });
    expect(score).toBe(100);
  });

  it("nothing present, all crawlers blocked, all pages failed -> 0", () => {
    const score = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: false, sitemapXml: false, llmsTxt: false },
      crawlers: { total: 10, allowed: 0 },
      crawl: { pagesFetched: 0, pagesFailed: 20 },
    });
    expect(score).toBe(0);
  });

  it("no crawl run -> rescales over 70 attainable, not penalised (full discovery + full crawler access -> 100)", () => {
    const score = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: true },
      crawlers: { total: 10, allowed: 10 },
      crawl: null,
    });
    expect(score).toBe(100);
  });

  it("website null and no crawl run -> null", () => {
    const score = scoreSiteHealth({
      website: null,
      discovery: { robotsTxt: false, sitemapXml: false, llmsTxt: false },
      crawlers: { total: 0, allowed: 0 },
      crawl: null,
    });
    expect(score).toBeNull();
  });

  it("pending -> score is null, regardless of what the placeholder's other fields say", () => {
    const score = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: false, sitemapXml: false, llmsTxt: false },
      crawlers: { total: 10, allowed: 0 },
      crawl: null,
      pending: true,
    });
    expect(score).toBeNull();
  });

  it("unknown (null) discovery files are EXCLUDED from both earned and attainable, not scored as missing", () => {
    // 2 confirmed present + 3 unknown must score IDENTICALLY to a site where
    // only those same 2 files were ever probed - never as "3/5 missing".
    const withUnknowns = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: null },
      crawlers: { total: 10, allowed: 10 },
      crawl: null,
    });
    const onlyConfirmed = scoreSiteHealth({
      website: "https://example.com",
      // llmsTxt omitted from scoring entirely - same attainable denominator
      // as the "unknown" case above should produce.
      discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: null },
      crawlers: { total: 10, allowed: 10 },
      crawl: null,
    });
    expect(withUnknowns).toBe(onlyConfirmed);
    // Both discovery + crawler access fully earned over their (rescaled)
    // attainable points -> 100, same shape as the "no crawl run" case above.
    expect(withUnknowns).toBe(100);
  });

  it("an unknown discovery file scores strictly better than a CONFIRMED-absent one", () => {
    const unknown = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: null },
      crawlers: { total: 10, allowed: 10 },
      crawl: null,
    });
    const confirmedAbsent = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: false },
      crawlers: { total: 10, allowed: 10 },
      crawl: null,
    });
    expect(unknown).toBeGreaterThan(confirmedAbsent!);
  });

  // The tests above all use exact 0%/100% ratios (or ratios producing whole
  // numbers), which cannot tell Math.round from Math.floor apart, cannot
  // tell one point-weighting scheme from another, and never reach the
  // zero-denominator branches. See .audit/B6/B6b-03-mutation-metrics.md
  // sections 1.2-1.5. Each test below is built around a value chosen
  // specifically to fail under the named defect.

  it("crawler-access ratio at the .5 rounding boundary distinguishes round from floor (and the final round from a final floor)", () => {
    // 7/10 allowed = 0.7 * 35 = 24.5 - the exact halfway point where
    // Math.round (25) and Math.floor (24) diverge. Discovery is fully
    // earned (35, no rounding involved) and crawl is omitted, so the ONLY
    // ambiguity in `earned` comes from the crawler-access term.
    //   earned=35+round(24.5)=60, attainable=70 -> round(60/70*100)=round(85.71..)=86
    //   earned=35+floor(24.5)=59, attainable=70 -> round(59/70*100)=round(84.28..)=84
    // 86 also happens to prove the FINAL Math.round is not a floor: with
    // the crawler term correct (earned=60), floor(85.71..) would be 85,
    // not 86 - so this one input catches both the crawler-access rounding
    // mutation and the outer-total rounding mutation.
    const score = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: true },
      crawlers: { total: 10, allowed: 7 },
      crawl: null,
    });
    expect(score).toBe(86);
  });

  it("crawl-success ratio at the .5 rounding boundary distinguishes round from floor", () => {
    // 3/4 pages fetched = 0.75 * 30 = 22.5 - the halfway point for the
    // crawl-success term specifically. Discovery and crawler-access are
    // both fully earned at exact ratios (35 + 35, no rounding), and the
    // total attainable is exactly 100, so earned/attainable*100 == earned
    // and the outer round cannot introduce or mask ambiguity here:
    //   earned=35+35+round(22.5)=93 -> score 93
    //   earned=35+35+floor(22.5)=92 -> score 92
    const score = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: true },
      crawlers: { total: 10, allowed: 10 },
      crawl: { pagesFetched: 3, pagesFailed: 1 },
    });
    expect(score).toBe(93);
  });

  it("the 35/30 crawler/crawl-success point split changes the score when the two terms' ratios differ", () => {
    // Discovery excluded entirely (all null) so it can't dilute the
    // signal. Crawler access is fully earned (ratio 1, contributes its
    // whole weight) and crawl success is earned at exactly half (ratio
    // 0.5, both exact - no rounding ambiguity mixed in). Re-splitting
    // 35/30 to 45/20 (audit's named mutation, same 65-point subtotal)
    // changes which term's weight the full-vs-half ratio gets applied to:
    //   original: earned=35*1 + round(0.5*30)=15 -> 50/65 -> round(76.92)=77
    //   mutated:  earned=45*1 + round(0.5*20)=10 -> 55/65 -> round(84.61)=85
    const score = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: null, sitemapXml: null, llmsTxt: null },
      crawlers: { total: 4, allowed: 4 },
      crawl: { pagesFetched: 1, pagesFailed: 1 },
    });
    expect(score).toBe(77);
  });

  it("the 10/15/10 discovery weights change the score when robots.txt and sitemap.xml disagree", () => {
    // Crawler access is given a clean, fully-earned ratio (1/1 -> its
    // whole 35 points, both earned and attainable, no rounding involved)
    // purely so attainable/earned aren't both zero; crawl is excluded
    // (null). robotsTxt=true / sitemapXml=false is the one shape where a
    // 10/15 vs 15/10 swap changes the earned points without touching
    // attainable (10+15 == 15+10 == 25) or the crawler term:
    //   original: earned=10(robots)+35(crawler)=45, attainable=25+35=60 -> round(45/60*100)=75
    //   mutated:  earned=15(robots)+35(crawler)=50, attainable=25+35=60 -> round(50/60*100)=83.33->83
    const score = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: true, sitemapXml: false, llmsTxt: null },
      crawlers: { total: 1, allowed: 1 },
      crawl: null,
    });
    expect(score).toBe(75);
  });

  it("crawler-access guard: total=0 (never crawled) contributes 0 to earned, not NaN, when website is otherwise known", () => {
    // `!website && !crawl` only short-circuits to null when BOTH are
    // falsy; a real website with crawlers.total=0 and no crawl run must
    // still reach the crawler-access line with a zero denominator.
    // `attainable += 35` runs unconditionally (crawler-access always
    // counts toward the denominator, unlike discovery's null-exclusion),
    // so with full discovery (35/35) the guarded score is
    // round(35/(35+35)*100) = 50. Without the `crawlers.total > 0` guard,
    // `0/0` is NaN and NaN poisons the whole score instead of that 50.
    const score = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: true },
      crawlers: { total: 0, allowed: 0 },
      crawl: null,
    });
    expect(score).toBe(50);
    expect(Number.isNaN(score)).toBe(false);
  });

  it("crawl-success guard: a crawl that ran but fetched zero pages contributes 0, not NaN", () => {
    // crawl !== null (a crawl DID run) but pagesFetched=pagesFailed=0, so
    // `denom` is 0. Discovery and crawler-access are both fully earned at
    // exact ratios (35 + 35, attainable 100 total with crawl's 30 added),
    // so without the `denom > 0` guard, `0/0` is NaN and the whole score
    // becomes NaN instead of the guarded 70 (= 35 + 35 + 0 over 100).
    const score = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: true },
      crawlers: { total: 10, allowed: 10 },
      crawl: { pagesFetched: 0, pagesFailed: 0 },
    });
    expect(score).toBe(70);
    expect(Number.isNaN(score)).toBe(false);
  });
});
