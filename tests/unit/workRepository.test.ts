import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
vi.mock("../../server/db", () => ({ db: {} }));
import { createRequestActor } from "../../server/lib/requestActor";
import type { EvidenceReference } from "@shared/work";
import {
  createWorkEvidenceAuthorizer,
  createWorkRepository,
  type WorkEvidenceReaders,
  type WorkRepository,
} from "../../server/domains/work/repository";

const restrictedContextMock = vi.hoisted(() => ({
  set: vi.fn(async ({ transaction }: { transaction: FakeTransaction }) => {
    transaction.events.push("context");
  }),
}));

vi.mock("../../server/data/restrictedRequestTransaction", () => ({
  setRestrictedRequestContext: restrictedContextMock.set,
}));

const USER_A_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_A_ID = "brand-a";
const TASK_A_ID = "task-a";

type Row = Record<string, unknown>;

type FakeChain = {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  onConflictDoNothing: ReturnType<typeof vi.fn>;
  then: (
    resolve: (value: Row[]) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

type FakeTransaction = {
  events: string[];
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  chains: FakeChain[];
};

function taskRow(overrides: Row = {}): Row {
  return {
    id: TASK_A_ID,
    brandId: BRAND_A_ID,
    goalId: null,
    taskKey: "repair-homepage-facts",
    taskVersion: 1,
    taskType: "repair_confirmed_access_or_factual_fault",
    state: "suggested",
    revision: 0,
    title: "Repair the homepage facts",
    desiredResult: "The buyer can verify the core facts.",
    buyerNeed: "Verify the product before contacting the company.",
    recommendedChange: "Restore the missing fact block and verify the page.",
    reason: "The page omits a confirmed buyer question.",
    confidence: "0.85",
    effort: 2,
    points: 40,
    completionRule: { required: ["fault_repair"] },
    measurementScope: null,
    nextCheckAt: null,
    blockedReason: null,
    dismissalReason: null,
    ownerFirstName: null,
    ownerLastName: null,
    ownerProfileImageUrl: null,
    ownerUserId: null,
    createdAt: new Date("2026-09-08T00:00:00.000Z"),
    updatedAt: new Date("2026-09-08T00:00:00.000Z"),
    userId: USER_A_ID,
    ownerId: USER_A_ID,
    ruleVersion: 1,
    ...overrides,
  };
}

function awardRow(overrides: Row = {}): Row {
  return {
    id: "award-1",
    taskId: TASK_A_ID,
    brandId: BRAND_A_ID,
    taskVersion: 1,
    cycleKey: "2026-09-08",
    awardKey: "award-key-1",
    points: 40,
    ruleVersion: 1,
    evidenceVersion: 1,
    verificationMethod: { kind: "system_check", checkId: "check-1" },
    reason: "The task proof passed.",
    awardStatus: "reversed",
    reversalReference: "award-original",
    occurredAt: new Date("2026-09-09T00:00:00.000Z"),
    ...overrides,
  };
}

function faultRepairEvidence(): Row {
  return {
    kind: "fault_repair",
    label: "The homepage facts now pass the check.",
    faultId: "fault-1",
    beforeCheckId: "check-before-1",
    afterCheckId: "check-after-1",
    checkedAt: "2026-09-08T01:00:00.000Z",
  };
}

function sourceEvidence(): Row {
  return {
    kind: "source",
    label: "The published source confirms the essential fact.",
    sourceUrl: "https://example.test/source",
    retrievedAt: "2026-09-08T01:00:00.000Z",
    excerpt: "The source contains the approved fact.",
  };
}

function createFakeDatabase(rows: Row[] | Row[][] = [], executeRows: Row[][] = []) {
  const resultQueue = Array.isArray(rows[0]) ? [...(rows as Row[][])] : [rows as Row[]];
  const events: string[] = [];
  const chains: FakeChain[] = [];
  const transaction: FakeTransaction = {
    events,
    chains,
    select: vi.fn((projection: Record<string, unknown>) => {
      events.push("select");
      const chain = createChain(projection, resultQueue.shift() ?? [], events);
      chains.push(chain);
      return chain;
    }),
    update: vi.fn(() => {
      events.push("update");
      const chain = createChain({}, resultQueue.shift() ?? [], events);
      chains.push(chain);
      return chain;
    }),
    insert: vi.fn(() => {
      events.push("insert");
      const chain = createChain({}, resultQueue.shift() ?? [], events);
      chains.push(chain);
      return chain;
    }),
    execute: vi.fn(async () => {
      events.push("execute");
      return { rows: executeRows.shift() ?? [] };
    }),
  };
  const database = {
    transaction: vi.fn(async (operation: (tx: FakeTransaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };
  return { database, transaction };
}

function createChain(
  projection: Record<string, unknown>,
  rows: Row[],
  events: string[],
): FakeChain {
  void projection;
  const chain = {
    from: vi.fn(() => {
      events.push("from");
      return chain;
    }),
    innerJoin: vi.fn(() => {
      events.push("innerJoin");
      return chain;
    }),
    leftJoin: vi.fn(() => {
      events.push("leftJoin");
      return chain;
    }),
    where: vi.fn(() => {
      events.push("where");
      return chain;
    }),
    orderBy: vi.fn(() => {
      events.push("orderBy");
      return chain;
    }),
    limit: vi.fn(() => {
      events.push("limit");
      return chain;
    }),
    offset: vi.fn(() => {
      events.push("offset");
      return chain;
    }),
    set: vi.fn(() => {
      events.push("set");
      return chain;
    }),
    values: vi.fn(() => {
      events.push("values");
      return chain;
    }),
    returning: vi.fn(() => {
      events.push("returning");
      return chain;
    }),
    onConflictDoNothing: vi.fn(() => {
      events.push("onConflictDoNothing");
      return chain;
    }),
    then: (resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  } satisfies FakeChain;
  return chain;
}

function compile(condition: unknown): { sql: string; params: unknown[] } {
  return new PgDialect().sqlToQuery(condition as SQL);
}

describe("work evidence authorization boundary", () => {
  it("passes complete references to each owner-scoped reader", async () => {
    const readers: WorkEvidenceReaders = {
      source: vi.fn().mockResolvedValue("owned_usable"),
      artifact: vi.fn().mockResolvedValue("owned_usable"),
      measurement: vi.fn().mockResolvedValue("owned_usable"),
      fault_repair: vi.fn().mockResolvedValue("owned_usable"),
      content_change: vi.fn().mockResolvedValue("owned_usable"),
      authored_work: vi.fn().mockResolvedValue("owned_usable"),
      confirmation: vi.fn().mockResolvedValue("owned_usable"),
      decision: vi.fn().mockResolvedValue("owned_usable"),
      experiment: vi.fn().mockResolvedValue("owned_usable"),
    };
    const references = [
      sourceEvidence(),
      {
        kind: "artifact" as const,
        label: "Owned artifact",
        artifactId: "artifact-1",
        version: 2,
        reviewedByUserId: USER_A_ID,
        coverage: "facts",
        duplicateCheck: "passed",
      },
      {
        kind: "measurement" as const,
        label: "Owned measurement",
        measurementId: "measurement-1",
        scopeId: "scope-1",
        provider: "provider-a",
        promptVersion: "v2",
        startedAt: "2026-09-01T00:00:00.000Z",
        endedAt: "2026-09-08T00:00:00.000Z",
        coverage: "10 prompts",
      },
      faultRepairEvidence(),
      {
        kind: "content_change" as const,
        label: "Published content",
        changeId: "change-1",
        pageUrl: "https://example.test/page",
        buyerNeed: "Verify the fact",
        publishedAt: "2026-09-08T01:00:00.000Z",
      },
      {
        kind: "authored_work" as const,
        label: "Published authored work",
        submissionId: "submission-1",
        destinationUrl: "https://example.test/post",
        authoredByUserId: USER_A_ID,
        submittedAt: "2026-09-08T01:00:00.000Z",
      },
      {
        kind: "confirmation" as const,
        label: "Named confirmation",
        confirmedByUserId: USER_A_ID,
        note: "Confirmed",
        confirmedAt: "2026-09-08T01:00:00.000Z",
      },
      {
        kind: "decision" as const,
        label: "Recorded decision",
        decisionId: "decision-1",
        reviewPeriod: "2026-09-01/2026-09-08",
        decision: "improve",
        basedOnMeasurementId: "measurement-1",
      },
      {
        kind: "experiment" as const,
        label: "Completed experiment",
        experimentId: "experiment-1",
        hypothesis: "The page change improves retrieval.",
        baselineMeasurementId: "measurement-1",
        changedAt: "2026-09-02T00:00:00.000Z",
        laterMeasurementId: "measurement-2",
        conclusion: "Observed improvement",
      },
    ] satisfies EvidenceReference[];
    const authorizer = createWorkEvidenceAuthorizer(readers);

    await expect(
      authorizer({
        actor: createRequestActor(USER_A_ID),
        brandId: BRAND_A_ID,
        taskId: TASK_A_ID,
        taskVersion: 1,
        verification: { kind: "system_check", checkId: "check-1" },
        evidence: references,
      }),
    ).resolves.toBe("authorized");
    expect(readers.source).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: expect.objectContaining({ sourceUrl: "https://example.test/source" }),
      }),
    );
    expect(readers.fault_repair).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: expect.objectContaining({
          beforeCheckId: "check-before-1",
          afterCheckId: "check-after-1",
        }),
      }),
    );
    expect(readers.decision).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: expect.objectContaining({ basedOnMeasurementId: "measurement-1" }),
      }),
    );
    expect(readers.experiment).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: expect.objectContaining({
          baselineMeasurementId: "measurement-1",
          laterMeasurementId: "measurement-2",
        }),
      }),
    );
  });

  it("returns typed outcomes for foreign and unusable evidence", async () => {
    const readers: WorkEvidenceReaders = {
      source: vi.fn().mockResolvedValue("not_found"),
      artifact: vi.fn().mockResolvedValue("owned_unusable"),
      measurement: vi.fn().mockResolvedValue("owned_usable"),
      fault_repair: vi.fn().mockResolvedValue("owned_usable"),
      content_change: vi.fn().mockResolvedValue("owned_usable"),
      authored_work: vi.fn().mockResolvedValue("owned_usable"),
      confirmation: vi.fn().mockResolvedValue("owned_usable"),
      decision: vi.fn().mockResolvedValue("owned_usable"),
      experiment: vi.fn().mockResolvedValue("owned_usable"),
    };
    const authorizer = createWorkEvidenceAuthorizer(readers);
    const input = {
      actor: createRequestActor(USER_A_ID),
      brandId: BRAND_A_ID,
      taskId: TASK_A_ID,
      taskVersion: 1,
      verification: { kind: "system_check" as const, checkId: "check-1" },
    };

    await expect(authorizer({ ...input, evidence: [sourceEvidence()] })).resolves.toBe("not_found");
    await expect(
      authorizer({
        ...input,
        evidence: [
          {
            kind: "artifact",
            label: "An unusable artifact",
            artifactId: "artifact-1",
            version: 1,
            reviewedByUserId: USER_A_ID,
            coverage: "",
            duplicateCheck: "failed",
          },
        ],
      }),
    ).resolves.toBe("invalid_evidence");
  });
});

describe("actor-scoped work repository", () => {
  it("exposes the bounded repository contract", () => {
    const { database } = createFakeDatabase([]);
    const repository: WorkRepository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    expect(repository.getTask).toEqual(expect.any(Function));
    expect(repository.listTasks).toEqual(expect.any(Function));
    expect(repository.getSummaryInputs).toEqual(expect.any(Function));
    expect(repository.listAwardEvents).toEqual(expect.any(Function));
    expect(repository.createTask).toEqual(expect.any(Function));
    expect(repository.appendEvidence).toEqual(expect.any(Function));
    expect(repository.transitionTask).toEqual(expect.any(Function));
    expect(repository.submitTask).toEqual(expect.any(Function));
    expect(repository.verifyAndAward).toEqual(expect.any(Function));
    expect(repository.recordOutcomeReview).toEqual(expect.any(Function));
    expect(repository.reverseAward).toEqual(expect.any(Function));
  });

  it("reads award history only for an active owned brand", async () => {
    const { database, transaction } = createFakeDatabase([[{ id: BRAND_A_ID }], [awardRow()]]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(repository.listAwardEvents(BRAND_A_ID)).resolves.toMatchObject([
      { id: "award-1", awardStatus: "reversed", points: 40 },
    ]);
    const query = transaction.chains[1];
    expect(compile(query.where.mock.calls[0][0]).params).toEqual(
      expect.arrayContaining([BRAND_A_ID, USER_A_ID]),
    );
  });

  it("sets the restricted actor context before reading a task", async () => {
    restrictedContextMock.set.mockClear();
    const { database, transaction } = createFakeDatabase([[taskRow()]]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    const result = await repository.getTask(BRAND_A_ID, TASK_A_ID);

    expect(result).toMatchObject({
      id: TASK_A_ID,
      brandId: BRAND_A_ID,
      taskType: "repair_confirmed_access_or_factual_fault",
      owner: null,
    });
    expect(Object.keys(result ?? {}).sort()).toEqual(
      [
        "id",
        "brandId",
        "goalId",
        "taskKey",
        "taskVersion",
        "taskType",
        "state",
        "revision",
        "title",
        "desiredResult",
        "buyerNeed",
        "recommendedChange",
        "reason",
        "confidence",
        "effort",
        "points",
        "completionRule",
        "measurementScope",
        "nextCheckAt",
        "blockedReason",
        "dismissalReason",
        "createdAt",
        "updatedAt",
        "owner",
      ].sort(),
    );
    expect(result?.confidence).toBe(0.85);
    const projection = transaction.select.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(projection).sort()).toEqual(
      [
        "id",
        "brandId",
        "goalId",
        "taskKey",
        "taskVersion",
        "taskType",
        "state",
        "revision",
        "title",
        "desiredResult",
        "buyerNeed",
        "recommendedChange",
        "reason",
        "confidence",
        "effort",
        "points",
        "completionRule",
        "measurementScope",
        "nextCheckAt",
        "blockedReason",
        "dismissalReason",
        "createdAt",
        "updatedAt",
        "ownerFirstName",
        "ownerLastName",
        "ownerProfileImageUrl",
        "ownerUserId",
      ].sort(),
    );
    expect(transaction.events.indexOf("context")).toBeLessThan(
      transaction.events.indexOf("select"),
    );
    expect(restrictedContextMock.set).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "venturecite_request",
        actor: expect.objectContaining({ userId: USER_A_ID }),
      }),
    );

    const query = transaction.chains[0];
    const join = compile(query.innerJoin.mock.calls[0][1]);
    const where = compile(query.where.mock.calls[0][0]);
    expect(join.params).toEqual(expect.arrayContaining([BRAND_A_ID, USER_A_ID]));
    expect(where.params).toEqual(expect.arrayContaining([BRAND_A_ID, TASK_A_ID]));
  });

  it("returns only non-secret owner display fields", async () => {
    const { database } = createFakeDatabase([
      [
        taskRow({
          ownerFirstName: "Ada",
          ownerLastName: "Lovelace",
          ownerProfileImageUrl: "https://example.test/ada.png",
          ownerUserId: USER_A_ID,
        }),
      ],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(repository.getTask(BRAND_A_ID, TASK_A_ID)).resolves.toMatchObject({
      owner: {
        id: USER_A_ID,
        firstName: "Ada",
        lastName: "Lovelace",
        profileImageUrl: "https://example.test/ada.png",
      },
    });
  });

  it("returns no task when the brand or task is foreign or deleted", async () => {
    const { database } = createFakeDatabase([[]]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(repository.getTask("foreign-or-deleted", TASK_A_ID)).resolves.toBeUndefined();
  });

  it("filters task lists by the brand, active owner, state, and page", async () => {
    const { database, transaction } = createFakeDatabase([[{ id: BRAND_A_ID }], [taskRow()]]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    const result = await repository.listTasks(BRAND_A_ID, {
      state: "suggested",
      taskType: "repair_confirmed_access_or_factual_fault",
      limit: 7,
      offset: 14,
    });

    expect(result).toHaveLength(1);
    const query = transaction.chains[1];
    expect(query.limit).toHaveBeenCalledWith(7);
    expect(query.offset).toHaveBeenCalledWith(14);
    expect(compile(query.innerJoin.mock.calls[0][1]).params).toEqual(
      expect.arrayContaining([BRAND_A_ID, USER_A_ID]),
    );
    expect(compile(query.where.mock.calls[0][0]).params).toEqual(
      expect.arrayContaining([BRAND_A_ID, "suggested", "repair_confirmed_access_or_factual_fault"]),
    );
    expect(transaction.events.indexOf("context")).toBeLessThan(
      transaction.events.indexOf("select"),
    );
  });

  it("loads summary inputs in one restricted transaction with safe projections", async () => {
    const taskCounts = {
      total: 3,
      pending: 2,
      suggested: 0,
      accepted: 0,
      inProgress: 1,
      submitted: 0,
      verified: 1,
      waitingForObservation: 1,
      dismissed: 0,
      notApplicable: 0,
      reopened: 0,
    };
    const awardTotals = {
      eventCount: 2,
      points: 30,
      awardedPoints: 40,
      reversedPoints: -10,
      adjustmentPoints: 0,
      latestOccurredAt: new Date("2026-09-08T01:00:00.000Z"),
    };
    const milestone = {
      milestone: "baseline_ready",
      eventKind: "achieved",
      occurredAt: new Date("2026-09-08T02:00:00.000Z"),
    };
    const { database, transaction } = createFakeDatabase(
      [[{ id: BRAND_A_ID }], [taskCounts], [awardTotals]],
      [[milestone]],
    );
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    const result = await repository.getSummaryInputs(BRAND_A_ID);

    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(transaction.events.filter((event) => event === "context")).toHaveLength(1);
    expect(result.taskCounts).toEqual(taskCounts);
    expect(result.awards).toEqual(awardTotals);
    expect(result.capabilityState).toEqual([milestone]);
    for (const projectionCall of transaction.select.mock.calls) {
      const projection = projectionCall[0] as Record<string, unknown>;
      expect(projection).not.toHaveProperty("userId");
      expect(projection).not.toHaveProperty("ownerId");
      expect(projection).not.toHaveProperty("actorId");
      expect(projection).not.toHaveProperty("verificationMethod");
    }
    for (const chain of transaction.chains.slice(1)) {
      expect(compile(chain.innerJoin.mock.calls[0][1]).params).toEqual(
        expect.arrayContaining([BRAND_A_ID, USER_A_ID]),
      );
      expect(compile(chain.where.mock.calls[0][0]).params).toEqual(
        expect.arrayContaining([BRAND_A_ID]),
      );
    }
  });

  it("creates a suggested task for the active actor-owned brand", async () => {
    const { database, transaction } = createFakeDatabase([[{ id: BRAND_A_ID }], [], [taskRow()]]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(
      repository.createTask(BRAND_A_ID, {
        taskKey: "repair-homepage-facts",
        taskType: "repair_confirmed_access_or_factual_fault",
        title: "Repair the homepage facts",
        desiredResult: "The buyer can verify the core facts.",
        recommendedChange: "Restore the missing fact block and verify the page.",
      }),
    ).resolves.toMatchObject({ id: TASK_A_ID, brandId: BRAND_A_ID });

    const insertChain = transaction.chains[1];
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: BRAND_A_ID,
        userId: USER_A_ID,
        taskType: "repair_confirmed_access_or_factual_fault",
        state: "suggested",
        points: 40,
      }),
    );
    expect(insertChain.onConflictDoNothing).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.any(Array) }),
    );
    expect(transaction.events.indexOf("context")).toBeLessThan(
      transaction.events.indexOf("select"),
    );
  });

  it("returns the existing task when creation repeats the same task key and version", async () => {
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [],
      [taskRow()],
      [{ id: BRAND_A_ID }],
      [],
      [taskRow()],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });
    const input = {
      taskKey: "repair-homepage-facts",
      taskType: "repair_confirmed_access_or_factual_fault" as const,
      title: "Repair the homepage facts",
      desiredResult: "The buyer can verify the core facts.",
      recommendedChange: "Restore the missing fact block and verify the page.",
    };

    const first = await repository.createTask(BRAND_A_ID, input);
    const second = await repository.createTask(BRAND_A_ID, input);

    expect(second).toEqual(first);
    expect(transaction.insert).toHaveBeenCalledTimes(2);
    expect(
      transaction.chains.filter((chain) => chain.onConflictDoNothing.mock.calls.length > 0),
    ).toHaveLength(2);
  });

  it("writes trigger evidence only for the winning atomic task insert", async () => {
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [{ id: TASK_A_ID }],
      [taskRow()],
      [],
      [{ id: BRAND_A_ID }],
      [],
      [taskRow()],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });
    const input = {
      taskKey: "repair-homepage-facts",
      taskType: "repair_confirmed_access_or_factual_fault" as const,
      title: "Repair the homepage facts",
      desiredResult: "The buyer can verify the core facts.",
      recommendedChange: "Restore the missing fact block and verify the page.",
      completionRule: { required: ["fault_repair"] },
      ruleVersion: 1,
    };

    const first = await repository.createTaskWithTriggerEvidence(BRAND_A_ID, input, [
      faultRepairEvidence(),
    ]);
    const second = await repository.createTaskWithTriggerEvidence(BRAND_A_ID, input, [
      faultRepairEvidence(),
    ]);

    expect(first).toMatchObject({ created: true, task: { id: TASK_A_ID } });
    expect(second).toMatchObject({ created: false, task: { id: TASK_A_ID } });
    expect(transaction.insert).toHaveBeenCalledTimes(3);
  });

  it("does not insert a task when the brand is not visible to the actor", async () => {
    const { database, transaction } = createFakeDatabase([[]]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(
      repository.createTask(BRAND_A_ID, {
        taskKey: "repair-homepage-facts",
        taskType: "repair_confirmed_access_or_factual_fault",
        title: "Repair the homepage facts",
        desiredResult: "The buyer can verify the core facts.",
        recommendedChange: "Restore the missing fact block and verify the page.",
      }),
    ).resolves.toBeUndefined();
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("distinguishes an owned empty brand from a foreign or deleted brand", async () => {
    const owned = createFakeDatabase([[{ id: BRAND_A_ID }], []]);
    const ownedRepository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: owned.database as never,
    });
    await expect(ownedRepository.listTasks(BRAND_A_ID)).resolves.toEqual([]);

    const invisible = createFakeDatabase([[]]);
    const invisibleRepository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: invisible.database as never,
    });
    await expect(invisibleRepository.listTasks("foreign-or-deleted")).resolves.toBeUndefined();
    await expect(
      invisibleRepository.getSummaryInputs("foreign-or-deleted"),
    ).resolves.toBeUndefined();
  });

  it("propagates a transaction failure so the caller can rely on rollback", async () => {
    const failure = new Error("transaction failed");
    const database = {
      transaction: vi.fn(async () => {
        throw failure;
      }),
    };
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(repository.getTask(BRAND_A_ID, TASK_A_ID)).rejects.toBe(failure);
  });

  it("transitions a task with an expected revision and appends an event", async () => {
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ state: "suggested", revision: 3 })],
      [{ id: TASK_A_ID, revision: 4, state: "accepted" }],
      [],
      [taskRow({ state: "accepted", revision: 4 })],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    const result = await repository.transitionTask(BRAND_A_ID, TASK_A_ID, 3, { kind: "accept" });

    expect(result.kind).toBe("updated");
    expect(result.value.state).toBe("accepted");
    expect(result.value.revision).toBe(4);
    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.insert).toHaveBeenCalledTimes(1);
    expect(transaction.events.indexOf("context")).toBeLessThan(
      transaction.events.indexOf("select"),
    );
    const updateChain = transaction.chains.find((chain) => chain.set.mock.calls.length > 0);
    expect(updateChain).toBeDefined();
    const updateCondition = compile(updateChain?.where.mock.calls[0]?.[0]);
    expect(updateCondition.params).toEqual(
      expect.arrayContaining([BRAND_A_ID, USER_A_ID, TASK_A_ID, 3]),
    );
  });

  it("returns a conflict and does not write when the task revision is stale", async () => {
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ state: "suggested", revision: 8 })],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(
      repository.transitionTask(BRAND_A_ID, TASK_A_ID, 3, { kind: "accept" }),
    ).resolves.toEqual({ kind: "conflict", currentRevision: 8 });
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("submits evidence, updates the task, and appends the event in one transaction", async () => {
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ state: "in_progress", revision: 1 })],
      [{ id: TASK_A_ID, revision: 2, state: "submitted" }],
      [{ nextVersion: 1 }],
      [],
      [],
      [taskRow({ state: "submitted", revision: 2 })],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    const result = await repository.transitionTask(BRAND_A_ID, TASK_A_ID, 1, {
      kind: "submit",
      evidence: [faultRepairEvidence()],
    });

    expect(result.kind).toBe("updated");
    expect(result.value.state).toBe("submitted");
    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.insert).toHaveBeenCalledTimes(2);
    const evidenceChain = transaction.chains.find(
      (chain) =>
        chain.values.mock.calls.length > 0 &&
        Array.isArray(chain.values.mock.calls[0]?.[0]) &&
        chain.values.mock.calls[0]?.[0]?.[0]?.kind,
    );
    expect(evidenceChain?.values.mock.calls[0]?.[0]?.[0]).toMatchObject({
      brandId: BRAND_A_ID,
      userId: USER_A_ID,
      taskId: TASK_A_ID,
      taskVersion: 1,
      kind: "fault_repair",
      status: "submitted",
      evidenceVersion: 1,
    });
  });

  it("appends one valid evidence reference without requiring every evidence kind", async () => {
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ taskType: "approve_essential_brand_facts", state: "in_progress", revision: 1 })],
      [{ id: TASK_A_ID, revision: 2, state: "in_progress" }],
      [{ nextVersion: 3 }],
      [],
      [],
      [taskRow({ taskType: "approve_essential_brand_facts", state: "in_progress", revision: 2 })],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    const result = await repository.appendEvidence(BRAND_A_ID, TASK_A_ID, 1, [sourceEvidence()]);

    expect(result.kind).toBe("updated");
    expect(result.value.revision).toBe(2);
    const evidenceChain = transaction.chains.find(
      (chain) =>
        chain.values.mock.calls.length > 0 &&
        Array.isArray(chain.values.mock.calls[0]?.[0]) &&
        chain.values.mock.calls[0]?.[0]?.[0]?.kind === "source",
    );
    expect(evidenceChain?.values.mock.calls[0]?.[0]?.[0]).toMatchObject({
      evidenceVersion: 3,
      role: "submission",
      status: "submitted",
    });
  });

  it("rejects evidence that attributes work to another user", async () => {
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ taskType: "approve_essential_brand_facts", state: "in_progress", revision: 1 })],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(
      repository.appendEvidence(BRAND_A_ID, TASK_A_ID, 1, [
        {
          kind: "artifact",
          label: "A reviewed artifact",
          artifactId: "artifact-1",
          version: 1,
          reviewedByUserId: "22222222-2222-4222-8222-222222222222",
          coverage: "The essential facts",
          duplicateCheck: "No duplicate",
        },
      ]),
    ).rejects.toThrow("authorized reviewer");
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("verifies a submitted task and creates an idempotent award with capability progress", async () => {
    const award = {
      id: "award-1",
      awardKey: "award-key-1",
      points: 40,
      awardStatus: "awarded",
      taskVersion: 1,
      cycleKey: "2026-09",
      ruleVersion: 1,
      evidenceVersion: 1,
      verificationMethod: {
        kind: "human_confirmation",
        confirmedByUserId: USER_A_ID,
        note: "The buyer can verify the repaired facts.",
      },
      occurredAt: new Date("2026-09-08T02:00:00.000Z"),
    };
    const capability = {
      id: "capability-1",
      brandId: BRAND_A_ID,
      milestone: "evidenced_changes_complete",
      eventKey: "capability-event-1",
      eventKind: "achieved",
      taskId: TASK_A_ID,
      taskVersion: 1,
      evidenceVersion: 1,
      reason: "The verified repair is complete.",
      occurredAt: new Date("2026-09-08T02:00:00.000Z"),
    };
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ state: "submitted", revision: 2 })],
      [],
      [{ id: TASK_A_ID, revision: 3, state: "verified" }],
      [{ nextVersion: 1 }],
      [],
      [],
      [award],
      [capability],
      [taskRow({ state: "verified", revision: 3 })],
      [{ id: BRAND_A_ID }],
      [taskRow({ state: "verified", revision: 3 })],
      [award],
    ]);
    const evidenceAuthorizer = vi
      .fn()
      .mockResolvedValueOnce("authorized")
      .mockResolvedValueOnce("invalid_evidence");
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
      evidenceAuthorizer,
    });

    const result = await repository.verifyAndAward(BRAND_A_ID, TASK_A_ID, 2, {
      cycleKey: "2026-09",
      verification: {
        kind: "human_confirmation",
        confirmedByUserId: USER_A_ID,
        note: "The buyer can verify the repaired facts.",
      },
      evidence: [faultRepairEvidence()],
      capability: {
        milestone: "evidenced_changes_complete",
        eventKey: "capability-event-1",
        reason: "The verified repair is complete.",
      },
    });

    expect(result.kind).toBe("updated");
    expect(result.value.task.state).toBe("verified");
    expect(result.value.award).toMatchObject({ id: "award-1", points: 40, awardStatus: "awarded" });
    expect(result.value.created).toBe(true);
    expect(evidenceAuthorizer).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: BRAND_A_ID,
        taskId: TASK_A_ID,
        taskVersion: 1,
        verification: expect.objectContaining({ kind: "human_confirmation" }),
        evidence: [expect.objectContaining({ kind: "fault_repair", faultId: "fault-1" })],
      }),
    );
    const retry = await repository.verifyAndAward(BRAND_A_ID, TASK_A_ID, 0, {
      cycleKey: "2026-09",
      verification: { kind: "system_check", checkId: "changed-check" },
      evidence: [faultRepairEvidence()],
    });
    expect(retry.kind).toBe("updated");
    expect(retry.value.award.id).toBe("award-1");
    expect(retry.value.created).toBe(false);
    expect(evidenceAuthorizer).toHaveBeenCalledTimes(1);
    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.insert).toHaveBeenCalledTimes(4);
  });

  it("returns the existing award on a repeated verification request", async () => {
    const award = {
      id: "award-existing",
      awardKey: "award-key-existing",
      points: 40,
      awardStatus: "awarded",
      taskVersion: 1,
      cycleKey: "2026-09",
      ruleVersion: 1,
      verificationMethod: {
        kind: "human_confirmation",
        confirmedByUserId: USER_A_ID,
        note: "The buyer can verify the repaired facts.",
      },
      occurredAt: new Date("2026-09-08T02:00:00.000Z"),
    };
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ state: "verified", revision: 3 })],
      [award],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
      evidenceAuthorizer: async () => "authorized",
    });

    const result = await repository.verifyAndAward(BRAND_A_ID, TASK_A_ID, 2, {
      cycleKey: "2026-09",
      verification: {
        kind: "human_confirmation",
        confirmedByUserId: USER_A_ID,
        note: "The buyer can verify the repaired facts.",
      },
      evidence: [faultRepairEvidence()],
    });

    expect(result.kind).toBe("updated");
    expect(result.value.task.revision).toBe(3);
    expect(result.value.award.id).toBe("award-existing");
    expect(result.value.created).toBe(false);
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("rejects human verification attributed to another user", async () => {
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ state: "submitted", revision: 2 })],
      [],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(
      repository.verifyAndAward(BRAND_A_ID, TASK_A_ID, 2, {
        cycleKey: "2026-09",
        verification: {
          kind: "human_confirmation",
          confirmedByUserId: "22222222-2222-4222-8222-222222222222",
          note: "The repaired facts are visible.",
        },
        evidence: [faultRepairEvidence()],
      }),
    ).rejects.toThrow("authorized confirmer");
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("denies verification when independent evidence is absent", async () => {
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ state: "submitted", revision: 2 })],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(
      repository.verifyAndAward(BRAND_A_ID, TASK_A_ID, 2, {
        cycleKey: "2026-09",
        verification: { kind: "system_check", checkId: "check-1" },
        evidence: [faultRepairEvidence()],
      }),
    ).rejects.toMatchObject({ code: "invalid_evidence" });
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("rolls back verification when a capability key names another milestone", async () => {
    const award = {
      id: "award-collision",
      taskId: TASK_A_ID,
      brandId: BRAND_A_ID,
      taskVersion: 1,
      cycleKey: "2026-09",
      awardKey: "award-key-collision",
      points: 40,
      ruleVersion: 1,
      evidenceVersion: 1,
      verificationMethod: { kind: "system_check", checkId: "check-1" },
      reason: "The task was verified.",
      awardStatus: "awarded",
      reversalReference: null,
      occurredAt: new Date("2026-09-08T02:00:00.000Z"),
    };
    const collision = {
      id: "capability-collision",
      brandId: BRAND_A_ID,
      milestone: "baseline_ready",
      eventKey: "capability-key-collision",
      eventKind: "achieved",
      taskId: TASK_A_ID,
      taskVersion: 1,
      evidenceVersion: 1,
      reason: "A different milestone owns this key.",
      occurredAt: new Date("2026-09-08T02:00:00.000Z"),
    };
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ state: "submitted", revision: 2 })],
      [],
      [{ id: TASK_A_ID, revision: 3, state: "verified" }],
      [{ nextVersion: 1 }],
      [],
      [],
      [award],
      [],
      [collision],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
      evidenceAuthorizer: async () => "authorized",
    });

    await expect(
      repository.verifyAndAward(BRAND_A_ID, TASK_A_ID, 2, {
        cycleKey: "2026-09",
        verification: { kind: "system_check", checkId: "check-1" },
        evidence: [faultRepairEvidence()],
        capability: {
          milestone: "evidenced_changes_complete",
          eventKey: "capability-key-collision",
          reason: "The evidence milestone is complete.",
        },
      }),
    ).rejects.toThrow("conflicts with another task milestone");
    expect(transaction.select).toHaveBeenCalledTimes(5);
  });

  it("returns an existing reversal before checking a stale task revision", async () => {
    const reversal = {
      id: "reversal-existing",
      taskId: TASK_A_ID,
      brandId: BRAND_A_ID,
      taskVersion: 1,
      cycleKey: "2026-09",
      awardKey: "award-key-existing:reversal",
      points: -40,
      ruleVersion: 1,
      evidenceVersion: 1,
      verificationMethod: { kind: "system_check", checkId: "check-1" },
      reason: "The award was reversed.",
      awardStatus: "reversed",
      reversalReference: "award-existing",
      occurredAt: new Date("2026-09-08T02:00:00.000Z"),
    };
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ state: "verified", revision: 5 })],
      [reversal],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    const result = await repository.reverseAward(BRAND_A_ID, TASK_A_ID, 4, {
      awardId: "award-existing",
      reason: "The award should remain reversed.",
    });

    expect(result.kind).toBe("updated");
    expect(result.value.award.id).toBe("reversal-existing");
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("rejects an empty award reversal reason", async () => {
    const { database, transaction } = createFakeDatabase([]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(
      repository.reverseAward(BRAND_A_ID, TASK_A_ID, 0, {
        awardId: "award-1",
        reason: "   ",
      }),
    ).rejects.toThrow("Award reversal requires a reason");
    expect(transaction.select).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("records an outcome review without changing the earned task points", async () => {
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ state: "verified", revision: 4 })],
      [],
      [{ id: TASK_A_ID, revision: 5, state: "waiting_for_observation" }],
      [
        {
          id: "review-1",
          taskId: TASK_A_ID,
          brandId: BRAND_A_ID,
          taskVersion: 1,
          cycleKey: "2026-09",
          measurementScope: { kind: "period", period: "2026-09" },
          decision: "unavailable",
          notes: "The next provider sample is not ready.",
          visibilityEvidenceVersion: null,
          businessResultEventId: null,
          nextCheckAt: null,
          createdAt: new Date("2026-09-08T03:00:00.000Z"),
          updatedAt: new Date("2026-09-08T03:00:00.000Z"),
        },
      ],
      [],
      [taskRow({ state: "waiting_for_observation", revision: 5 })],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    const result = await repository.recordOutcomeReview(BRAND_A_ID, TASK_A_ID, 4, {
      cycleKey: "2026-09",
      measurementScope: { kind: "period", period: "2026-09" },
      decision: "unavailable",
      notes: "The next provider sample is not ready.",
    });

    expect(result.kind).toBe("updated");
    expect(result.value.task.state).toBe("waiting_for_observation");
    expect(result.value.task.points).toBe(40);
    expect(result.value.review.decision).toBe("unavailable");
    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.insert).toHaveBeenCalledTimes(2);
  });

  it("returns an existing outcome review without writing it twice", async () => {
    const review = {
      id: "review-existing",
      taskId: TASK_A_ID,
      brandId: BRAND_A_ID,
      taskVersion: 1,
      cycleKey: "2026-09",
      measurementScope: { kind: "period", period: "2026-09" },
      decision: "unavailable",
      notes: "The next provider sample is not ready.",
      visibilityEvidenceVersion: null,
      businessResultEventId: null,
      nextCheckAt: null,
      createdAt: new Date("2026-09-08T03:00:00.000Z"),
      updatedAt: new Date("2026-09-08T03:00:00.000Z"),
    };
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ state: "waiting_for_observation", revision: 5 })],
      [review],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    const result = await repository.recordOutcomeReview(BRAND_A_ID, TASK_A_ID, 4, {
      cycleKey: "2026-09",
      measurementScope: { kind: "period", period: "2026-09" },
      decision: "unavailable",
      notes: "A repeated review request.",
    });

    expect(result.kind).toBe("updated");
    expect(result.value.review.id).toBe("review-existing");
    expect(result.value.task.revision).toBe(5);
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("rejects an invalid outcome measurement scope before writing", async () => {
    const { database, transaction } = createFakeDatabase([
      [{ id: BRAND_A_ID }],
      [taskRow({ state: "verified", revision: 4 })],
    ]);
    const repository = createWorkRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(
      repository.recordOutcomeReview(BRAND_A_ID, TASK_A_ID, 4, {
        cycleKey: "2026-09",
        measurementScope: { kind: "unknown" } as never,
        decision: "unavailable",
      }),
    ).rejects.toThrow("measurement scope is invalid");
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.insert).not.toHaveBeenCalled();
  });
});
