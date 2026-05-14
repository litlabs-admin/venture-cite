// End-to-end search-LLM: real DB, mocked OpenRouter Perplexity.
// Verifies cache write + facts persistence + log row.
import "dotenv/config";
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { sql } from "drizzle-orm";
import { db } from "../../server/db";

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, _res: unknown, next: () => void) => {
    req.user = { id: "smoke-user" };
    next();
  },
}));

vi.mock("../../server/lib/routesShared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/routesShared");
  return {
    ...real,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    openai: { chat: { completions: { create: vi.fn() } } },
  };
});

// Mock the OpenRouter client at the v2 module level.
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
                      domain: "identity",
                      subcategory: "description",
                      factKey: "tagline",
                      factValue: "Smoke search-LLM result.",
                      valueType: "string",
                      confidence: 0.95,
                      sourceExcerpt: "",
                      sourceUrl: "https://example.com/about",
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

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

const TEST_USER_ID = "smoke-user";
const TEST_BRAND_ID = "smoke-brand-v2-search";

async function seed() {
  await db.execute(sql`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (${TEST_USER_ID}, 'smoke@test.local', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO brands (id, user_id, name, company_name, website, industry, created_at, updated_at)
    VALUES (${TEST_BRAND_ID}, ${TEST_USER_ID}, 'Smoke Search', 'Smoke Search', 'https://example.com', 'saas', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function cleanup() {
  await db.execute(sql`DELETE FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID}`);
  await db.execute(sql`DELETE FROM fact_scrape_cache WHERE brand_id = ${TEST_BRAND_ID}`);
  await db.execute(
    sql`DELETE FROM fact_scrape_logs WHERE run_id IN (SELECT id FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID})`,
  );
  await db.execute(sql`DELETE FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID}`);
}

describe("Plan 3 smoke: POST /search-llm persists end-to-end", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  it("calls Perplexity-via-OpenRouter, persists 1 fact, writes cache + log", async () => {
    const runRow = await db.execute(sql`
      INSERT INTO brand_fact_scrape_runs (brand_id, triggered_by, status)
      VALUES (${TEST_BRAND_ID}, 'manual_rescrape', 'pending')
      RETURNING id
    `);
    const runId = (runRow as unknown as { rows: Array<{ id: string }> }).rows[0].id;

    const app = express();
    app.use(express.json());
    setupFactSheetV2Routes(app);

    const res = await request(app).post("/api/brand-fact-sheet/search-llm").send({ runId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.factCount).toBe(1);

    const factRows = await db.execute(sql`
      SELECT fact_key, fact_value FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID} AND source = 'scraped'
    `);
    const facts = (factRows as unknown as { rows: Array<{ fact_key: string; fact_value: string }> })
      .rows;
    expect(
      facts.some((f) => f.fact_key === "tagline" && f.fact_value === "Smoke search-LLM result."),
    ).toBe(true);

    const cacheRows = await db.execute(sql`
      SELECT cache_key FROM fact_scrape_cache WHERE brand_id = ${TEST_BRAND_ID}
    `);
    expect((cacheRows as unknown as { rows: Array<unknown> }).rows.length).toBeGreaterThanOrEqual(
      1,
    );

    const logRows = await db.execute(sql`
      SELECT source, status, fact_count FROM fact_scrape_logs WHERE run_id = ${runId}
    `);
    const logs = (
      logRows as unknown as { rows: Array<{ source: string; status: string; fact_count: number }> }
    ).rows;
    expect(
      logs.some((l) => l.source === "search_llm" && l.status === "done" && l.fact_count === 1),
    ).toBe(true);
  });
});
