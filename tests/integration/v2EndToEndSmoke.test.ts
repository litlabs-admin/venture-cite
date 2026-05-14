// Full v2 pipeline end-to-end smoke test against the real DB.
// Exercises every phase in sequence:
//   plan → scrape-one (all pages) → search-llm → user-enrich → aggregate
// All LLM / HTTP calls are mocked so the test is deterministic and free.
//
// dotenv must load BEFORE any server/db import.
import "dotenv/config";
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { sql } from "drizzle-orm";
import { db } from "../../server/db";

// Auth shim → user 'smoke-user'
vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, _res: unknown, next: () => void) => {
    req.user = { id: "smoke-user" };
    next();
  },
}));

// Bypass aiLimitMiddleware; stub the shared OpenAI singleton.
vi.mock("../../server/lib/routesShared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/routesShared");
  return {
    ...real,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    openai: { chat: { completions: { create: vi.fn() } } },
  };
});

// sourceUserEnrich creates its own OpenAI instance — intercept at the SDK level.
vi.mock("openai", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("openai");
  return {
    ...actual,
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    facts: [
                      {
                        domain: "identity",
                        subcategory: "description",
                        factKey: "tagline",
                        factValue: "End-to-end test brand.",
                        valueType: "string",
                        confidence: 1.0,
                        sourceExcerpt: "",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        },
      };
    },
  };
});

// Stub HTTP fetcher (used by /plan sitemap discovery and /scrape-one).
vi.mock("../../server/lib/ssrf", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/ssrf");
  return {
    ...real,
    safeFetchTextWithLockedIp: vi.fn().mockResolvedValue({
      status: 200,
      text: `<html><head>
        <title>E2E Brand</title>
        <meta name="description" content="E2E brand description." />
      </head><body>Some body content ${"filler ".repeat(40)}</body></html>`,
      contentType: "text/html",
      headers: {},
    }),
  };
});

// Sitemap discovery returns one candidate URL.
vi.mock("../../server/lib/factAgent/v2/sitemapDiscovery", () => ({
  discoverSitemapUrls: vi.fn().mockResolvedValue(["https://example.com/about"]),
}));

// OpenRouter client used by search-LLM source.
vi.mock("../../server/lib/factAgent/v2/openrouterClient", () => ({
  getOpenrouterClient: () => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  facts: [
                    {
                      domain: "team",
                      subcategory: "founders",
                      factKey: "ceo",
                      factValue: "Alice",
                      valueType: "string",
                      confidence: 0.9,
                      sourceExcerpt: "",
                      sourceUrl: "https://example.com",
                    },
                  ],
                }),
              },
            },
          ],
        }),
      },
    },
  }),
}));

// LLM failover layer used by /scrape-one.
vi.mock("../../server/lib/factAgent/v2/llmFailover", () => ({
  callWithFailover: vi.fn().mockResolvedValue(
    JSON.stringify({
      facts: [
        {
          domain: "identity",
          subcategory: "description",
          factKey: "tagline",
          factValue: "E2E brand description.",
          valueType: "string",
          confidence: 0.95,
          sourceExcerpt: "",
        },
      ],
    }),
  ),
}));

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

const TEST_USER_ID = "smoke-user";
const TEST_BRAND_ID = "smoke-brand-e2e";

async function seed() {
  await db.execute(sql`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (${TEST_USER_ID}, 'smoke@test.local', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO brands (id, user_id, name, company_name, description, website, industry, created_at, updated_at, fact_scrape_enabled)
    VALUES (${TEST_BRAND_ID}, ${TEST_USER_ID}, 'E2E Brand', 'E2E Brand Inc', 'E2E brand description.', 'https://example.com', 'saas', now(), now(), true)
    ON CONFLICT (id) DO NOTHING
  `);
}

async function cleanup() {
  await db.execute(sql`DELETE FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID}`);
  await db.execute(sql`DELETE FROM fact_scrape_cache WHERE brand_id = ${TEST_BRAND_ID}`);
  await db.execute(sql`
    DELETE FROM fact_scrape_logs
    WHERE run_id IN (SELECT id FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID})
  `);
  await db.execute(sql`
    DELETE FROM brand_fact_scrape_pages
    WHERE run_id IN (SELECT id FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID})
  `);
  await db.execute(sql`DELETE FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID}`);
}

describe("Plan 6 smoke: full v2 pipeline persists facts end-to-end", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  // Each pipeline phase does multiple real DB round-trips; 30 s is generous.
  it("plan → scrape-one + search-llm + user-enrich → aggregate", async () => {
    const app = express();
    app.use(express.json());
    setupFactSheetV2Routes(app);

    // ── Phase 1: plan ──────────────────────────────────────────────────────
    const planRes = await request(app)
      .post("/api/brand-fact-sheet/plan")
      .send({ brandId: TEST_BRAND_ID });

    expect(planRes.status).toBe(200);
    expect(planRes.body.success).toBe(true);

    const { runId, pages } = planRes.body as {
      runId: string;
      pages: Array<{ pageId: string; url: string }>;
    };
    expect(typeof runId).toBe("string");
    expect(pages.length).toBeGreaterThanOrEqual(1);

    // Verify run + pages landed in the DB.
    const runRows = await db.execute(sql`
      SELECT id, status FROM brand_fact_scrape_runs WHERE id = ${runId}
    `);
    expect((runRows as unknown as { rows: Array<unknown> }).rows.length).toBe(1);

    const dbPageRows = await db.execute(sql`
      SELECT id FROM brand_fact_scrape_pages WHERE run_id = ${runId}
    `);
    expect((dbPageRows as unknown as { rows: Array<unknown> }).rows.length).toBe(pages.length);

    // ── Phase 2: scrape-one for every planned page ─────────────────────────
    for (const page of pages) {
      const r = await request(app)
        .post("/api/brand-fact-sheet/scrape-one")
        .send({ runId, pageId: page.pageId });
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
    }

    // At least one scraped fact should now exist.
    const scrapedRows = await db.execute(sql`
      SELECT fact_key FROM brand_fact_sheet
      WHERE brand_id = ${TEST_BRAND_ID} AND source = 'scraped'
    `);
    expect((scrapedRows as unknown as { rows: Array<unknown> }).rows.length).toBeGreaterThan(0);

    // ── Phase 3: search-llm ────────────────────────────────────────────────
    const searchRes = await request(app).post("/api/brand-fact-sheet/search-llm").send({ runId });

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.success).toBe(true);

    // ── Phase 4: user-enrich ───────────────────────────────────────────────
    const enrichRes = await request(app).post("/api/brand-fact-sheet/user-enrich").send({ runId });

    expect(enrichRes.status).toBe(200);
    expect(enrichRes.body.success).toBe(true);

    // ── Phase 5: aggregate ─────────────────────────────────────────────────
    // Insert a log row so computeTerminalStatus sees >=1 fact and returns
    // 'completed' (mirrors what the other aggregate smoke tests do).
    await db.execute(sql`
      INSERT INTO fact_scrape_logs (run_id, source, status, fact_count)
      VALUES (${runId}, 'static_pages', 'done', 1)
      ON CONFLICT DO NOTHING
    `);

    const aggRes = await request(app).post("/api/brand-fact-sheet/aggregate").send({ runId });

    expect(aggRes.status).toBe(200);
    expect(aggRes.body.success).toBe(true);
    expect(aggRes.body.status).toBe("completed");
    expect(aggRes.body.totalFacts).toBeGreaterThan(0);

    // ── Final: verify the fact sheet has rows in the DB ────────────────────
    const factRows = await db.execute(sql`
      SELECT fact_key, source FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID}
    `);
    const facts = (factRows as unknown as { rows: Array<{ fact_key: string; source: string }> })
      .rows;
    expect(facts.length).toBeGreaterThan(0);
  }, 30_000);
});
