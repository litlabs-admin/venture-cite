import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

const databaseTest = configureDestructiveDatabaseTest(process.env);
const describeIfLocal =
  databaseTest.kind === "ready" && process.env.LOCAL_SUPABASE_TEST === "1"
    ? describe
    : describe.skip;

describeIfLocal("work evidence reader RLS (migration 0127)", () => {
  const userAId = randomUUID();
  const userBId = randomUUID();
  const brandAId = randomUUID();
  const runId = randomUUID();
  const pageId = randomUUID();
  const factId = randomUUID();
  const runtimeRole = `venturecite_work_evidence_${process.pid}_${Date.now()}`;
  const runtimePassword = "local-test-only-password";
  let ownerPool: Pool;
  let requestPool: Pool;

  beforeAll(async () => {
    ownerPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2, ssl: false });
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0127_work_evidence_readers_rls.sql"),
      "utf8",
    );
    await ownerPool.query(migration);
    await ownerPool.query(
      `create role "${runtimeRole}" with login password '${runtimePassword}' noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls`,
    );
    await ownerPool.query(
      `grant venturecite_request to "${runtimeRole}" with inherit false, set true, admin false`,
    );

    const requestUrl = new URL(process.env.TEST_DATABASE_URL!);
    requestUrl.username = runtimeRole;
    requestUrl.password = runtimePassword;
    requestPool = new Pool({ connectionString: requestUrl.toString(), max: 1, ssl: false });

    await ownerPool.query(
      `insert into public.users (id, email, first_name, access_tier)
       values ($1, $2, 'Evidence A', 'free'), ($3, $4, 'Evidence B', 'free')`,
      [userAId, `${userAId}@example.test`, userBId, `${userBId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.brands (id, user_id, name, company_name, industry)
       values ($1, $2, 'Evidence brand', 'Evidence company', 'Software')`,
      [brandAId, userAId],
    );
    await ownerPool.query(
      `insert into public.brand_fact_scrape_runs
       (id, brand_id, status, triggered_by, completed_at)
       values ($1, $2, 'completed', 'test', now())`,
      [runId, brandAId],
    );
    await ownerPool.query(
      `insert into public.brand_fact_scrape_pages
       (id, run_id, url, canonical_url, status, fetched_at, status_code)
       values ($1, $2, 'https://evidence.example/facts', 'https://evidence.example/facts', 'completed', now(), 200)`,
      [pageId, runId],
    );
    await ownerPool.query(
      `insert into public.brand_fact_sheet
       (id, brand_id, domain, subcategory, fact_key, fact_value, source_url, run_id, accepted_at, is_active)
       values ($1, $2, 'identity', 'company', 'name', 'Evidence', 'https://evidence.example/facts', $3, now(), 1)`,
      [factId, brandAId, runId],
    );
  });

  afterAll(async () => {
    if (requestPool) await requestPool.end();
    if (ownerPool) {
      await ownerPool.query("delete from public.users where id = any($1::varchar[])", [
        [userAId, userBId],
      ]);
      await ownerPool.query(`revoke venturecite_request from "${runtimeRole}"`);
      await ownerPool.query(`drop role if exists "${runtimeRole}"`);
      await ownerPool.end();
    }
  });

  async function selectSource(userId: string): Promise<number> {
    const client: PoolClient = await requestPool.connect();
    try {
      await client.query("begin");
      await client.query("set local role venturecite_request");
      await client.query("select set_config('app.user_id', $1, true)", [userId]);
      const result = await client.query(
        `select fact.id
         from public.brands brand
         join public.brand_fact_sheet fact on fact.brand_id = brand.id
         join public.brand_fact_scrape_runs run on run.id = fact.run_id
         join public.brand_fact_scrape_pages page on page.run_id = run.id
         where fact.id = $1 and page.id = $2
           and fact.accepted_at is not null and fact.is_active = 1
           and run.status = 'completed' and run.completed_at is not null
           and page.status = 'completed' and page.status_code between 200 and 299`,
        [factId, pageId],
      );
      await client.query("rollback");
      return result.rowCount ?? 0;
    } finally {
      client.release();
    }
  }

  it("allows the owner to read the completed source record", async () => {
    await expect(selectSource(userAId)).resolves.toBe(1);
  });

  it("hides the source record from another user", async () => {
    await expect(selectSource(userBId)).resolves.toBe(0);
  });

  it("does not grant write privilege to the request role", async () => {
    const client = await requestPool.connect();
    try {
      await client.query("begin");
      await client.query("set local role venturecite_request");
      await client.query("select set_config('app.user_id', $1, true)", [userAId]);
      await expect(
        client.query("update public.brand_fact_sheet set fact_value = 'tampered' where id = $1", [
          factId,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback");
    } finally {
      client.release();
    }
  });
});
