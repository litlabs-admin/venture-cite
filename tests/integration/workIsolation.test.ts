import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { createWorkRepository } from "../../server/domains/work/repository";
import { createRequestActor } from "../../server/lib/requestActor";
import type { EvidenceReference } from "@shared/work";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

const databaseTest = configureDestructiveDatabaseTest(process.env);
const describeIfLocal =
  databaseTest.kind === "ready" && process.env.LOCAL_SUPABASE_TEST === "1"
    ? describe
    : describe.skip;

const WORK_TABLES = [
  "brand_goals",
  "work_tasks",
  "work_task_evidence",
  "work_task_events",
  "work_award_events",
  "brand_capability_events",
  "work_outcome_reviews",
  "business_result_events",
] as const;

type WorkIds = Record<(typeof WORK_TABLES)[number], string[]>;

type Seed = {
  userId: string;
  brandId: string;
  goalId: string;
  taskId: string;
  submissionEvidenceId: string;
  verificationEvidenceId: string;
  verificationEventId: string;
  reversalEventId: string;
  awardId: string;
  reversalId: string;
  capabilityId: string;
  businessResultId: string;
  reviewId: string;
};

type SourceFixture = {
  factId: string;
  pageId: string;
  runId: string;
  sourceUrl: string;
  retrievedAt: string;
};

let activeRequestPool: Pool | undefined;

describe("work database target guard", () => {
  it("rejects shared, production, and remote targets before a pool opens", () => {
    expect(() =>
      configureDestructiveDatabaseTest({
        DATABASE_URL: "postgres://app@127.0.0.1:56323/venturecite_test",
        TEST_DATABASE_URL: "postgres://test@127.0.0.1:56323/venturecite_test",
        LOCAL_SUPABASE_TEST: "1",
      }),
    ).toThrow("TEST_DATABASE_URL must differ from DATABASE_URL");

    expect(() =>
      configureDestructiveDatabaseTest({
        TEST_DATABASE_URL: "postgres://test@prod.example/venturecite_test",
        LOCAL_SUPABASE_TEST: "1",
      }),
    ).toThrow("TEST_DATABASE_URL must name a test database");

    expect(() =>
      configureDestructiveDatabaseTest({
        TEST_DATABASE_URL: "postgres://test@remote.example/venturecite_test",
        LOCAL_SUPABASE_TEST: "1",
      }),
    ).toThrow("TEST_DATABASE_URL must use a loopback host");
  });
});

describeIfLocal("work database isolation", () => {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  const userAId = randomUUID();
  const userBId = randomUUID();
  const deletedUserId = randomUUID();
  const seeds: Seed[] = [];
  let ownerPool: Pool;
  let sourceFixture: SourceFixture;

  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required for local work tests");
    ownerPool = new Pool({ connectionString: testDatabaseUrl, max: 3, ssl: false });
    activeRequestPool = new Pool({ connectionString: testDatabaseUrl, max: 2, ssl: false });

    await ownerPool.query(
      `insert into public.users (id, email, first_name, access_tier)
       values ($1, $2, 'Work A', 'free'),
              ($3, $4, 'Work B', 'free'),
              ($5, $6, 'Deleted Work', 'free')`,
      [
        userAId,
        `${userAId}@example.test`,
        userBId,
        `${userBId}@example.test`,
        deletedUserId,
        `${deletedUserId}@example.test`,
      ],
    );

    seeds.push(await seedTenant(ownerPool, userAId, "Work isolation A", false));
    seeds.push(await seedTenant(ownerPool, userBId, "Work isolation B", false));
    seeds.push(await seedTenant(ownerPool, deletedUserId, "Work isolation deleted", true));
    sourceFixture = await seedAuthoritativeSource(ownerPool, seeds[0].brandId);
  }, 60_000);

  afterAll(async () => {
    try {
      if (ownerPool) {
        await ownerPool.query("delete from public.users where id = any($1::varchar[])", [
          [userAId, userBId, deletedUserId],
        ]);
      }
    } finally {
      await activeRequestPool?.end();
      await ownerPool?.end();
      activeRequestPool = undefined;
    }
  });

  it("enables RLS for every work table", async () => {
    const result = await ownerPool.query<{ relname: string; relrowsecurity: boolean }>(
      `select relation.relname, relation.relrowsecurity
       from pg_class as relation
       join pg_namespace as namespace on namespace.oid = relation.relnamespace
       where namespace.nspname = 'public'
         and relation.relname = any($1::text[])
       order by relation.relname`,
      [WORK_TABLES],
    );

    expect(result.rows).toEqual(
      [...WORK_TABLES].sort().map((relname) => ({ relname, relrowsecurity: true })),
    );
  });

  it("isolates every work table by actor and hides soft-deleted brands", async () => {
    await expect(readWorkIds(userAId)).resolves.toEqual(idsFor(seeds[0]));
    await expect(readWorkIds(userBId)).resolves.toEqual(idsFor(seeds[1]));
    await expect(readWorkIds(deletedUserId)).resolves.toEqual(emptyWorkIds());
    await expect(readWorkIds()).resolves.toEqual(emptyWorkIds());
  });

  it("returns no task for a foreign actor or a soft-deleted brand", async () => {
    const repositoryForA = repositoryForTest(userAId);
    const repositoryForB = repositoryForTest(userBId);

    await expect(
      repositoryForB.getTask(seeds[0].brandId, seeds[0].taskId),
    ).resolves.toBeUndefined();
    await expect(
      repositoryForA.getTask(seeds[2].brandId, seeds[2].taskId),
    ).resolves.toBeUndefined();
  });

  it("creates one award under concurrent verification and returns one award identity", async () => {
    const repository = repositoryForTest(userAId);
    const task = await repository.createTask(seeds[0].brandId, {
      taskKey: `concurrent-verification-${randomUUID()}`,
      taskVersion: 1,
      taskType: "approve_essential_brand_facts",
      title: "Approve the verified fact",
      desiredResult: "The buyer can verify the approved fact.",
      recommendedChange: "Approve the fact and record the source.",
    });
    expect(task).toBeDefined();
    if (!task) return;

    const accepted = await repository.transitionTask(seeds[0].brandId, task.id, 0, {
      kind: "accept",
    });
    expect(accepted.kind).toBe("updated");
    if (accepted.kind !== "updated") return;
    const started = await repository.transitionTask(
      seeds[0].brandId,
      task.id,
      accepted.value.revision,
      { kind: "start" },
    );
    expect(started.kind).toBe("updated");
    if (started.kind !== "updated") return;
    const evidence = authoritativeEvidence(sourceFixture, userAId);
    const submitted = await repository.submitTask(
      seeds[0].brandId,
      task.id,
      started.value.revision,
      evidence,
    );
    expect(submitted.kind).toBe("updated");
    if (submitted.kind !== "updated") return;

    const verification = {
      cycleKey: `concurrent-cycle-${randomUUID()}`,
      verification: { kind: "system_check" as const, checkId: sourceFixture.pageId },
      evidence,
    };
    const results = await Promise.all([
      repository.verifyAndAward(seeds[0].brandId, task.id, submitted.value.revision, verification),
      repository.verifyAndAward(seeds[0].brandId, task.id, submitted.value.revision, verification),
    ]);

    const updatedResults = results.filter(
      (result): result is Extract<(typeof results)[number], { kind: "updated" }> =>
        result.kind === "updated",
    );
    expect(updatedResults).toHaveLength(2);
    expect(updatedResults.filter((result) => result.value.created)).toHaveLength(1);
    expect(updatedResults.map((result) => result.value.award.points)).toEqual([20, 20]);
    expect(new Set(updatedResults.map((result) => result.value.award.id))).toEqual(
      new Set([updatedResults[0].value.award.id]),
    );
    const awardRows = await ownerPool.query<{ id: string; points: number }>(
      `select id, points from public.work_award_events where task_id = $1 order by id`,
      [task.id],
    );
    expect(awardRows.rows).toEqual([{ id: updatedResults[0].value.award.id, points: 20 }]);
  });

  it("returns a PostgreSQL revision conflict without a duplicate task event", async () => {
    const repository = repositoryForTest(userAId);
    const task = await repository.createTask(seeds[0].brandId, {
      taskKey: `stale-revision-${randomUUID()}`,
      taskVersion: 1,
      taskType: "approve_essential_brand_facts",
      title: "Approve the stale revision fact",
      desiredResult: "The buyer can verify the approved fact.",
      recommendedChange: "Approve the fact and record the source.",
    });
    expect(task).toBeDefined();
    if (!task) return;

    const results = await Promise.all([
      repository.transitionTask(seeds[0].brandId, task.id, 0, { kind: "accept" }),
      repository.transitionTask(seeds[0].brandId, task.id, 0, { kind: "accept" }),
    ]);
    expect(results.filter((result) => result.kind === "updated")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "conflict")).toEqual([
      { kind: "conflict", currentRevision: 1 },
    ]);

    const persisted = await ownerPool.query<{ state: string; revision: number }>(
      `select state, revision from public.work_tasks where id = $1`,
      [task.id],
    );
    expect(persisted.rows).toEqual([{ state: "accepted", revision: 1 }]);
    const events = await ownerPool.query<{ id: string }>(
      `select id from public.work_task_events where task_id = $1 and next_state = 'accepted'`,
      [task.id],
    );
    expect(events.rows).toHaveLength(1);
  });

  it("exports task, evidence, award, verification, and reversal fields", async () => {
    const [
      { createWorkRepository },
      { createWorkService },
      { createRequestActor },
      { drizzle },
      schema,
    ] = await Promise.all([
      import("../../server/domains/work/repository"),
      import("../../server/services/work/WorkService"),
      import("../../server/lib/requestActor"),
      import("drizzle-orm/node-postgres"),
      import("@shared/schema"),
    ]);
    const database = drizzle(requestPoolForTest(), { schema });
    const actor = createRequestActor(userAId);
    const repository = createWorkRepository({ actor, database: database as never });
    const service = createWorkService({
      actor,
      repository,
      brandReader: {
        async findActiveBrand(currentActor, brandId) {
          const result = await ownerPool.query<{ id: string }>(
            `select id from public.brands
             where id = $1 and user_id = $2 and deleted_at is null`,
            [brandId, currentActor.userId],
          );
          return result.rows[0];
        },
      },
    });

    const exported = await service.exportWork({ brandId: seeds[0].brandId });
    expect(exported).toMatchObject({ manifestVersion: 1, brandId: seeds[0].brandId });
    if ("kind" in exported) return;
    const entry = exported.tasks.find(({ task }) => task.id === seeds[0].taskId);
    expect(entry).toBeDefined();
    expect(entry?.task).toMatchObject({
      id: seeds[0].taskId,
      brandId: seeds[0].brandId,
      taskVersion: 1,
      state: "waiting_for_observation",
      points: 40,
    });
    expect(entry?.details).toEqual(
      expect.objectContaining({
        evidence: expect.arrayContaining([
          expect.objectContaining({
            id: seeds[0].submissionEvidenceId,
            role: "submission",
            evidenceVersion: 1,
            status: "submitted",
          }),
          expect.objectContaining({
            id: seeds[0].verificationEvidenceId,
            role: "verification",
            evidenceVersion: 2,
            status: "verified",
          }),
        ]),
        history: expect.arrayContaining([
          expect.objectContaining({
            id: seeds[0].verificationEventId,
            nextState: "verified",
            verificationMethod: { kind: "system_check", checkId: "export-check" },
          }),
          expect.objectContaining({
            id: seeds[0].reversalEventId,
            reason: "The export award was reversed.",
          }),
        ]),
        awards: expect.arrayContaining([
          expect.objectContaining({
            id: seeds[0].awardId,
            points: 40,
            awardStatus: "awarded",
            verificationMethod: { kind: "system_check", checkId: "export-check" },
            reversalReference: null,
          }),
          expect.objectContaining({
            id: seeds[0].reversalId,
            points: -40,
            awardStatus: "reversed",
            reversalReference: seeds[0].awardId,
          }),
        ]),
        reversals: [
          expect.objectContaining({
            id: seeds[0].reversalId,
            awardStatus: "reversed",
            reversalReference: seeds[0].awardId,
          }),
        ],
      }),
    );
  });
});

async function readWorkIds(userId?: string): Promise<WorkIds> {
  const client = await requestPoolForTest().connect();
  try {
    await client.query("begin");
    await client.query("set local role venturecite_request");
    if (userId) {
      await client.query("select set_config('venturecite.user_id', $1, true)", [userId]);
    }
    const rows = {} as WorkIds;
    for (const table of WORK_TABLES) {
      const result = await client.query<{ id: string }>(
        `select id from public.${table} order by id`,
      );
      rows[table] = result.rows.map(({ id }) => id);
    }
    await client.query("rollback");
    return rows;
  } finally {
    client.release();
  }
}

function requestPoolForTest(): Pool {
  if (!activeRequestPool) throw new Error("The request pool is not ready");
  return activeRequestPool;
}

function repositoryForTest(userId: string) {
  return createWorkRepository({
    actor: createRequestActor(userId),
    database: drizzle(requestPoolForTest(), { schema }) as never,
  });
}

function emptyWorkIds(): WorkIds {
  return Object.fromEntries(WORK_TABLES.map((table) => [table, []])) as WorkIds;
}

function idsFor(seed: Seed): WorkIds {
  return {
    brand_goals: [seed.goalId],
    work_tasks: [seed.taskId],
    work_task_evidence: [seed.submissionEvidenceId, seed.verificationEvidenceId].sort(),
    work_task_events: [seed.verificationEventId, seed.reversalEventId].sort(),
    work_award_events: [seed.awardId, seed.reversalId].sort(),
    brand_capability_events: [seed.capabilityId],
    work_outcome_reviews: [seed.reviewId],
    business_result_events: [seed.businessResultId],
  };
}

async function seedTenant(
  pool: Pool,
  userId: string,
  name: string,
  deleted: boolean,
): Promise<Seed> {
  const brandId = randomUUID();
  const goalId = randomUUID();
  const taskId = randomUUID();
  const submissionEvidenceId = randomUUID();
  const verificationEvidenceId = randomUUID();
  const verificationEventId = randomUUID();
  const reversalEventId = randomUUID();
  const awardId = randomUUID();
  const reversalId = randomUUID();
  const capabilityId = randomUUID();
  const businessResultId = randomUUID();
  const reviewId = randomUUID();
  const verificationMethod = JSON.stringify({ kind: "system_check", checkId: "export-check" });

  await pool.query(
    `insert into public.brands (id, user_id, name, company_name, industry)
     values ($1, $2, $3, $4, 'Software')`,
    [brandId, userId, name, `${name} Company`],
  );
  await pool.query(
    `insert into public.brand_goals
       (id, brand_id, user_id, goal_key, goal_kind, title, statement, desired_outcome)
     values ($1, $2, $3, $4, 'visibility_improvement', 'Work goal', 'Complete the work cycle.', 'The buyer sees the repaired fact.')`,
    [goalId, brandId, userId, `${name}-goal`],
  );
  await pool.query(
    `insert into public.work_tasks
       (id, brand_id, user_id, goal_id, task_key, task_version, task_type, state,
        rule_version, revision, title, desired_result, recommended_change, points,
        completion_rule, verification_method, measurement_scope)
     values ($1, $2, $3, $4, $5, 1, 'repair_confirmed_access_or_factual_fault',
        'waiting_for_observation', 1, 5, 'Repair the confirmed source',
        'The source gives buyers the approved fact.', 'Restore and verify the source.',
        40, '{}'::jsonb, $6::jsonb, '{"kind":"period","period":"2026-09"}'::jsonb)`,
    [taskId, brandId, userId, goalId, `${name}-task`, verificationMethod],
  );
  await pool.query(
    `insert into public.work_task_evidence
       (id, task_id, brand_id, user_id, task_version, evidence_version, role, kind,
        source_url, final_url, canonical_url, observed_at, excerpt, structured_finding,
        status, submitted_by)
     values ($1, $2, $3, $4, 1, 1, 'submission', 'fault_repair',
        'https://export.example/source', 'https://export.example/source',
        'https://export.example/source', now(), 'The repaired fact is present.',
        '{"phase":"submission"}'::jsonb, 'submitted', $4),
       ($5, $2, $3, $4, 1, 2, 'verification', 'fault_repair',
        'https://export.example/source', 'https://export.example/source',
        'https://export.example/source', now(), 'The system check passed.',
        '{"phase":"verification"}'::jsonb, 'verified', $4)`,
    [submissionEvidenceId, taskId, brandId, userId, verificationEvidenceId],
  );
  await pool.query(
    `insert into public.work_task_events
       (id, task_id, brand_id, user_id, task_version, revision, prior_state, next_state,
        actor_id, actor_kind, reason, verification_method)
     values ($1, $2, $3, $4, 1, 4, 'submitted', 'verified', $4, 'system',
        'The export check verified the task.', $5::jsonb),
       ($6, $2, $3, $4, 1, 5, 'waiting_for_observation', 'waiting_for_observation', $4, 'system',
        'The export award was reversed.', $5::jsonb)`,
    [verificationEventId, taskId, brandId, userId, verificationMethod, reversalEventId],
  );
  await pool.query(
    `insert into public.work_award_events
       (id, task_id, brand_id, user_id, task_version, cycle_key, award_key, points,
        rule_version, evidence_version, actor_id, verification_method, reason, award_status,
        reversal_reference)
     values ($1, $2, $3, $4, 1, 'export-cycle', $5, 40, 1, 2, $4, $6::jsonb,
        'The export check awarded the repair.', 'awarded', null),
       ($7, $2, $3, $4, 1, 'export-cycle', $8, -40, 1, 2, $4, $6::jsonb,
        'The export award was reversed.', 'reversed', $1)`,
    [
      awardId,
      taskId,
      brandId,
      userId,
      `${name}-award`,
      verificationMethod,
      reversalId,
      `${name}-award-reversal`,
    ],
  );
  await pool.query(
    `insert into public.brand_capability_events
       (id, brand_id, user_id, milestone, event_key, event_kind, task_id, task_version,
        evidence_version, actor_id, reason)
     values ($1, $2, $3, 'evidenced_changes_complete', $4, 'achieved', $5, 1, 2, $3,
        'The export check recorded the capability.')`,
    [capabilityId, brandId, userId, `${name}-capability`, taskId],
  );
  await pool.query(
    `insert into public.business_result_events
       (id, brand_id, user_id, event_key, event_kind, value, value_unit, source,
        attribution_method, confirmation_state, occurred_at)
     values ($1, $2, $3, $4, 'inquiry', 1, 'count', 'test', 'unattributed',
        'unconfirmed', now())`,
    [businessResultId, brandId, userId, `${name}-result`],
  );
  await pool.query(
    `insert into public.work_outcome_reviews
       (id, task_id, brand_id, user_id, task_version, cycle_key, measurement_scope,
        decision, notes, business_result_event_id, next_check_at)
     values ($1, $2, $3, $4, 1, 'export-review',
        '{"kind":"period","period":"2026-09"}'::jsonb, 'unavailable',
        'The next observation is not ready.', $5, now() + interval '7 days')`,
    [reviewId, taskId, brandId, userId, businessResultId],
  );
  if (deleted) {
    await pool.query("update public.brands set deleted_at = now() where id = $1", [brandId]);
  }

  return {
    userId,
    brandId,
    goalId,
    taskId,
    submissionEvidenceId,
    verificationEvidenceId,
    verificationEventId,
    reversalEventId,
    awardId,
    reversalId,
    capabilityId,
    businessResultId,
    reviewId,
  };
}

async function seedAuthoritativeSource(pool: Pool, brandId: string): Promise<SourceFixture> {
  const runId = randomUUID();
  const pageId = randomUUID();
  const factId = randomUUID();
  const sourceUrl = `https://work-source.example/${brandId}/facts`;
  const retrievedAt = "2026-09-08T03:00:00.000Z";
  await pool.query(
    `insert into public.brand_fact_scrape_runs
       (id, brand_id, status, triggered_by, completed_at)
     values ($1, $2, 'completed', 'work-isolation-test', $3::timestamptz)`,
    [runId, brandId, retrievedAt],
  );
  await pool.query(
    `insert into public.brand_fact_scrape_pages
       (id, run_id, url, canonical_url, status, fetched_at, status_code)
     values ($1, $2, $3, $3, 'completed', $4::timestamptz, 200)`,
    [pageId, runId, sourceUrl, retrievedAt],
  );
  await pool.query(
    `insert into public.brand_fact_sheet
       (id, brand_id, domain, subcategory, fact_key, fact_value, source_url, run_id,
        accepted_at, is_active)
     values ($1, $2, 'identity', 'company', 'name', 'Work isolation', $3, $4,
        $5::timestamptz, 1)`,
    [factId, brandId, sourceUrl, runId, retrievedAt],
  );
  return { factId, pageId, runId, sourceUrl, retrievedAt };
}

function authoritativeEvidence(source: SourceFixture, userId: string): EvidenceReference[] {
  return [
    {
      kind: "source",
      label: "The approved fact is present in the source.",
      sourceUrl: source.sourceUrl,
      factId: source.factId,
      scrapePageId: source.pageId,
      checkId: source.pageId,
      finalUrl: source.sourceUrl,
      canonicalUrl: source.sourceUrl,
      retrievedAt: source.retrievedAt,
      excerpt: "The approved fact is present.",
    },
    {
      kind: "confirmation",
      label: "The owner confirms the fact.",
      confirmedByUserId: userId,
      note: "The owner confirmed the source.",
      confirmedAt: source.retrievedAt,
    },
  ];
}
