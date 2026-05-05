import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any imports under test.
// ---------------------------------------------------------------------------

const { mockAcquireOrWait, mockBrowser, mockPage, mockEval, mockLaunch } = vi.hoisted(() => {
  const mockEval = vi.fn();
  const mockPage = {
    setUserAgent: vi.fn(),
    setViewport: vi.fn(),
    goto: vi.fn(),
    waitForSelector: vi.fn(),
    $$eval: mockEval,
    close: vi.fn(),
  };
  const mockBrowser = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn(),
  };
  const mockLaunch = vi.fn().mockResolvedValue(mockBrowser);
  return {
    mockAcquireOrWait: vi.fn(),
    mockBrowser,
    mockPage,
    mockEval,
    mockLaunch,
  };
});

// Mock rate-limit buckets.
vi.mock("../../server/lib/rateLimitBuckets", () => ({
  acquireOrWait: mockAcquireOrWait,
}));

// Mock puppeteer-core with both default and named exports so the dynamic
// `import("puppeteer-core")` in launchBrowser() resolves correctly.
vi.mock("puppeteer-core", () => ({
  default: { launch: mockLaunch },
  launch: mockLaunch,
}));

// Mock @sparticuz/chromium-min so tests don't try to download the real binary.
vi.mock("@sparticuz/chromium-min", () => ({
  default: {
    args: [],
    graphicsMode: true,
    executablePath: vi.fn().mockResolvedValue("/path/to/chrome"),
  },
}));

// Import the module under test AFTER all mocks are registered.
import { scanQuoraSource } from "../../server/lib/sources/quoraSource";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(
  overrides?: Partial<{
    query: string;
    variations: string[];
    brandId: string;
  }>,
) {
  return {
    query: "Linear project management tool",
    variations: ["Linear"],
    brandId: "brand-123",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scanQuoraSource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Restore default mock implementations after resetAllMocks clears them.
    mockAcquireOrWait.mockResolvedValue(true);
    mockLaunch.mockResolvedValue(mockBrowser);
    mockBrowser.newPage.mockResolvedValue(mockPage);
    mockPage.goto.mockResolvedValue(undefined);
    mockPage.setUserAgent.mockResolvedValue(undefined);
    mockPage.setViewport.mockResolvedValue(undefined);
    mockPage.waitForSelector.mockResolvedValue(undefined);
    mockPage.close.mockResolvedValue(undefined);
    mockBrowser.close.mockResolvedValue(undefined);
    // Default: no links found.
    mockEval.mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // Basic happy path — matched mentions extracted
  // -------------------------------------------------------------------------
  it("returns matched mentions from rendered links", async () => {
    mockEval.mockResolvedValue([
      {
        href: "https://www.quora.com/Why-is-Linear-the-best",
        text: "Why is Linear the best PM tool?",
      },
      {
        href: "https://www.quora.com/Random-thing",
        text: "Random unrelated thing",
      },
      {
        href: "https://www.quora.com/topic/Linear",
        text: "Linear (topic page)",
      }, // must be excluded
    ]);

    const result = await scanQuoraSource(makeInput({ variations: ["Linear"] }));

    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].sourceUrl).toBe("https://www.quora.com/why-is-linear-the-best");
    expect(result.failed).toBeUndefined();
  });

  it("every mention has correct shape: platform, mentionLocation, empty mentionContext", async () => {
    mockEval.mockResolvedValue([
      {
        href: "https://www.quora.com/Why-is-Linear-great",
        text: "Why is Linear great",
      },
    ]);

    const { mentions } = await scanQuoraSource(makeInput({ variations: ["Linear"] }));

    for (const m of mentions) {
      expect(m.platform).toBe("quora");
      expect(m.mentionLocation).toBe("post");
      expect(m.mentionContext).toBe("");
      expect(m.matchedField).toBe("title");
      expect(m.engagementInputs).toBeUndefined();
    }
  });

  // -------------------------------------------------------------------------
  // Deduplication across two $$eval calls (same URL)
  // -------------------------------------------------------------------------
  it("loops over variations and dedupes results across them", async () => {
    mockEval
      .mockResolvedValueOnce([
        {
          href: "https://www.quora.com/Q-A-Linear",
          text: "Linear is great",
        },
      ])
      .mockResolvedValueOnce([
        {
          href: "https://www.quora.com/Q-A-Linear",
          text: "linear app review",
        },
      ]); // same canonical URL

    const result = await scanQuoraSource(makeInput({ variations: ["Linear", "linear app"] }));

    expect(mockBrowser.newPage).toHaveBeenCalledTimes(2);
    expect(result.mentions).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // MAX_VARIATIONS cap
  // -------------------------------------------------------------------------
  it("caps to 2 variations max even when more are provided", async () => {
    mockEval.mockResolvedValue([]);

    await scanQuoraSource(makeInput({ variations: ["a", "b", "c", "d"] }));

    // Only 2 newPage() calls — one per variation processed.
    expect(mockBrowser.newPage).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Rate-limit failure
  // -------------------------------------------------------------------------
  it("returns failed when all variations are rate-limited", async () => {
    mockAcquireOrWait.mockResolvedValue(false);

    const result = await scanQuoraSource(makeInput({ variations: ["a"] }));

    expect(result.failed).toMatch(/quora.*rate-limited/);
    expect(result.mentions).toHaveLength(0);
    // Browser must not be opened when we couldn't acquire a token.
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Navigation error
  // -------------------------------------------------------------------------
  it("returns failed when goto throws on every variation", async () => {
    mockPage.goto.mockRejectedValue(new Error("navigation timeout"));

    const result = await scanQuoraSource(makeInput({ variations: ["a"] }));

    expect(result.failed).toMatch(/quora.*navigation timeout/);
    expect(result.mentions).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Browser always closed (even on error)
  // -------------------------------------------------------------------------
  it("closes the browser even when errors occur", async () => {
    mockPage.goto.mockRejectedValue(new Error("boom"));

    await scanQuoraSource(makeInput({ variations: ["a"] }));

    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it("closes the browser on happy path", async () => {
    mockEval.mockResolvedValue([
      {
        href: "https://www.quora.com/Why-Linear-is-good",
        text: "Why Linear is good",
      },
    ]);

    await scanQuoraSource(makeInput({ variations: ["Linear"] }));

    expect(mockBrowser.close).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Falls back to input.query when variations is empty
  // -------------------------------------------------------------------------
  it("falls back to input.query when variations is empty", async () => {
    mockEval.mockResolvedValue([]);

    await scanQuoraSource(makeInput({ query: "fallback query", variations: [] }));

    expect(mockPage.goto).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent("fallback query")),
      expect.any(Object),
    );
  });

  // -------------------------------------------------------------------------
  // URL filtering — excluded path prefixes
  // -------------------------------------------------------------------------
  it("excludes /topic/, /profile/, /q/ paths even when anchor text matches brand", async () => {
    mockEval.mockResolvedValue([
      { href: "https://www.quora.com/topic/Linear", text: "Linear topic" },
      {
        href: "https://www.quora.com/profile/Linear-Fan",
        text: "Linear Fan profile",
      },
      {
        href: "https://www.quora.com/q/Linear-App-Reviews",
        text: "Linear App Reviews",
      },
      {
        href: "https://www.quora.com/Why-is-Linear-great",
        text: "Why is Linear great",
      }, // only this one should pass
    ]);

    const result = await scanQuoraSource(makeInput({ variations: ["Linear"] }));

    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].sourceUrl).toBe("https://www.quora.com/why-is-linear-great");
  });

  it("excludes non-quora.com domains", async () => {
    mockEval.mockResolvedValue([
      { href: "https://example.com/Why-Linear-rocks", text: "Why Linear rocks" },
    ]);

    const result = await scanQuoraSource(makeInput({ variations: ["Linear"] }));

    expect(result.mentions).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Slug-only path filter (no internal slashes)
  // -------------------------------------------------------------------------
  it("excludes multi-segment paths like /answers/12345", async () => {
    mockEval.mockResolvedValue([
      {
        href: "https://www.quora.com/What-is-Linear/answer/Jane-Doe",
        text: "What is Linear answer",
      },
      {
        href: "https://www.quora.com/What-is-Linear",
        text: "What is Linear",
      },
    ]);

    const result = await scanQuoraSource(makeInput({ variations: ["Linear"] }));

    // Only the single-segment slug path passes.
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].sourceUrl).toBe("https://www.quora.com/what-is-linear");
  });

  // -------------------------------------------------------------------------
  // Canonical URL: lowercase + no trailing slash
  // -------------------------------------------------------------------------
  it("lowercases the path in canonical URL", async () => {
    mockEval.mockResolvedValue([
      {
        href: "https://www.quora.com/Why-Is-LINEAR-Great",
        text: "Why is Linear great",
      },
    ]);

    const result = await scanQuoraSource(makeInput({ variations: ["Linear"] }));

    expect(result.mentions[0].sourceUrl).toBe("https://www.quora.com/why-is-linear-great");
  });

  it("strips trailing slash from canonical URL", async () => {
    mockEval.mockResolvedValue([
      {
        href: "https://www.quora.com/Why-is-Linear-cool/",
        text: "Why is Linear cool",
      },
    ]);

    const result = await scanQuoraSource(makeInput({ variations: ["Linear"] }));

    expect(result.mentions[0].sourceUrl).toBe("https://www.quora.com/why-is-linear-cool");
  });

  // -------------------------------------------------------------------------
  // Cap at MAX_MENTIONS (25)
  // -------------------------------------------------------------------------
  it("caps results at 25 mentions even when more links match", async () => {
    const links = Array.from({ length: 30 }, (_, i) => ({
      href: `https://www.quora.com/Linear-question-${i}-answer`,
      text: `Linear question ${i}`,
    }));
    mockEval.mockResolvedValue(links);

    const result = await scanQuoraSource(makeInput({ variations: ["Linear"] }));

    expect(result.mentions.length).toBeLessThanOrEqual(25);
  });

  // -------------------------------------------------------------------------
  // acquireOrWait called with correct args
  // -------------------------------------------------------------------------
  it("calls acquireOrWait with provider='quora', correct brandId, and 10_000 ms", async () => {
    mockEval.mockResolvedValue([]);

    await scanQuoraSource(makeInput({ brandId: "brand-xyz", variations: ["Linear"] }));

    expect(mockAcquireOrWait).toHaveBeenCalledWith("quora", "brand-xyz", 10_000);
  });

  // -------------------------------------------------------------------------
  // Quora search URL construction
  // -------------------------------------------------------------------------
  it("navigates to Quora search URL with the variation query-encoded", async () => {
    mockEval.mockResolvedValue([]);

    await scanQuoraSource(makeInput({ variations: ["linear app"] }));

    expect(mockPage.goto).toHaveBeenCalledWith(
      "https://www.quora.com/search?q=linear%20app&type=question",
      expect.objectContaining({ waitUntil: "domcontentloaded", timeout: 15_000 }),
    );
  });

  // -------------------------------------------------------------------------
  // Partial failure — one variation errors, another succeeds
  // -------------------------------------------------------------------------
  it("continues to next variation when one throws, returns results from the successful one", async () => {
    // goto throws for the first variation — $$eval is never called for it.
    // goto resolves for the second variation — $$eval returns a matching link.
    mockPage.goto
      .mockRejectedValueOnce(new Error("navigation timeout"))
      .mockResolvedValueOnce(undefined);

    // Only one mockResolvedValueOnce needed: the first variation never calls
    // $$eval (goto threw before it), so variation 2 consumes this value.
    mockEval.mockResolvedValueOnce([
      {
        href: "https://www.quora.com/Why-is-Linear-great",
        text: "Why is Linear great",
      },
    ]);

    const result = await scanQuoraSource(makeInput({ variations: ["a-variation", "Linear"] }));

    // Second variation succeeded.
    expect(result.mentions).toHaveLength(1);
    expect(result.failed).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // waitForSelector timeout is swallowed gracefully
  // -------------------------------------------------------------------------
  it("does not fail when waitForSelector times out (proceeds with whatever rendered)", async () => {
    mockPage.waitForSelector.mockRejectedValue(new Error("timeout"));
    mockEval.mockResolvedValue([
      {
        href: "https://www.quora.com/Why-is-Linear-great",
        text: "Why is Linear great",
      },
    ]);

    const result = await scanQuoraSource(makeInput({ variations: ["Linear"] }));

    // Still extracts mentions because $$eval runs after waitForSelector rejection.
    expect(result.mentions).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Empty $$eval result → empty mentions, no failed field
  // -------------------------------------------------------------------------
  it("returns empty mentions (no failed) when $$eval returns no links", async () => {
    mockEval.mockResolvedValue([]);

    const result = await scanQuoraSource(makeInput({ variations: ["Linear"] }));

    expect(result.mentions).toHaveLength(0);
    expect(result.failed).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Cross-variation deduplication producing a union
  // -------------------------------------------------------------------------
  it("returns the union of unique mentions across two variations", async () => {
    mockEval
      .mockResolvedValueOnce([
        {
          href: "https://www.quora.com/Why-is-Linear-great",
          text: "Why is Linear great",
        },
        {
          href: "https://www.quora.com/Linear-vs-Jira",
          text: "Linear vs Jira comparison",
        },
      ])
      .mockResolvedValueOnce([
        {
          href: "https://www.quora.com/Why-is-Linear-great",
          text: "Why is Linear great",
        }, // duplicate
        {
          href: "https://www.quora.com/Best-linear-app-features",
          text: "Best linear app features",
        },
      ]);

    const result = await scanQuoraSource(makeInput({ variations: ["Linear", "linear app"] }));

    expect(result.mentions).toHaveLength(3);
    const urls = result.mentions.map((m) => m.sourceUrl);
    expect(urls).toContain("https://www.quora.com/why-is-linear-great");
    expect(urls).toContain("https://www.quora.com/linear-vs-jira");
    expect(urls).toContain("https://www.quora.com/best-linear-app-features");
    // No duplicates.
    expect(new Set(urls).size).toBe(3);
  });
});
