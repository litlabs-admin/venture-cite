// Direct, no-HTTP tests for server/services/crawlerPermissions.ts.
//
// HTTP-level behavior for POST /api/check-crawler-permissions is covered by
// the route wiring; this file proves the extracted checkCrawlerPermissions
// function works when called directly, including the two distinct 400
// error paths (invalid URL format vs SSRF-disallowed target) the route
// maps to different status codes/messages.

import { describe, it, expect, vi, beforeEach } from "vitest";

const FAKE_CRAWLERS = [
  { platform: "ChatGPT-User", agent: "ChatGPT-User", purpose: "realtime" as const },
  { platform: "GPTBot", agent: "GPTBot", purpose: "training" as const },
  { platform: "PerplexityBot", agent: "PerplexityBot", purpose: "search" as const },
];

const crawlerStubs = vi.hoisted(() => ({
  fetchRobots: vi.fn(),
  parseRobotsTxt: vi.fn(),
  evaluateCrawlers: vi.fn(),
}));

vi.mock("../../server/lib/crawlerAccess", () => ({
  AI_CRAWLERS: FAKE_CRAWLERS,
  fetchRobots: crawlerStubs.fetchRobots,
  parseRobotsTxt: crawlerStubs.parseRobotsTxt,
  evaluateCrawlers: crawlerStubs.evaluateCrawlers,
  DisallowedUrlError: class DisallowedUrlError extends Error {},
}));

const { checkCrawlerPermissions, InvalidUrlFormatError } =
  await import("../../server/services/crawlerPermissions");
const { DisallowedUrlError } = await import("../../server/lib/crawlerAccess");

beforeEach(() => {
  crawlerStubs.fetchRobots.mockReset();
  crawlerStubs.parseRobotsTxt.mockReset();
  crawlerStubs.evaluateCrawlers.mockReset();
});

describe("checkCrawlerPermissions", () => {
  it("throws InvalidUrlFormatError for an unparseable url", async () => {
    await expect(checkCrawlerPermissions("::not a url::")).rejects.toBeInstanceOf(
      InvalidUrlFormatError,
    );
    expect(crawlerStubs.fetchRobots).not.toHaveBeenCalled();
  });

  it("propagates DisallowedUrlError from fetchRobots for SSRF-disallowed targets", async () => {
    crawlerStubs.fetchRobots.mockRejectedValue(new DisallowedUrlError("private IP"));

    await expect(checkCrawlerPermissions("http://169.254.169.254")).rejects.toBeInstanceOf(
      DisallowedUrlError,
    );
  });

  it("returns a summary + recommendations when robots.txt blocks a search bot", async () => {
    crawlerStubs.fetchRobots.mockResolvedValue({
      content: "User-agent: PerplexityBot\nDisallow: /",
      robotsTxtExists: true,
      fetchError: "",
    });
    crawlerStubs.parseRobotsTxt.mockReturnValue([{ agent: "PerplexityBot", disallow: ["/"] }]);
    crawlerStubs.evaluateCrawlers.mockReturnValue([
      { ...FAKE_CRAWLERS[0], status: "allowed" },
      { ...FAKE_CRAWLERS[1], status: "allowed" },
      { ...FAKE_CRAWLERS[2], status: "blocked" },
    ]);

    const result = await checkCrawlerPermissions("acme.com");

    expect(result.url).toBe("https://acme.com");
    expect(result.robotsTxtUrl).toBe("https://acme.com/robots.txt");
    expect(result.summary).toEqual({ total: 3, allowed: 2, blocked: 1, unknown: 0, geoScore: 67 });
    expect(result.recommendations.some((r) => r.includes("CRITICAL"))).toBe(true);
    expect(result.recommendations.some((r) => r.includes("PerplexityBot"))).toBe(true);
  });

  it("suggests a robots.txt snippet when none exists", async () => {
    crawlerStubs.fetchRobots.mockResolvedValue({
      content: "",
      robotsTxtExists: false,
      fetchError: "",
    });
    crawlerStubs.parseRobotsTxt.mockReturnValue([]);
    crawlerStubs.evaluateCrawlers.mockReturnValue(
      FAKE_CRAWLERS.map((c) => ({ ...c, status: "unknown" })),
    );

    const result = await checkCrawlerPermissions("acme.com");

    expect(result.robotsTxtExists).toBe(false);
    expect(result.rawRobotsTxt).toBeNull();
    expect(result.recommendations.some((r) => r.includes("No robots.txt found"))).toBe(true);
    expect(result.recommendations.some((r) => r.includes("User-agent: *"))).toBe(true);
  });
});
