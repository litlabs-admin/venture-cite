// Live check that every GPT call site works against OpenAI's own API.
//
// Excluded from `npm test`: it spends real money and needs OPENAI_API_KEY.
// Run it with `npm run test:openai-live`, which sets LIVE_OPENAI=1. Storage
// and the database are replaced by in-memory fakes, so nothing is written
// anywhere; only the model calls are real. A spy on the shared client proves
// each function actually reached OpenAI rather than returning early.
import express from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const live = process.env.LIVE_OPENAI === "1";

const { store } = vi.hoisted(() => {
  const now = new Date();
  const brand = {
    id: "brand-live",
    userId: "user-live",
    name: "Venture PR",
    companyName: "Venture PR",
    website: "https://venturepr.com",
    industry: "Tech Public Relations Agencies",
    description:
      "Venture PR runs earned-media, product launch and thought leadership programs for B2B SaaS, robotics and AI companies.",
    targetAudience: "Marketing leaders at venture-backed tech companies",
    products: ["Media relations", "Product launches", "Thought leadership"],
    uniqueSellingPoints: ["Tech-only focus", "Founder-led team"],
    nameVariations: [],
    deletedAt: null,
  };
  const prompts = [
    "best pr agencies for b2b saas startups",
    "top tech pr firms for robotics companies",
    "leading pr agencies for ai startups",
    "compare leading pr agencies for series a companies",
    "best pr agencies for consumer electronics launches",
    "top pr firms for developer tools companies",
  ].map((prompt, i) => ({
    id: `prompt-${i}`,
    brandId: brand.id,
    prompt,
    status: "tracked",
    paused: false,
    category: "vendor",
    funnelStage: "MOFU",
    createdAt: now,
  }));
  const answer =
    "Here are leading PR agencies for B2B SaaS startups: 1. Highwire PR - strong in enterprise tech. 2. LaunchSquad - known for startup launches. 3. Bospar - growth-stage tech. 4. Venture PR - focused on disruptive tech and AI companies.";
  const rankings = prompts.flatMap((p, i) =>
    ["ChatGPT", "Gemini"].map((aiPlatform) => ({
      id: `rank-${i}-${aiPlatform}`,
      brandPromptId: p.id,
      runId: "run-1",
      aiPlatform,
      isCited: i % 2,
      rank: i % 2 ? 4 : null,
      relevance: 60,
      checkedAt: now,
      citationContext: `context\n||| RAW_RESPONSE |||\n${answer}`,
      prompt: p.prompt,
    })),
  );
  return {
    store: {
      brand,
      prompts,
      rankings,
      competitors: [
        { id: "c1", brandId: brand.id, name: "Highwire PR", domain: "highwirepr.com" },
        { id: "c2", brandId: brand.id, name: "LaunchSquad", domain: "launchsquad.com" },
      ],
    },
  };
});

const echo = (row: Record<string, unknown>) =>
  Promise.resolve({ id: `row-${Math.random()}`, createdAt: new Date(), ...row });

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({
  storage: {
    getBrandById: () => Promise.resolve(store.brand),
    getBrandPromptsByBrandId: () => Promise.resolve(store.prompts),
    getGeoRankingsByBrandPromptIds: () => Promise.resolve(store.rankings),
    getCompetitorGeoRankingsByPromptRuns: () => Promise.resolve([]),
    getCompetitors: () => Promise.resolve(store.competitors),
    getBrandFacts: () => Promise.resolve([]),
    getRecentArticlesByBrandId: () => Promise.resolve([]),
    archiveBrandPrompts: () => Promise.resolve(),
    archiveSuggestedPrompts: () => Promise.resolve(),
    createPromptGeneration: () => echo({}),
    createBrandPrompt: echo,
    createPromptAudience: echo,
    attachPromptAudience: () => Promise.resolve(),
    createSetHealthRun: echo,
    createCompetitor: echo,
  },
}));
vi.mock("../../server/lib/logoStorage", () => ({
  downloadAndStoreLogo: () => Promise.resolve(null),
}));
// brands route plumbing - auth, request data, rate limits. The model call and
// the page fetch stay real.
vi.mock("../../server/data/requestData", () => {
  const brands = { list: () => Promise.resolve([]), createWithQuota: (b: object) => echo(b) };
  return { requestData: { forActor: () => ({ brands, users: {} }) } };
});
vi.mock("../../server/lib/ownership", () => ({
  requireUser: () => ({ id: "11111111-1111-4111-8111-111111111111", accessTier: "pro" }),
}));
vi.mock("../../server/lib/routesShared", () => ({
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  asyncHandler: (handler: unknown) => handler,
  sendError: (res: express.Response, _error: unknown, fallback: string) =>
    res.status(500).json({ success: false, error: fallback }),
}));
vi.mock("../../server/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));

const { getOpenAIClient } = await import("../../server/lib/openaiClient");

type Spy = ReturnType<typeof vi.fn>;
let chatSpy: Spy;
let responsesSpy: Spy;

describe.skipIf(!live)("GPT call sites against OpenAI's own API", () => {
  beforeAll(() => {
    const client = getOpenAIClient();
    if (!client) throw new Error("OPENAI_API_KEY is not set");
    chatSpy = vi.spyOn(client.chat.completions, "create") as unknown as Spy;
    responsesSpy = vi.spyOn(client.responses, "create") as unknown as Spy;
  });
  beforeEach(() => {
    chatSpy.mockClear();
    responsesSpy.mockClear();
  });

  const T = 90_000;
  const brand = () => store.brand as never;

  it("brand setup: POST /api/brands/create-from-website", { timeout: T }, async () => {
    const { setupBrandRoutes } = await import("../../server/routes/brands");
    const app = express();
    app.use(express.json());
    setupBrandRoutes(app);
    const res = await request(app)
      .post("/api/brands/create-from-website")
      .send({ url: "venturepr.com" });
    expect(res.body.error).toBeUndefined();
    expect(res.status).toBeLessThan(300);
    expect(chatSpy).toHaveBeenCalled();
  });

  it("onboarding brand scrape", { timeout: T }, async () => {
    const { runOnboardingBrandScrape } = await import("../../server/services/onboardingScrape");
    const r = await runOnboardingBrandScrape("venturepr.com", "https://venturepr.com", () => {});
    expect(r.kind).toBe("success");
    expect(chatSpy).toHaveBeenCalled();
  });

  it(
    "onboarding analyze: profile, web-searched competitors, loading lines",
    { timeout: T },
    async () => {
      const { analyzeBrand, writeLoadingLines } =
        await import("../../server/onboardingSession/analyze");
      const pageText = store.brand.description;
      const [a, lines] = await Promise.all([
        analyzeBrand({ domain: "venturepr.com", pageText }),
        writeLoadingLines({ domain: "venturepr.com", pageText }),
      ]);
      expect(a.profile.name).toBeTruthy();
      expect(a.competitors.shown.length).toBeGreaterThan(0);
      expect(a.topics.length).toBeGreaterThan(0);
      expect(lines).toHaveLength(4);
      expect(responsesSpy).toHaveBeenCalled();
    },
  );

  it("onboarding insight", { timeout: T }, async () => {
    const { buildInsight } = await import("../../server/onboardingSession/insight");
    const insight = await buildInsight({
      domain: "venturepr.com",
      profile: {
        name: "Venture PR",
        industry: "Tech Public Relations Agencies",
        descriptor: "PR for disruptive tech",
        description: store.brand.description,
        audience: store.brand.targetAudience,
      },
      readiness: { robotsAllowsAi: true, hasLlmsTxt: false, hasSchema: false } as never,
      pageText: store.brand.description,
    });
    expect(insight.headline).toBeTruthy();
    expect(chatSpy).toHaveBeenCalled();
  });

  it("Ask business brief draft", { timeout: T }, async () => {
    const { generateWebsiteBriefDraft } = await import("../../server/ask/briefWebsiteDraft");
    const r = await generateWebsiteBriefDraft("https://venturepr.com");
    expect(JSON.stringify(r)).not.toMatch(/"error"/);
    expect(chatSpy).toHaveBeenCalled();
  });

  it("prompt generation", { timeout: T }, async () => {
    const { generateBrandPrompts } = await import("../../server/lib/promptGenerator");
    const r = await generateBrandPrompts(brand());
    expect(r.error).toBeUndefined();
    expect(r.saved.length).toBeGreaterThan(0);
    expect(chatSpy).toHaveBeenCalled();
  });

  it("prompt suggestions", { timeout: T }, async () => {
    const { generateSuggestedPrompts } = await import("../../server/lib/suggestionGenerator");
    const r = await generateSuggestedPrompts(store.brand.id);
    expect(r.error).toBeUndefined();
    expect(r.saved.length).toBeGreaterThan(0);
    expect(chatSpy).toHaveBeenCalled();
  });

  it("phrasings", { timeout: T }, async () => {
    const { generatePhrasings } = await import("../../server/lib/phrasingGenerator");
    const r = await generatePhrasings(brand(), store.prompts[0].prompt);
    expect(r.length).toBeGreaterThan(0);
    expect(chatSpy).toHaveBeenCalled();
  });

  it("prompt diagnosis", { timeout: T }, async () => {
    const { diagnosePrompt } = await import("../../server/lib/promptDiagnose");
    const r = await diagnosePrompt(brand(), store.prompts[0] as never);
    expect(r.narrativeError).toBeNull();
    expect(r.verdict).toBeTruthy();
    expect(chatSpy).toHaveBeenCalled();
  });

  it("set health audit", { timeout: T }, async () => {
    const { runPromptSetHealthAudit } = await import("../../server/lib/promptSetHealthAuditor");
    const r = await runPromptSetHealthAudit(store.brand.id);
    expect(r.score).not.toBeNull();
    expect(chatSpy).toHaveBeenCalled();
  });

  it("audiences", { timeout: T }, async () => {
    const { generatePromptAudiences } = await import("../../server/lib/audienceGenerator");
    const r = await generatePromptAudiences(store.brand.id);
    expect(r.error).toBeUndefined();
    expect(r.saved.length).toBeGreaterThan(0);
    expect(chatSpy).toHaveBeenCalled();
  });

  it("perception probe judge", { timeout: T }, async () => {
    const { judgeEngineAnswers } = await import("../../server/lib/perceptionProbes");
    const r = await judgeEngineAnswers("Venture PR", "ChatGPT", [
      {
        axis: "trust",
        question: "Is Venture PR a trustworthy PR agency?",
        answer: "Venture PR is a respected tech PR agency with a strong record for AI startups.",
      },
    ] as never);
    expect(r.length).toBeGreaterThan(0);
    expect(chatSpy).toHaveBeenCalled();
  });

  it("perception scoring", { timeout: T }, async () => {
    const { scoreBrandPerception } = await import("../../server/lib/perceptionScorer");
    const r = await scoreBrandPerception({
      brandName: "Venture PR",
      evidence: [
        {
          platform: "ChatGPT",
          text: "Venture PR is well regarded for AI and robotics launches, with strong media results and fair pricing for startups.",
        },
      ] as never,
    });
    expect(r.trust ?? r.quality ?? r.value ?? r.market).not.toBeNull();
    expect(chatSpy).toHaveBeenCalled();
  });

  it("competitor discovery, both passes", { timeout: T }, async () => {
    const { discoverCompetitors } = await import("../../server/lib/competitorDiscovery");
    const n = await discoverCompetitors(store.brand.id);
    expect(n).toBeGreaterThan(0);
    expect(chatSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("brand extraction on a citation answer", { timeout: T }, async () => {
    const { analyzeResponse } = await import("../../server/lib/responseAnalyzer");
    const r = await analyzeResponse({
      responseText: store.rankings[0].citationContext.split("\n").pop()!,
      trackedEntities: [{ id: "brand-live", name: "Venture PR", kind: "brand" }] as never,
    });
    expect(r.brands.length).toBeGreaterThan(0);
    expect(chatSpy).toHaveBeenCalled();
  });

  it("ChatGPT citation check with web search", { timeout: T }, async () => {
    const { runPlatformCitationCheck } = await import("../../server/citationChecker");
    const r = await runPlatformCitationCheck(
      "ChatGPT",
      "best pr agencies for b2b tech startups",
      null,
      "Venture PR",
      [],
      "venturepr.com",
      undefined,
      { skipJudge: true },
    );
    expect(r.error).toBeUndefined();
    expect(r.responseText.length).toBeGreaterThan(200);
    expect(r.structuredCitations.length).toBeGreaterThan(0);
    // citationChecker keeps its own direct OpenAI client, so the shared-client
    // spy does not see this call; the citations prove web search ran.
    expect(r.structuredCitations.join(" ")).not.toContain("utm_source=openai");
  });
});
