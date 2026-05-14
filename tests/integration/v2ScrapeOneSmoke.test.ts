// End-to-end: real DB, real auth shim, MOCKED LLM (deterministic + cheap)
// and MOCKED fetcher (inject known HTML). Verifies the whole pipeline
// persists facts when the LLM returns valid output.
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
// in factSheetV2.ts (we intercept the LLM at the failover layer below).
vi.mock("../../server/lib/routesShared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/routesShared");
  return {
    ...real,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    openai: { chat: { completions: { create: vi.fn() } } },
  };
});

// Mock the fetcher with a synthetic HTML page that has structured data.
vi.mock("../../server/lib/ssrf", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/ssrf");
  return {
    ...real,
    safeFetchTextWithLockedIp: vi.fn().mockResolvedValue({
      status: 200,
      text: `<html><head>
        <title>Smoke Brand</title>
        <meta name="description" content="Smoke Brand builds tests." />
      </head><body><p>Body text here. ${"filler ".repeat(40)}</p></body></html>`,
      contentType: "text/html",
      headers: {},
    }),
  };
});

// Mock the failover layer so we don't go over the wire.
vi.mock("../../server/lib/factAgent/v2/llmFailover", () => ({
  callWithFailover: vi.fn().mockResolvedValue(
    JSON.stringify({
      facts: [
        {
          domain: "identity",
          subcategory: "description",
          factKey: "tagline",
          factValue: "Smoke Brand builds tests.",
          valueType: "string",
          confidence: 0.95,
          sourceExcerpt: "Smoke Brand builds tests.",
        },
      ],
    }),
  ),
}));

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

const TEST_USER_ID = "smoke-user";
const TEST_BRAND_ID = "smoke-brand-v2";

async function seed() {
  await db.execute(sql`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (${TEST_USER_ID}, 'smoke@test.local', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO brands (id, user_id, name, company_name, website, industry, created_at, updated_at)
    VALUES (${TEST_BRAND_ID}, ${TEST_USER_ID}, 'Smoke Brand', 'Smoke Brand Inc', 'https://example.com', 'saas', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function cleanup() {
  await db.execute(sql`DELETE FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID}`);
  await db.execute(
    sql`DELETE FROM brand_fact_scrape_pages WHERE run_id IN (SELECT id FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID})`,
  );
  await db.execute(
    sql`DELETE FROM fact_scrape_logs WHERE run_id IN (SELECT id FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID})`,
  );
  await db.execute(sql`DELETE FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID}`);
}

describe("Plan 2 smoke: POST /scrape-one persists facts end-to-end", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  it("creates run + page, hits the endpoint, persists 1 fact", async () => {
    const runRow = await db.execute(sql`
      INSERT INTO brand_fact_scrape_runs (brand_id, triggered_by, status)
      VALUES (${TEST_BRAND_ID}, 'manual_rescrape', 'pending')
      RETURNING id
    `);
    const runId = (runRow as unknown as { rows: Array<{ id: string }> }).rows[0].id;

    const pageRow = await db.execute(sql`
      INSERT INTO brand_fact_scrape_pages (run_id, url, canonical_url, status)
      VALUES (${runId}, 'https://example.com/about', 'https://example.com/about', 'pending')
      RETURNING id
    `);
    const pageId = (pageRow as unknown as { rows: Array<{ id: string }> }).rows[0].id;

    const app = express();
    app.use(express.json());
    setupFactSheetV2Routes(app);

    const res = await request(app).post("/api/brand-fact-sheet/scrape-one").send({ runId, pageId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.factCount).toBe(1);

    // Verify the fact landed
    const factRows = await db.execute(sql`
      SELECT fact_key, fact_value FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID} AND source = 'scraped'
    `);
    const facts = (factRows as unknown as { rows: Array<{ fact_key: string; fact_value: string }> })
      .rows;
    expect(facts.length).toBeGreaterThanOrEqual(1);
    expect(
      facts.some((f) => f.fact_key === "tagline" && f.fact_value === "Smoke Brand builds tests."),
    ).toBe(true);

    // Verify the log row landed
    const logRows = await db.execute(sql`
      SELECT source, status, fact_count FROM fact_scrape_logs WHERE run_id = ${runId}
    `);
    const logs = (
      logRows as unknown as { rows: Array<{ source: string; status: string; fact_count: number }> }
    ).rows;
    expect(
      logs.some((l) => l.source === "static_pages" && l.status === "done" && l.fact_count === 1),
    ).toBe(true);

    // Verify the page row updated
    const pageRows = await db.execute(sql`
      SELECT status, fact_count FROM brand_fact_scrape_pages WHERE id = ${pageId}
    `);
    const page = (pageRows as unknown as { rows: Array<{ status: string; fact_count: number }> })
      .rows[0];
    expect(page.status).toBe("done");
    expect(page.fact_count).toBe(1);
  });
});
