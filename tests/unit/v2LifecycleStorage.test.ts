import "dotenv/config";
import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "../../server/storage";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";

async function nukeCache() {
  await db.execute(sql`DELETE FROM fact_scrape_cache WHERE cache_key LIKE 'lifecycle-test:%'`);
}

async function nukeSlots() {
  await db.execute(sql`DELETE FROM llm_concurrency_slots WHERE slot_id LIKE 'lifecycle-test-%'`);
}

describe("storage lifecycle sweeps", () => {
  beforeEach(async () => {
    await nukeCache();
    await nukeSlots();
  });

  it("deleteExpiredFactScrapeCache deletes expired rows and returns count", async () => {
    const brandRow = await db.execute(sql`SELECT id FROM brands LIMIT 1`);
    const brand = (brandRow as unknown as { rows: Array<{ id: string }> }).rows[0];
    if (!brand) return;

    await db.execute(sql`
      INSERT INTO fact_scrape_cache (cache_key, source, brand_id, value_json, expires_at)
      VALUES
        ('lifecycle-test:exp1', 'search_llm', ${brand.id}, '{}'::jsonb, now() - interval '1 hour'),
        ('lifecycle-test:exp2', 'search_llm', ${brand.id}, '{}'::jsonb, now() - interval '5 minutes'),
        ('lifecycle-test:valid', 'search_llm', ${brand.id}, '{}'::jsonb, now() + interval '1 hour')
    `);

    const deleted = await storage.deleteExpiredFactScrapeCache();
    expect(deleted).toBeGreaterThanOrEqual(2);

    const survivor = await db.execute(sql`
      SELECT cache_key FROM fact_scrape_cache WHERE cache_key = 'lifecycle-test:valid'
    `);
    expect((survivor as unknown as { rows: Array<unknown> }).rows.length).toBe(1);

    await nukeCache();
  });

  it("deleteExpiredLlmConcurrencySlots deletes expired slots", async () => {
    await db.execute(sql`
      INSERT INTO llm_concurrency_slots (slot_id, provider, expires_at)
      VALUES
        ('lifecycle-test-exp1', 'openai', now() - interval '1 minute'),
        ('lifecycle-test-valid', 'openai', now() + interval '1 minute')
    `);
    const deleted = await storage.deleteExpiredLlmConcurrencySlots();
    expect(deleted).toBeGreaterThanOrEqual(1);
    const survivor = await db.execute(sql`
      SELECT slot_id FROM llm_concurrency_slots WHERE slot_id = 'lifecycle-test-valid'
    `);
    expect((survivor as unknown as { rows: Array<unknown> }).rows.length).toBe(1);
    await nukeSlots();
  });

  it("deleteOldFactScrapePages, Runs, Logs are callable and return a number", async () => {
    expect(typeof (await storage.deleteOldFactScrapePages(7))).toBe("number");
    expect(typeof (await storage.deleteOldFactScrapeRuns(30))).toBe("number");
    expect(typeof (await storage.deleteOldFactScrapeLogs(90))).toBe("number");
  });
});
