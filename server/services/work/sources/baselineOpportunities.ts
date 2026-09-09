import type { BrandPrompt, CitationRun, GeoRanking, PromptGeneration } from "@shared/schema";
import type { EvidenceReference } from "@shared/work";
import type { RequestActor } from "../../../lib/requestActor";
import {
  calculateVisibilityCoverage,
  classifyLegacyStoredObservationOutcome,
  toVisibilityObservation,
  type ObservationOutcome,
  type VisibilityObservation,
} from "../../visibilityCoverage";
import type { WorkOpportunity, WorkOpportunitySource } from "../../../domains/work/opportunities";
import type { OpportunityReconciler } from "../OpportunityReconciler";

export type BaselineBrand = {
  readonly id: string;
  readonly userId: string;
};

export type BaselinePrompt = Pick<
  BrandPrompt,
  "id" | "brandId" | "generationId" | "prompt" | "status" | "paused" | "region"
>;

export type BaselineGeneration = Pick<
  PromptGeneration,
  "id" | "brandId" | "generationNumber" | "createdAt"
>;

export type BaselineRun = Pick<
  CitationRun,
  "id" | "brandId" | "startedAt" | "completedAt" | "status"
>;

export type BaselineRanking = Pick<
  GeoRanking,
  | "id"
  | "brandId"
  | "brandPromptId"
  | "runId"
  | "aiPlatform"
  | "prompt"
  | "isCited"
  | "checkedAt"
  | "metadata"
>;

export type BaselineObservation = Omit<VisibilityObservation, "isCited"> & {
  readonly isCited: 0 | 1;
  readonly outcome: ObservationOutcome;
};

export type BaselineOpportunityInput = {
  readonly actor: RequestActor;
  readonly brand: BaselineBrand;
  readonly generation: BaselineGeneration;
  readonly prompts: readonly BaselinePrompt[];
  readonly run: BaselineRun;
  readonly rankings: readonly BaselineObservation[];
};

export type BaselineOpportunityReader = {
  readonly getBrandByIdForUser: (
    brandId: string,
    userId: string,
  ) => Promise<BaselineBrand | undefined>;
  readonly getPromptGenerationsByBrandId: (
    brandId: string,
  ) => Promise<readonly BaselineGeneration[]>;
  readonly getBrandPromptsByBrandId: (brandId: string) => Promise<readonly BaselinePrompt[]>;
  readonly getCitationRunsByBrandId: (brandId: string) => Promise<readonly BaselineRun[]>;
  readonly getGeoRankingsByRunId: (
    runId: string,
    brandId: string,
  ) => Promise<readonly BaselineRanking[]>;
};

export type BaselineOpportunityRegistration = {
  readonly source: WorkOpportunitySource;
  reconcile(input: {
    actor: RequestActor;
    brandId: string;
  }): ReturnType<OpportunityReconciler["reconcile"]>;
};

function fail(message: string): never {
  throw new Error(`Invalid baseline: ${message}`);
}

function requireText(value: string | null | undefined, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${field} is required`);
  return value.trim();
}

function isoDate(value: Date | null | undefined, field: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail(`${field} is invalid`);
  return value.toISOString();
}

function normalizeObservation(row: BaselineObservation): VisibilityObservation {
  return {
    id: requireText(row.id, "ranking id"),
    brandId: requireText(row.brandId, "ranking brandId"),
    brandPromptId: requireText(row.brandPromptId, "ranking brandPromptId"),
    runId: requireText(row.runId, "ranking runId"),
    promptGenerationId: row.promptGenerationId,
    aiPlatform: requireText(row.aiPlatform, "ranking provider"),
    prompt: requireText(row.prompt, "ranking prompt"),
    isCited: row.isCited === 1,
    checkedAt: row.checkedAt,
    outcome: row.outcome,
  };
}

function coverageText(
  coverage: ReturnType<typeof calculateVisibilityCoverage>,
  providers: readonly string[],
  promptCount: number,
): string {
  return [
    `attempted=${coverage.counts.attempted}`,
    `successful=${coverage.counts.successful}`,
    `unavailable=${coverage.counts.unavailable}`,
    `failed=${coverage.counts.failed}`,
    `denominator=${coverage.denominator}`,
    `citationRate=${coverage.citationRate}`,
    `prompts=${promptCount}`,
    `providers=${providers.join(",")}`,
  ].join("; ");
}

function sortedProviders(observations: readonly VisibilityObservation[]): string[] {
  return [...new Set(observations.map((observation) => observation.aiPlatform))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function toBaselineObservation(
  row: BaselineRanking,
  promptGenerationId: string,
): BaselineObservation | null {
  const observation = toVisibilityObservation(row, {
    legacyOutcome: classifyLegacyStoredObservationOutcome(row),
  });
  if (!observation) return null;
  return {
    ...observation,
    promptGenerationId,
    isCited: observation.isCited ? 1 : 0,
  };
}

/**
 * Build the production source from actor-scoped reads.
 *
 * The source selects the newest prompt generation and newest complete run
 * with successful observations. It returns no task when the run is unusable.
 */
export function createBaselineOpportunitySource(
  reader: BaselineOpportunityReader,
): WorkOpportunitySource {
  return {
    sourceKey: "baseline",
    async collect({ actor, brandId }) {
      const brand = await reader.getBrandByIdForUser(brandId, actor.userId);
      if (!brand) return [];

      const generation = (await reader.getPromptGenerationsByBrandId(brandId))
        .filter((item) => item.brandId === brandId)
        .sort(
          (left, right) =>
            right.createdAt.getTime() - left.createdAt.getTime() || left.id.localeCompare(right.id),
        )[0];
      if (!generation) return [];

      const prompts = (await reader.getBrandPromptsByBrandId(brandId)).filter(
        (prompt) =>
          prompt.brandId === brandId &&
          prompt.generationId === generation.id &&
          prompt.status === "tracked" &&
          !prompt.paused,
      );
      if (prompts.length === 0) return [];
      const promptIds = new Set(prompts.map((prompt) => prompt.id));

      const runs = (await reader.getCitationRunsByBrandId(brandId))
        .filter((run) => run.brandId === brandId && run.status === "succeeded" && run.completedAt)
        .sort(
          (left, right) =>
            (right.completedAt as Date).getTime() - (left.completedAt as Date).getTime() ||
            left.id.localeCompare(right.id),
        );

      for (const run of runs) {
        const rankings = (await reader.getGeoRankingsByRunId(run.id, brandId))
          .filter(
            (ranking) =>
              ranking.brandId === brandId &&
              ranking.runId === run.id &&
              ranking.brandPromptId !== null &&
              promptIds.has(ranking.brandPromptId),
          )
          .map((ranking) => toBaselineObservation(ranking, generation.id))
          .filter((ranking): ranking is BaselineObservation => ranking !== null);

        if (rankings.length === 0) continue;
        try {
          return [
            buildBaselineOpportunity({
              actor,
              brand: { id: brand.id, userId: actor.userId },
              generation,
              prompts,
              run,
              rankings,
            }),
          ];
        } catch {
          // A complete run with no successful observations cannot establish
          // a baseline. Try the next complete run before returning nothing.
        }
      }

      return [];
    },
  };
}

/**
 * Register the baseline source with the production reconciler.
 *
 * The caller supplies the actor-bound reconciler and the actor-scoped reader.
 */
export function registerBaselineOpportunitySource({
  reconciler,
  reader,
}: {
  reconciler: Pick<OpportunityReconciler, "reconcile">;
  reader: BaselineOpportunityReader;
}): BaselineOpportunityRegistration {
  const source = createBaselineOpportunitySource(reader);
  return {
    source,
    reconcile: ({ actor, brandId }) => reconciler.reconcile({ actor, brandId, sources: [source] }),
  };
}

export function buildBaselineOpportunity(input: BaselineOpportunityInput): WorkOpportunity {
  const brandId = requireText(input.brand.id, "brand id");
  if (input.actor.userId !== input.brand.userId) fail("actor does not own the brand");
  if (input.generation.brandId !== brandId) fail("prompt generation belongs to another brand");
  if (
    !Number.isInteger(input.generation.generationNumber) ||
    input.generation.generationNumber < 1
  ) {
    fail("prompt generation version is invalid");
  }
  requireText(input.generation.id, "prompt generation id");
  isoDate(input.generation.createdAt, "prompt generation date");

  if (input.run.brandId !== brandId) fail("citation run belongs to another brand");
  if (input.run.status !== "succeeded") fail("citation run is not complete");
  const startedAt = isoDate(input.run.startedAt, "citation run start date");
  const endedAt = isoDate(input.run.completedAt, "citation run completion date");
  if (new Date(endedAt).getTime() < new Date(startedAt).getTime()) {
    fail("citation run dates are out of order");
  }

  const promptById = new Map<string, BaselinePrompt>();
  for (const prompt of input.prompts) {
    const promptId = requireText(prompt.id, "prompt id");
    if (promptById.has(promptId)) fail("prompt set contains a duplicate prompt");
    if (prompt.brandId !== brandId) fail("prompt belongs to another brand");
    if (prompt.generationId !== input.generation.id) fail("prompt set mixes generations");
    if (prompt.status !== "tracked" || prompt.paused)
      fail("prompt set contains a non-runnable prompt");
    requireText(prompt.prompt, "prompt text");
    requireText(prompt.region, "prompt region");
    promptById.set(promptId, prompt);
  }
  if (promptById.size === 0) fail("prompt set is empty");

  const observations = input.rankings.map((ranking) => {
    const observation = normalizeObservation(ranking);
    if (observation.brandId !== brandId) fail("ranking belongs to another brand");
    if (observation.runId !== input.run.id) fail("ranking belongs to another citation run");
    const prompt = promptById.get(observation.brandPromptId!);
    if (!prompt) fail("ranking belongs to another prompt set");
    if (
      observation.promptGenerationId !== undefined &&
      observation.promptGenerationId !== null &&
      observation.promptGenerationId !== input.generation.id
    ) {
      fail("ranking belongs to another prompt generation");
    }
    if (observation.checkedAt.getTime() < input.run.startedAt.getTime()) {
      fail("ranking predates the citation run");
    }
    if (observation.checkedAt.getTime() > input.run.completedAt!.getTime()) {
      fail("ranking follows the citation run");
    }
    return observation;
  });
  if (observations.length === 0) fail("citation run has no observations");

  const coverage = calculateVisibilityCoverage(observations);
  if (coverage.counts.successful === 0) {
    fail("citation run has no successful observations");
  }
  const providers = sortedProviders(coverage.observations);
  const successfulObservation = coverage.observations.find(
    (observation) => observation.outcome === "successful",
  );
  if (!successfulObservation) fail("citation run has no successful observations");

  const coverageSummary = coverageText(coverage, providers, promptById.size);
  const measurement: Extract<EvidenceReference, { kind: "measurement" }> = {
    kind: "measurement",
    label: "Measured baseline for the runnable prompt set",
    measurementId: input.run.id,
    geoRankingId: successfulObservation.id,
    citationRunId: input.run.id,
    brandPromptId: successfulObservation.brandPromptId ?? undefined,
    promptGenerationId: input.generation.id,
    scopeId: `${brandId}:baseline`,
    provider: providers.join(","),
    promptVersion: `generation-${input.generation.generationNumber}`,
    startedAt,
    endedAt,
    coverage: coverageSummary,
  };

  return {
    taskKey: `baseline:${input.run.id}`,
    taskType: "establish_measurement_baseline",
    ruleVersion: 1,
    title: "Establish the AI visibility baseline",
    reason: `The ${input.generation.id} prompt generation has a completed citation measurement for ${providers.join(", ")}.`,
    completionRule: {
      required: ["measurement"],
      promptGenerationId: input.generation.id,
      promptGenerationNumber: input.generation.generationNumber,
      providerScope: providers,
      coverageCounts: coverage.counts,
      denominator: coverage.denominator,
    },
    evidence: [measurement],
  };
}
