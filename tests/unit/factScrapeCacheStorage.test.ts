// Hits real Postgres (despite living under tests/unit/). Loads dotenv before
// importing server/db so DATABASE_URL is available when the pool initializes.
// Global setup intentionally doesn't load dotenv — see tests/setup.ts.
import "dotenv/config";
import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "../../server/storage";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";

async function clear() {
  await db.execute(sql`DELETE FROM fact_scrape_cache`);
}

describe("storage.factScrapeCache", () => {
  beforeEach(clear);

  it("upserts and reads a cache entry by key", async () => {
    const brandRow = await db.execute(sql`
      SELECT id FROM brands LIMIT 1
    `);
    const brand = (brandRow as unknown as { rows: Array<{ id: string }> }).rows[0];
    if (!brand) {
      return; // No brands in test DB — skip rather than fail.
    }

    await storage.upsertFactScrapeCache({
      cacheKey: "search-llm:test:abc:v1",
      source: "search_llm",
      brandId: brand.id,
      valueJson: { facts: [{ k: "v" }] },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const got = await storage.getFactScrapeCache("search-llm:test:abc:v1");
    expect(got?.valueJson).toEqual({ facts: [{ k: "v" }] });

    await db.execute(sql`
      UPDATE fact_scrape_cache SET expires_at = now() - interval '1 minute'
      WHERE cache_key = 'search-llm:test:abc:v1'
    `);
    expect(await storage.getFactScrapeCache("search-llm:test:abc:v1")).toBeNull();
  });

  it("setSystemState writes and getSystemState reads JSON", async () => {
    await storage.setSystemState("test_key", { hello: "world" });
    expect(await storage.getSystemState("test_key")).toEqual({ hello: "world" });
    await db.execute(sql`DELETE FROM system_state WHERE key = 'test_key'`);
  });

  it("insertFactScrapeLog writes a log row", async () => {
    const runRow = await db.execute(sql`
      SELECT id FROM brand_fact_scrape_runs LIMIT 1
    `);
    const run = (runRow as unknown as { rows: Array<{ id: string }> }).rows[0];
    if (!run) return;

    await storage.insertFactScrapeLog({
      runId: run.id,
      source: "static_pages",
      status: "done",
      factCount: 3,
      latencyMs: 1234,
    });
    const rows = await db.execute(sql`
      SELECT count(*)::int AS n FROM fact_scrape_logs WHERE run_id = ${run.id} AND source='static_pages'
    `);
    const n = (rows as unknown as { rows: Array<{ n: number }> }).rows[0].n;
    expect(n).toBeGreaterThanOrEqual(1);
    await db.execute(
      sql`DELETE FROM fact_scrape_logs WHERE run_id = ${run.id} AND source='static_pages'`,
    );
  });
});
