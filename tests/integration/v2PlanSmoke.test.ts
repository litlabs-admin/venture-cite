// End-to-end: real DB, real auth shim, MOCKED sitemap discovery (deterministic).
// Verifies the /plan endpoint creates a run + pages in the DB and filters
// Tier-3 URLs (blog/*) before persisting.
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

// Return three known URLs from sitemap discovery: two tier-1/tier-2 candidates
// and one Tier-3 blog URL that selectTopUrls must drop.
vi.mock("../../server/lib/factAgent/v2/sitemapDiscovery", () => ({
  discoverSitemapUrls: vi
    .fn()
    .mockResolvedValue([
      "https://example.com/about",
      "https://example.com/pricing",
      "https://example.com/blog/foo",
    ]),
}));

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

const TEST_USER_ID = "smoke-user";
const TEST_BRAND_ID = "smoke-brand-v2-plan";

async function seed() {
  await db.execute(sql`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (${TEST_USER_ID}, 'smoke@test.local', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO brands (id, user_id, name, company_name, website, industry, created_at, updated_at, fact_scrape_enabled)
    VALUES (${TEST_BRAND_ID}, ${TEST_USER_ID}, 'Smoke Plan', 'Smoke Plan', 'https://example.com', 'saas', now(), now(), true)
    ON CONFLICT (id) DO NOTHING
  `);
}

async function cleanup() {
  await db.execute(
    sql`DELETE FROM brand_fact_scrape_pages WHERE run_id IN (SELECT id FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID})`,
  );
  await db.execute(sql`DELETE FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID}`);
}

describe("Plan 4 smoke: POST /plan creates run + pages end-to-end", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  it("creates a run with the expected page rows", async () => {
    const app = express();
    app.use(express.json());
    setupFactSheetV2Routes(app);

    const res = await request(app)
      .post("/api/brand-fact-sheet/plan")
      .send({ brandId: TEST_BRAND_ID });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.runId).toBe("string");
    expect(res.body.pages.length).toBeGreaterThanOrEqual(1);
    // Homepage is always included by selectTopUrls regardless of sitemap.
    expect(res.body.pages.some((p: { url: string }) => p.url === "https://example.com/")).toBe(
      true,
    );
    // Tier-3 blog URL must have been dropped.
    expect(res.body.pages.every((p: { url: string }) => !p.url.includes("/blog/foo"))).toBe(true);

    // Verify the run row landed in the DB.
    const runRows = await db.execute(sql`
      SELECT id, status FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID}
    `);
    expect((runRows as unknown as { rows: Array<unknown> }).rows.length).toBe(1);

    // Verify page rows were persisted for this run.
    const pageRows = await db.execute(sql`
      SELECT id, url FROM brand_fact_scrape_pages WHERE run_id = ${res.body.runId}
    `);
    expect(
      (pageRows as unknown as { rows: Array<{ url: string }> }).rows.length,
    ).toBeGreaterThanOrEqual(1);
  });
});
