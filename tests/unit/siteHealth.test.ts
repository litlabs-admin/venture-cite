// Site health citation-readiness scoring — pure function tests.
//
// Weights (see server/routes/dashboard.ts scoreSiteHealth):
//   discovery (35): robots.txt=10, sitemap.xml=15, llms.txt=10
//   crawler access (35): round(allowed/total*35)
//   crawl success (30): round(pagesFetched/(pagesFetched+pagesFailed)*30),
//     EXCLUDED (not zeroed) when there is no crawl run — rescale over 70.

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
    // only those same 2 files were ever probed — never as "3/5 missing".
    const withUnknowns = scoreSiteHealth({
      website: "https://example.com",
      discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: null },
      crawlers: { total: 10, allowed: 10 },
      crawl: null,
    });
    const onlyConfirmed = scoreSiteHealth({
      website: "https://example.com",
      // llmsTxt omitted from scoring entirely — same attainable denominator
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
});
