import { describe, expect, it } from "vitest";
import {
  deriveContentOpportunityBoard,
  deriveEarnedMediaBoard,
  type BofuContentRecord,
  type BrandMentionRecord,
  type BrandPromptRecord,
  type CommunityPostRecord,
  type GeoRankingRecord,
  type ListicleRecord,
} from "../../server/services/work/opportunityBoards";

function prompt(overrides: Partial<BrandPromptRecord> = {}): BrandPromptRecord {
  return { id: "prompt-1", prompt: "What does startup PR pricing include?", ...overrides };
}

function listicle(overrides: Partial<ListicleRecord> = {}): ListicleRecord {
  return {
    id: "listicle-1",
    title: "Best startup PR agencies",
    url: "https://techcrunch.test/best-pr",
    sourcePublication: "TechCrunch",
    isIncluded: 0,
    listPosition: null,
    totalListItems: null,
    domainAuthority: null,
    searchVolume: null,
    outreachStatus: "new",
    lastChecked: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("earned media opportunity board", () => {
  it("only surfaces listicles that exclude the brand, and maps outreach status honestly", () => {
    const board = deriveEarnedMediaBoard({
      ownDomain: "venturepr.test",
      listicles: [listicle({ id: "included", isIncluded: 1 }), listicle({ id: "excluded" })],
      communityPosts: [],
      brandMentions: [],
      geoRankings: [],
      brandPrompts: [prompt()],
      taskStateByTaskKey: new Map(),
    });

    expect(board.opportunities).toHaveLength(1);
    expect(board.opportunities[0].id).toBe("listicle:excluded");
    expect(board.opportunities[0].status).toBe("Not started");
    expect(board.opportunities[0].relationship).toBe("No contact");
  });

  it("maps listicle outreach status to relationship, status and effort", () => {
    const board = deriveEarnedMediaBoard({
      ownDomain: null,
      listicles: [listicle({ outreachStatus: "won", domainAuthority: 80 })],
      communityPosts: [],
      brandMentions: [],
      geoRankings: [],
      brandPrompts: [],
      taskStateByTaskKey: new Map(),
    });

    const [row] = board.opportunities;
    expect(row.relationship).toBe("Existing contact");
    expect(row.status).toBe("Completed");
    expect(row.effort).toBe("Low");
  });

  it("derives citation-gap opportunities from geo_rankings cited URLs the brand was absent from", () => {
    const geoRankings: GeoRankingRecord[] = [
      {
        id: "rank-1",
        brandPromptId: "prompt-1",
        aiPlatform: "chatgpt",
        prompt: "What does startup PR pricing include?",
        isCited: 0,
        citedUrls: ["https://g2.test/reviews/venturepr-competitor"],
        citationContext: "G2 lists several PR tools with pricing tables.",
        checkedAt: "2026-09-10T00:00:00.000Z",
      },
    ];
    const board = deriveEarnedMediaBoard({
      ownDomain: "venturepr.test",
      listicles: [],
      communityPosts: [],
      brandMentions: [],
      geoRankings,
      brandPrompts: [prompt()],
      taskStateByTaskKey: new Map(),
    });

    expect(board.opportunities).toHaveLength(1);
    expect(board.opportunities[0]).toMatchObject({
      id: "citation:g2.test",
      sourceType: "citation",
      evidenceType: "Citation gap",
      canUpdateStatus: false,
    });
  });

  it("excludes citation domains already claimed by a listicle, community group or mention", () => {
    const geoRankings: GeoRankingRecord[] = [
      {
        id: "rank-1",
        brandPromptId: "prompt-1",
        aiPlatform: "chatgpt",
        prompt: "p",
        isCited: 0,
        citedUrls: ["https://techcrunch.test/other-article"],
        citationContext: null,
        checkedAt: "2026-09-10T00:00:00.000Z",
      },
    ];
    const board = deriveEarnedMediaBoard({
      ownDomain: null,
      listicles: [listicle({ url: "https://techcrunch.test/best-pr" })],
      communityPosts: [],
      brandMentions: [],
      geoRankings,
      brandPrompts: [prompt()],
      taskStateByTaskKey: new Map(),
    });

    expect(board.opportunities.some((item) => item.sourceType === "citation")).toBe(false);
  });

  it("overrides derived status with a real work task's state once one exists", () => {
    const board = deriveEarnedMediaBoard({
      ownDomain: null,
      listicles: [listicle({ id: "l1", outreachStatus: "new" })],
      communityPosts: [],
      brandMentions: [],
      geoRankings: [],
      brandPrompts: [],
      taskStateByTaskKey: new Map([["v2earned:listicle:l1", "verified"]]),
    });

    expect(board.opportunities[0].status).toBe("Completed");
  });

  it("counts a brand mention as an existing-relationship opportunity, not a cold one", () => {
    const mention: BrandMentionRecord = {
      id: "mention-1",
      platform: "reddit",
      sourceUrl: "https://reddit.test/r/startups/thread",
      sourceTitle: "Best PR tools thread",
      mentionContext: "VenturePR came up as a solid option for startup pricing questions.",
      sentiment: "positive",
      isVerified: 1,
      status: "new",
      mentionedAt: "2026-09-05T00:00:00.000Z",
      discoveredAt: "2026-09-05T00:00:00.000Z",
    };
    const board = deriveEarnedMediaBoard({
      ownDomain: null,
      listicles: [],
      communityPosts: [],
      brandMentions: [mention],
      geoRankings: [],
      brandPrompts: [prompt()],
      taskStateByTaskKey: new Map(),
    });

    expect(board.opportunities[0]).toMatchObject({
      sourceType: "mention",
      relationship: "Warm contact",
      confidence: "High",
      affectedQuestionCount: 1,
    });
  });

  it("drops community posts the app never got to (false positives excluded upstream)", () => {
    const post: CommunityPostRecord = {
      id: "post-1",
      platform: "reddit",
      groupName: "r/startups",
      groupUrl: "https://reddit.test/r/startups",
      content: "Draft answer about pricing that mentions startup PR budgets directly.",
      status: "draft",
      keywords: ["pricing"],
      createdAt: "2026-09-02T00:00:00.000Z",
    };
    const board = deriveEarnedMediaBoard({
      ownDomain: null,
      listicles: [],
      communityPosts: [post],
      brandMentions: [],
      geoRankings: [],
      brandPrompts: [prompt()],
      taskStateByTaskKey: new Map(),
    });

    expect(board.opportunities[0]).toMatchObject({
      sourceType: "community",
      status: "Not started",
      evidenceType: "Question thread",
    });
    expect(board.outreachCounts.notStarted).toBe(1);
  });
});

describe("content opportunity inventory", () => {
  const prompts: BrandPromptRecord[] = [
    { id: "q1", prompt: "What does startup PR cost and what's included?" },
    { id: "q2", prompt: "How long does a PR engagement usually take?" },
  ];

  function bofu(overrides: Partial<BofuContentRecord> = {}): BofuContentRecord {
    return {
      id: "bofu-1",
      contentType: "pricing",
      title: "Pricing",
      content: "Short page.",
      primaryKeyword: "pricing",
      targetIntent: "cost",
      status: "published",
      aiScore: 20,
      publishedUrl: "https://venturepr.test/pricing",
      updatedAt: "2026-06-10T00:00:00.000Z",
      ...overrides,
    };
  }

  it("surfaces unpublished content honestly - no live URL, no fabricated visibility gap", () => {
    const board = deriveContentOpportunityBoard({
      bofuContent: [bofu({ publishedUrl: null })],
      faqItems: [],
      articles: [],
      trackedContentUrls: [],
      brandPrompts: prompts,
      geoRankings: [],
    });

    expect(board.pages).toHaveLength(1);
    const [page] = board.pages;
    expect(page.path).toBeNull();
    expect(page.visibilityGap).toBeNull();
    expect(page.status).toBe("Needs update");
    expect(page.recommendedChange).toMatch(/Publish this page/);
  });

  it("flags a weak, uncited page as high priority and covers matching buyer questions", () => {
    const board = deriveContentOpportunityBoard({
      bofuContent: [bofu()],
      faqItems: [],
      articles: [],
      trackedContentUrls: [],
      brandPrompts: prompts,
      geoRankings: [
        {
          id: "r1",
          brandPromptId: "q1",
          aiPlatform: "chatgpt",
          prompt: prompts[0].prompt,
          isCited: 1,
          citedUrls: ["https://competitor.test/pricing"],
          citationContext: null,
          checkedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });

    expect(board.pages).toHaveLength(1);
    const [page] = board.pages;
    expect(page.questionsCovered).toBe(1);
    expect(page.evidenceQuality).toBe("Weak");
    expect(page.visibilityGap).toBe("High");
    expect(page.status).toBe("High priority");
  });

  it("counts an approved buyer question with no matching page as unmapped", () => {
    const board = deriveContentOpportunityBoard({
      bofuContent: [
        bofu({ primaryKeyword: "unrelated-topic", targetIntent: null, title: "Unrelated" }),
      ],
      faqItems: [],
      articles: [],
      trackedContentUrls: [],
      brandPrompts: prompts,
      geoRankings: [],
    });

    expect(board.coverageGapCount).toBe(2);
    expect(board.unmappedQuestions.map((q) => q.id).sort()).toEqual(["q1", "q2"]);
  });

  it("builds a prioritized action from the worst page when one exists", () => {
    const board = deriveContentOpportunityBoard({
      bofuContent: [bofu()],
      faqItems: [],
      articles: [],
      trackedContentUrls: [],
      brandPrompts: prompts,
      geoRankings: [],
    });

    expect(board.prioritizedAction).not.toBeNull();
    expect(board.prioritizedAction?.pageName).toBe("Pricing");
  });
});
