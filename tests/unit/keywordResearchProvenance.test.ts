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
// Behavioral test for the AI-discovery insert path.
//
// POST /api/keyword-research/discover no longer runs the OpenAI call inline
// and inserts synchronously - it now enqueues a Vercel-Hobby-safe background
// job via enqueueLlmJob() (server/lib/llmJobs.ts) and returns 202 + jobId
// immediately. The actual OpenAI Responses run happens on OpenAI's
// infrastructure; the client polls GET /api/llm-jobs/:jobId, which calls
// pollLlmJob() -> openai.responses.retrieve() -> the "keyword_discovery"
// handler registered by server/routes/content.ts. That handler is what
// tags rows with provenance='ai-estimate' (see content.ts, the
// registerLlmJobHandler({kind: "keyword_discovery", ...}) block). So this
// test drives the full enqueue -> poll -> finalize cycle: mock the "openai"
// package's Responses API and a minimal in-memory llm_jobs table, then
// assert the persisted row via the mocked storage.createKeywordResearch.
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
  responsesCreate: vi.fn(),
  responsesRetrieve: vi.fn(),
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

vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("../../server/outbox/contentCostOutboxDrain", () => ({
  runContentCostOutboxDrain: vi.fn().mockResolvedValue({ stopReason: "idle" }),
}));

// Minimal in-memory llm_jobs table. enqueueLlmJob()/pollLlmJob() (server/lib/
// llmJobs.ts) and the ownership check in server/routes/llmJobs.ts all read
// and write schema.llmJobs directly (bypassing the storage layer), so the
// generic no-op chain used for every other table isn't enough here - we need
// insert to actually persist a row that a later select can find by id.
vi.mock("../../server/db", async () => {
  const schema = await vi.importActual<any>("@shared/schema");
  const genericChain: any = {};
  genericChain.set = () => genericChain;
  genericChain.where = () => genericChain;
  genericChain.from = () => genericChain;
  genericChain.limit = () => Promise.resolve([]);
  genericChain.values = () => ({ returning: async () => [] });

  let jobRow: Record<string, unknown> | null = null;
  let counter = 0;

  const insert = (table: unknown) => {
    if (table !== schema.llmJobs) return genericChain;
    return {
      values: (vals: Record<string, unknown>) => ({
        returning: async () => {
          counter += 1;
          jobRow = {
            id: `test-job-${counter}`,
            status: "pending",
            responseId: null,
            result: null,
            errorKind: null,
            errorMessage: null,
            startedAt: null,
            completedAt: null,
            createdAt: new Date(),
            ...vals,
          };
          return [{ id: jobRow.id }];
        },
      }),
    };
  };

  return {
    db: {
      select: () => ({
        from: (table: unknown) => {
          if (table !== schema.llmJobs) return genericChain;
          return { where: () => ({ limit: () => Promise.resolve(jobRow ? [jobRow] : []) }) };
        },
      }),
      insert,
      transaction: async (work: (transaction: unknown) => Promise<unknown>) =>
        work({ insert, execute: async () => [] }),
      update: (table: unknown) => {
        if (table !== schema.llmJobs) return genericChain;
        let pendingVals: Record<string, unknown> | null = null;
        const chain: any = {
          set(vals: Record<string, unknown>) {
            pendingVals = vals;
            return chain;
          },
          where() {
            if (jobRow && pendingVals) Object.assign(jobRow, pendingVals);
            return Promise.resolve(undefined);
          },
        };
        return chain;
      },
      delete: () => genericChain,
    },
    // rateLimitBuckets.ts's tryAcquire() (called by the discover route via
    // acquireOrWait) talks to Postgres directly through a raw pg client,
    // not Drizzle. Fake a client that always reports plenty of tokens so
    // the rate-limit gate never blocks the test.
    pool: {
      connect: async () => ({
        query: async (sql: string) => {
          if (/^\s*SELECT/i.test(sql)) {
            return { rows: [{ tokens: "999", last_refill_at: new Date() }] };
          }
          return { rows: [] };
        },
        release: () => undefined,
      }),
    },
    __resetLlmJobsRowForTests: () => {
      jobRow = null;
    },
    __setLlmJobRunningForTests: (responseId: string) => {
      if (jobRow) Object.assign(jobRow, { status: "running", responseId });
    },
  };
});

// enqueueLlmJob()/pollLlmJob() use a standalone `new OpenAI(...)` client
// (server/lib/llmJobs.ts), separate from the routesShared client mocked
// below. Mock the Responses API surface it calls.
vi.mock("openai", () => ({
  default: class FakeOpenAI {
    responses = {
      create: stubs.responsesCreate,
      retrieve: stubs.responsesRetrieve,
    };
    chat = { completions: { create: vi.fn() } };
  },
}));

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
const { setupLlmJobsRoutes } = await import("../../server/routes/llmJobs");
const { __resetLlmJobsRowForTests, __setLlmJobRunningForTests } =
  (await import("../../server/db")) as unknown as {
    __resetLlmJobsRowForTests: () => void;
    __setLlmJobRunningForTests: (responseId: string) => void;
  };

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  setupContentRoutes(app);
  setupLlmJobsRoutes(app);
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
  stubs.responsesCreate.mockReset();
  stubs.responsesRetrieve.mockReset();
  __resetLlmJobsRowForTests();
});

describe("POST /api/keyword-research/discover", () => {
  it("tags inserted rows with provenance='ai-estimate'", async () => {
    const app = buildApp();
    const kickoff = await call(app, "POST", "/api/keyword-research/discover", {
      brandId: BRAND_ID,
    });
    // The route no longer inserts synchronously - it enqueues a background
    // job and returns 202 with a jobId to poll.
    expect(kickoff.status).toBe(202);
    expect(kickoff.body?.jobId).toBeTruthy();
    expect(stubs.responsesCreate).not.toHaveBeenCalled();
    expect(stubs.createKeywordResearch).not.toHaveBeenCalled();

    // The outbox worker starts the provider response and links its id.
    __setLlmJobRunningForTests("resp-1");

    // Poll: openai.responses.retrieve() reports the background run as
    // completed. pollLlmJob() then dispatches to the "keyword_discovery"
    // handler registered by server/routes/content.ts, which is what
    // actually persists rows tagged with provenance='ai-estimate'.
    stubs.responsesRetrieve.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify({
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
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const poll = await call(app, "GET", `/api/llm-jobs/${kickoff.body.jobId}`);
    expect(poll.status).toBe(200);
    expect(poll.body?.status).toBe("succeeded");

    expect(stubs.createKeywordResearch).toHaveBeenCalledTimes(1);
    const payload = stubs.createKeywordResearch.mock.calls[0]?.[0] as any;
    expect(payload).toBeDefined();
    expect(payload.provenance).toBe("ai-estimate");
    expect(payload.brandId).toBe(BRAND_ID);
    expect(payload.keyword).toBe("best ai citation tool");
  });
});
