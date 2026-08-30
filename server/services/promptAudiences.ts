// Business logic for prompt audiences: score aggregation for the audiences
// list, the AI-generation cooldown, and the duplicate-name guard on create.
//
// Extracted verbatim from server/routes/prompts.ts as part of the B6b
// service-layer split.

import { storage } from "../storage";
import { generatePromptAudiences } from "../lib/audienceGenerator";
import { buildPromptScoreHistory, resolvePoints } from "../lib/promptScoreHistory";
import { AUDIENCE_GENERATION_COOLDOWN_MS } from "@shared/constants";
import type { Brand, PromptAudience } from "@shared/schema";

// Coverage/score/trend are computed from real member-prompt data, never
// fabricated: score history is joined in here so the client doesn't need a
// second round trip per audience.
export async function listPromptAudiencesWithScores(brand: Brand) {
  const [audiences, counts, map] = await Promise.all([
    storage.getPromptAudiencesByBrandId(brand.id),
    storage.getPromptAudienceCounts(brand.id),
    storage.getPromptAudienceMapByBrandId(brand.id),
  ]);
  const allPrompts = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
  const promptIds = allPrompts.map((p) => p.id);
  const rankings = await storage.getGeoRankingsByBrandPromptIds(promptIds);
  const history = buildPromptScoreHistory(promptIds, rankings, resolvePoints(undefined));
  const historyByPromptId = new Map(history.map((h) => [h.promptId, h]));

  return audiences.map((a) => {
    const memberIds = Object.entries(map)
      .filter(([, audienceIds]) => audienceIds.includes(a.id))
      .map(([promptId]) => promptId);
    const scores = memberIds
      .map((id) => historyByPromptId.get(id)?.score)
      .filter((s): s is number => typeof s === "number");
    const score =
      scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;
    return {
      ...a,
      promptCount: counts[a.id] ?? 0,
      score,
    };
  });
}

export type GenerateAudiencesResult =
  | { outcome: "cooldown"; retryAfterSeconds: number }
  | { outcome: "upstream_error"; error: string }
  | { outcome: "ok"; data: PromptAudience[] };

// AI-generate audiences from the tracked prompt set. Cost safeguard mirrors
// PERCEPTION_COOLDOWN_MS (server/routes/dashboard.ts): the underlying
// evidence only changes when prompts are edited or a new citation run
// lands, so re-generating sooner just reproduces the same grouping for
// another LLM call.
export async function generatePromptAudiencesForBrand(
  brand: Brand,
): Promise<GenerateAudiencesResult> {
  const lastAi = await storage.getLatestAiAudienceCreatedAt(brand.id);
  if (lastAi) {
    const ageMs = Date.now() - lastAi.getTime();
    if (ageMs < AUDIENCE_GENERATION_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((AUDIENCE_GENERATION_COOLDOWN_MS - ageMs) / 1000);
      return { outcome: "cooldown", retryAfterSeconds: retryAfterSec };
    }
  }

  const result = await generatePromptAudiences(brand.id);
  if (result.error && result.saved.length === 0) {
    return { outcome: "upstream_error", error: result.error };
  }
  return { outcome: "ok", data: result.saved };
}

export type CreatePromptAudienceInput = {
  name: string;
  description: string | null;
  funnelStage: "TOFU" | "MOFU" | "BOFU" | null;
};

export type CreatePromptAudienceResult =
  { outcome: "duplicate" } | { outcome: "created"; data: PromptAudience };

export async function createPromptAudience(
  brand: Brand,
  input: CreatePromptAudienceInput,
): Promise<CreatePromptAudienceResult> {
  const existing = await storage.getPromptAudiencesByBrandId(brand.id);
  if (existing.some((a) => a.name.toLowerCase() === input.name.toLowerCase())) {
    return { outcome: "duplicate" };
  }
  const audience = await storage.createPromptAudience({
    brandId: brand.id,
    name: input.name,
    description: input.description,
    funnelStage: input.funnelStage,
    generatedBy: "manual",
  });
  return { outcome: "created", data: audience };
}
