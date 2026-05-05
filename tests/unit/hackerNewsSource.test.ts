import { describe, it, expect, beforeEach, vi } from "vitest";
import fixtureData from "../fixtures/hn-search.json";
import hnItemFixture from "../fixtures/hn-item.json";

// ---------------------------------------------------------------------------
// Mock global fetch before importing the module under test
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Mock acquireOrWait — controls the rate-limit gate
// ---------------------------------------------------------------------------
const mockAcquireOrWait = vi.fn<() => Promise<boolean>>();
vi.mock("../../server/lib/rateLimitBuckets", () => ({
  acquireOrWait: (...args: unknown[]) => mockAcquireOrWait(...args),
}));

// ---------------------------------------------------------------------------
// Import the module AFTER stubs are in place
// ---------------------------------------------------------------------------
const { scanHackerNewsSource } = await import("../../server/lib/sources/hackerNewsSource");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({}),
  };
}

/** Default fetch mock that handles /search_by_date and /items/:id separately */
function setupFetchRouter(
  searchResponse: unknown,
  itemResponse: unknown = makeOkResponse({ id: 0, children: [] }),
) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/items/")) {
      return Promise.resolve(
        typeof itemResponse === "object" && itemResponse !== null && "ok" in itemResponse
          ? itemResponse
          : makeOkResponse(itemResponse),
      );
    }
    return Promise.resolve(makeOkResponse(searchResponse));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("scanHackerNewsSource", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockAcquireOrWait.mockReset();
    // Default: rate-limit allows
    mockAcquireOrWait.mockResolvedValue(true);
  });

  // -------------------------------------------------------------------------
  // Endpoint URL — must use /search_by_date
  // -------------------------------------------------------------------------
  it("uses /search_by_date endpoint (not /search)", async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ hits: [] }));

    await scanHackerNewsSource({
      query: '"Linear"',
      variations: ["Linear"],
      brandId: "brand-abc",
    });

    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("/search_by_date");
    expect(calledUrl).not.toContain("/search?");
  });

  // -------------------------------------------------------------------------
  // Happy path — uses the fixture
  // -------------------------------------------------------------------------
  it("returns expected mentions from fixture (matched story + matched comment; unmatched filtered out)", async () => {
    // Search fixture has stories that won't trigger comment expansion (no matching story hits
    // that need expansion for this basic test — the comment hit is a direct search comment)
    setupFetchRouter(fixtureData, { id: 0, children: [] });

    const result = await scanHackerNewsSource({
      query: '"Linear" "linear app"',
      variations: ["Linear", "linear app"],
      brandId: "brand-abc",
    });

    expect(result.failed).toBeUndefined();

    // Fixture: objectID 12345 (story matches), objectID 67890 (comment matches),
    //          objectID 99999 (story — no variation present), objectID 11111 (empty story_text, title has no match)
    const mentions = result.mentions;
    // At least the 2 direct-search mentions; comment expansion may add more
    const directMentions = mentions.filter(
      (m) => m.sourceUrl.includes("12345") || m.sourceUrl.includes("67890"),
    );
    expect(directMentions.length).toBeGreaterThanOrEqual(2);

    const story = mentions.find(
      (m) => m.mentionLocation === "post" && m.sourceUrl.includes("12345"),
    );
    expect(story).toBeDefined();
    expect(story!.platform).toBe("hackernews");
    expect(story!.sourceUrl).toBe("https://news.ycombinator.com/item?id=12345");
    expect(story!.sourceTitle).toContain("Linear");
    expect(story!.authorUsername).toBe("pg");
    expect(story!.mentionedAt).toBeInstanceOf(Date);
    expect(story!.mentionLocation).toBe("post");
    expect(story!.engagementInputs.points).toBe(142);
    expect(story!.engagementInputs.comments).toBe(38);

    const comment = mentions.find(
      (m) => m.mentionLocation === "comment" && m.sourceUrl.includes("67890"),
    );
    expect(comment).toBeDefined();
    expect(comment!.platform).toBe("hackernews");
    expect(comment!.sourceUrl).toBe("https://news.ycombinator.com/item?id=67890");
    expect(comment!.authorUsername).toBe("sama");
    expect(comment!.mentionLocation).toBe("comment");
    expect(comment!.engagementInputs.points).toBe(0);
    expect(comment!.engagementInputs.comments).toBe(0);
  });

  it("matched variation is recorded on each mention", async () => {
    setupFetchRouter(fixtureData, { id: 0, children: [] });

    const { mentions } = await scanHackerNewsSource({
      query: '"Linear" "linear app"',
      variations: ["Linear", "linear app"],
      brandId: "brand-abc",
    });

    // The story title contains "Linear"; the comment body contains "linear app"
    // passesBrandPresenceGate picks longest match first — both should record something meaningful
    for (const m of mentions) {
      expect(["Linear", "linear app"]).toContain(m.matchedVariation);
    }
  });

  it("matchedField is 'title' for story matched by title", async () => {
    const storyOnlyFixture = {
      hits: [
        {
          objectID: "55555",
          title: "Linear is our new issue tracker",
          story_text: "",
          author: "founder",
          created_at: "2023-01-01T00:00:00Z",
          points: 10,
          num_comments: 2,
        },
      ],
    };
    setupFetchRouter(storyOnlyFixture, { id: 55555, children: [] });

    const { mentions } = await scanHackerNewsSource({
      query: '"Linear"',
      variations: ["Linear"],
      brandId: "brand-abc",
    });

    expect(mentions.some((m) => m.matchedField === "title")).toBe(true);
  });

  it("empty story_text + matching title only is detected via title field", async () => {
    // objectID 11111 in fixture has empty story_text. We add it with a matching title here.
    const fixture = {
      hits: [
        {
          objectID: "11111",
          title: "How Linear changed our workflow",
          story_text: "",
          author: "tptacek",
          created_at: "2023-06-18T09:00:00Z",
          points: 88,
          num_comments: 15,
        },
      ],
    };
    setupFetchRouter(fixture, { id: 11111, children: [] });

    const { mentions } = await scanHackerNewsSource({
      query: '"Linear"',
      variations: ["Linear"],
      brandId: "brand-abc",
    });

    const directMention = mentions.find(
      (m) => m.matchedField === "title" && m.sourceUrl.includes("11111"),
    );
    expect(directMention).toBeDefined();
    expect(directMention!.mentionContext).toBe(""); // story_text is empty
  });

  // -------------------------------------------------------------------------
  // Audit A15 regression: distinct object IDs → distinct canonical URLs
  // -------------------------------------------------------------------------
  it("HN regression A15: two distinct objectIDs produce distinct canonical sourceUrls both containing ?id=", async () => {
    const twoHitsFixture = {
      hits: [
        {
          objectID: "100",
          title: "Linear is great",
          story_text: "Using Linear app daily.",
          author: "user1",
          created_at: "2023-01-01T00:00:00Z",
          points: 5,
          num_comments: 1,
        },
        {
          objectID: "200",
          title: "Linear at scale",
          story_text: "We use Linear app across 10 teams.",
          author: "user2",
          created_at: "2023-01-02T00:00:00Z",
          points: 3,
          num_comments: 0,
        },
      ],
    };
    setupFetchRouter(twoHitsFixture, { id: 0, children: [] });

    const { mentions } = await scanHackerNewsSource({
      query: '"Linear"',
      variations: ["Linear", "linear app"],
      brandId: "brand-abc",
    });

    // At least 2 mentions from direct search
    const directMentions = mentions.filter(
      (m) => m.sourceUrl.includes("?id=100") || m.sourceUrl.includes("?id=200"),
    );
    expect(directMentions.length).toBe(2);
    const urls = directMentions.map((m) => m.sourceUrl);
    expect(urls[0]).not.toBe(urls[1]);
    expect(urls[0]).toContain("?id=");
    expect(urls[1]).toContain("?id=");
  });

  // -------------------------------------------------------------------------
  // URL is built correctly and includes numericFilters when sinceUnix is set
  // -------------------------------------------------------------------------
  it("includes numericFilters in request URL when sinceUnix is provided", async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ hits: [] }));

    await scanHackerNewsSource({
      query: '"Linear"',
      variations: ["Linear"],
      brandId: "brand-abc",
      sinceUnix: 1700000000,
    });

    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("numericFilters=");
    expect(calledUrl).toContain("1700000000");
    expect(calledUrl).toContain("/search_by_date");
  });

  it("omits numericFilters when sinceUnix is not provided", async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ hits: [] }));

    await scanHackerNewsSource({
      query: '"Linear"',
      variations: ["Linear"],
      brandId: "brand-abc",
    });

    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).not.toContain("numericFilters");
  });

  // -------------------------------------------------------------------------
  // Rate-limit gate
  // -------------------------------------------------------------------------
  it("returns failed='hackernews rate-limited' when acquireOrWait returns false", async () => {
    mockAcquireOrWait.mockResolvedValueOnce(false);

    const result = await scanHackerNewsSource({
      query: '"Linear"',
      variations: ["Linear"],
      brandId: "brand-abc",
    });

    expect(result.mentions).toEqual([]);
    expect(result.failed).toMatch(/^hackernews:.*rate-limited/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // HTTP errors
  // -------------------------------------------------------------------------
  it("returns failed='hackernews 503' on HTTP 503", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(503));

    const result = await scanHackerNewsSource({
      query: '"Linear"',
      variations: ["Linear"],
      brandId: "brand-abc",
    });

    expect(result.mentions).toEqual([]);
    expect(result.failed).toMatch(/^hackernews:.*503/);
  });

  it("returns failed on unexpected fetch throw", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const result = await scanHackerNewsSource({
      query: '"Linear"',
      variations: ["Linear"],
      brandId: "brand-abc",
    });

    expect(result.mentions).toEqual([]);
    expect(result.failed).toMatch(/network error/);
  });

  // -------------------------------------------------------------------------
  // mentionedAt
  // -------------------------------------------------------------------------
  it("mentionedAt is undefined when created_at is missing", async () => {
    const fixture = {
      hits: [
        {
          objectID: "77777",
          title: "Linear rocks",
          story_text: "Using Linear app.",
          author: "anon",
          created_at: null,
          points: 1,
          num_comments: 0,
        },
      ],
    };
    setupFetchRouter(fixture, { id: 77777, children: [] });

    const { mentions } = await scanHackerNewsSource({
      query: '"Linear"',
      variations: ["Linear"],
      brandId: "brand-abc",
    });

    const directMention = mentions.find((m) => m.sourceUrl.includes("77777"));
    expect(directMention!.mentionedAt).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Comment-tree expansion — new tests
  // -------------------------------------------------------------------------

  it("expands comment trees for matched stories and adds comment mentions with correct fields", async () => {
    const searchFixture = {
      hits: [
        {
          objectID: "12345",
          title: "Notion launches new feature",
          story_text: "Notion is changing productivity.",
          author: "alice",
          created_at: "2024-01-01T00:00:00Z",
          points: 100,
          num_comments: 5,
        },
      ],
    };

    // hn-item.json has two matching comments: bob mentions "Notion", carol mentions "Notion"
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/items/12345")) {
        return Promise.resolve(makeOkResponse(hnItemFixture));
      }
      return Promise.resolve(makeOkResponse(searchFixture));
    });

    const { mentions } = await scanHackerNewsSource({
      query: '"Notion"',
      variations: ["Notion"],
      brandId: "brand-abc",
    });

    // Direct story mention + comment mentions from tree
    const storyMention = mentions.find(
      (m) => m.mentionLocation === "post" && m.sourceUrl.includes("12345"),
    );
    expect(storyMention).toBeDefined();

    // Bob's comment mentions "Notion"
    const bobMention = mentions.find(
      (m) => m.mentionLocation === "comment" && m.authorUsername === "bob",
    );
    expect(bobMention).toBeDefined();
    expect(bobMention!.platform).toBe("hackernews");
    expect(bobMention!.sourceUrl).toContain("?id=12346");
    expect(bobMention!.sourceTitle).toBe("Notion launches new feature");
    expect(bobMention!.mentionContext).toContain("Notion");
    expect(bobMention!.engagementInputs).toEqual({ points: 0, comments: 0 });
    expect(bobMention!.mentionLocation).toBe("comment");

    // Carol's nested comment also mentions "Notion"
    const carolMention = mentions.find(
      (m) => m.mentionLocation === "comment" && m.authorUsername === "carol",
    );
    expect(carolMention).toBeDefined();
    expect(carolMention!.sourceUrl).toContain("?id=12347");
    expect(carolMention!.sourceTitle).toBe("Notion launches new feature");
    expect(carolMention!.mentionLocation).toBe("comment");
  });

  it("skips comment expansion when /items/:id returns 500 and still returns search-step mentions", async () => {
    const searchFixture = {
      hits: [
        {
          objectID: "12345",
          title: "Notion launches new feature",
          story_text: "Notion is changing productivity.",
          author: "alice",
          created_at: "2024-01-01T00:00:00Z",
          points: 100,
          num_comments: 5,
        },
      ],
    };

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/items/")) {
        return Promise.resolve(makeErrorResponse(500));
      }
      return Promise.resolve(makeOkResponse(searchFixture));
    });

    const result = await scanHackerNewsSource({
      query: '"Notion"',
      variations: ["Notion"],
      brandId: "brand-abc",
    });

    // No overall failure — the scan succeeded
    expect(result.failed).toBeUndefined();
    // Direct story mention is still returned
    const storyMention = result.mentions.find(
      (m) => m.mentionLocation === "post" && m.sourceUrl.includes("12345"),
    );
    expect(storyMention).toBeDefined();
    // No comment-tree mentions (expansion was skipped due to 500)
    const commentTreeMentions = result.mentions.filter(
      (m) => m.mentionLocation === "comment" && m.sourceUrl.includes("12346"),
    );
    expect(commentTreeMentions).toHaveLength(0);
  });

  it("skips comment expansion for that story when acquireOrWait returns false for /items call", async () => {
    const searchFixture = {
      hits: [
        {
          objectID: "12345",
          title: "Notion launches new feature",
          story_text: "Notion is great.",
          author: "alice",
          created_at: "2024-01-01T00:00:00Z",
          points: 100,
          num_comments: 5,
        },
      ],
    };

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/items/")) {
        return Promise.resolve(makeOkResponse(hnItemFixture));
      }
      return Promise.resolve(makeOkResponse(searchFixture));
    });

    // First call: top-level rate limit passes; second call (for /items): fails
    mockAcquireOrWait
      .mockResolvedValueOnce(true) // top-level search
      .mockResolvedValueOnce(false); // comment expansion rate-limit

    const result = await scanHackerNewsSource({
      query: '"Notion"',
      variations: ["Notion"],
      brandId: "brand-abc",
    });

    // No overall failure
    expect(result.failed).toBeUndefined();
    // Direct mention still returned
    const storyMention = result.mentions.find((m) => m.mentionLocation === "post");
    expect(storyMention).toBeDefined();
    // No comment-tree mentions (expansion skipped due to rate-limit)
    const treeMentions = result.mentions.filter(
      (m) => m.mentionLocation === "comment" && m.sourceUrl.includes("12346"),
    );
    expect(treeMentions).toHaveLength(0);
  });

  it("respects 10-story comment-expansion cap — calls /items/:id at most 10 times", async () => {
    // 15 story hits, all matching
    const hits = Array.from({ length: 15 }, (_, i) => ({
      objectID: String(1000 + i),
      title: `Notion story ${i}`,
      story_text: "Notion is great for teams.",
      author: `user${i}`,
      created_at: "2024-01-01T00:00:00Z",
      points: 10,
      num_comments: 2,
    }));

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/items/")) {
        return Promise.resolve(makeOkResponse({ id: 9999, children: [] }));
      }
      return Promise.resolve(makeOkResponse({ hits }));
    });

    await scanHackerNewsSource({
      query: '"Notion"',
      variations: ["Notion"],
      brandId: "brand-abc",
    });

    const itemCalls = mockFetch.mock.calls.filter((args: string[]) =>
      String(args[0]).includes("/items/"),
    );
    expect(itemCalls.length).toBe(10);
  });

  it("only story-type hits (no comment_text) trigger comment-tree expansion", async () => {
    const searchFixture = {
      hits: [
        {
          objectID: "22222",
          comment_text: "Notion is great",
          story_title: "Show HN: Something",
          author: "commenter",
          created_at: "2024-01-01T00:00:00Z",
          points: null,
          num_comments: null,
        },
      ],
    };

    mockFetch.mockResolvedValue(makeOkResponse(searchFixture));

    await scanHackerNewsSource({
      query: '"Notion"',
      variations: ["Notion"],
      brandId: "brand-abc",
    });

    const itemCalls = mockFetch.mock.calls.filter((args: string[]) =>
      String(args[0]).includes("/items/"),
    );
    // Comment hits from search do NOT trigger /items expansion
    expect(itemCalls.length).toBe(0);
  });

  it("comment-tree mentions have mentionContext truncated at 2000 chars", async () => {
    const longText = "Notion ".repeat(300); // well over 2000 chars
    const itemWithLongComment = {
      id: 55555,
      type: "story",
      author: "alice",
      title: "Notion story",
      text: null,
      children: [
        {
          id: 55556,
          type: "comment",
          author: "bob",
          text: longText,
          points: null,
          children: [],
        },
      ],
    };

    const searchFixture = {
      hits: [
        {
          objectID: "55555",
          title: "Notion story",
          story_text: "Notion is mentioned here.",
          author: "alice",
          created_at: "2024-01-01T00:00:00Z",
          points: 50,
          num_comments: 1,
        },
      ],
    };

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/items/55555")) {
        return Promise.resolve(makeOkResponse(itemWithLongComment));
      }
      return Promise.resolve(makeOkResponse(searchFixture));
    });

    const { mentions } = await scanHackerNewsSource({
      query: '"Notion"',
      variations: ["Notion"],
      brandId: "brand-abc",
    });

    const commentMention = mentions.find(
      (m) => m.mentionLocation === "comment" && m.authorUsername === "bob",
    );
    expect(commentMention).toBeDefined();
    expect(commentMention!.mentionContext.length).toBeLessThanOrEqual(2000);
  });
});
