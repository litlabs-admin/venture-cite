import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../shared/schema";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

const databaseTest = configureDestructiveDatabaseTest(process.env);
const canRunDatabaseTest = databaseTest.kind === "ready" && process.env.LOCAL_SUPABASE_TEST === "1";

if (canRunDatabaseTest) {
  // The environment guard runs before this import so the shared pool points
  // at TEST_DATABASE_URL and never at the normal application database.
  const { db } = await import("../../server/db");
  const { createWorkRepository } = await import("../../server/domains/work/repository");
  const { createRequestActor } = await import("../../server/lib/requestActor");
  const { setRestrictedRequestContext } =
    await import("../../server/data/restrictedRequestTransaction");

  const userAId = randomUUID();
  const userBId = randomUUID();
  const brandAId = randomUUID();
  const brandBId = randomUUID();
  const deletedBrandId = randomUUID();
  const summaryBrandId = randomUUID();
  const testBrandIds = [brandAId, brandBId, deletedBrandId, summaryBrandId];
  const actorA = createRequestActor(userAId);
  let foreignTaskId = "";
  let deletedTaskId = "";
  let summaryVerifiedTaskId = "";

  const taskInput = (taskKey: string) => ({
    taskKey,
    taskVersion: 1,
    taskType: "repair_confirmed_access_or_factual_fault" as const,
    title: "Repair the confirmed source",
    desiredResult: "The source gives buyers the approved fact.",
    recommendedChange: "Restore the approved fact and verify the source.",
  });

  const faultEvidence = (id: string) => ({
    kind: "fault_repair" as const,
    label: "The repaired fact passes the check.",
    faultId: id,
    beforeCheckId: `${id}-before`,
    afterCheckId: `${id}-after`,
    checkedAt: "2026-09-08T03:00:00.000Z",
  });

  async function deleteTestData() {
    await db
      .delete(schema.workAwardEvents)
      .where(inArray(schema.workAwardEvents.brandId, testBrandIds));
    await db
      .delete(schema.brandCapabilityEvents)
      .where(inArray(schema.brandCapabilityEvents.brandId, testBrandIds));
    await db.delete(schema.workTasks).where(inArray(schema.workTasks.brandId, testBrandIds));
    await db.delete(schema.brands).where(inArray(schema.brands.id, testBrandIds));
    await db.delete(schema.users).where(inArray(schema.users.id, [userAId, userBId]));
  }

  async function insertSeedTask(
    brandId: string,
    userId: string,
    taskKey: string,
    state = "suggested",
  ) {
    const [task] = await db
      .insert(schema.workTasks)
      .values({
        id: randomUUID(),
        brandId,
        userId,
        taskKey,
        taskVersion: 1,
        taskType: "repair_confirmed_access_or_factual_fault",
        state,
        ruleVersion: 1,
        revision: 0,
        title: "Seeded work task",
        desiredResult: "The seeded fact is available to buyers.",
        recommendedChange: "Publish the approved seeded fact.",
        points: 40,
        completionRule: {},
      } as never)
      .returning({ id: schema.workTasks.id });
    if (!task) throw new Error("The test task was not inserted");
    return task.id;
  }

  beforeAll(async () => {
    await deleteTestData();

    await db.insert(schema.users).values([
      {
        id: userAId,
        email: `work-repository-a-${userAId}@example.test`,
        firstName: "Work A",
        lastName: "Owner",
        onboardingState: {},
      },
      {
        id: userBId,
        email: `work-repository-b-${userBId}@example.test`,
        firstName: "Work B",
        lastName: "Owner",
        onboardingState: {},
      },
    ] as never);

    await db.insert(schema.brands).values([
      {
        id: brandAId,
        userId: userAId,
        name: "Work repository brand A",
        companyName: "Work repository company A",
        industry: "Software",
      },
      {
        id: brandBId,
        userId: userBId,
        name: "Work repository brand B",
        companyName: "Work repository company B",
        industry: "Software",
      },
      {
        id: deletedBrandId,
        userId: userAId,
        name: "Work repository deleted brand",
        companyName: "Work repository deleted company",
        industry: "Software",
      },
      {
        id: summaryBrandId,
        userId: userAId,
        name: "Work repository summary brand",
        companyName: "Work repository summary company",
        industry: "Software",
      },
    ] as never);

    await db
      .update(schema.brands)
      .set({ deletedAt: new Date() })
      .where(eq(schema.brands.id, deletedBrandId));

    foreignTaskId = await insertSeedTask(brandBId, userBId, `foreign-${randomUUID()}`);
    deletedTaskId = await insertSeedTask(deletedBrandId, userAId, `deleted-${randomUUID()}`);

    for (const state of [
      "suggested",
      "accepted",
      "in_progress",
      "submitted",
      "verified",
      "waiting_for_observation",
      "dismissed",
      "not_applicable",
      "reopened",
    ]) {
      const taskId = await insertSeedTask(
        summaryBrandId,
        userAId,
        `summary-${state}-${randomUUID()}`,
        state,
      );
      if (state === "verified") summaryVerifiedTaskId = taskId;
    }

    const awardedEventId = randomUUID();
    const awardDate = new Date("2026-09-01T08:00:00.000Z");
    await db.insert(schema.workAwardEvents).values({
      id: awardedEventId,
      taskId: summaryVerifiedTaskId,
      brandId: summaryBrandId,
      userId: userAId,
      taskVersion: 1,
      cycleKey: "summary-cycle",
      awardKey: `summary-award-${randomUUID()}`,
      points: 40,
      ruleVersion: 1,
      evidenceVersion: 1,
      verificationMethod: { kind: "system_check", checkId: "summary-award" },
      reason: "The verified summary task earned points.",
      awardStatus: "awarded",
      occurredAt: awardDate,
      createdAt: awardDate,
    } as never);
    await db.insert(schema.workAwardEvents).values({
      id: randomUUID(),
      taskId: summaryVerifiedTaskId,
      brandId: summaryBrandId,
      userId: userAId,
      taskVersion: 1,
      cycleKey: "summary-cycle",
      awardKey: `summary-reversal-${randomUUID()}`,
      points: -10,
      ruleVersion: 1,
      evidenceVersion: 1,
      verificationMethod: { kind: "system_check", checkId: "summary-reversal" },
      reason: "The earlier award was reversed.",
      awardStatus: "reversed",
      reversalReference: awardedEventId,
      occurredAt: new Date("2026-09-02T08:00:00.000Z"),
      createdAt: new Date("2026-09-02T08:00:00.000Z"),
    } as never);
    await db.insert(schema.workAwardEvents).values({
      id: randomUUID(),
      taskId: summaryVerifiedTaskId,
      brandId: summaryBrandId,
      userId: userAId,
      taskVersion: 1,
      cycleKey: "summary-cycle",
      awardKey: `summary-adjustment-${randomUUID()}`,
      points: 5,
      ruleVersion: 1,
      evidenceVersion: 1,
      verificationMethod: { kind: "system_check", checkId: "summary-adjustment" },
      reason: "The summary task received a correction.",
      awardStatus: "adjustment",
      occurredAt: new Date("2026-09-03T08:00:00.000Z"),
      createdAt: new Date("2026-09-03T08:00:00.000Z"),
    } as never);

    await db.insert(schema.brandCapabilityEvents).values([
      {
        id: randomUUID(),
        brandId: summaryBrandId,
        userId: userAId,
        milestone: "baseline_ready",
        eventKey: `summary-baseline-achieved-${randomUUID()}`,
        eventKind: "achieved",
        reason: "The baseline was recorded.",
        occurredAt: new Date("2026-09-01T08:00:00.000Z"),
      },
      {
        id: randomUUID(),
        brandId: summaryBrandId,
        userId: userAId,
        milestone: "baseline_ready",
        eventKey: `summary-baseline-reversed-${randomUUID()}`,
        eventKind: "reversed",
        reason: "The baseline needs review.",
        occurredAt: new Date("2026-09-04T08:00:00.000Z"),
      },
      {
        id: randomUUID(),
        brandId: summaryBrandId,
        userId: userAId,
        milestone: "evidenced_changes_complete",
        eventKey: `summary-evidence-achieved-${randomUUID()}`,
        eventKind: "achieved",
        reason: "The evidenced changes were completed.",
        occurredAt: new Date("2026-09-03T08:00:00.000Z"),
      },
    ] as never);
  }, 60_000);

  afterAll(async () => {
    await deleteTestData();
  });

  describe("work repository against the isolated request database", () => {
    it("does not expose a foreign task or a deleted-brand task", async () => {
      const repository = createWorkRepository({ actor: actorA, database: db });

      const visibleTaskIds = await db.transaction(async (transaction) => {
        await setRestrictedRequestContext({
          actor: actorA,
          role: "venturecite_request",
          transaction,
        });
        const rows = await transaction.select({ id: schema.workTasks.id }).from(schema.workTasks);
        return rows.map((row) => row.id);
      });

      expect(visibleTaskIds).toContain(summaryVerifiedTaskId);
      expect(visibleTaskIds).not.toContain(foreignTaskId);
      expect(visibleTaskIds).not.toContain(deletedTaskId);
      await expect(repository.getTask(brandBId, foreignTaskId)).resolves.toBeUndefined();
      await expect(repository.getTask(deletedBrandId, deletedTaskId)).resolves.toBeUndefined();
      await expect(repository.listTasks(brandBId)).resolves.toBeUndefined();
      await expect(repository.getSummaryInputs(deletedBrandId)).resolves.toBeUndefined();
    });

    it("returns live task, award, and capability aggregates for the actor-owned brand", async () => {
      const repository = createWorkRepository({ actor: actorA, database: db });

      await expect(repository.getSummaryInputs(summaryBrandId)).resolves.toEqual({
        taskCounts: {
          total: 9,
          pending: 6,
          suggested: 1,
          accepted: 1,
          inProgress: 1,
          submitted: 1,
          verified: 1,
          waitingForObservation: 1,
          dismissed: 1,
          notApplicable: 1,
          reopened: 1,
        },
        awards: {
          eventCount: 3,
          points: 35,
          awardedPoints: 40,
          reversedPoints: -10,
          adjustmentPoints: 5,
          latestOccurredAt: new Date("2026-09-03T08:00:00.000Z"),
        },
        capabilityState: [
          {
            milestone: "baseline_ready",
            eventKind: "reversed",
            occurredAt: new Date("2026-09-04T08:00:00.000Z"),
          },
          {
            milestone: "evidenced_changes_complete",
            eventKind: "achieved",
            occurredAt: new Date("2026-09-03T08:00:00.000Z"),
          },
        ],
      });
    });

    it("returns one task for concurrent duplicate creation", async () => {
      const repository = createWorkRepository({ actor: actorA, database: db });
      const input = taskInput(`concurrent-${randomUUID()}`);

      const [first, second] = await Promise.all([
        repository.createTask(brandAId, input),
        repository.createTask(brandAId, input),
      ]);

      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(first?.id).toBe(second?.id);
      const rows = await db
        .select({ id: schema.workTasks.id })
        .from(schema.workTasks)
        .where(
          and(
            eq(schema.workTasks.brandId, brandAId),
            eq(schema.workTasks.taskKey, input.taskKey),
            eq(schema.workTasks.taskVersion, input.taskVersion),
          ),
        );
      expect(rows).toHaveLength(1);
    });

    it("atomically submits, verifies, awards, and records an outcome review", async () => {
      const repository = createWorkRepository({
        actor: actorA,
        database: db,
        evidenceAuthorizer: async () => "authorized",
      });
      const input = taskInput(`mutation-${randomUUID()}`);
      const task = await repository.createTask(brandAId, input);
      expect(task).toBeDefined();
      if (!task) return;

      const accepted = await repository.transitionTask(brandAId, task.id, task.revision, {
        kind: "accept",
      });
      expect(accepted.kind).toBe("updated");
      if (accepted.kind !== "updated") return;
      const started = await repository.transitionTask(brandAId, task.id, accepted.value.revision, {
        kind: "start",
      });
      expect(started.kind).toBe("updated");
      if (started.kind !== "updated") return;
      const evidence = faultEvidence(randomUUID());
      const submitted = await repository.submitTask(brandAId, task.id, started.value.revision, [
        evidence,
      ]);
      expect(submitted.kind).toBe("updated");
      if (submitted.kind !== "updated") return;

      const verificationInput = {
        cycleKey: `mutation-cycle-${randomUUID()}`,
        verification: { kind: "system_check" as const, checkId: randomUUID() },
        evidence: [evidence],
        capability: {
          milestone: "evidenced_changes_complete" as const,
          eventKey: `mutation-capability-${randomUUID()}`,
          reason: "The repaired fact passed verification.",
        },
      };
      const [verified, concurrentVerified] = await Promise.all([
        repository.verifyAndAward(brandAId, task.id, submitted.value.revision, verificationInput),
        repository.verifyAndAward(brandAId, task.id, submitted.value.revision, verificationInput),
      ]);
      expect(verified.kind).toBe("updated");
      if (verified.kind !== "updated") return;
      expect(concurrentVerified.kind).toBe("updated");
      if (concurrentVerified.kind !== "updated") return;
      expect(verified.value.task.state).toBe("verified");
      expect(verified.value.award.points).toBe(40);
      const concurrentResults = [verified, concurrentVerified];
      expect(concurrentResults.filter((result) => result.value.created)).toHaveLength(1);
      expect(concurrentResults.filter((result) => !result.value.created)).toHaveLength(1);
      expect(new Set(concurrentResults.map((result) => result.value.award.id))).toEqual(
        new Set([verified.value.award.id]),
      );

      const repeated = await repository.verifyAndAward(
        brandAId,
        task.id,
        submitted.value.revision,
        {
          cycleKey: verified.value.award.cycleKey,
          verification: { kind: "system_check", checkId: randomUUID() },
          evidence: [evidence],
        },
      );
      expect(repeated.kind).toBe("updated");
      if (repeated.kind !== "updated") return;
      expect(repeated.value.award.id).toBe(verified.value.award.id);
      expect(repeated.value.created).toBe(false);

      const awards = await db
        .select({ id: schema.workAwardEvents.id })
        .from(schema.workAwardEvents)
        .where(
          and(
            eq(schema.workAwardEvents.brandId, brandAId),
            eq(schema.workAwardEvents.taskId, task.id),
          ),
        );
      expect(awards).toHaveLength(1);

      const verificationEvidence = await db
        .select({
          id: schema.workTaskEvidence.id,
          evidenceVersion: schema.workTaskEvidence.evidenceVersion,
          role: schema.workTaskEvidence.role,
          status: schema.workTaskEvidence.status,
        })
        .from(schema.workTaskEvidence)
        .where(
          and(
            eq(schema.workTaskEvidence.brandId, brandAId),
            eq(schema.workTaskEvidence.taskId, task.id),
            eq(schema.workTaskEvidence.role, "verification"),
          ),
        );
      expect(verificationEvidence).toHaveLength(1);
      expect(verificationEvidence[0]).toMatchObject({ evidenceVersion: 2, status: "verified" });

      const verificationEvents = await db
        .select({ id: schema.workTaskEvents.id, nextState: schema.workTaskEvents.nextState })
        .from(schema.workTaskEvents)
        .where(
          and(
            eq(schema.workTaskEvents.brandId, brandAId),
            eq(schema.workTaskEvents.taskId, task.id),
            eq(schema.workTaskEvents.nextState, "verified"),
          ),
        );
      expect(verificationEvents).toHaveLength(1);

      const capabilityEvents = await db
        .select({
          id: schema.brandCapabilityEvents.id,
          eventKey: schema.brandCapabilityEvents.eventKey,
          taskId: schema.brandCapabilityEvents.taskId,
          taskVersion: schema.brandCapabilityEvents.taskVersion,
        })
        .from(schema.brandCapabilityEvents)
        .where(
          and(
            eq(schema.brandCapabilityEvents.brandId, brandAId),
            eq(schema.brandCapabilityEvents.eventKey, verificationInput.capability.eventKey),
            eq(schema.brandCapabilityEvents.taskId, task.id),
          ),
        );
      expect(capabilityEvents).toHaveLength(1);
      expect(capabilityEvents[0]).toMatchObject({ taskId: task.id, taskVersion: 1 });

      const review = await repository.recordOutcomeReview(
        brandAId,
        task.id,
        verified.value.task.revision,
        {
          cycleKey: `review-cycle-${randomUUID()}`,
          measurementScope: { kind: "period", period: "2026-09" },
          decision: "unavailable",
          notes: "The next measurement is not ready.",
        },
      );
      expect(review.kind).toBe("updated");
      if (review.kind === "updated") {
        expect(review.value.task.state).toBe("waiting_for_observation");
        expect(review.value.task.points).toBe(40);

        const reversalReason = "The verification result was superseded by a corrected check.";
        const reversal = await repository.reverseAward(
          brandAId,
          task.id,
          review.value.task.revision,
          {
            awardId: verified.value.award.id,
            reason: reversalReason,
          },
        );
        expect(reversal.kind).toBe("updated");
        if (reversal.kind === "updated") {
          expect(reversal.value.award.points).toBe(-40);
          expect(reversal.value.award.awardStatus).toBe("reversed");
          expect(reversal.value.award.reversalReference).toBe(verified.value.award.id);

          const retry = await repository.reverseAward(
            brandAId,
            task.id,
            review.value.task.revision,
            {
              awardId: verified.value.award.id,
              reason: "A repeated reversal request.",
            },
          );
          expect(retry.kind).toBe("updated");
          if (retry.kind === "updated") {
            expect(retry.value.award.id).toBe(reversal.value.award.id);
            expect(retry.value.award.points).toBe(-40);
          }
        }

        const awardRows = await db
          .select({
            id: schema.workAwardEvents.id,
            points: schema.workAwardEvents.points,
            awardStatus: schema.workAwardEvents.awardStatus,
            reversalReference: schema.workAwardEvents.reversalReference,
          })
          .from(schema.workAwardEvents)
          .where(
            and(
              eq(schema.workAwardEvents.brandId, brandAId),
              eq(schema.workAwardEvents.taskId, task.id),
            ),
          );
        expect(awardRows).toHaveLength(2);
        expect(awardRows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: verified.value.award.id,
              points: 40,
              awardStatus: "awarded",
              reversalReference: null,
            }),
            expect.objectContaining({
              points: -40,
              awardStatus: "reversed",
              reversalReference: verified.value.award.id,
            }),
          ]),
        );
        const reversalEvents = await db
          .select({ id: schema.workTaskEvents.id })
          .from(schema.workTaskEvents)
          .where(
            and(
              eq(schema.workTaskEvents.brandId, brandAId),
              eq(schema.workTaskEvents.taskId, task.id),
              eq(schema.workTaskEvents.reason, reversalReason),
            ),
          );
        expect(reversalEvents).toHaveLength(1);
      }
    });

    it("returns a stale revision conflict without changing the task", async () => {
      const repository = createWorkRepository({ actor: actorA, database: db });
      const task = await repository.createTask(brandAId, taskInput(`stale-${randomUUID()}`));
      expect(task).toBeDefined();
      if (!task) return;

      const first = await repository.transitionTask(brandAId, task.id, 0, { kind: "accept" });
      expect(first.kind).toBe("updated");
      const stale = await repository.transitionTask(brandAId, task.id, 0, { kind: "accept" });
      expect(stale).toEqual({ kind: "conflict", currentRevision: 1 });
    });

    it("rolls back a verification mutation when the repository transaction fails", async () => {
      const repository = createWorkRepository({
        actor: actorA,
        database: db,
        evidenceAuthorizer: async () => "authorized",
      });
      const task = await repository.createTask(
        brandAId,
        taskInput(`mutation-rollback-${randomUUID()}`),
      );
      expect(task).toBeDefined();
      if (!task) return;
      const accepted = await repository.transitionTask(brandAId, task.id, 0, { kind: "accept" });
      expect(accepted.kind).toBe("updated");
      if (accepted.kind !== "updated") return;
      const started = await repository.transitionTask(brandAId, task.id, 1, { kind: "start" });
      expect(started.kind).toBe("updated");
      if (started.kind !== "updated") return;

      const evidence = faultEvidence(randomUUID());
      const submitted = await repository.submitTask(brandAId, task.id, started.value.revision, [
        evidence,
      ]);
      expect(submitted.kind).toBe("updated");
      if (submitted.kind !== "updated") return;

      const failure = new Error("forced verification mutation rollback");
      const throwingDatabase = {
        transaction: async (operation: Parameters<typeof db.transaction>[0]) =>
          db.transaction(async (transaction) => {
            await operation(transaction);
            throw failure;
          }),
      };
      const throwingRepository = createWorkRepository({
        actor: actorA,
        database: throwingDatabase as never,
        evidenceAuthorizer: async () => "authorized",
      });

      await expect(
        throwingRepository.verifyAndAward(brandAId, task.id, submitted.value.revision, {
          cycleKey: `rollback-cycle-${randomUUID()}`,
          verification: { kind: "system_check", checkId: randomUUID() },
          evidence: [evidence],
          capability: {
            milestone: "evidenced_changes_complete",
            eventKey: `rollback-capability-${randomUUID()}`,
            reason: "The verified repair should roll back.",
          },
        }),
      ).rejects.toBe(failure);

      const [persisted] = await db
        .select({ state: schema.workTasks.state, revision: schema.workTasks.revision })
        .from(schema.workTasks)
        .where(eq(schema.workTasks.id, task.id));
      expect(persisted).toEqual({ state: "submitted", revision: submitted.value.revision });
      const evidenceRows = await db
        .select({ id: schema.workTaskEvidence.id, role: schema.workTaskEvidence.role })
        .from(schema.workTaskEvidence)
        .where(eq(schema.workTaskEvidence.taskId, task.id));
      expect(evidenceRows).toHaveLength(1);
      expect(evidenceRows[0]?.role).toBe("submission");
      const events = await db
        .select({ id: schema.workTaskEvents.id })
        .from(schema.workTaskEvents)
        .where(eq(schema.workTaskEvents.taskId, task.id));
      expect(events).toHaveLength(3);
      const awards = await db
        .select({ id: schema.workAwardEvents.id })
        .from(schema.workAwardEvents)
        .where(eq(schema.workAwardEvents.taskId, task.id));
      expect(awards).toHaveLength(0);
      const capabilities = await db
        .select({ id: schema.brandCapabilityEvents.id })
        .from(schema.brandCapabilityEvents)
        .where(eq(schema.brandCapabilityEvents.taskId, task.id));
      expect(capabilities).toHaveLength(0);
    });

    it("rolls back a reversal mutation when the repository transaction fails", async () => {
      const repository = createWorkRepository({
        actor: actorA,
        database: db,
        evidenceAuthorizer: async () => "authorized",
      });
      const task = await repository.createTask(
        brandAId,
        taskInput(`reversal-rollback-${randomUUID()}`),
      );
      expect(task).toBeDefined();
      if (!task) return;
      const accepted = await repository.transitionTask(brandAId, task.id, 0, { kind: "accept" });
      expect(accepted.kind).toBe("updated");
      if (accepted.kind !== "updated") return;
      const started = await repository.transitionTask(brandAId, task.id, accepted.value.revision, {
        kind: "start",
      });
      expect(started.kind).toBe("updated");
      if (started.kind !== "updated") return;
      const evidence = faultEvidence(randomUUID());
      const submitted = await repository.submitTask(brandAId, task.id, started.value.revision, [
        evidence,
      ]);
      expect(submitted.kind).toBe("updated");
      if (submitted.kind !== "updated") return;
      const verified = await repository.verifyAndAward(
        brandAId,
        task.id,
        submitted.value.revision,
        {
          cycleKey: `reversal-rollback-cycle-${randomUUID()}`,
          verification: { kind: "system_check", checkId: randomUUID() },
          evidence: [evidence],
        },
      );
      expect(verified.kind).toBe("updated");
      if (verified.kind !== "updated") return;
      expect(verified.value.created).toBe(true);

      const failure = new Error("forced reversal mutation rollback");
      const throwingDatabase = {
        transaction: async (operation: Parameters<typeof db.transaction>[0]) =>
          db.transaction(async (transaction) => {
            await operation(transaction);
            throw failure;
          }),
      };
      const throwingRepository = createWorkRepository({
        actor: actorA,
        database: throwingDatabase as never,
      });

      await expect(
        throwingRepository.reverseAward(brandAId, task.id, verified.value.task.revision, {
          awardId: verified.value.award.id,
          reason: "The reversal should roll back.",
        }),
      ).rejects.toBe(failure);

      const [persisted] = await db
        .select({ state: schema.workTasks.state, revision: schema.workTasks.revision })
        .from(schema.workTasks)
        .where(eq(schema.workTasks.id, task.id));
      expect(persisted).toEqual({ state: "verified", revision: verified.value.task.revision });
      const awards = await db
        .select({
          id: schema.workAwardEvents.id,
          points: schema.workAwardEvents.points,
          awardStatus: schema.workAwardEvents.awardStatus,
          reversalReference: schema.workAwardEvents.reversalReference,
        })
        .from(schema.workAwardEvents)
        .where(eq(schema.workAwardEvents.taskId, task.id));
      expect(awards).toEqual([
        expect.objectContaining({
          id: verified.value.award.id,
          points: 40,
          awardStatus: "awarded",
          reversalReference: null,
        }),
      ]);
      const events = await db
        .select({ id: schema.workTaskEvents.id })
        .from(schema.workTaskEvents)
        .where(eq(schema.workTaskEvents.taskId, task.id));
      expect(events).toHaveLength(4);
      const capabilities = await db
        .select({ id: schema.brandCapabilityEvents.id })
        .from(schema.brandCapabilityEvents)
        .where(eq(schema.brandCapabilityEvents.taskId, task.id));
      expect(capabilities).toHaveLength(0);
    });

    it("rolls back a work-task write when the transaction throws", async () => {
      const input = taskInput(`rollback-${randomUUID()}`);
      const failure = new Error("forced work repository rollback");
      const throwingDatabase = {
        transaction: async (operation: Parameters<typeof db.transaction>[0]) =>
          db.transaction(async (transaction) => {
            await operation(transaction);
            throw failure;
          }),
      };
      const repository = createWorkRepository({
        actor: actorA,
        database: throwingDatabase as never,
      });

      await expect(repository.createTask(brandAId, input)).rejects.toBe(failure);

      const rows = await db
        .select({ id: schema.workTasks.id })
        .from(schema.workTasks)
        .where(
          and(
            eq(schema.workTasks.brandId, brandAId),
            eq(schema.workTasks.taskKey, input.taskKey),
            eq(schema.workTasks.taskVersion, input.taskVersion),
          ),
        );
      expect(rows).toHaveLength(0);
    });
  });
} else {
  describe.skip("work repository database integration", () => {
    it("requires LOCAL_SUPABASE_TEST=1 and TEST_DATABASE_URL", () => {});
  });
}
