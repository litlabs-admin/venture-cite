import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type QueryResult } from "pg";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

const databaseTest = configureDestructiveDatabaseTest(process.env);
const describeIfLocal =
  databaseTest.kind === "ready" && process.env.LOCAL_SUPABASE_TEST === "1"
    ? describe
    : describe.skip;
const schemaName = `local_claim_test_${process.pid}_${Date.now()}`;
const quotedSchema = `"${schemaName}"`;
const migrationsDirectory = path.resolve(process.cwd(), "migrations");

describeIfLocal("local PostgreSQL claim migrations", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: localSupabaseDatabaseUrl(), max: 6, ssl: false });
    await pool.query(`CREATE SCHEMA ${quotedSchema}`);
    await pool.query(`
      CREATE TABLE ${quotedSchema}.stripe_webhook_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        processed_at TIMESTAMPTZ
      );

      CREATE TABLE ${quotedSchema}.content_generation_jobs (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        status TEXT NOT NULL DEFAULT 'pending',
        request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
      );
    `);
    await applyMigration("0094_stripe_webhook_processing_claim.sql");
    await applyMigration("0095_content_job_slice_tokens.sql");
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
    await pool.end();
  });

  async function applyMigration(fileName: string): Promise<void> {
    const source = fs.readFileSync(path.join(migrationsDirectory, fileName), "utf8");
    const isolatedSource = source.replaceAll("public.", `${quotedSchema}.`);
    await pool.query(isolatedSource);
  }

  it("applies migrations 0094 and 0095 twice", async () => {
    await applyMigration("0094_stripe_webhook_processing_claim.sql");
    await applyMigration("0095_content_job_slice_tokens.sql");

    const columns = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = $1
         AND column_name IN (
           'processing_started_at',
           'processing_token',
           'advance_token',
           'advance_lease_expires_at'
         )`,
      [schemaName],
    );
    expect(columns.rows).toEqual(
      expect.arrayContaining([
        { table_name: "stripe_webhook_events", column_name: "processing_started_at" },
        { table_name: "stripe_webhook_events", column_name: "processing_token" },
        { table_name: "content_generation_jobs", column_name: "advance_token" },
        { table_name: "content_generation_jobs", column_name: "advance_lease_expires_at" },
      ]),
    );

    const indexes = await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = $1
         AND indexname IN (
           'stripe_webhook_events_claimable_idx',
           'content_generation_jobs_advanceable_idx'
         )`,
      [schemaName],
    );
    expect(indexes.rows).toHaveLength(2);
    expect(
      indexes.rows.find((row) => row.indexname === "stripe_webhook_events_claimable_idx")?.indexdef,
    ).toContain("WHERE (processed_at IS NULL)");
    const contentIndex = indexes.rows.find(
      (row) => row.indexname === "content_generation_jobs_advanceable_idx",
    )?.indexdef;
    expect(contentIndex).toContain("advance_lease_expires_at, created_at");
    expect(contentIndex).toContain("pending");
    expect(contentIndex).toContain("running");
  });

  it("gives one concurrent Stripe request the claim", async () => {
    const eventId = `evt_${randomUUID()}`;
    const [first, second] = await Promise.all([
      claimStripeEvent(eventId),
      claimStripeEvent(eventId),
    ]);
    const tokens = [...first.rows, ...second.rows].map((row) => row.processing_token);

    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatch(/^[0-9a-f-]{36}$/);

    await pool.query(
      `UPDATE ${quotedSchema}.stripe_webhook_events
       SET processing_started_at = now() - interval '6 minutes'
       WHERE event_id = $1`,
      [eventId],
    );
    const [reclaimFirst, reclaimSecond] = await Promise.all([
      claimStripeEvent(eventId),
      claimStripeEvent(eventId),
    ]);
    const replacementTokens = [...reclaimFirst.rows, ...reclaimSecond.rows].map(
      (row) => row.processing_token,
    );

    expect(replacementTokens).toHaveLength(1);
    expect(replacementTokens[0]).not.toBe(tokens[0]);
  });

  it("accepts only the active Stripe token for completion", async () => {
    const eventId = `evt_${randomUUID()}`;
    const claim = await claimStripeEvent(eventId);
    const token = claim.rows[0]?.processing_token;
    expect(token).toBeDefined();

    const staleCompletion = await pool.query(
      `UPDATE ${quotedSchema}.stripe_webhook_events
       SET processed_at = now(), processing_started_at = NULL, processing_token = NULL
       WHERE event_id = $1
         AND processing_token = $2
         AND processed_at IS NULL
       RETURNING event_id`,
      [eventId, randomUUID()],
    );
    expect(staleCompletion.rowCount).toBe(0);

    const activeCompletion = await pool.query(
      `UPDATE ${quotedSchema}.stripe_webhook_events
       SET processed_at = now(), processing_started_at = NULL, processing_token = NULL
       WHERE event_id = $1
         AND processing_token = $2
         AND processed_at IS NULL
       RETURNING event_id`,
      [eventId, token],
    );
    expect(activeCompletion.rowCount).toBe(1);
    await expect(claimStripeEvent(eventId)).resolves.toMatchObject({ rowCount: 0 });
  });

  it("gives one concurrent content slice the token", async () => {
    const jobId = await insertContentJob();
    const [first, second] = await Promise.all([claimContentSlice(jobId), claimContentSlice(jobId)]);
    const tokens = [...first.rows, ...second.rows].map((row) => row.advance_token);

    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatch(/^[0-9a-f-]{36}$/);

    const wrongRenewal = await renewContentSlice(jobId, randomUUID());
    expect(wrongRenewal.rowCount).toBe(0);
    const activeRenewal = await renewContentSlice(jobId, tokens[0]);
    expect(activeRenewal.rowCount).toBe(1);
  });

  it("prevents a stale content token from completing after cancellation", async () => {
    const jobId = await insertContentJob();
    const token = (await claimContentSlice(jobId)).rows[0]?.advance_token;
    expect(token).toBeDefined();

    const cancellation = await pool.query(
      `UPDATE ${quotedSchema}.content_generation_jobs
       SET status = 'cancelled',
           completed_at = now(),
           advance_token = NULL,
           advance_lease_expires_at = NULL
       WHERE id = $1
         AND status IN ('pending', 'running')
       RETURNING id`,
      [jobId],
    );
    expect(cancellation.rowCount).toBe(1);

    const staleCompletion = await completeContentSlice(jobId, token ?? "");
    expect(staleCompletion.rowCount).toBe(0);
    const state = await pool.query<{
      status: string;
      advance_token: string | null;
      advance_lease_expires_at: Date | null;
    }>(
      `SELECT status, advance_token, advance_lease_expires_at
       FROM ${quotedSchema}.content_generation_jobs
       WHERE id = $1`,
      [jobId],
    );
    expect(state.rows[0]).toMatchObject({
      status: "cancelled",
      advance_token: null,
      advance_lease_expires_at: null,
    });
  });

  it("prevents cancellation after an active content token completes", async () => {
    const jobId = await insertContentJob();
    const token = (await claimContentSlice(jobId)).rows[0]?.advance_token;
    expect(token).toBeDefined();

    const completion = await completeContentSlice(jobId, token ?? "");
    expect(completion.rowCount).toBe(1);
    const cancellation = await pool.query(
      `UPDATE ${quotedSchema}.content_generation_jobs
       SET status = 'cancelled', completed_at = now()
       WHERE id = $1
         AND status IN ('pending', 'running')
       RETURNING id`,
      [jobId],
    );
    expect(cancellation.rowCount).toBe(0);
  });

  function claimStripeEvent(eventId: string): Promise<QueryResult<{ processing_token: string }>> {
    return pool.query(
      `INSERT INTO ${quotedSchema}.stripe_webhook_events (
         event_id,
         event_type,
         processing_started_at,
         processing_token
       )
       VALUES ($1, 'invoice.paid', now(), gen_random_uuid())
       ON CONFLICT (event_id) DO UPDATE
       SET event_type = excluded.event_type,
           processing_started_at = now(),
           processing_token = gen_random_uuid()
       WHERE stripe_webhook_events.processed_at IS NULL
         AND (
           stripe_webhook_events.processing_started_at IS NULL
           OR stripe_webhook_events.processing_started_at < now() - interval '5 minutes'
         )
       RETURNING processing_token`,
      [eventId],
    );
  }

  async function insertContentJob(): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO ${quotedSchema}.content_generation_jobs DEFAULT VALUES RETURNING id`,
    );
    return result.rows[0]?.id ?? "";
  }

  function claimContentSlice(jobId: string): Promise<QueryResult<{ advance_token: string }>> {
    return pool.query(
      `UPDATE ${quotedSchema}.content_generation_jobs
       SET status = 'running',
           started_at = COALESCE(started_at, now()),
           advance_token = gen_random_uuid()::text,
           advance_lease_expires_at = now() + make_interval(secs => 120)
       WHERE id = $1
         AND status IN ('pending', 'running')
         AND (
           advance_lease_expires_at IS NULL
           OR advance_lease_expires_at < now()
         )
       RETURNING advance_token`,
      [jobId],
    );
  }

  function renewContentSlice(jobId: string, token: string): Promise<QueryResult<{ id: string }>> {
    return pool.query(
      `UPDATE ${quotedSchema}.content_generation_jobs
       SET advance_lease_expires_at = now() + make_interval(secs => 120)
       WHERE id = $1
         AND advance_token = $2
         AND status = 'running'
       RETURNING id`,
      [jobId, token],
    );
  }

  function completeContentSlice(
    jobId: string,
    token: string,
  ): Promise<QueryResult<{ id: string }>> {
    return pool.query(
      `UPDATE ${quotedSchema}.content_generation_jobs
       SET status = 'succeeded',
           completed_at = now(),
           advance_token = NULL,
           advance_lease_expires_at = NULL
       WHERE id = $1
         AND advance_token = $2
         AND status = 'running'
       RETURNING id`,
      [jobId, token],
    );
  }
});

function localSupabaseDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value || process.env.LOCAL_SUPABASE_TEST !== "1") {
    throw new Error("Local Supabase database tests require explicit approval");
  }
  const parsed = new URL(value);
  const hostIsLoopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  const databaseName = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  if (!hostIsLoopback || parsed.port !== "55322" || databaseName !== "postgres") {
    throw new Error("Local Supabase database tests require loopback port 55322");
  }
  return value;
}
