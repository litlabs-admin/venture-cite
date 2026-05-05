import { describe, it, expect, vi, beforeEach } from "vitest";
import redditSearchFixture from "../fixtures/reddit-search.json";
import redditCommentsFixture from "../fixtures/reddit-comments.json";

// vi.mock factories are hoisted before top-level imports, so we use
// vi.hoisted() to share mock handles with the factory closures.
const { mockRedditFetch, mockAcquireOrWait } = vi.hoisted(() => ({
  mockRedditFetch: vi.fn(),
  mockAcquireOrWait: vi.fn(),
}));

vi.mock("../../server/lib/redditOAuth", () => ({
  redditFetch: mockRedditFetch,
  redditPublicFetch: vi.fn(), // not used when hasRedditOAuthCredentials() is true
  hasRedditOAuthCredentials: () => true, // pin tests to the OAuth path
}));

vi.mock("../../server/lib/rateLimitBuckets", () => ({
  acquireOrWait: mockAcquireOrWait,
}));

import { scanRedditSource } from "../../server/lib/sources/redditSource";

// Helper: build a minimal ok Response that returns the given JSON body.
function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function errResponse(status: number): Response {
  return { ok: false, status } as unknown as Response;
}

const BASE_INPUT = {
  query: '(title:"Linear" OR selftext:"Linear")',
  variations: ["Linear", "linear app", "linear.app"],
  brandId: "brand-uuid-001",
};

describe("scanRedditSource", () => {
  beforeEach(() => {
    mockRedditFetch.mockReset();
    mockAcquireOrWait.mockReset();
    // Default: rate-limit always acquired
    mockAcquireOrWait.mockResolvedValue(true);
  });

  // -------------------------------------------------------------------------
  // Basic happy path
  // -------------------------------------------------------------------------

  it("returns expected mention count from fixtures (1 post + 1 comment)", async () => {
    // Search returns 3 posts: 1 matching, 1 non-matching, 1 NSFW.
    // Provide an empty comment tree for the non-matching post (def456) so we get
    // exactly 1 post mention + 1 comment mention from the matching post (abc123).
    const emptyCommentTree = [
      { kind: "Listing", data: { children: [] } },
      { kind: "Listing", data: { children: [] } },
    ];

    mockRedditFetch
      // First call: /search
      .mockResolvedValueOnce(okJson(redditSearchFixture))
      // Second call: comment tree for the matching post (abc123)
      .mockResolvedValueOnce(okJson(redditCommentsFixture))
      // Third call: comment tree for the non-matching post (def456)
      .mockResolvedValueOnce(okJson(emptyCommentTree));

    const { mentions, failed } = await scanRedditSource(BASE_INPUT);

    expect(failed).toBeUndefined();
    // One matching post mention + one matching comment mention
    expect(mentions).toHaveLength(2);
  });

  it("correctly shapes the post mention", async () => {
    mockRedditFetch
      .mockResolvedValueOnce(okJson(redditSearchFixture))
      .mockResolvedValueOnce(okJson(redditCommentsFixture))
      .mockResolvedValueOnce(okJson(redditCommentsFixture));

    const { mentions } = await scanRedditSource(BASE_INPUT);

    const postMention = mentions.find((m) => m.mentionLocation === "post");
    expect(postMention).toBeDefined();
    expect(postMention!.platform).toBe("reddit");
    expect(postMention!.sourceUrl).toContain("reddit.com");
    expect(postMention!.sourceUrl).toContain("abc123");
    expect(postMention!.sourceTitle).toBe("Why we switched to Linear for project management");
    expect(postMention!.mentionLocation).toBe("post");
    expect(postMention!.matchedVariation).toBe("Linear");
    expect(postMention!.matchedField).toBe("title");
    expect(postMention!.authorUsername).toBe("devuser42");
    expect(postMention!.mentionedAt).toBeInstanceOf(Date);
    expect(postMention!.engagementInputs.ups).toBe(142);
    expect(postMention!.engagementInputs.comments).toBe(27);
  });

  it("correctly shapes the comment mention", async () => {
    mockRedditFetch
      .mockResolvedValueOnce(okJson(redditSearchFixture))
      .mockResolvedValueOnce(okJson(redditCommentsFixture))
      .mockResolvedValueOnce(okJson(redditCommentsFixture));

    const { mentions } = await scanRedditSource(BASE_INPUT);

    const commentMention = mentions.find((m) => m.mentionLocation === "comment");
    expect(commentMention).toBeDefined();
    expect(commentMention!.platform).toBe("reddit");
    expect(commentMention!.mentionLocation).toBe("comment");
    expect(commentMention!.matchedField).toBe("comment");
    expect(commentMention!.matchedVariation).toBe("linear app");
    // comment body contains "linear app"
    expect(commentMention!.mentionContext).toContain("linear app");
    // sourceTitle is the parent post title
    expect(commentMention!.sourceTitle).toBe("Why we switched to Linear for project management");
    // engagementInputs.comments is 0 for comments
    expect(commentMention!.engagementInputs.comments).toBe(0);
    expect(commentMention!.engagementInputs.ups).toBe(23);
  });

  // -------------------------------------------------------------------------
  // NSFW exclusion
  // -------------------------------------------------------------------------

  it("excludes NSFW posts (over_18: true)", async () => {
    mockRedditFetch
      .mockResolvedValueOnce(okJson(redditSearchFixture))
      .mockResolvedValueOnce(okJson(redditCommentsFixture))
      .mockResolvedValueOnce(okJson(redditCommentsFixture));

    const { mentions } = await scanRedditSource(BASE_INPUT);

    // No mention should have a sourceUrl containing ghi789 (NSFW post)
    const nsfwMention = mentions.find((m) => m.sourceUrl.includes("ghi789"));
    expect(nsfwMention).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Non-matching post excluded
  // -------------------------------------------------------------------------

  it("excludes post that does not match brand variations", async () => {
    mockRedditFetch
      .mockResolvedValueOnce(okJson(redditSearchFixture))
      .mockResolvedValueOnce(okJson(redditCommentsFixture))
      .mockResolvedValueOnce(okJson(redditCommentsFixture));

    const { mentions } = await scanRedditSource(BASE_INPUT);

    // def456 is the non-matching post — it should not appear as a post mention.
    const nonMatchingPost = mentions.find(
      (m) => m.mentionLocation === "post" && m.sourceUrl.includes("def456"),
    );
    expect(nonMatchingPost).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Rate-limit timeout (top-level acquire)
  // -------------------------------------------------------------------------

  it("returns failed when top-level rate-limit times out", async () => {
    mockAcquireOrWait.mockResolvedValueOnce(false);

    const { mentions, failed } = await scanRedditSource(BASE_INPUT);

    expect(mentions).toHaveLength(0);
    expect(failed).toMatch(/rate-limited/i);
    // redditFetch should never have been called
    expect(mockRedditFetch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // HTTP non-2xx response
  // -------------------------------------------------------------------------

  it("returns failed on non-2xx HTTP response from /search", async () => {
    mockRedditFetch.mockResolvedValueOnce(errResponse(503));

    const { mentions, failed } = await scanRedditSource(BASE_INPUT);

    expect(mentions).toHaveLength(0);
    expect(failed).toMatch(/503/);
  });

  // -------------------------------------------------------------------------
  // Comment-tree rate-limit failure only skips that post's comments
  // -------------------------------------------------------------------------

  it("skips comment expansion but does not fail whole scan when comment-tree rate-limit times out", async () => {
    // First acquireOrWait call (top-level search): succeed
    // Second call (per-post comment token for abc123): fail
    // Third call (per-post comment token for def456): fail
    mockAcquireOrWait
      .mockResolvedValueOnce(true) // search token
      .mockResolvedValueOnce(false) // comment tree for post 1 — rate-limited
      .mockResolvedValueOnce(false); // comment tree for post 2 — rate-limited

    mockRedditFetch.mockResolvedValueOnce(okJson(redditSearchFixture));
    // No comment-tree fetch calls should happen

    const { mentions, failed } = await scanRedditSource(BASE_INPUT);

    // Should still find the post mention (abc123 matches brand)
    // but NO comment mentions because comment-tree was skipped for all posts
    expect(failed).toBeUndefined();
    const commentMentions = mentions.filter((m) => m.mentionLocation === "comment");
    expect(commentMentions).toHaveLength(0);
    // The post itself still shows up if it matches
    expect(mentions.length).toBeGreaterThanOrEqual(1);
    // redditFetch only called once (the /search, not the comment trees)
    expect(mockRedditFetch).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // sinceUnix parameter affects t= param
  // -------------------------------------------------------------------------

  it("uses t=year when sinceUnix is undefined (first scan)", async () => {
    mockRedditFetch.mockResolvedValue(okJson(redditSearchFixture));

    await scanRedditSource(BASE_INPUT);

    const firstCall = mockRedditFetch.mock.calls[0][0] as string;
    expect(firstCall).toContain("t=year");
  });

  it("uses t=week when sinceUnix is set (subsequent scan)", async () => {
    mockRedditFetch.mockResolvedValue(okJson(redditSearchFixture));

    await scanRedditSource({ ...BASE_INPUT, sinceUnix: 1714000000 });

    const firstCall = mockRedditFetch.mock.calls[0][0] as string;
    expect(firstCall).toContain("t=week");
  });

  // -------------------------------------------------------------------------
  // Deleted / removed content is skipped
  // -------------------------------------------------------------------------

  it("skips posts with author [deleted]", async () => {
    const withDeletedAuthor = {
      ...redditSearchFixture,
      data: {
        ...redditSearchFixture.data,
        children: [
          {
            kind: "t3",
            data: {
              id: "zz0001",
              title: "Linear is awesome",
              selftext: "Linear saved us so much time.",
              permalink: "/r/sub/comments/zz0001/linear_is_awesome/",
              author: "[deleted]",
              ups: 10,
              num_comments: 1,
              created_utc: 1714521600,
              over_18: false,
              removed_by_category: null,
              subreddit: "sub",
            },
          },
        ],
      },
    };

    mockRedditFetch.mockResolvedValueOnce(okJson(withDeletedAuthor));

    const { mentions } = await scanRedditSource(BASE_INPUT);

    expect(mentions.filter((m) => m.mentionLocation === "post")).toHaveLength(0);
  });

  it("skips posts with removed_by_category set", async () => {
    const withRemoved = {
      ...redditSearchFixture,
      data: {
        ...redditSearchFixture.data,
        children: [
          {
            kind: "t3",
            data: {
              id: "zz0002",
              title: "Linear is awesome",
              selftext: "Linear saved us so much time.",
              permalink: "/r/sub/comments/zz0002/linear_is_awesome/",
              author: "someuser",
              ups: 10,
              num_comments: 1,
              created_utc: 1714521600,
              over_18: false,
              removed_by_category: "moderator",
              subreddit: "sub",
            },
          },
        ],
      },
    };

    mockRedditFetch.mockResolvedValueOnce(okJson(withRemoved));

    const { mentions } = await scanRedditSource(BASE_INPUT);

    expect(mentions.filter((m) => m.mentionLocation === "post")).toHaveLength(0);
  });
});
