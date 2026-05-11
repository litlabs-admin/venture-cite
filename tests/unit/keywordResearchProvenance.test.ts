import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import {
  keywordResearch,
  insertKeywordResearchSchema,
  type InsertKeywordResearch,
} from "../../shared/schema";

describe("keyword_research provenance column", () => {
  it("declares a provenance column on the Drizzle table", () => {
    // Drizzle exposes columns on the table object. The column must exist so
    // app code (and the migration) agree on the shape of the row.
    const cols = keywordResearch as any;
    expect(cols.provenance).toBeDefined();
  });

  it("accepts provenance via the insert schema", () => {
    const candidate: InsertKeywordResearch = {
      brandId: "00000000-0000-0000-0000-000000000000",
      keyword: "test keyword",
      provenance: "ai-estimate",
    } as InsertKeywordResearch;

    const parsed = insertKeywordResearchSchema.safeParse(candidate);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.provenance).toBe("ai-estimate");
    }
  });
});

// ---------------------------------------------------------------------------
// Behavioral test for the AI-discovery insert path. Mocks the OpenAI client
// and storage, drives the actual /api/keyword-research/discover route, and
// asserts the createKeywordResearch payload is tagged with provenance.
// ---------------------------------------------------------------------------

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "22222222-2222-4222-8222-222222222222";

const stubs = vi.hoisted(() => ({
  createKeywordResearch: vi.fn(async (row: any) => ({ id: "kr-1", ...row })),
  getKeywordResearch: vi.fn(async () => [] as any[]),
  getCompetitors: vi.fn(async () => [] as any[]),
  openaiCreate: vi.fn(),
}));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as any).user = { id: USER_ID };
    next();
  },
}));

vi.mock("../../server/lib/ownership", async () => {
  const actual = await vi.importActual<any>("../../server/lib/ownership");
  return {
    ...actual,
    requireUser: (req: express.Request) => ({ id: (req as any).user.id }),
    requireBrand: vi.fn(async (brandId: string, userId: string) => {
      if (brandId === BRAND_ID && userId === USER_ID) {
        return {
          id: BRAND_ID,
          userId,
          name: "Acme",
          companyName: "Acme Co",
          industry: "SaaS",
          description: "desc",
          products: ["p1"],
          targetAudience: "devs",
        };
      }
      throw new actual.OwnershipError(404, "Brand not found");
    }),
    requireArticle: vi.fn(),
    requireKeywordResearch: vi.fn(),
  };
});

vi.mock("../../server/storage", () => ({
  storage: {
    createKeywordResearch: stubs.createKeywordResearch,
    getKeywordResearch: stubs.getKeywordResearch,
    getCompetitors: stubs.getCompetitors,
    // Surface fillers for setupContentRoutes' broader import surface.
    getActiveContentJob: vi.fn(),
    getContentJobById: vi.fn(),
    updateContentJob: vi.fn(),
    setArticleDraft: vi.fn(),
    getRecentCompletedContentJob: vi.fn(async () => undefined),
    enqueueContentJob: vi.fn(),
    getContentJobByIdAdmin: vi.fn(),
    claimContentJobForSlice: vi.fn(),
    setArticleReady: vi.fn(),
    setArticleFailed: vi.fn(),
    createRevision: vi.fn(),
    createDraftArticle: vi.fn(),
  },
}));

vi.mock("../../server/lib/usageLimit", () => ({
  withArticleQuota: vi.fn(),
  isUsageLimitError: () => false,
  refundArticleQuota: vi.fn(async () => undefined),
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: vi.fn(),
}));

vi.mock("../../server/db", () => {
  const chain: any = {};
  chain.set = () => chain;
  chain.where = () => chain;
  chain.from = () => chain;
  chain.limit = () => Promise.resolve([]);
  chain.values = () => ({ returning: async () => [] });
  return {
    db: {
      select: () => chain,
      update: () => chain,
      insert: () => chain,
      delete: () => chain,
    },
    pool: {},
  };
});

vi.mock("../../server/contentGenerationWorker", () => ({
  runArticleSlice: vi.fn(),
}));

vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: {
    contentGeneration: "gpt-4o-mini",
    keywordResearch: "gpt-4o-mini",
  },
}));

vi.mock("../../server/lib/routesShared", async () => {
  const actual = await vi.importActual<any>("../../server/lib/routesShared");
  return {
    ...actual,
    openai: {
      chat: { completions: { create: (...args: unknown[]) => stubs.openaiCreate(...args) } },
    },
    aiLimitMiddleware: (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => next(),
  };
});

const { setupContentRoutes } = await import("../../server/routes/content");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  setupContentRoutes(app);
  return app;
}

async function call(
  app: express.Express,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      headers: { host: "localhost", "content-type": "application/json" },
      body: body ?? {},
      user: { id: USER_ID },
    } as unknown as express.Request;
    let statusCode = 200;
    let payload: any = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(p: any) {
        payload = p;
        resolve({ status: statusCode, body: payload });
        return res;
      },
      setHeader() {
        return res;
      },
      end() {
        if (payload === null) resolve({ status: statusCode, body: null });
      },
      on() {
        return res;
      },
    } as unknown as express.Response;
    try {
      (app as any).handle(req, res, (err: unknown) => {
        if (err) reject(err);
        else resolve({ status: statusCode, body: payload });
      });
    } catch (e) {
      reject(e);
    }
  });
}

beforeEach(() => {
  stubs.createKeywordResearch.mockClear();
  stubs.getKeywordResearch.mockReset();
  stubs.getKeywordResearch.mockResolvedValue([]);
  stubs.getCompetitors.mockReset();
  stubs.getCompetitors.mockResolvedValue([]);
  stubs.openaiCreate.mockReset();
});

describe("POST /api/keyword-research/discover", () => {
  it("tags inserted rows with provenance='ai-estimate'", async () => {
    stubs.openaiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              keywords: [
                {
                  keyword: "best ai citation tool",
                  searchVolume: 5000,
                  difficulty: 40,
                  opportunityScore: 80,
                  aiCitationPotential: 90,
                  intent: "commercial",
                  category: "tools",
                  competitorGap: 30,
                  suggestedContentType: "comparison",
                  relatedKeywords: ["ai citation"],
                },
              ],
            }),
          },
        },
      ],
    });

    const app = buildApp();
    const { status } = await call(app, "POST", "/api/keyword-research/discover", {
      brandId: BRAND_ID,
    });

    expect(status).toBe(200);
    expect(stubs.createKeywordResearch).toHaveBeenCalledTimes(1);
    const payload = stubs.createKeywordResearch.mock.calls[0]?.[0] as any;
    expect(payload).toBeDefined();
    expect(payload.provenance).toBe("ai-estimate");
    expect(payload.brandId).toBe(BRAND_ID);
    expect(payload.keyword).toBe("best ai citation tool");
  });
});
