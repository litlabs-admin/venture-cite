import { describe, it, expect, vi, beforeEach } from "vitest";

// The Reddit scanner is UNAUTHENTICATED ONLY. The OAuth path — token exchange,
// authenticated fetch, and comment-tree expansion — was removed, along with
// server/lib/redditOAuth.ts. What remains is public JSON with an RSS fallback,
// so these tests exercise that path rather than pinning to a mode that no
// longer exists (the previous suite mocked hasRedditOAuthCredentials() to true).
//
// vi.mock factories are hoisted before top-level imports, so vi.hoisted()
// shares mock handles with the factory closures.
const { mockPublicFetch, mockAcquireOrWait } = vi.hoisted(() => ({
  mockPublicFetch: vi.fn(),
  mockAcquireOrWait: vi.fn(),
}));

vi.mock("../../server/lib/redditFetch", () => ({
  redditPublicFetch: mockPublicFetch,
  REDDIT_USER_AGENT: "test-agent",
}));

vi.mock("../../server/lib/rateLimitBuckets", () => ({
  acquireOrWait: mockAcquireOrWait,
}));

import { scanRedditSource } from "../../server/lib/sources/redditSource";

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function errStatus(code: number): Response {
  return {
    ok: false,
    status: code,
    json: async () => ({}),
    text: async () => "",
  } as unknown as Response;
}
/** One `t3` (post) child in the shape /search.json returns. */
function post(over: Record<string, unknown> = {}) {
  return {
    kind: "t3",
    data: {
      title: "Linear is great",
      selftext: "I switched to Linear last year",
      author: "someuser",
      permalink: "/r/test/comments/abc/linear/",
      created_utc: 1_700_000_000,
      ups: 12,
      num_comments: 3,
      ...over,
    },
  };
}
const listing = (children: unknown[]) => ({ data: { children } });

const BASE_INPUT = {
  query: '(title:"Linear" OR selftext:"Linear")',
  variations: ["Linear"],
  brandId: "brand-uuid-001",
  sinceUnix: undefined as number | undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAcquireOrWait.mockResolvedValue(true);
});

describe("scanRedditSource — public JSON path", () => {
  it("returns a shaped mention from a matching post", async () => {
    mockPublicFetch.mockResolvedValue(okJson(listing([post()])));

    const r = await scanRedditSource(BASE_INPUT);

    expect(r.failed).toBeUndefined();
    expect(r.mentions).toHaveLength(1);
    expect(r.mentions[0]).toMatchObject({
      platform: "reddit",
      sourceUrl: "https://reddit.com/r/test/comments/abc/linear/",
      sourceTitle: "Linear is great",
      authorUsername: "someuser",
      mentionLocation: "post",
      engagementInputs: { ups: 12, comments: 3 },
    });
  });

  it("excludes NSFW posts", async () => {
    mockPublicFetch.mockResolvedValue(okJson(listing([post({ over_18: true })])));
    expect((await scanRedditSource(BASE_INPUT)).mentions).toHaveLength(0);
  });

  it("excludes removed and deleted posts", async () => {
    mockPublicFetch.mockResolvedValue(
      okJson(
        listing([
          post({ removed_by_category: "moderator" }),
          post({ author: "[deleted]", permalink: "/r/test/comments/d/x/" }),
          post({ selftext: "[removed]", permalink: "/r/test/comments/e/x/" }),
        ]),
      ),
    );
    expect((await scanRedditSource(BASE_INPUT)).mentions).toHaveLength(0);
  });

  it("excludes a post that does not mention any brand variation", async () => {
    mockPublicFetch.mockResolvedValue(
      okJson(listing([post({ title: "Unrelated", selftext: "nothing here" })])),
    );
    expect((await scanRedditSource(BASE_INPUT)).mentions).toHaveLength(0);
  });

  it("dedupes the same permalink seen across two variations", async () => {
    mockPublicFetch.mockResolvedValue(okJson(listing([post()])));
    const r = await scanRedditSource({ ...BASE_INPUT, variations: ["Linear", "linear app"] });
    expect(r.mentions).toHaveLength(1);
  });

  it("uses t=year on a first scan and t=week once sinceUnix is set", async () => {
    mockPublicFetch.mockResolvedValue(okJson(listing([])));

    await scanRedditSource(BASE_INPUT);
    expect(String(mockPublicFetch.mock.calls[0][0])).toContain("t=year");

    mockPublicFetch.mockClear();
    await scanRedditSource({ ...BASE_INPUT, sinceUnix: 1_700_000_000 });
    expect(String(mockPublicFetch.mock.calls[0][0])).toContain("t=week");
  });
});

describe("scanRedditSource — blocked and failing", () => {
  // Live behaviour as of 2026-07-30: Reddit 403s unauthenticated traffic on
  // BOTH the JSON and RSS endpoints. The scan must report a source FAILURE,
  // never an empty success — an empty list reads as "nothing was said about
  // this brand", which is a different and false claim.
  it("reports failed (not an empty success) when both JSON and RSS are blocked", async () => {
    mockPublicFetch.mockResolvedValue(errStatus(403));

    const r = await scanRedditSource(BASE_INPUT);

    expect(r.mentions).toHaveLength(0);
    expect(r.failed).toBeTruthy();
    expect(r.failed).toMatch(/403/);
  });

  it("reports failed when the rate-limit bucket times out for every variation", async () => {
    mockAcquireOrWait.mockResolvedValue(false);

    const r = await scanRedditSource(BASE_INPUT);

    expect(r.mentions).toHaveLength(0);
    expect(r.failed).toBeTruthy();
  });

  it("never throws out of the scanner — a fetch rejection becomes `failed`", async () => {
    mockPublicFetch.mockRejectedValue(new Error("socket hang up"));

    const r = await scanRedditSource(BASE_INPUT);

    expect(r.mentions).toHaveLength(0);
    expect(r.failed).toBeTruthy();
  });
});
