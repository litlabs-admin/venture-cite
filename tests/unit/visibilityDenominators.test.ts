import { describe, expect, it } from "vitest";
import {
  computeCoverageCounts,
  computeVisibilityDenominator,
  computeVisibilityRate,
  classifyLegacyStoredObservationOutcome,
  dedupeVisibilityObservations,
  toVisibilityObservation,
  type VisibilityObservation,
} from "../../server/services/visibilityCoverage";

const BRAND_ID = "brand-a";
const PROMPT = "Which workflow tool should a small team choose?";

function observation(
  id: string,
  promptId: string,
  provider: string,
  outcome: VisibilityObservation["outcome"],
  isCited = false,
  checkedAt = "2026-09-08T10:05:00.000Z",
): VisibilityObservation {
  return {
    id,
    brandId: BRAND_ID,
    brandPromptId: promptId,
    runId: "run-1",
    aiPlatform: provider,
    prompt: PROMPT,
    isCited,
    checkedAt: new Date(checkedAt),
    outcome,
  };
}

const rows: VisibilityObservation[] = [
  observation("ranking-1", "prompt-1", "ChatGPT", "successful", true),
  observation("ranking-2", "prompt-2", "ChatGPT", "successful"),
  observation("ranking-3", "prompt-1", "Perplexity", "unavailable"),
  observation("ranking-4", "prompt-2", "Perplexity", "failed"),
];

describe("visibility denominators", () => {
  it("counts unique attempted observations with distinct structured outcomes", () => {
    expect(computeCoverageCounts(rows)).toEqual({
      attempted: 4,
      successful: 2,
      unavailable: 1,
      failed: 1,
    });
  });

  it("uses successful observations as the denominator", () => {
    const counts = computeCoverageCounts(rows);

    expect(computeVisibilityDenominator(counts)).toBe(2);
    expect(computeVisibilityRate(1, counts)).toBe(50);
  });

  it("returns unknown when no successful observation exists", () => {
    const counts = { attempted: 2, successful: 0, unavailable: 1, failed: 1 } as const;

    expect(computeVisibilityDenominator(counts)).toBe(0);
    expect(computeVisibilityRate(0, counts)).toBe("unknown");
  });

  it("keeps only the latest observation for a prompt and provider", () => {
    const latest = dedupeVisibilityObservations([
      observation("old", "prompt-1", "ChatGPT", "successful", true, "2026-09-07T10:00:00.000Z"),
      observation("new", "prompt-1", "ChatGPT", "unavailable", false, "2026-09-08T10:00:00.000Z"),
      observation("other", "prompt-1", "Perplexity", "successful", true),
    ]);

    expect(latest).toEqual([
      expect.objectContaining({ id: "new", brandPromptId: "prompt-1", aiPlatform: "ChatGPT" }),
      expect.objectContaining({ id: "other", brandPromptId: "prompt-1", aiPlatform: "Perplexity" }),
    ]);
  });

  it("does not treat a missing outcome as successful without compatibility opt-in", () => {
    const legacyRow = {
      id: "legacy",
      brandId: BRAND_ID,
      brandPromptId: "prompt-1",
      runId: "run-1",
      aiPlatform: "ChatGPT",
      prompt: PROMPT,
      isCited: 1,
      checkedAt: new Date("2026-09-08T10:05:00.000Z"),
      metadata: null,
    };

    expect(toVisibilityObservation(legacyRow)).toBeNull();
    expect(classifyLegacyStoredObservationOutcome(legacyRow)).toBe("unavailable");
  });
});
