import { describe, expect, it, vi } from "vitest";
import type { BrandPrompt, CitationRun, PromptGeneration } from "@shared/schema";
import { createRequestActor } from "../../server/lib/requestActor";
import {
  buildBaselineOpportunity,
  createBaselineOpportunitySource,
  registerBaselineOpportunitySource,
  type BaselineObservation,
  type BaselineOpportunityReader,
} from "../../server/services/work/sources/baselineOpportunities";
import {
  createActorBoundBaselineReader,
  registerProductionBaselineOpportunitySource,
} from "../../server/services/work/sources/productionBaselineOpportunities";
import { createOpportunityReconciler } from "../../server/services/work/OpportunityReconciler";
import type { db } from "../../server/db";
import type { WorkTaskView } from "../../server/storage/workStorage";

const ACTOR = createRequestActor("11111111-1111-4111-8111-111111111111");
const BRAND = { id: "brand-a", userId: ACTOR.userId };

type PromptReaderRow = Pick<
  BrandPrompt,
  "id" | "brandId" | "generationId" | "prompt" | "status" | "paused" | "region"
>;
type GenerationReaderRow = Pick<
  PromptGeneration,
  "id" | "brandId" | "generationNumber" | "createdAt"
>;
type RunReaderRow = Pick<
  CitationRun,
  "id" | "brandId" | "startedAt" | "completedAt" | "status" | "platformBreakdown"
>;

const generation: GenerationReaderRow = {
  id: "generation-3",
  brandId: BRAND.id,
  generationNumber: 3,
  createdAt: new Date("2026-09-07T00:00:00.000Z"),
};

const prompts: PromptReaderRow[] = [
  {
    id: "prompt-1",
    brandId: BRAND.id,
    generationId: generation.id,
    prompt: "Which workflow tool should a small team choose?",
    status: "tracked",
    paused: false,
    region: "global",
  },
  {
    id: "prompt-2",
    brandId: BRAND.id,
    generationId: generation.id,
    prompt: "Which workflow tool has the best onboarding?",
    status: "tracked",
    paused: false,
    region: "global",
  },
];

const run: RunReaderRow = {
  id: "run-1",
  brandId: BRAND.id,
  startedAt: new Date("2026-09-08T10:00:00.000Z"),
  completedAt: new Date("2026-09-08T10:05:00.000Z"),
  status: "succeeded",
  platformBreakdown: {
    ChatGPT: { checks: 2, cited: 1, rate: 50 },
    Perplexity: { checks: 2, cited: 0, rate: 0 },
  },
};

function ranking(
  id: string,
  prompt: PromptReaderRow,
  aiPlatform: string,
  outcome: BaselineObservation["outcome"],
  isCited: 0 | 1,
): BaselineObservation {
  return {
    id,
    brandId: BRAND.id,
    brandPromptId: prompt.id,
    runId: run.id,
    aiPlatform,
    prompt: prompt.prompt,
    isCited,
    checkedAt: run.completedAt!,
    outcome,
  };
}

const rankings: BaselineObservation[] = [
  ranking("ranking-1", prompts[0]!, "ChatGPT", "successful", 1),
  ranking("ranking-2", prompts[1]!, "ChatGPT", "successful", 0),
  ranking("ranking-3", prompts[0]!, "Perplexity", "unavailable", 0),
  ranking("ranking-4", prompts[1]!, "Perplexity", "failed", 0),
];

const baseInput = {
  actor: ACTOR,
  brand: BRAND,
  generation,
  prompts,
  run,
  rankings,
};

function input(overrides: Partial<typeof baseInput> = {}) {
  return { ...baseInput, ...overrides };
}

describe("baseline work opportunities", () => {
  it("registers the actor-scoped baseline source with the reconciler", async () => {
    const reconcile = vi.fn(async () => []);
    const registration = registerBaselineOpportunitySource({
      reconciler: { reconcile },
      reader: {} as BaselineOpportunityReader,
    });

    await registration.reconcile({ actor: ACTOR, brandId: BRAND.id });

    expect(registration.source.sourceKey).toBe("baseline");
    expect(reconcile).toHaveBeenCalledWith({
      actor: ACTOR,
      brandId: BRAND.id,
      sources: [registration.source],
    });
  });

  it("registers the baseline source at the production entry and creates a task", async () => {
    const database = databaseWithBaselineRows();
    const task = {
      id: "task-1",
      brandId: BRAND.id,
      goalId: null,
      taskKey: "baseline:run-1",
      taskVersion: 1,
      taskType: "establish_measurement_baseline",
      state: "suggested",
      revision: 0,
      title: "Establish the AI visibility baseline",
      desiredResult: "Establish the AI visibility baseline",
      buyerNeed: null,
      recommendedChange: "A measured baseline is ready.",
      reason: "A measured baseline is ready.",
      confidence: null,
      effort: null,
      points: 0,
      completionRule: { required: ["measurement"] },
      measurementScope: null,
      nextCheckAt: null,
      blockedReason: null,
      dismissalReason: null,
      createdAt: new Date("2026-09-08T10:06:00.000Z"),
      updatedAt: new Date("2026-09-08T10:06:00.000Z"),
      owner: null,
    } as unknown as WorkTaskView;
    const createTaskWithTriggerEvidence = vi.fn(async () => ({ task, created: true }));
    const repository = {
      listTasks: vi.fn(async () => []),
      createTaskWithTriggerEvidence,
      getTask: vi.fn(async () => undefined),
      transitionTask: vi.fn(async () => ({ kind: "not_found" as const })),
    };
    const reconciler = createOpportunityReconciler({
      repository: repository as never,
    });

    const registration = registerProductionBaselineOpportunitySource({
      reconciler,
      database,
      actor: ACTOR,
    });
    const tasks = await registration.reconcile({ actor: ACTOR, brandId: BRAND.id });

    expect(tasks).toEqual([task]);
    expect(createTaskWithTriggerEvidence).toHaveBeenCalledWith(
      BRAND.id,
      expect.objectContaining({
        taskKey: "baseline:run-1",
        taskType: "establish_measurement_baseline",
      }),
      expect.arrayContaining([expect.objectContaining({ kind: "measurement" })]),
    );
  });

  it("returns no baseline for a foreign actor before the restricted reader starts", async () => {
    const transaction = vi.fn();
    const database = { transaction } as unknown as typeof db;
    const reader = createActorBoundBaselineReader({ database, actor: ACTOR });
    const source = createBaselineOpportunitySource(reader);
    const foreignActor = createRequestActor("22222222-2222-4222-8222-222222222222");

    await expect(source.collect({ actor: foreignActor, brandId: BRAND.id })).resolves.toEqual([]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("freezes actor, brand, prompt generation, provider scope, and collection dates", () => {
    const opportunity = buildBaselineOpportunity(input());
    const measurement = opportunity.evidence.find((item) => item.kind === "measurement");

    expect(opportunity).toMatchObject({
      taskKey: "baseline:run-1",
      taskType: "establish_measurement_baseline",
      ruleVersion: 1,
    });
    expect(measurement).toMatchObject({
      kind: "measurement",
      measurementId: "run-1",
      geoRankingId: "ranking-1",
      citationRunId: "run-1",
      scopeId: "brand-a:baseline",
      provider: "ChatGPT,Perplexity",
      promptVersion: "generation-3",
      promptGenerationId: "generation-3",
      startedAt: "2026-09-08T10:00:00.000Z",
      endedAt: "2026-09-08T10:05:00.000Z",
    });
    expect(opportunity.completionRule).toMatchObject({
      promptGenerationId: "generation-3",
      promptGenerationNumber: 3,
      providerScope: ["ChatGPT", "Perplexity"],
    });
  });

  it("stores honest coverage and excludes unavailable or failed rows from the rate", () => {
    const opportunity = buildBaselineOpportunity(input());
    const measurement = opportunity.evidence.find((item) => item.kind === "measurement");

    expect(measurement?.coverage).toContain("attempted=4");
    expect(measurement?.coverage).toContain("successful=2");
    expect(measurement?.coverage).toContain("unavailable=1");
    expect(measurement?.coverage).toContain("failed=1");
    expect(measurement?.coverage).toContain("denominator=2");
    expect(measurement?.coverage).toContain("citationRate=50");
  });

  it.each([
    ["foreign actor", { brand: { id: BRAND.id, userId: "22222222-2222-4222-8222-222222222222" } }],
    ["foreign generation", { generation: { ...generation, brandId: "brand-b" } }],
    [
      "mixed prompt generation",
      { prompts: [{ ...prompts[0]!, generationId: "generation-4" }, prompts[1]!] },
    ],
    ["foreign run", { run: { ...run, brandId: "brand-b" } }],
    ["missing completion date", { run: { ...run, completedAt: null } }],
    ["invalid run state", { run: { ...run, status: "running" } }],
    ["partial run", { run: { ...run, status: "partial" } }],
  ])("rejects %s", (_name, overrides) => {
    expect(() => buildBaselineOpportunity(input(overrides))).toThrow(/baseline/i);
  });
});

function databaseWithBaselineRows(): typeof db {
  const rowsByRead = [
    [{ id: BRAND.id, userId: ACTOR.userId }],
    [generation],
    [prompts[0]!],
    [run],
    [
      {
        id: "ranking-1",
        brandId: BRAND.id,
        brandPromptId: prompts[0]!.id,
        runId: run.id,
        aiPlatform: "ChatGPT",
        prompt: prompts[0]!.prompt,
        isCited: 1,
        checkedAt: run.completedAt!,
        metadata: { outcome: "successful" },
      },
    ],
  ];
  let executeCount = 0;
  const execute = vi.fn(async () => {
    executeCount += 1;
    if (executeCount % 4 !== 0) return { rows: [] };
    return { rows: rowsByRead[executeCount / 4 - 1] ?? [] };
  });
  const transaction = vi.fn(async (callback: (value: unknown) => unknown) => callback({ execute }));
  return { transaction } as unknown as typeof db;
}
