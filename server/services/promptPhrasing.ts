// Business logic for prompt phrasing exploration: generating alternate
// phrasings for a tracked prompt and running the per-platform citation
// check against one phrasing.
//
// Extracted verbatim from server/routes/prompts.ts as part of the B6b
// service-layer split. Phrasings are deliberately NOT written into
// geo_rankings (see migration 0099's comment), so these never affect the
// tracked prompt's own Score/Delta/sparkline.

import { storage } from "../storage";
import { generatePhrasings } from "../lib/phrasingGenerator";
import { DEFAULT_CITATION_PLATFORMS, runPlatformCitationCheck } from "../citationChecker";
import type { Brand, BrandPrompt, PromptPhrasingTest } from "@shared/schema";

export type GeneratePhrasingsResult =
  { outcome: "upstream_error" } | { outcome: "ok"; data: PromptPhrasingTest[] };

export async function generatePhrasingsForPrompt(
  brand: Brand,
  prompt: BrandPrompt,
): Promise<GeneratePhrasingsResult> {
  const generated = await generatePhrasings(brand, prompt.prompt);
  if (generated.length === 0) {
    return { outcome: "upstream_error" };
  }
  const saved = await Promise.all(
    generated.map((p) =>
      storage.createPhrasingTest({
        brandPromptId: prompt.id,
        phrasing: p.text,
        rationale: p.rationale,
      }),
    ),
  );
  return { outcome: "ok", data: saved };
}

// Runs one citation check per platform (6 in parallel) for one phrasing.
export async function analyzePhrasing(brand: Brand, userId: string, test: PromptPhrasingTest) {
  const nameVariations = Array.isArray(brand.nameVariations)
    ? (brand.nameVariations as string[])
    : [];
  const results = await Promise.all(
    DEFAULT_CITATION_PLATFORMS.map(async (platform) => {
      try {
        const r = await runPlatformCitationCheck(
          platform,
          test.phrasing,
          brand,
          brand.name,
          nameVariations,
          brand.website ?? undefined,
          userId,
        );
        return {
          platform,
          isCited: r.isCited,
          rank: r.rank,
          relevance: r.relevance,
        };
      } catch (err: any) {
        return { platform, isCited: false, rank: null, relevance: null, error: err?.message };
      }
    }),
  );

  return storage.setPhrasingTestResults(test.id, results);
}
