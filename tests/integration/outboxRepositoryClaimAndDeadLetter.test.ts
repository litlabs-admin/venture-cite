// Integration test: executes the REAL server/outbox/outboxRepository.ts
// claimNext/reschedule SQL against a real Postgres.
//
// WHY THIS FILE EXISTS (.audit/B6/B6b-02-mutation-concurrency.md, structural
// finding + gaps 1 and 2 in .audit/B7/B7-02-job-bounds-coverage.md).
//
// tests/unit/outboxRepository.test.ts mocks db.execute entirely and asserts
// on the generated SQL as text. That catches a mutation which DELETES a
// substring (gap 1: dropping "attempt_count < max_attempts" from the claim
// CTE), but it is structurally blind to a mutation that leaves every word
// in place while making the clause logically unreachable - e.g. gap 2's
// exact reported mutation:
//
//   set status = case when false and (cancellation_requested_at is not null
//     or attempt_count >= max_attempts) then 'dead_letter' else 'pending' end
//
// `executedSql().some(text => text.includes("attempt_count >= max_attempts"))`
// still finds the substring - it is right there in the dead JS-unreachable
// "false and (...)" clause - so no text assertion, however precisely scoped
// to just the status-clause, can distinguish this from the real predicate.
// This was verified directly during this task: a scoped substring check
// against just the `set status = case when ... then 'dead_letter'` span
// still PASSED with the mutation applied. Only evaluating the SQL is
// sufficient. That requires a real Postgres.
//
// The one existing "integration" test that looks like it covers this
// (tests/integration/localOutboxMigration.test.ts) never imports
// createOutboxRepository() - it hand-writes its own simplified copy of the
// UPDATE/CASE WHEN SQL directly against the schema, so it verifies that
// hand-written copy stays in sync with itself, not that the production
// module's query does the right thing. This file closes that hole by
// importing the real repository and asserting against the real table's
// post-call state, not a return value or SQL text.
//
// HOW TO RUN
//   npx supabase start
//   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
//   LOCAL_SUPABASE_TEST=1 npx vitest run tests/integration/outboxRepositoryClaimAndDeadLetter.test.ts
//
// Without TEST_DATABASE_URL the file skips, so CI and ordinary `npm test`
// runs are unaffected. `configureDestructiveDatabaseTest` additionally
// refuses any target that is not a database explicitly named as a test
// database (or the fixed loopback local Supabase instance).
//
// ISOLATION CONTRACT. public.outbox_commands is a shared table - other
// tests, and in a real dev environment a live worker, can hold pending or
// processing rows of the same `content_cost.record` kind concurrently.
// claimNext()'s claim tests therefore do not assert "resolves to null" or
// "resolves to exactly this row" in absolute terms (either could be wrong
// under concurrent, unrelated data). Instead:
//   - The exhausted-budget fixture's `available_at` is pinned to the Unix
//     epoch, which sorts before any real row's availability time under the
//     claim query's `order by available_at, created_at`. That makes it the
//     first candidate row is considered for, deterministically, regardless
//     of what else is pending - so the only way it could remain unclaimed
//     is the attempt-cap predicate correctly excluding it.
//   - The assertion is scoped to this fixture's id specifically
//     (`claimed?.id` must not be this id), never to a global count.
//   - Every row this file creates carries FIXTURE_PREFIX in its
//     idempotency_key and aggregate_id. Cleanup deletes only those rows.
// The reschedule tests need no such care: they target one row by
// id + lease_token, which is already exactly how the production code scopes
// its own UPDATE.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

const databaseTest = configureDestructiveDatabaseTest(process.env);

if (databaseTest.kind === "ready") {
  const { db } = await import("../../server/db");
  const { createOutboxRepository } = await import("../../server/outbox/outboxRepository");

  const repository = createOutboxRepository();
  const FIXTURE_PREFIX = `b7-outbox-${process.pid}-${Date.now()}`;

  async function removeFixtures() {
    await db.execute(sql`
      DELETE FROM public.outbox_commands WHERE idempotency_key LIKE ${FIXTURE_PREFIX + "%"}
    `);
  }

  beforeAll(removeFixtures);
  afterAll(removeFixtures);

  async function insertCommand(input: {
    idempotencyKey: string;
    status: "pending" | "processing";
    attemptCount: number;
    maxAttempts: number;
    availableAt?: Date;
    leaseToken?: string;
    leaseExpiresAt?: Date;
  }): Promise<string> {
    const result = await db.execute<{ id: string }>(sql`
      INSERT INTO public.outbox_commands (
        kind, status, idempotency_key, aggregate_type, aggregate_id,
        payload, payload_fingerprint, attempt_count, max_attempts,
        available_at, lease_token, lease_expires_at,
        provider_name, provider_operation
      ) VALUES (
        'content_cost.record', ${input.status}, ${input.idempotencyKey},
        'content_generation_job', ${FIXTURE_PREFIX},
        '{}'::jsonb, 'fp', ${input.attemptCount}, ${input.maxAttempts},
        ${input.availableAt ?? new Date()}, ${input.leaseToken ?? null}::uuid,
        ${input.leaseExpiresAt ?? null},
        'internal', 'record_content_cost'
      ) RETURNING id
    `);
    const id = (result as unknown as { rows: Array<{ id: string }> }).rows[0]?.id;
    if (!id) throw new Error("fixture insert did not return an id");
    return id;
  }

  async function readCommand(id: string) {
    const result = await db.execute<Record<string, unknown>>(sql`
      SELECT status, attempt_count, max_attempts, available_at, lease_token,
             dead_lettered_at, payload
      FROM public.outbox_commands WHERE id = ${id}
    `);
    return (result as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
  }

  describe("outboxRepository.claimNext against real Postgres (gap 1)", () => {
    it("never claims a pending row that has already exhausted its retry budget", async () => {
      // attempt_count === max_attempts, sitting ready to run (available_at
      // in the past). Pinned to the epoch so it sorts first among ALL
      // pending rows of this kind, real or fixture, database-wide.
      const exhaustedId = await insertCommand({
        idempotencyKey: `${FIXTURE_PREFIX}-exhausted`,
        status: "pending",
        attemptCount: 1,
        maxAttempts: 1,
        availableAt: new Date(0),
      });

      const claimed = await repository.claimNext({
        leaseSeconds: 60,
        kinds: ["content_cost.record"],
      });

      // Whatever claimNext did or did not claim, it must not be this row -
      // the attempt-cap predicate must exclude it before anything else
      // about ordering matters. (If the cap were removed, this row would
      // be the first candidate considered and either get wrongly claimed,
      // or the UPDATE would violate outbox_commands_attempt_count_check and
      // the whole call would reject - both fail this assertion.)
      expect(claimed?.id).not.toBe(exhaustedId);

      const row = await readCommand(exhaustedId);
      expect(row?.status).toBe("pending");
      expect(row?.attempt_count).toBe(1);
    });

    it("claims and increments a row within its retry budget", async () => {
      const eligibleId = await insertCommand({
        idempotencyKey: `${FIXTURE_PREFIX}-eligible`,
        status: "pending",
        attemptCount: 0,
        maxAttempts: 3,
        availableAt: new Date(0),
      });

      const claimed = await repository.claimNext({
        leaseSeconds: 60,
        kinds: ["content_cost.record"],
      });

      expect(claimed?.id).toBe(eligibleId);
      expect(claimed?.attemptCount).toBe(1);
      expect(claimed?.status).toBe("processing");

      const row = await readCommand(eligibleId);
      expect(row?.status).toBe("processing");
      expect(row?.attempt_count).toBe(1);
    });
  });

  describe("outboxRepository.reschedule against real Postgres (gap 2)", () => {
    it("dead-letters a claimed command whose attempt_count has reached max_attempts", async () => {
      const leaseToken = randomUUID();
      const id = await insertCommand({
        idempotencyKey: `${FIXTURE_PREFIX}-reschedule-exhausted`,
        status: "processing",
        attemptCount: 3,
        maxAttempts: 3,
        leaseToken,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        repository.reschedule({
          id,
          leaseToken,
          nextAvailableAt: new Date(Date.now() + 30_000),
          errorCode: "provider_unavailable",
        }),
      ).resolves.toEqual({ kind: "dead_letter" });

      const row = await readCommand(id);
      expect(row?.status).toBe("dead_letter");
      expect(row?.dead_lettered_at).not.toBeNull();
      expect(row?.lease_token).toBeNull();
      expect(row?.payload).toEqual({});
    });

    it("reschedules a claimed command that is still within its retry budget", async () => {
      const leaseToken = randomUUID();
      const id = await insertCommand({
        idempotencyKey: `${FIXTURE_PREFIX}-reschedule-pending`,
        status: "processing",
        attemptCount: 1,
        maxAttempts: 3,
        leaseToken,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      });
      const nextAvailableAt = new Date(Date.now() + 45_000);
      nextAvailableAt.setMilliseconds(0);

      await expect(
        repository.reschedule({
          id,
          leaseToken,
          nextAvailableAt,
          errorCode: "provider_unavailable",
        }),
      ).resolves.toEqual({ kind: "pending" });

      const row = await readCommand(id);
      expect(row?.status).toBe("pending");
      expect(row?.dead_lettered_at).toBeNull();
      expect(new Date(row!.available_at as string).getTime()).toBe(nextAvailableAt.getTime());
    });
  });
} else {
  describe.skip("outboxRepository against real Postgres (TEST_DATABASE_URL not set)", () => {
    it("skipped - see file header for how to run", () => {});
  });
}
