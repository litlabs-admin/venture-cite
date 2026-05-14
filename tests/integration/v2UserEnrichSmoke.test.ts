// End-to-end user-enrich: real DB, mocked OpenAI.
// Verifies facts persist with source='user'.
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

// sourceUserEnrich.ts instantiates its OWN OpenAI client (standalone, not
// shared from routesShared). Mock the SDK at the module level so the test
// doesn't make a real LLM call.
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
                        factKey: "description",
                        factValue: "Smoke user-enrich brand.",
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

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

const TEST_USER_ID = "smoke-user";
const TEST_BRAND_ID = "smoke-brand-v2-enrich";

async function seed() {
  await db.execute(sql`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (${TEST_USER_ID}, 'smoke@test.local', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO brands (id, user_id, name, company_name, description, website, industry, created_at, updated_at)
    VALUES (${TEST_BRAND_ID}, ${TEST_USER_ID}, 'Smoke Enrich', 'Smoke Enrich', 'Smoke user-enrich brand.', 'https://example.com', 'saas', now(), now())
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

describe("Plan 3 smoke: POST /user-enrich persists with source=user", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  it("calls GPT, persists fact with source=user, writes log", async () => {
    const runRow = await db.execute(sql`
      INSERT INTO brand_fact_scrape_runs (brand_id, triggered_by, status)
      VALUES (${TEST_BRAND_ID}, 'manual_rescrape', 'pending')
      RETURNING id
    `);
    const runId = (runRow as unknown as { rows: Array<{ id: string }> }).rows[0].id;

    const app = express();
    app.use(express.json());
    setupFactSheetV2Routes(app);

    const res = await request(app).post("/api/brand-fact-sheet/user-enrich").send({ runId });

    expect(res.status).toBe(200);
    expect(res.body.factCount).toBe(1);

    const factRows = await db.execute(sql`
      SELECT fact_key, fact_value, source FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID}
    `);
    const facts = (
      factRows as unknown as {
        rows: Array<{ fact_key: string; fact_value: string; source: string }>;
      }
    ).rows;
    expect(facts.some((f) => f.fact_key === "description" && f.source === "user")).toBe(true);

    const logRows = await db.execute(sql`
      SELECT source, status FROM fact_scrape_logs WHERE run_id = ${runId}
    `);
    expect(
      (logRows as unknown as { rows: Array<{ source: string; status: string }> }).rows.some(
        (l) => l.source === "user_enrich" && l.status === "done",
      ),
    ).toBe(true);
  });
});
