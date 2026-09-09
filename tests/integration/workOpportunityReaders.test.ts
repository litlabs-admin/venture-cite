import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";
import { createRequestActor } from "../../server/lib/requestActor";
import { setRestrictedRequestContext } from "../../server/data/restrictedRequestTransaction";
import {
  readFactOpportunityRecords,
  readQuestionOpportunityRecords,
} from "../../server/storage/workOpportunityStorage";
import type { BrandId } from "../../server/domains/work/types";

const databaseTest = configureDestructiveDatabaseTest(process.env);
const describeIfLocal =
  databaseTest.kind === "ready" && process.env.LOCAL_SUPABASE_TEST === "1"
    ? describe
    : describe.skip;

describeIfLocal("work opportunity readers through the restricted request role", () => {
  const userAId = randomUUID();
  const userBId = randomUUID();
  const brandAId = randomUUID();
  const runAId = randomUUID();
  const pageAId = randomUUID();
  const factAId = randomUUID();
  const generationAId = randomUUID();
  const promptAId = randomUUID();
  const promptSuggestedId = randomUUID();
  const runtimeRole = `venturecite_work_reader_${process.pid}_${Date.now()}`;
  const runtimePassword = "local-test-only-password";
  let ownerPool: Pool;
  let requestPool: Pool;

  beforeAll(async () => {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required for local work tests");

    ownerPool = new Pool({ connectionString: testDatabaseUrl, max: 2, ssl: false });
    for (const migrationName of [
      "0127_work_evidence_readers_rls.sql",
      "0128_work_opportunity_reader_columns.sql",
    ]) {
      const migration = fs.readFileSync(
        path.resolve(process.cwd(), "migrations", migrationName),
        "utf8",
      );
      await ownerPool.query(migration);
    }

    await ownerPool.query(
      `create role "${runtimeRole}" with login password '${runtimePassword}' noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls`,
    );
    await ownerPool.query(`grant venturecite_request to "${runtimeRole}"`);

    const requestUrl = new URL(testDatabaseUrl);
    requestUrl.username = runtimeRole;
    requestUrl.password = runtimePassword;
    requestPool = new Pool({ connectionString: requestUrl.toString(), max: 1, ssl: false });

    await ownerPool.query(
      `insert into public.users (id, email, first_name, access_tier)
       values ($1, $2, 'Reader A', 'free'), ($3, $4, 'Reader B', 'free')`,
      [userAId, `${userAId}@example.test`, userBId, `${userBId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.brands (id, user_id, name, company_name, industry)
       values ($1, $2, 'Reader brand', 'Reader company', 'Software')`,
      [brandAId, userAId],
    );
    await ownerPool.query(
      `insert into public.brand_fact_scrape_runs
       (id, brand_id, status, triggered_by, completed_at)
       values ($1, $2, 'completed', 'test', now())`,
      [runAId, brandAId],
    );
    await ownerPool.query(
      `insert into public.brand_fact_scrape_pages
       (id, run_id, url, canonical_url, status, fetched_at, status_code, excerpt)
       values ($1, $2, 'https://reader.example/facts', 'https://reader.example/facts', 'completed', now(), 200, 'Reader source excerpt.')`,
      [pageAId, runAId],
    );
    await ownerPool.query(
      `insert into public.brand_fact_sheet
       (id, brand_id, domain, subcategory, fact_key, fact_value, source, source_url, source_excerpt, run_id, is_active, metadata)
       values ($1, $2, 'identity', 'company', 'name', 'Reader brand', 'scraped', 'https://reader.example/facts', null, $3, 1, '{"essential":true}'::jsonb)`,
      [factAId, brandAId, runAId],
    );
    await ownerPool.query(
      `insert into public.prompt_generations (id, brand_id, generation_number)
       values ($1, $2, 5)`,
      [generationAId, brandAId],
    );
    await ownerPool.query(
      `insert into public.brand_prompts
       (id, brand_id, generation_id, prompt, order_index, status, paused)
       values
       ($1, $2, $3, 'Which buyer problem does Reader solve?', 0, 'tracked', false),
       ($4, $2, $3, 'Which buyers use Reader?', 1, 'suggested', false)`,
      [promptAId, brandAId, generationAId, promptSuggestedId],
    );
  }, 60_000);

  afterAll(async () => {
    await requestPool?.end();
    if (!ownerPool) return;
    await ownerPool.query("delete from public.users where id = any($1::varchar[])", [
      [userAId, userBId],
    ]);
    await ownerPool.query(`revoke venturecite_request from "${runtimeRole}"`);
    await ownerPool.query(`drop role if exists "${runtimeRole}"`);
    await ownerPool.end();
  });

  it("reads the complete fact projection for the owner and hides it from another actor", async () => {
    const actor = createRequestActor(userAId);
    const database = drizzle(requestPool);
    const ownRows = await database.transaction(async (transaction) => {
      await setRestrictedRequestContext({ actor, role: "venturecite_request", transaction });
      return readFactOpportunityRecords(transaction, actor, brandAId as BrandId);
    });
    expect(ownRows).toEqual([
      expect.objectContaining({
        id: factAId,
        brandId: brandAId,
        domain: "identity",
        factKey: "name",
        source: "scraped",
        canonicalUrl: "https://reader.example/facts",
        scrapePageId: pageAId,
        sourceExcerpt: "Reader source excerpt.",
      }),
    ]);

    const otherActor = createRequestActor(userBId);
    const hiddenRows = await database.transaction(async (transaction) => {
      await setRestrictedRequestContext({
        actor: otherActor,
        role: "venturecite_request",
        transaction,
      });
      return readFactOpportunityRecords(transaction, otherActor, brandAId as BrandId);
    });
    expect(hiddenRows).toEqual([]);
  });

  it("reads all prompt statuses for the owner and hides them from another actor", async () => {
    const actor = createRequestActor(userAId);
    const database = drizzle(requestPool);
    const ownRows = await database.transaction(async (transaction) => {
      await setRestrictedRequestContext({ actor, role: "venturecite_request", transaction });
      return readQuestionOpportunityRecords(transaction, actor, brandAId as BrandId);
    });
    expect(ownRows).toEqual([
      expect.objectContaining({
        id: promptAId,
        brandId: brandAId,
        generationId: generationAId,
        generationNumber: 5,
        status: "tracked",
        paused: false,
      }),
      expect.objectContaining({
        id: promptSuggestedId,
        status: "suggested",
      }),
    ]);

    const otherActor = createRequestActor(userBId);
    const hiddenRows = await database.transaction(async (transaction) => {
      await setRestrictedRequestContext({
        actor: otherActor,
        role: "venturecite_request",
        transaction,
      });
      return readQuestionOpportunityRecords(transaction, otherActor, brandAId as BrandId);
    });
    expect(hiddenRows).toEqual([]);
  });
});
