// End-to-end: real DB, real auth shim, NO LLM calls.
// Seeds a brand, an in-flight run, one 'scraped' fact and one conflicting
// 'user' fact, then calls /aggregate.  Verifies:
//   - response status is 'completed'
//   - disagreementsIncremented >= 1
//   - the 'user' row's disagreement_count was incremented in the DB
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

// Bypass aiLimitMiddleware; mock the OpenAI client to satisfy the import
// in factSheetV2.ts.
vi.mock("../../server/lib/routesShared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/routesShared");
  return {
    ...real,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    openai: { chat: { completions: { create: vi.fn() } } },
  };
});

vi.mock("openai", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("openai");
  return {
    ...actual,
    default: class MockOpenAI {
      chat = { completions: { create: vi.fn() } };
    },
  };
});

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

const TEST_USER_ID = "smoke-user";
const TEST_BRAND_ID = "smoke-brand-v2-aggregate";

async function seed() {
  await db.execute(sql`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (${TEST_USER_ID}, 'smoke@test.local', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO brands (id, user_id, name, company_name, website, industry, created_at, updated_at)
    VALUES (${TEST_BRAND_ID}, ${TEST_USER_ID}, 'Smoke Aggregate', 'Smoke Aggregate', 'https://example.com', 'saas', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function cleanup() {
  await db.execute(sql`DELETE FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID}`);
  await db.execute(
    sql`DELETE FROM fact_scrape_logs WHERE run_id IN (SELECT id FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID})`,
  );
  await db.execute(sql`DELETE FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID}`);
}

describe("Plan 4 smoke: POST /aggregate consolidates run end-to-end", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  it("increments disagreement_count and marks run completed", async () => {
    // Insert a pending run.
    const runRow = await db.execute(sql`
      INSERT INTO brand_fact_scrape_runs (brand_id, triggered_by, status)
      VALUES (${TEST_BRAND_ID}, 'manual_rescrape', 'pending')
      RETURNING id
    `);
    const runId = (runRow as unknown as { rows: Array<{ id: string }> }).rows[0].id;

    // Insert two facts for the same (domain, subcategory, factKey) with
    // different values so the aggregate step finds a disagreement.
    await db.execute(sql`
      INSERT INTO brand_fact_sheet (brand_id, domain, subcategory, fact_key, fact_value, value_type, source, run_id, confidence)
      VALUES
        (${TEST_BRAND_ID}, 'identity', 'description', 'tagline', 'Scraped tagline', 'string', 'scraped', ${runId}, '0.9'),
        (${TEST_BRAND_ID}, 'identity', 'description', 'tagline', 'User tagline', 'string', 'user', NULL, '1.0')
    `);

    // Insert a fact_scrape_logs row so computeTerminalStatus sees >=1 fact
    // and returns 'completed'.
    await db.execute(sql`
      INSERT INTO fact_scrape_logs (run_id, source, status, fact_count)
      VALUES (${runId}, 'static_pages', 'done', 1)
    `);

    const app = express();
    app.use(express.json());
    setupFactSheetV2Routes(app);

    const res = await request(app).post("/api/brand-fact-sheet/aggregate").send({ runId });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.disagreementsIncremented).toBeGreaterThanOrEqual(1);

    // Verify the 'user' row's disagreement_count was incremented in the DB.
    const userFactRow = await db.execute(sql`
      SELECT disagreement_count FROM brand_fact_sheet
      WHERE brand_id = ${TEST_BRAND_ID} AND source = 'user' AND fact_key = 'tagline'
    `);
    const cnt = (userFactRow as unknown as { rows: Array<{ disagreement_count: number }> }).rows[0]
      ?.disagreement_count;
    expect(cnt).toBeGreaterThanOrEqual(1);
  });
});
