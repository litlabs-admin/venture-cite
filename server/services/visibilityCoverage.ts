import type { GeoRanking } from "@shared/schema";
import { citationRatePct } from "@shared/visibilityMetrics";

export const OBSERVATION_OUTCOMES = ["successful", "unavailable", "failed"] as const;

export type ObservationOutcome = (typeof OBSERVATION_OUTCOMES)[number];

export type VisibilityObservation = {
  readonly id: string;
  readonly brandId: string;
  readonly brandPromptId: string | null;
  readonly runId: string | null;
  readonly promptGenerationId?: string | null;
  readonly aiPlatform: string;
  readonly prompt: string;
  readonly isCited: boolean;
  readonly checkedAt: Date;
  readonly outcome: ObservationOutcome;
};

export type CoverageCounts = {
  readonly attempted: number;
  readonly successful: number;
  readonly unavailable: number;
  readonly failed: number;
};

export type VisibilityRate = number | "unknown";

export type VisibilityCoverage = {
  readonly observations: readonly VisibilityObservation[];
  readonly counts: CoverageCounts;
  readonly denominator: number;
  readonly cited: number;
  readonly citationRate: VisibilityRate;
};

export type VisibilityObservationRow = Pick<
  GeoRanking,
  | "id"
  | "brandId"
  | "brandPromptId"
  | "runId"
  | "aiPlatform"
  | "isCited"
  | "prompt"
  | "checkedAt"
  | "metadata"
> & {
  readonly outcome?: unknown;
  readonly promptGenerationId?: string | null;
};

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asObservationOutcome(value: unknown): ObservationOutcome | null {
  if (typeof value !== "string") return null;
  for (const outcome of OBSERVATION_OUTCOMES) {
    if (outcome === value) return outcome;
  }
  return null;
}

/**
 * Read an explicitly stored outcome.
 *
 * The citation context is deliberately ignored. Text cannot classify a
 * provider result reliably and can turn an error message into a metric.
 */
export function readStructuredObservationOutcome(
  row: Pick<VisibilityObservationRow, "outcome" | "metadata">,
): ObservationOutcome | null {
  const direct = asObservationOutcome(row.outcome);
  if (direct) return direct;
  if (!isRecord(row.metadata)) return null;
  return asObservationOutcome(row.metadata.outcome);
}

/**
 * Treat the old row shape as unavailable until a run writes a real status.
 * The old shape has no status field, so successful would corrupt the denominator.
 */
export function classifyLegacyStoredObservationOutcome(
  row: Pick<VisibilityObservationRow, "outcome" | "metadata">,
): ObservationOutcome | null {
  if (row.outcome !== undefined) return null;
  if (isRecord(row.metadata) && row.metadata.outcome !== undefined) return null;
  return "unavailable";
}

export function toVisibilityObservation(
  row: VisibilityObservationRow,
  options: { legacyOutcome?: ObservationOutcome | null } = {},
): VisibilityObservation | null {
  const structuredOutcome = readStructuredObservationOutcome(row);
  const outcome = structuredOutcome ?? options.legacyOutcome ?? null;
  if (!outcome) return null;

  return {
    id: row.id,
    brandId: row.brandId ?? "",
    brandPromptId: row.brandPromptId,
    runId: row.runId,
    promptGenerationId: row.promptGenerationId,
    aiPlatform: row.aiPlatform,
    prompt: row.prompt,
    isCited: row.isCited === 1,
    checkedAt: row.checkedAt,
    outcome,
  };
}

function observationKey(observation: VisibilityObservation): string {
  return [observation.brandId, observation.brandPromptId ?? "", observation.aiPlatform].join(
    "\u0000",
  );
}

function compareObservations(left: VisibilityObservation, right: VisibilityObservation): number {
  const promptOrder = (left.brandPromptId ?? "").localeCompare(right.brandPromptId ?? "");
  if (promptOrder !== 0) return promptOrder;
  const providerOrder = left.aiPlatform.localeCompare(right.aiPlatform);
  if (providerOrder !== 0) return providerOrder;
  const dateOrder = left.checkedAt.getTime() - right.checkedAt.getTime();
  if (dateOrder !== 0) return dateOrder;
  return left.id.localeCompare(right.id);
}

function isLaterObservation(
  candidate: VisibilityObservation,
  current: VisibilityObservation,
): boolean {
  const dateOrder = candidate.checkedAt.getTime() - current.checkedAt.getTime();
  if (dateOrder !== 0) return dateOrder > 0;
  return candidate.id.localeCompare(current.id) > 0;
}

/**
 * Collapse retries to one current observation per brand, prompt, and provider.
 * The output order stays stable when storage returns rows in another order.
 */
export function dedupeVisibilityObservations(
  observations: readonly VisibilityObservation[],
): VisibilityObservation[] {
  const latestByKey = new Map<string, VisibilityObservation>();
  for (const observation of observations) {
    const key = observationKey(observation);
    const current = latestByKey.get(key);
    if (!current || isLaterObservation(observation, current)) latestByKey.set(key, observation);
  }
  return [...latestByKey.values()].sort(compareObservations);
}

export function computeCoverageCounts(
  observations: readonly VisibilityObservation[],
): CoverageCounts {
  const unique = dedupeVisibilityObservations(observations);
  return unique.reduce<CoverageCounts>(
    (counts, observation) => ({
      attempted: counts.attempted + 1,
      successful: counts.successful + (observation.outcome === "successful" ? 1 : 0),
      unavailable: counts.unavailable + (observation.outcome === "unavailable" ? 1 : 0),
      failed: counts.failed + (observation.outcome === "failed" ? 1 : 0),
    }),
    { attempted: 0, successful: 0, unavailable: 0, failed: 0 },
  );
}

export function computeVisibilityDenominator(counts: CoverageCounts): number {
  return counts.successful;
}

export function computeVisibilityRate(cited: number, counts: CoverageCounts): VisibilityRate {
  const denominator = computeVisibilityDenominator(counts);
  return denominator > 0 ? citationRatePct(cited, denominator) : "unknown";
}

export function calculateVisibilityCoverage(
  observations: readonly VisibilityObservation[],
): VisibilityCoverage {
  const unique = dedupeVisibilityObservations(observations);
  const counts = computeCoverageCounts(unique);
  const successful = unique.filter((observation) => observation.outcome === "successful");
  const cited = successful.filter((observation) => observation.isCited).length;
  const denominator = computeVisibilityDenominator(counts);
  return {
    observations: unique,
    counts,
    denominator,
    cited,
    citationRate: computeVisibilityRate(cited, counts),
  };
}
