import { describe, expect, it, vi } from "vitest";
import type { RequestActor } from "../../server/lib/requestActor";
import { createRequestActor } from "../../server/lib/requestActor";
import type {
  WorkOpportunity,
  WorkOpportunitySource,
} from "../../server/domains/work/opportunities";
import type {
  WorkOpportunityRepository,
  WorkRepository,
} from "../../server/domains/work/repository";
import { createOpportunityReconciler } from "../../server/services/work/OpportunityReconciler";
import type { EvidenceReference } from "@shared/work";
import type { WorkTaskView } from "../../server/storage/workStorage";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "brand-a";
const OTHER_BRAND_ID = "brand-b";
const ACTOR = createRequestActor(USER_ID);

const sourceEvidence = Object.freeze({
  kind: "source" as const,
  label: "The published source confirms the essential fact.",
  sourceUrl: "https://example.test/facts/acme",
  factId: "fact-1",
  retrievedAt: "2026-09-08T01:00:00.000Z",
  excerpt: "Acme provides a documented buyer workflow.",
});

function opportunity(overrides: Partial<WorkOpportunity> = {}): WorkOpportunity {
  return {
    taskKey: "facts:fact-1",
    taskType: "approve_essential_brand_facts",
    ruleVersion: 1,
    title: "Approve the essential brand fact",
    reason: "The source contains a fact that needs review.",
    completionRule: { required: ["source", "confirmation"] },
    evidence: [sourceEvidence],
    ...overrides,
  };
}

function task(overrides: Partial<WorkTaskView> = {}): WorkTaskView {
  return {
    id: "task-fact-1-v1",
    brandId: BRAND_ID,
    goalId: null,
    taskKey: "facts:fact-1",
    taskVersion: 1,
    taskType: "approve_essential_brand_facts",
    state: "suggested",
    revision: 0,
    title: "Approve the essential brand fact",
    desiredResult: "The buyer can verify the essential fact.",
    buyerNeed: null,
    recommendedChange: "Review the source and confirm the fact.",
    reason: "The source contains a fact that needs review.",
    confidence: null,
    effort: null,
    points: 20,
    completionRule: { required: ["source", "confirmation"], ruleVersion: 1 },
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

type TriggerEvidence = {
  role: "trigger";
  status: "verified";
  evidence: EvidenceReference[];
};

function createRepository(initialTasks: WorkTaskView[] = []) {
  const state = {
    tasks: [...initialTasks],
    triggerEvidence: [] as TriggerEvidence[],
  };

  const repository: WorkRepository & WorkOpportunityRepository = {
    getTask: vi.fn(async (brandId, taskId) =>
      state.tasks.find((item) => item.brandId === brandId && item.id === taskId),
    ),
    listTasks: vi.fn(async (brandId) => state.tasks.filter((item) => item.brandId === brandId)),
    getSummaryInputs: vi.fn(async () => undefined),
    getTaskDetails: vi.fn(async () => undefined),
    listAwardEvents: vi.fn(async () => []),
    createTask: vi.fn(async () => undefined),
    createTaskWithTriggerEvidence: vi.fn(async (brandId, input, evidence) => {
      const taskVersion = input.taskVersion ?? 1;
      const existing = state.tasks.find(
        (item) =>
          item.brandId === brandId &&
          item.taskKey === input.taskKey &&
          item.taskVersion === taskVersion,
      );
      if (existing) {
        return { task: existing, created: false };
      }
      const created = task({
        id: `${brandId}-${input.taskKey}-v${taskVersion}`,
        brandId,
        taskKey: input.taskKey,
        taskVersion,
        taskType: input.taskType,
        title: input.title,
        desiredResult: input.desiredResult,
        buyerNeed: input.buyerNeed ?? null,
        recommendedChange: input.recommendedChange,
        reason: input.reason ?? null,
        completionRule: input.completionRule ?? {},
      });
      state.tasks.push(created);
      state.triggerEvidence.push({
        role: "trigger",
        status: "verified",
        evidence: structuredClone(evidence),
      });
      return { task: created, created: true };
    }),
    appendEvidence: vi.fn(async () => ({ kind: "not_found" })),
    transitionTask: vi.fn(async (brandId, taskId, expectedRevision, command) => {
      const current = state.tasks.find((item) => item.brandId === brandId && item.id === taskId);
      if (!current) return { kind: "not_found" };
      if (current.revision !== expectedRevision) {
        return { kind: "conflict", currentRevision: current.revision };
      }
      const nextState = command.kind === "dismiss" ? "dismissed" : current.state;
      const updated = {
        ...current,
        state: nextState,
        revision: current.revision + 1,
        dismissalReason: command.kind === "dismiss" ? command.reason : current.dismissalReason,
      };
      state.tasks.splice(state.tasks.indexOf(current), 1, updated);
      return { kind: "updated", value: updated };
    }),
    submitTask: vi.fn(async () => ({ kind: "not_found" })),
    verifyAndAward: vi.fn(async () => ({ kind: "not_found" })),
    recordOutcomeReview: vi.fn(async () => ({ kind: "not_found" })),
    reverseAward: vi.fn(async () => ({ kind: "not_found" })),
  };

  return { repository, state };
}

function source(
  overrides: Partial<WorkOpportunity> = {},
  sourceKey = "facts",
): WorkOpportunitySource {
  return {
    sourceKey,
    collect: vi.fn(async () => [opportunity(overrides)]),
  };
}

function emptySource(sourceKey = "facts"): WorkOpportunitySource {
  return { sourceKey, collect: vi.fn(async () => []) };
}

function reconcileInput(
  repository: WorkRepository & WorkOpportunityRepository,
  actor: RequestActor = ACTOR,
  brandId = BRAND_ID,
  sources: readonly WorkOpportunitySource[] = [source()],
) {
  return createOpportunityReconciler({ repository }).reconcile({ actor, brandId, sources });
}

describe("work opportunity reconciliation", () => {
  it("preserves the source namespace in a stable task key", async () => {
    const { repository } = createRepository();

    await reconcileInput(repository);

    expect(repository.createTaskWithTriggerEvidence).toHaveBeenCalledWith(
      BRAND_ID,
      expect.objectContaining({ taskKey: "facts:fact-1", taskVersion: 1 }),
      expect.any(Array),
    );
  });

  it("passes the authenticated actor and brand to every source", async () => {
    const foreignTask = task({ id: "task-foreign", brandId: OTHER_BRAND_ID });
    const { repository, state } = createRepository([foreignTask]);
    const adapter = source();

    await reconcileInput(repository, ACTOR, BRAND_ID, [adapter]);

    expect(adapter.collect).toHaveBeenCalledWith({ actor: ACTOR, brandId: BRAND_ID });
    expect(repository.listTasks).toHaveBeenCalledWith(BRAND_ID);
    expect(state.tasks).toContainEqual(foreignTask);
  });

  it("does not create duplicate tasks or trigger evidence on an ON CONFLICT retry", async () => {
    const { repository, state } = createRepository();
    const adapter = source();
    const reconciler = createOpportunityReconciler({ repository });
    const staleEmptyList: WorkTaskView[] = [];
    vi.mocked(repository.listTasks).mockResolvedValue(staleEmptyList);

    await Promise.all([
      reconciler.reconcile({ actor: ACTOR, brandId: BRAND_ID, sources: [adapter] }),
      reconciler.reconcile({ actor: ACTOR, brandId: BRAND_ID, sources: [adapter] }),
    ]);

    expect(repository.createTaskWithTriggerEvidence).toHaveBeenCalledTimes(2);
    expect(state.tasks.filter((item) => item.taskKey === "facts:fact-1")).toHaveLength(1);
    expect(state.triggerEvidence).toHaveLength(1);
    expect(state.tasks[0]?.revision).toBe(0);
  });

  it("stores a verified trigger record without changing the suggested task revision", async () => {
    const { repository, state } = createRepository();

    await reconcileInput(repository);

    expect(state.triggerEvidence).toEqual([
      expect.objectContaining({ role: "trigger", status: "verified" }),
    ]);
    expect(state.triggerEvidence[0]?.evidence).toEqual([sourceEvidence]);
    expect(state.tasks[0]).toMatchObject({ state: "suggested", revision: 0 });
  });

  it("dismisses a removed suggested task only inside the current source namespace", async () => {
    const factsTask = task();
    const questionsTask = task({
      id: "task-question-1",
      taskKey: "questions:question-1",
    });
    const manualTask = task({
      id: "task-manual-1",
      taskKey: "manual:task-1",
    });
    const { repository, state } = createRepository([factsTask, questionsTask, manualTask]);

    await reconcileInput(repository, ACTOR, BRAND_ID, [emptySource("facts")]);

    expect(repository.transitionTask).toHaveBeenCalledWith(
      BRAND_ID,
      factsTask.id,
      factsTask.revision,
      expect.objectContaining({ kind: "dismiss" }),
    );
    expect(state.tasks).toContainEqual(
      expect.objectContaining({ id: factsTask.id, state: "dismissed" }),
    );
    expect(state.tasks).toContainEqual(questionsTask);
    expect(state.tasks).toContainEqual(manualTask);
  });

  it("dismisses only obsolete suggested versions after a higher rule version appears", async () => {
    const priorTask = task({
      completionRule: { required: ["source", "confirmation"], ruleVersion: 1 },
    });
    const { repository, state } = createRepository([priorTask]);
    const updatedSource = source({
      ruleVersion: 2,
      completionRule: { required: ["source", "confirmation"] },
    });

    await reconcileInput(repository, ACTOR, BRAND_ID, [updatedSource]);

    expect(repository.createTaskWithTriggerEvidence).toHaveBeenCalledWith(
      BRAND_ID,
      expect.objectContaining({ taskKey: priorTask.taskKey, taskVersion: 2 }),
      expect.any(Array),
    );
    expect(state.tasks).toContainEqual(
      expect.objectContaining({ id: priorTask.id, state: "dismissed" }),
    );
  });

  it("keeps reconciliation successful when an obsolete dismissal loses a revision race", async () => {
    const priorTask = task();
    const { repository, state } = createRepository([priorTask]);
    vi.mocked(repository.transitionTask).mockResolvedValue({
      kind: "conflict",
      currentRevision: 1,
    });
    vi.mocked(repository.getTask).mockResolvedValue({
      ...priorTask,
      state: "accepted",
      revision: 1,
    });

    await expect(
      reconcileInput(repository, ACTOR, BRAND_ID, [source({ ruleVersion: 2 })]),
    ).resolves.toHaveLength(1);

    expect(repository.getTask).toHaveBeenCalledWith(BRAND_ID, priorTask.id);
    expect(repository.transitionTask).toHaveBeenCalledTimes(1);
    expect(state.tasks).toContainEqual(
      expect.objectContaining({ id: priorTask.id, state: "suggested" }),
    );
  });

  it("preserves an accepted earlier version when a higher rule version appears", async () => {
    const activeTask = task({
      state: "accepted",
      completionRule: { required: ["source"], ruleVersion: 1 },
    });
    const { repository, state } = createRepository([activeTask]);

    await reconcileInput(repository, ACTOR, BRAND_ID, [source({ ruleVersion: 2 })]);

    expect(repository.transitionTask).not.toHaveBeenCalled();
    expect(state.tasks).toContainEqual(
      expect.objectContaining({ id: activeTask.id, state: "accepted" }),
    );
  });

  it("rejects invalid trigger evidence before persistence", async () => {
    const { repository } = createRepository();
    const invalidSource = source({
      evidence: [
        {
          ...sourceEvidence,
          sourceUrl: "javascript:alert(1)",
        },
      ],
    });

    await expect(reconcileInput(repository, ACTOR, BRAND_ID, [invalidSource])).rejects.toThrow(
      /invalid evidence/i,
    );
    expect(repository.createTaskWithTriggerEvidence).not.toHaveBeenCalled();
  });

  it("rejects confirmation trigger evidence owned by another actor", async () => {
    const invalidConfirmation = {
      kind: "confirmation" as const,
      label: "A foreign reviewer confirmation.",
      confirmedByUserId: "22222222-2222-4222-8222-222222222222",
      note: "The source is current.",
      confirmedAt: "2026-09-08T01:05:00.000Z",
    };
    const invalidSource = source({ evidence: [sourceEvidence, invalidConfirmation] });
    const { repository } = createRepository();

    await expect(reconcileInput(repository, ACTOR, BRAND_ID, [invalidSource])).rejects.toThrow(
      /invalid evidence/i,
    );
    expect(repository.createTaskWithTriggerEvidence).not.toHaveBeenCalled();
  });

  it("merges duplicate same-key and same-rule evidence in deterministic order", async () => {
    const secondEvidence = {
      ...sourceEvidence,
      factId: "fact-2",
      excerpt: "Acme documents a second buyer workflow.",
    };
    const adapter: WorkOpportunitySource = {
      sourceKey: "facts",
      collect: vi.fn(async () => [
        opportunity(),
        opportunity({ evidence: [secondEvidence, sourceEvidence] }),
      ]),
    };
    const { repository, state } = createRepository();

    await reconcileInput(repository, ACTOR, BRAND_ID, [adapter]);

    expect(repository.createTaskWithTriggerEvidence).toHaveBeenCalledTimes(1);
    expect(state.triggerEvidence).toHaveLength(1);
    expect(state.triggerEvidence[0]?.evidence).toEqual(
      expect.arrayContaining([sourceEvidence, secondEvidence]),
    );
    expect(
      new Set(state.triggerEvidence[0]?.evidence.map((item) => JSON.stringify(item))).size,
    ).toBe(2);
  });

  it.each([
    [
      "task type",
      {
        taskType: "approve_buyer_question_set" as const,
        completionRule: { required: ["artifact", "confirmation"] },
      },
    ],
    ["title", { title: "A different title" }],
    ["reason", { reason: "A different reason" }],
    [
      "completion rule",
      { completionRule: { required: ["source", "confirmation"], reviewerRole: "different" } },
    ],
  ])("rejects a conflicting duplicate %s", async (_label, override) => {
    const adapter: WorkOpportunitySource = {
      sourceKey: "facts",
      collect: vi.fn(async () => [opportunity(), opportunity(override)]),
    };
    const { repository } = createRepository();

    await expect(reconcileInput(repository, ACTOR, BRAND_ID, [adapter])).rejects.toThrow(
      /conflicting work opportunities/i,
    );
    expect(repository.createTaskWithTriggerEvidence).not.toHaveBeenCalled();
  });

  it("keeps source evidence immutable while attaching cloned trigger evidence", async () => {
    const original = opportunity();
    const adapter: WorkOpportunitySource = {
      sourceKey: "facts",
      collect: vi.fn(async () => [original]),
    };
    const before = structuredClone(original);
    const { repository, state } = createRepository();

    await reconcileInput(repository, ACTOR, BRAND_ID, [adapter]);

    expect(original).toEqual(before);
    expect(state.triggerEvidence[0]?.evidence).toEqual([sourceEvidence]);
    expect(state.triggerEvidence[0]?.evidence[0]).not.toBe(sourceEvidence);
  });
});
