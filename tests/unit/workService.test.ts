import { describe, expect, it, vi } from "vitest";
import { createRequestActor, type RequestActor } from "../../server/lib/requestActor";
import type {
  WorkRepository,
  WorkVerificationResult,
  WorkOutcomeReviewResult,
} from "../../server/domains/work/repository";
import type {
  WorkAwardView,
  WorkSummaryInputs,
  WorkTaskDetailsView,
  WorkTaskView,
} from "../../server/storage/workStorage";
import { WorkPolicyError, type EvidenceReference, type TaskCommand } from "@shared/work";
import { createWorkService } from "../../server/services/work/WorkService";

const USER_A_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_A_ID = "brand-a";
const FOREIGN_BRAND_ID = "brand-owned-by-someone-else";
const actorA = createRequestActor(USER_A_ID);
const TASK_IDS = ["task-a", "task-b", "task-c", "task-d"] as const;
const CYCLE_KEY = "2026-09-08";

type BrandReader = {
  findActiveBrand(actor: RequestActor, brandId: string): Promise<{ id: string } | undefined>;
};

type WorkService = ReturnType<typeof createWorkService>;

const makeService = (dependencies: Parameters<typeof createWorkService>[0]): WorkService =>
  createWorkService(dependencies);

const summary: WorkSummaryInputs = {
  taskCounts: {
    total: 4,
    pending: 4,
    suggested: 4,
    accepted: 0,
    inProgress: 0,
    submitted: 0,
    verified: 0,
    waitingForObservation: 0,
    dismissed: 0,
    notApplicable: 0,
    reopened: 0,
  },
  awards: {
    eventCount: 0,
    points: 0,
    awardedPoints: 0,
    reversedPoints: 0,
    adjustmentPoints: 0,
    latestOccurredAt: null,
  },
  capabilityState: [],
};

function task(id: string, overrides: Partial<WorkTaskView> = {}): WorkTaskView {
  return {
    id,
    brandId: BRAND_A_ID,
    goalId: null,
    taskKey: id,
    taskVersion: 1,
    taskType: "repair_confirmed_access_or_factual_fault",
    state: "suggested",
    revision: 4,
    title: `Task ${id}`,
    desiredResult: "The buyer can verify the essential fact.",
    buyerNeed: "Verify the product before contacting the company.",
    recommendedChange: "Publish the approved fact and verify the page.",
    reason: "The current page does not expose the approved fact.",
    confidence: 0.9,
    effort: 2,
    points: 40,
    completionRule: { required: ["fault_repair"] },
    measurementScope: null,
    nextCheckAt: null,
    blockedReason: null,
    dismissalReason: null,
    createdAt: new Date("2026-09-08T00:00:00.000Z"),
    updatedAt: new Date("2026-09-08T00:00:00.000Z"),
    owner: null,
    ...overrides,
  };
}

function faultEvidence(): EvidenceReference[] {
  return [
    {
      kind: "fault_repair",
      label: "The repaired page passes the check.",
      faultId: "fault-1",
      beforeCheckId: "check-before-1",
      afterCheckId: "check-after-1",
      checkedAt: "2026-09-08T01:00:00.000Z",
    },
  ];
}

function award(points = 17): WorkAwardView {
  return {
    id: "award-1",
    taskId: "task-a",
    brandId: BRAND_A_ID,
    taskVersion: 1,
    cycleKey: CYCLE_KEY,
    awardKey: "repair_confirmed_access_or_factual_fault:v1:2026-09-08",
    points,
    ruleVersion: 1,
    evidenceVersion: 1,
    verificationMethod: { kind: "system_check", checkId: "check-after-1" },
    reason: "The task proof passed.",
    awardStatus: "awarded",
    reversalReference: null,
    occurredAt: new Date("2026-09-08T01:00:00.000Z"),
  };
}

function verificationResult(taskView = task("task-a"), created = true): WorkVerificationResult {
  return { task: taskView, award: award(), created };
}

function outcomeResult(): WorkOutcomeReviewResult {
  return {
    task: task("task-a", { state: "waiting_for_observation" }),
    review: {
      id: "review-1",
      taskId: "task-a",
      brandId: BRAND_A_ID,
      taskVersion: 1,
      cycleKey: CYCLE_KEY,
      measurementScope: { kind: "period", period: "2026-09-08/2026-09-15" },
      decision: "unavailable",
      notes: null,
      visibilityEvidenceVersion: null,
      businessResultEventId: null,
      nextCheckAt: new Date("2026-09-15T00:00:00.000Z"),
      createdAt: new Date("2026-09-08T01:00:00.000Z"),
      updatedAt: new Date("2026-09-08T01:00:00.000Z"),
    },
  };
}

function repository(overrides: Partial<WorkRepository> = {}) {
  const base = {
    getTask: vi.fn<WorkRepository["getTask"]>().mockResolvedValue(task("task-a")),
    listTasks: vi
      .fn<WorkRepository["listTasks"]>()
      .mockResolvedValue(TASK_IDS.map((id) => task(id))),
    getSummaryInputs: vi.fn<WorkRepository["getSummaryInputs"]>().mockResolvedValue(summary),
    getTaskDetails: vi.fn<WorkRepository["getTaskDetails"]>().mockResolvedValue({
      evidence: [],
      history: [],
    }),
    listAwardEvents: vi.fn<WorkRepository["listAwardEvents"]>().mockResolvedValue([]),
    createTask: vi.fn<WorkRepository["createTask"]>(),
    appendEvidence: vi.fn<WorkRepository["appendEvidence"]>().mockResolvedValue({
      kind: "updated",
      value: task("task-a", { state: "in_progress", revision: 5 }),
    }),
    transitionTask: vi.fn<WorkRepository["transitionTask"]>().mockResolvedValue({
      kind: "updated",
      value: task("task-a", { state: "accepted", revision: 5 }),
    }),
    submitTask: vi.fn<WorkRepository["submitTask"]>(),
    verifyAndAward: vi
      .fn<WorkRepository["verifyAndAward"]>()
      .mockResolvedValue({ kind: "updated", value: verificationResult() }),
    recordOutcomeReview: vi
      .fn<WorkRepository["recordOutcomeReview"]>()
      .mockResolvedValue({ kind: "updated", value: outcomeResult() }),
    reverseAward: vi.fn<WorkRepository["reverseAward"]>(),
  } satisfies WorkRepository;
  return { ...base, ...overrides };
}

function brandReader(owned = true): BrandReader & { findActiveBrand: ReturnType<typeof vi.fn> } {
  return {
    findActiveBrand: vi
      .fn()
      .mockImplementation(async (_actor: RequestActor, brandId: string) =>
        owned ? { id: brandId } : undefined,
      ),
  };
}

describe("WorkService", () => {
  it.each([
    [
      "getToday",
      (service: WorkService) => service.getToday({ brandId: FOREIGN_BRAND_ID, mode: "guided" }),
    ],
    ["getTasks", (service: WorkService) => service.getTasks({ brandId: FOREIGN_BRAND_ID })],
    [
      "getTask",
      (service: WorkService) => service.getTask({ brandId: FOREIGN_BRAND_ID, taskId: "task-a" }),
    ],
    [
      "transitionTask",
      (service: WorkService) =>
        service.transitionTask({
          brandId: FOREIGN_BRAND_ID,
          taskId: "task-a",
          expectedRevision: 4,
          command: { kind: "accept" },
        }),
    ],
    [
      "addEvidence",
      (service: WorkService) =>
        service.addEvidence({
          brandId: FOREIGN_BRAND_ID,
          taskId: "task-a",
          expectedRevision: 4,
          evidence: faultEvidence(),
        }),
    ],
    [
      "verifyTask",
      (service: WorkService) =>
        service.verifyTask({
          brandId: FOREIGN_BRAND_ID,
          taskId: "task-a",
          expectedRevision: 4,
          cycleKey: CYCLE_KEY,
          verification: { kind: "system_check", checkId: "check-after-1" },
          evidence: faultEvidence(),
        }),
    ],
    [
      "reviewTask",
      (service: WorkService) =>
        service.reviewTask({
          brandId: FOREIGN_BRAND_ID,
          taskId: "task-a",
          expectedRevision: 4,
          cycleKey: CYCLE_KEY,
          measurementScope: { kind: "period", period: "2026-09-08/2026-09-15" },
          decision: "unavailable",
          nextCheckAt: new Date("2026-09-15T00:00:00.000Z"),
        }),
    ],
  ])("checks ownership before %s", async (_name, operation) => {
    const repo = repository();
    const reader = brandReader(false);
    const service = makeService({ actor: actorA, repository: repo, brandReader: reader });

    await expect(operation(service)).resolves.toEqual({ kind: "not_found" });
    expect(reader.findActiveBrand).toHaveBeenCalledWith(actorA, FOREIGN_BRAND_ID);
    expect(repo.getTask).not.toHaveBeenCalled();
    expect(repo.listTasks).not.toHaveBeenCalled();
    expect(repo.getSummaryInputs).not.toHaveBeenCalled();
    expect(repo.createTask).not.toHaveBeenCalled();
    expect(repo.appendEvidence).not.toHaveBeenCalled();
    expect(repo.transitionTask).not.toHaveBeenCalled();
    expect(repo.submitTask).not.toHaveBeenCalled();
    expect(repo.verifyAndAward).not.toHaveBeenCalled();
    expect(repo.recordOutcomeReview).not.toHaveBeenCalled();
  });

  it("keeps getToday read-only and preserves unavailable summary values", async () => {
    const repo = repository();
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });

    const result = await service.getToday({ brandId: BRAND_A_ID, mode: "guided" });

    expect(result).toMatchObject({ mode: "guided" });
    expect(result).toMatchObject({
      summary: { awards: { latestOccurredAt: null } },
    });
    expect(repo.getSummaryInputs).toHaveBeenCalledWith(BRAND_A_ID);
    expect(repo.listTasks).toHaveBeenCalledWith(BRAND_A_ID, expect.anything());
    expect(repo.createTask).not.toHaveBeenCalled();
  });

  it("limits Guided mode to three deterministic tasks", async () => {
    const repo = repository();
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });

    const result = await service.getToday({ brandId: BRAND_A_ID, mode: "guided" });

    if ("kind" in result) throw new Error("Expected owned brand result");
    expect(result.tasks.map((item) => item.id)).toEqual(["task-a", "task-b", "task-c"]);
  });

  it("keeps Expert task IDs and order while exposing stored evidence and history details", async () => {
    const storedEvidence = faultEvidence();
    const storedHistory = [{ revision: 4, state: "suggested" }];
    const details: WorkTaskDetailsView = {
      evidence: storedEvidence.map((item) => ({
        id: item.faultId,
        taskId: "task-a",
        brandId: BRAND_A_ID,
        taskVersion: 1,
        evidenceVersion: 1,
        role: "verification",
        kind: item.kind,
        status: "verified",
        sourceUrl: null,
        finalUrl: null,
        canonicalUrl: null,
        retrievedAt: null,
        observedAt: new Date(item.checkedAt),
        excerpt: item.label,
        structuredFinding: item,
        createdAt: new Date(item.checkedAt),
      })),
      history: storedHistory.map((item, index) => ({
        id: `event-${index}`,
        taskId: "task-a",
        brandId: BRAND_A_ID,
        taskVersion: 1,
        revision: item.revision,
        priorState: null,
        nextState: item.state,
        actorId: USER_A_ID,
        actorKind: "user",
        reason: null,
        verificationMethod: null,
        createdAt: new Date("2026-09-08T00:00:00.000Z"),
      })),
    };
    const repo = repository({
      getTaskDetails: vi.fn<WorkRepository["getTaskDetails"]>().mockResolvedValue(details),
    });
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });

    const guided = await service.getToday({ brandId: BRAND_A_ID, mode: "guided" });
    const expert = await service.getToday({ brandId: BRAND_A_ID, mode: "expert" });

    if ("kind" in guided || "kind" in expert) throw new Error("Expected owned brand results");

    expect(expert.tasks.map((item) => item.id)).toEqual(guided.tasks.map((item) => item.id));
    expect(expert.tasks.map((item) => item.id)).toEqual(["task-a", "task-b", "task-c"]);
    expect(guided.tasks[0]).not.toHaveProperty("details");
    expect(expert.tasks[0]).toMatchObject({ details });
    expect(repo.getTaskDetails).toHaveBeenCalledTimes(3);
  });

  it("filters non-actionable states before applying the Guided limit", async () => {
    const repo = repository({
      listTasks: vi
        .fn<WorkRepository["listTasks"]>()
        .mockResolvedValue([
          task("verified", { state: "verified" }),
          task("dismissed", { state: "dismissed" }),
          task("not-applicable", { state: "not_applicable" }),
          task("task-b"),
          task("task-a"),
          task("task-c"),
          task("task-d"),
        ]),
    });
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });

    const result = await service.getToday({ brandId: BRAND_A_ID, mode: "guided" });

    if ("kind" in result) throw new Error("Expected owned brand result");
    expect(result.tasks.map((item) => item.id)).toEqual(["task-a", "task-b", "task-c"]);
  });

  it("maps repository conflicts to revision_conflict with currentRevision", async () => {
    const repo = repository({
      transitionTask: vi.fn<WorkRepository["transitionTask"]>().mockResolvedValue({
        kind: "conflict",
        currentRevision: 9,
      }),
    });
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });

    await expect(
      service.transitionTask({
        brandId: BRAND_A_ID,
        taskId: "task-a",
        expectedRevision: 4,
        command: { kind: "accept" },
      }),
    ).rejects.toMatchObject({ code: "revision_conflict", currentRevision: 9 });
  });

  it("maps missing evidence authorization to configuration_error", async () => {
    const repo = repository({
      verifyAndAward: vi
        .fn<WorkRepository["verifyAndAward"]>()
        .mockRejectedValue(
          new WorkPolicyError("configuration_error", "Evidence authorization is not configured"),
        ),
    });
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });

    await expect(
      service.verifyTask({
        brandId: BRAND_A_ID,
        taskId: "task-a",
        expectedRevision: 4,
        cycleKey: CYCLE_KEY,
        verification: { kind: "system_check", checkId: "check-after-1" },
        evidence: faultEvidence(),
      }),
    ).rejects.toMatchObject({ code: "configuration_error" });
    expect(repo.verifyAndAward).toHaveBeenCalledTimes(1);
    expect(repo.transitionTask).not.toHaveBeenCalled();
    expect(repo.appendEvidence).not.toHaveBeenCalled();
    expect(repo.recordOutcomeReview).not.toHaveBeenCalled();
  });

  it("forwards incremental evidence without creating a task", async () => {
    const repo = repository();
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });
    const input = {
      brandId: BRAND_A_ID,
      taskId: "task-a",
      expectedRevision: 4,
      evidence: faultEvidence(),
    };

    await service.addEvidence(input);

    expect(repo.appendEvidence).toHaveBeenCalledWith(BRAND_A_ID, "task-a", 4, input.evidence);
    expect(repo.createTask).not.toHaveBeenCalled();
  });

  it("requires task-specific evidence before submission", async () => {
    const repo = repository();
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });
    const command: TaskCommand = { kind: "submit", evidence: [] };

    await expect(
      service.transitionTask({
        brandId: BRAND_A_ID,
        taskId: "task-a",
        expectedRevision: 4,
        command,
      }),
    ).rejects.toMatchObject({ code: "missing_evidence" });
    expect(repo.transitionTask).not.toHaveBeenCalled();
    expect(repo.submitTask).not.toHaveBeenCalled();
  });

  it("maps domain policy errors and preserves repository not_found", async () => {
    const policyRepo = repository({
      transitionTask: vi
        .fn<WorkRepository["transitionTask"]>()
        .mockRejectedValue(
          new WorkPolicyError("invalid_transition", "The task transition is invalid"),
        ),
    });
    const policyService = makeService({
      actor: actorA,
      repository: policyRepo,
      brandReader: brandReader(),
    });
    await expect(
      policyService.transitionTask({
        brandId: BRAND_A_ID,
        taskId: "task-a",
        expectedRevision: 4,
        command: { kind: "accept" },
      }),
    ).rejects.toMatchObject({ code: "invalid_transition" });

    const missingRepo = repository({
      transitionTask: vi.fn<WorkRepository["transitionTask"]>().mockResolvedValue({
        kind: "not_found",
      }),
    });
    const missingService = makeService({
      actor: actorA,
      repository: missingRepo,
      brandReader: brandReader(),
    });
    await expect(
      missingService.transitionTask({
        brandId: BRAND_A_ID,
        taskId: "task-a",
        expectedRevision: 4,
        command: { kind: "accept" },
      }),
    ).resolves.toEqual({ kind: "not_found" });
  });

  it("forwards human confirmation attribution to verification", async () => {
    const repo = repository();
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });
    const verification = {
      kind: "human_confirmation" as const,
      confirmedByUserId: USER_A_ID,
      note: "I confirmed the published repair.",
    };

    await service.verifyTask({
      brandId: BRAND_A_ID,
      taskId: "task-a",
      expectedRevision: 4,
      cycleKey: CYCLE_KEY,
      verification,
      evidence: faultEvidence(),
    });

    expect(repo.verifyAndAward).toHaveBeenCalledWith(
      BRAND_A_ID,
      "task-a",
      4,
      expect.objectContaining({ cycleKey: CYCLE_KEY, verification }),
    );
  });

  it("returns created true or false from distinct idempotent repository results", async () => {
    const first = { kind: "updated" as const, value: verificationResult(task("task-a"), true) };
    const second = {
      kind: "updated" as const,
      value: verificationResult(task("task-a"), false),
    };
    const verifyAndAward = vi
      .fn<WorkRepository["verifyAndAward"]>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const repo = repository({ verifyAndAward });
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });
    const input = {
      brandId: BRAND_A_ID,
      taskId: "task-a",
      expectedRevision: 4,
      cycleKey: CYCLE_KEY,
      verification: { kind: "system_check" as const, checkId: "check-after-1" },
      evidence: faultEvidence(),
    };

    const firstResult = await service.verifyTask(input);
    const secondResult = await service.verifyTask(input);

    expect(firstResult).toMatchObject({
      created: true,
      award: { id: "award-1", awardKey: "repair_confirmed_access_or_factual_fault:v1:2026-09-08" },
    });
    expect(secondResult).toMatchObject({
      created: false,
      award: { id: "award-1", awardKey: "repair_confirmed_access_or_factual_fault:v1:2026-09-08" },
    });
    expect(repo.verifyAndAward).toHaveBeenCalledTimes(2);
    expect(repo.verifyAndAward).toHaveBeenLastCalledWith(
      BRAND_A_ID,
      "task-a",
      4,
      expect.objectContaining({ cycleKey: CYCLE_KEY }),
    );
  });

  it("filters service task pages before applying stable cursor pagination", async () => {
    const repo = repository({
      listTasks: vi
        .fn<WorkRepository["listTasks"]>()
        .mockResolvedValue([
          task("task-b", { updatedAt: new Date("2026-09-09T00:00:00.000Z") }),
          task("task-a", { updatedAt: new Date("2026-09-08T00:00:00.000Z") }),
          task("task-c", { state: "verified" }),
        ]),
    });
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });

    const first = await service.getTaskPage({
      brandId: BRAND_A_ID,
      filters: { status: "assigned", date: "2026-09-09", limit: 1 },
    });

    expect(first.items.map((item) => item.id)).toEqual(["task-b"]);
    expect(first.nextCursor).toBeNull();
    expect(repo.listTasks).toHaveBeenCalledWith(
      BRAND_A_ID,
      expect.objectContaining({ state: expect.arrayContaining(["suggested"]) }),
    );
  });

  it("rejects malformed cursors and keeps history and export in the service", async () => {
    const repo = repository();
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });

    await expect(
      service.getTaskPage({ brandId: BRAND_A_ID, filters: { cursor: "bad" } }),
    ).rejects.toMatchObject({ code: "invalid_transition" });
    await expect(service.exportWork({ brandId: BRAND_A_ID })).resolves.toMatchObject({
      manifestVersion: 1,
      brandId: BRAND_A_ID,
    });
  });

  it("exports scoped awards and reversal records for each task", async () => {
    const original = award();
    const reversal = {
      ...original,
      id: "award-reversed",
      points: -original.points,
      awardStatus: "reversed" as const,
      reversalReference: original.id,
    };
    const repo = repository({
      listTasks: vi.fn<WorkRepository["listTasks"]>().mockResolvedValue([task("task-a")]),
      listAwardEvents: vi
        .fn<WorkRepository["listAwardEvents"]>()
        .mockResolvedValue([original, reversal]),
    });
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });

    const result = await service.exportWork({ brandId: BRAND_A_ID });

    if ("kind" in result) throw new Error("Expected an owned brand export");
    expect(result.tasks[0]?.details).toMatchObject({
      awards: [original, reversal],
      reversals: [reversal],
    });
    expect(repo.listAwardEvents).toHaveBeenCalledWith(BRAND_A_ID);
  });

  it("reads reversed history from scoped award events", async () => {
    const reversed = {
      ...award(),
      id: "award-reversed",
      awardStatus: "reversed" as const,
      occurredAt: new Date("2026-09-09T00:00:00.000Z"),
    };
    const repo = repository({
      listAwardEvents: vi
        .fn<WorkRepository["listAwardEvents"]>()
        .mockResolvedValue([award(), reversed]),
      getTaskDetails: vi.fn<WorkRepository["getTaskDetails"]>().mockResolvedValue({
        evidence: [],
        history: [
          {
            id: "transition-event",
            taskId: "task-a",
            brandId: BRAND_A_ID,
            taskVersion: 1,
            revision: 5,
            priorState: "submitted",
            nextState: "verified",
            actorId: USER_A_ID,
            actorKind: "user",
            reason: "Task verified",
            verificationMethod: null,
            createdAt: new Date("2026-09-09T00:00:00.000Z"),
          },
        ],
      }),
    });
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });

    const result = await service.getHistory({
      brandId: BRAND_A_ID,
      filters: { status: "reversed", limit: 3 },
    });

    if ("kind" in result) throw new Error("Expected owned brand result");
    expect(result.items.map((item) => item.id)).toEqual(["award-reversed"]);
    expect(result.items[0]).toMatchObject({
      id: "award-reversed",
      state: "suggested",
      occurredAt: reversed.occurredAt,
      award: { awardStatus: "reversed", evidenceCount: 0 },
    });
    expect(result.items.some((item) => item.id === "transition-event")).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(repo.listAwardEvents).toHaveBeenCalledWith(BRAND_A_ID);
    const taskPage = await service.getTaskPage({
      brandId: BRAND_A_ID,
      filters: { status: "reversed" },
    });
    expect(taskPage).toEqual({ items: [], nextCursor: null });
    const history = await service.getHistory({ brandId: BRAND_A_ID });
    if ("kind" in history) throw new Error("Expected owned brand result");
    expect(history.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(["award-1", "award-reversed"]),
    );
  });

  it("records an unavailable outcome without changing points", async () => {
    const repo = repository();
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });

    const result = await service.reviewTask({
      brandId: BRAND_A_ID,
      taskId: "task-a",
      expectedRevision: 4,
      cycleKey: CYCLE_KEY,
      measurementScope: { kind: "period", period: "2026-09-08/2026-09-15" },
      decision: "unavailable",
      nextCheckAt: new Date("2026-09-15T00:00:00.000Z"),
    });

    if ("kind" in result) throw new Error("Expected owned brand result");
    expect(result).toMatchObject({ task: { state: "waiting_for_observation" }, pointsChanged: 0 });
    expect(repo.recordOutcomeReview).toHaveBeenCalledTimes(1);
    expect(repo.verifyAndAward).not.toHaveBeenCalled();
  });

  it("does not mutate work when the verification adapter fails", async () => {
    const repo = repository({
      verifyAndAward: vi
        .fn<WorkRepository["verifyAndAward"]>()
        .mockRejectedValue(new Error("verification adapter unavailable")),
    });
    const service = makeService({ actor: actorA, repository: repo, brandReader: brandReader() });

    await expect(
      service.verifyTask({
        brandId: BRAND_A_ID,
        taskId: "task-a",
        expectedRevision: 4,
        cycleKey: CYCLE_KEY,
        verification: { kind: "system_check", checkId: "check-after-1" },
        evidence: faultEvidence(),
      }),
    ).rejects.toThrow("verification adapter unavailable");
    expect(repo.createTask).not.toHaveBeenCalled();
    expect(repo.appendEvidence).not.toHaveBeenCalled();
    expect(repo.transitionTask).not.toHaveBeenCalled();
    expect(repo.submitTask).not.toHaveBeenCalled();
    expect(repo.recordOutcomeReview).not.toHaveBeenCalled();
  });
});
