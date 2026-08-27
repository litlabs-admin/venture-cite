// Integration test: executes `createCompetitorGeoRanking` against a real Postgres.
//
// WHY THIS FILE EXISTS (finding F-03).
// Task 1 rewrote this method from hand-written SQL onto Drizzle's insert builder.
// The unit test at tests/unit/rankingInsertRoundTrip.test.ts mocks `server/db`, so
// it proves the call shape and nothing else: the generated SQL is never sent to a
// database, the `COALESCE(EXCLUDED.x, table.x)` fragments are never evaluated, and
// the ON CONFLICT target is never matched against a real index. This path runs
// 84,892 times in production. Asserting against a mock and writing a comment that
// says "SQL correctness is not covered" documents the gap rather than closing it.
//
// The load-bearing behaviour is the COALESCE semantics: a later scan that finds no
// rank must NOT erase a rank an earlier scan recorded, while `is_cited` IS a
// straight overwrite. Those two rules differ per column and only a real database
// can tell you they were reproduced correctly.
//
// HOW TO RUN
//   npx supabase start
//   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
//   LOCAL_SUPABASE_TEST=1 npx vitest run tests/integration/competitorGeoRankingUpsert.test.ts
//
// Without TEST_DATABASE_URL the file skips, so CI and ordinary `npm test` runs are
// unaffected. `configureDestructiveDatabaseTest` additionally refuses any target
// that is not the fixed loopback Supabase database.
//
// ISOLATION CONTRACT. Every row this file creates carries FIXTURE_PREFIX in its
// primary key. Assertions scope to those ids and cleanup deletes only those ids,
// so the file is safe to run against a database that holds other data.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

const databaseTest = configureDestructiveDatabaseTest(process.env);

if (databaseTest.kind === "ready") {
  const { db } = await import("../../server/db");
  const { DatabaseStorage } = await import("../../server/databaseStorage");
  const storage = new DatabaseStorage();

  const FIXTURE_PREFIX = "f03-cgr-upsert";
  const BRAND_ID = `${FIXTURE_PREFIX}-brand`;
  const COMPETITOR_ID = `${FIXTURE_PREFIX}-competitor`;
  const RUN_ID = `${FIXTURE_PREFIX}-run`;
  const PROMPT_ID = `${FIXTURE_PREFIX}-prompt`;
  const PLATFORM = "ChatGPT";

  async function removeFixtures() {
    // Child first, then parents. Scoped to this file's ids only.
    await db.execute(
      sql`DELETE FROM competitor_geo_rankings WHERE competitor_id = ${COMPETITOR_ID}`,
    );
    await db.execute(sql`DELETE FROM brand_prompts WHERE id = ${PROMPT_ID}`);
    await db.execute(sql`DELETE FROM citation_runs WHERE id = ${RUN_ID}`);
    await db.execute(sql`DELETE FROM competitors WHERE id = ${COMPETITOR_ID}`);
    await db.execute(sql`DELETE FROM brands WHERE id = ${BRAND_ID}`);
  }

  beforeAll(async () => {
    await removeFixtures();
    await db.execute(sql`
      INSERT INTO brands (id, name, company_name, industry)
      VALUES (${BRAND_ID}, 'F03 Fixture', 'F03 Fixture Co', 'Testing')
    `);
    await db.execute(sql`
      INSERT INTO competitors (id, brand_id, name, domain)
      VALUES (${COMPETITOR_ID}, ${BRAND_ID}, 'F03 Rival', 'rival.example')
    `);
    await db.execute(sql`
      INSERT INTO citation_runs (id, brand_id) VALUES (${RUN_ID}, ${BRAND_ID})
    `);
    await db.execute(sql`
      INSERT INTO brand_prompts (id, brand_id, prompt)
      VALUES (${PROMPT_ID}, ${BRAND_ID}, 'best tool for F03 testing')
    `);
  });

  afterAll(async () => {
    await removeFixtures();
  });

  async function rowCount(): Promise<number> {
    const result = await db.execute<{ n: string }>(sql`
      SELECT count(*)::int AS n FROM competitor_geo_rankings WHERE competitor_id = ${COMPETITOR_ID}
    `);
    return Number((result as unknown as { rows: { n: number }[] }).rows[0].n);
  }

  describe("createCompetitorGeoRanking against real Postgres", () => {
    it("inserts a first observation and returns the typed row", async () => {
      const row = await storage.createCompetitorGeoRanking({
        competitorId: COMPETITOR_ID,
        runId: RUN_ID,
        brandPromptId: PROMPT_ID,
        aiPlatform: PLATFORM,
        isCited: 1,
        rank: 3,
        relevanceScore: 80,
        citationContext: "first observation",
        citingOutletUrl: "https://example.com/first",
        sentiment: "positive",
      } as never);

      // Proves the method returns a mapped camelCase row from the insert itself.
      // The old implementation could only do this via a second SELECT.
      expect(row.id).toBeTruthy();
      expect(row.competitorId).toBe(COMPETITOR_ID);
      expect(row.rank).toBe(3);
      expect(row.relevanceScore).toBe(80);
      expect(row.isCited).toBe(1);
      expect(await rowCount()).toBe(1);
    });

    it("preserves prior values on conflict when the new observation is null", async () => {
      const before = await rowCount();

      // A later scan of the same (competitor, run, prompt, platform) cell that
      // found the competitor but could not determine a rank. Every COALESCE
      // column arrives null; is_cited arrives 0.
      const updated = await storage.createCompetitorGeoRanking({
        competitorId: COMPETITOR_ID,
        runId: RUN_ID,
        brandPromptId: PROMPT_ID,
        aiPlatform: PLATFORM,
        isCited: 0,
        rank: null,
        relevanceScore: null,
        citationContext: null,
        citingOutletUrl: null,
        sentiment: null,
      } as never);

      // The ON CONFLICT target matched the real unique index: still one row.
      expect(await rowCount()).toBe(before);

      // COALESCE(EXCLUDED.x, table.x) - the earlier values must survive.
      expect(updated.rank).toBe(3);
      expect(updated.relevanceScore).toBe(80);
      expect(updated.citationContext).toBe("first observation");
      expect(updated.citingOutletUrl).toBe("https://example.com/first");
      expect(updated.sentiment).toBe("positive");

      // is_cited is a STRAIGHT overwrite, deliberately not COALESCE.
      expect(updated.isCited).toBe(0);
    });

    it("overwrites prior values on conflict when the new observation is present", async () => {
      const before = await rowCount();

      const updated = await storage.createCompetitorGeoRanking({
        competitorId: COMPETITOR_ID,
        runId: RUN_ID,
        brandPromptId: PROMPT_ID,
        aiPlatform: PLATFORM,
        isCited: 1,
        rank: 1,
        relevanceScore: 95,
        citationContext: "second observation",
        citingOutletUrl: "https://example.com/second",
        sentiment: "neutral",
      } as never);

      expect(await rowCount()).toBe(before);
      expect(updated.rank).toBe(1);
      expect(updated.relevanceScore).toBe(95);
      expect(updated.citationContext).toBe("second observation");
      expect(updated.citingOutletUrl).toBe("https://example.com/second");
      expect(updated.sentiment).toBe("neutral");
      expect(updated.isCited).toBe(1);
    });

    it("treats a different ai_platform as a separate cell", async () => {
      const before = await rowCount();

      await storage.createCompetitorGeoRanking({
        competitorId: COMPETITOR_ID,
        runId: RUN_ID,
        brandPromptId: PROMPT_ID,
        aiPlatform: "Perplexity",
        isCited: 1,
        rank: 2,
      } as never);

      // ai_platform participates in the conflict target, so this inserts rather
      // than updating the ChatGPT row.
      expect(await rowCount()).toBe(before + 1);
    });

    it("advances checked_at on conflict", async () => {
      const read = async () => {
        const result = await db.execute<{ checked_at: Date }>(sql`
          SELECT checked_at FROM competitor_geo_rankings
          WHERE competitor_id = ${COMPETITOR_ID} AND ai_platform = ${PLATFORM}
        `);
        return (result as unknown as { rows: { checked_at: Date }[] }).rows[0].checked_at;
      };

      const before = await read();
      await new Promise((resolve) => setTimeout(resolve, 10));

      await storage.createCompetitorGeoRanking({
        competitorId: COMPETITOR_ID,
        runId: RUN_ID,
        brandPromptId: PROMPT_ID,
        aiPlatform: PLATFORM,
        isCited: 1,
      } as never);

      const after = await read();
      expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
    });
  });
} else {
  describe.skip("createCompetitorGeoRanking against real Postgres", () => {
    it("requires TEST_DATABASE_URL and LOCAL_SUPABASE_TEST=1", () => {});
  });
}
