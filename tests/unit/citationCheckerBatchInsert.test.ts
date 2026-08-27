import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
});

const { storageMock, completionMock, analyzeMock, detectMock } = vi.hoisted(() => ({
  storageMock: {
    getBrandById: vi.fn(),
    getUser: vi.fn(),
    getBrandPromptsByBrandId: vi.fn(),
    createCitationRun: vi.fn(),
    getGeoRankingsByBrandPromptIds: vi.fn(),
    getCompetitors: vi.fn(),
    getTrackedContentUrlsByBrandId: vi.fn(),
    addBrandNameVariation: vi.fn(),
    addCompetitorNameVariation: vi.fn(),
    createGeoRanking: vi.fn(),
    createCompetitorGeoRanking: vi.fn(),
    createCompetitorGeoRankings: vi.fn(),
    updateCitationRun: vi.fn(),
    createCompetitorCitationSnapshot: vi.fn(),
  },
  completionMock: vi.fn(),
  analyzeMock: vi.fn(),
  detectMock: vi.fn(),
}));

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/databaseStorage", () => ({ DatabaseStorage: class {} }));
vi.mock("../../server/citationJudge", () => ({ judgeCitation: vi.fn() }));
vi.mock("../../server/lib/aiLogger", () => ({ attachAiLogger: vi.fn() }));
vi.mock("../../server/lib/llmBudget", () => ({
  assertWithinBudget: vi.fn().mockResolvedValue(undefined),
  recordSpend: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../server/lib/circuitBreaker", () => ({
  openaiBreaker: { run: (fn: () => unknown) => fn() },
  openrouterBreaker: { run: (fn: () => unknown) => fn() },
}));
vi.mock("../../server/lib/responseAnalyzer", () => ({
  analyzeResponse: analyzeMock,
  deriveSentiment: vi.fn(() => "positive"),
}));
vi.mock("../../server/lib/brandMatcher", () => ({
  detectBrandAndCompetitors: detectMock,
  matchEntity: vi.fn(() => ({ matched: false, hitVariants: [], positions: [] })),
}));
vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: completionMock } };
  },
}));

import { runBrandPrompts } from "../../server/citationChecker";

const BRAND = {
  id: "brand-1",
  name: "Acme",
  companyName: null,
  nameVariations: [],
  website: null,
  userId: null,
  industry: null,
  description: null,
};

const PROMPT = { id: "prompt-1", brandId: "brand-1", prompt: "Which tools should I use?" };

const COMPETITORS = [
  { id: "competitor-1", name: "Rival One", domain: "rival-one.test", nameVariations: [] },
  { id: "competitor-2", name: "Rival Two", domain: "rival-two.test", nameVariations: [] },
  { id: "competitor-3", name: "Rival Three", domain: "rival-three.test", nameVariations: [] },
];

function configureRun(
  matchedCompetitorIds: string[] = COMPETITORS.map((competitor) => competitor.id),
) {
  storageMock.getBrandById.mockResolvedValue(BRAND);
  storageMock.getBrandPromptsByBrandId.mockResolvedValue([PROMPT]);
  storageMock.createCitationRun.mockResolvedValue({ id: "run-1" });
  storageMock.getGeoRankingsByBrandPromptIds.mockResolvedValue([]);
  storageMock.getCompetitors.mockResolvedValue(COMPETITORS);
  storageMock.getTrackedContentUrlsByBrandId.mockResolvedValue([]);
  storageMock.createGeoRanking.mockResolvedValue({
    id: "ranking-1",
    brandPromptId: PROMPT.id,
    aiPlatform: "ChatGPT",
    isCited: 1,
  });
  storageMock.updateCitationRun.mockResolvedValue(undefined);
  storageMock.createCompetitorCitationSnapshot.mockResolvedValue(undefined);
  storageMock.addBrandNameVariation.mockResolvedValue(true);
  storageMock.addCompetitorNameVariation.mockResolvedValue(true);
  completionMock.mockResolvedValue({
    choices: [{ message: { content: "Acme and Rival One are useful tools." } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });
  analyzeMock.mockResolvedValue({
    brands: [],
    tracked: Object.fromEntries(COMPETITORS.map((competitor) => [competitor.id, null])),
    untracked: [],
  });
  detectMock.mockReturnValue({
    brand: { matched: false, hitVariants: [], positions: [] },
    competitors: matchedCompetitorIds.map((competitorId) => ({
      competitorId,
      competitorName: COMPETITORS.find((competitor) => competitor.id === competitorId)?.name,
      result: { matched: true, hitVariants: [], positions: [] },
    })),
  });
}

beforeEach(() => {
  Object.values(storageMock).forEach((mock) => mock.mockReset());
  completionMock.mockReset();
  analyzeMock.mockReset();
  detectMock.mockReset();
  configureRun();
});

describe("citation checker competitor ranking inserts", () => {
  it("batches three matched competitor rows into one insert", async () => {
    await runBrandPrompts("brand-1", ["ChatGPT"]);

    expect(storageMock.createCompetitorGeoRankings).toHaveBeenCalledOnce();
    expect(storageMock.createCompetitorGeoRankings.mock.calls[0][0]).toHaveLength(3);
    expect(storageMock.createCompetitorGeoRankings.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ competitorId: "competitor-1" }),
        expect.objectContaining({ competitorId: "competitor-2" }),
        expect.objectContaining({ competitorId: "competitor-3" }),
      ]),
    );
    expect(storageMock.createCompetitorGeoRanking).not.toHaveBeenCalled();
  });

  it("does not insert when no competitors match", async () => {
    configureRun([]);

    await runBrandPrompts("brand-1", ["ChatGPT"]);

    expect(storageMock.createCompetitorGeoRankings).not.toHaveBeenCalled();
    expect(storageMock.createCompetitorGeoRanking).not.toHaveBeenCalled();
  });

  it("retries rows individually after a batch failure", async () => {
    storageMock.createCompetitorGeoRankings.mockRejectedValueOnce(new Error("batch failed"));
    storageMock.createCompetitorGeoRanking.mockImplementation(async (row) => {
      if (row.competitorId === "competitor-2") throw new Error("row failed");
      return row;
    });

    await runBrandPrompts("brand-1", ["ChatGPT"]);

    expect(storageMock.createCompetitorGeoRankings).toHaveBeenCalledOnce();
    expect(storageMock.createCompetitorGeoRanking).toHaveBeenCalledTimes(3);
    expect(
      storageMock.createCompetitorGeoRanking.mock.calls.map(([row]) => row.competitorId),
    ).toEqual(["competitor-1", "competitor-2", "competitor-3"]);
  });
});
