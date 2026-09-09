import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// The two reads Diagnostics needs, and nothing else.
//
// QUERY KEYS ARE NAMESPACED `["v2", ...]`, for the reason `workSummary.ts`
// gives: the query client is a singleton shared with the live dashboard, so a
// key shaped like the live app's would let an invalidation from this tree
// re-render the live dashboard, and the default queryFn would try to build a
// URL out of the key.
//
// TWO ENDPOINTS, BECAUSE NEITHER ALONE CARRIES THE SCREEN:
//   GET /api/brand-prompts/:brandId
//       whole `brand_prompts` rows - the only place `category` and
//       `funnelStage` (the question's intent) exist.
//   GET /api/brand-prompts/:brandId/results
//       the latest geo_rankings row per (prompt, platform), already split
//       into snippet + full response by `splitCitationContext`.
//
// WHAT IS DELIBERATELY NOT CALLED. `GET .../prompts/:promptId/diagnose` also
// exists and would look like the obvious fit for a screen called Diagnostics.
// It asks a model for a verdict and a set of fixes. This screen's product
// requirement is the opposite of a verdict - it must not assert a cause it has
// not proven - so an LLM opinion rendered as a diagnosis is precisely what it
// must not show. Every value on this screen is counted from stored rows.

/** A `brand_prompts` row as `GET /api/brand-prompts/:brandId` returns it.
 *  Only the columns this screen reads are declared. */
export type BrandPromptView = {
  id: string;
  brandId: string;
  prompt: string;
  rationale: string | null;
  orderIndex: number;
  status: string;
  /** Nullable in the schema. The board prints "Comparison intent"; a prompt
   *  with no category prints no intent rather than a guessed one. */
  category: string | null;
  funnelStage: string | null;
  paused: boolean;
  createdAt: string;
};

/**
 * One model's answer to one question - the latest row for that pair.
 *
 * `snippet` is the status line citationChecker stored ahead of
 * `RAW_RESPONSE_DELIMITER`. For a call that never returned it is the
 * "Check failed: …" line, which is the ONLY recorded difference between a
 * failure and an honest "answered, did not mention the brand". See
 * `@shared/citationFailure`.
 *
 * `isCited` is `is_cited === 1`. On a failed row it is false, and that false
 * means nothing at all - it must never be counted.
 */
export type PromptAnswerView = {
  platform: string;
  isCited: boolean;
  rank: number | null;
  snippet: string | null;
  fullResponse: string | null;
  /** ISO - `res.json` serialises the Date column. */
  checkedAt: string;
  reDetectedAt: string | null;
  citingOutletUrl: string | null;
  citingOutletName: string | null;
  citedUrls: string[];
  sourceType: string | null;
};

export type PromptResultView = {
  promptId: string;
  prompt: string;
  rationale: string | null;
  platforms: PromptAnswerView[];
  reportCount: number;
  lastCheckedAt: string | null;
};

/**
 * `buildBrandPromptResults`'s envelope.
 *
 * `sourceCounts` and `brandDomain` are OPTIONAL because the zero-prompt early
 * return in `server/services/citationResults.ts` omits them. Typing them as
 * present would make a brand with no questions read `undefined.something`.
 */
export type PromptResultsView = {
  byPrompt: PromptResultView[];
  byPlatform: { platform: string; cited: number; checks: number; citationRate: number }[];
  totalChecks: number;
  totalCited: number;
  citationRate: number;
  sourceCounts?: Record<string, number>;
  brandDomain?: string | null;
};

async function readData<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

/** The brand's tracked questions. `[]` is a real answer - a brand whose
 *  question set has not been approved yet returns it with a 200. */
export function useBrandPrompts(brandId: string | undefined) {
  return useQuery<BrandPromptView[]>({
    queryKey: ["v2", "diagnostics", "prompts", brandId],
    enabled: Boolean(brandId),
    // The screen renders its own error block, so the global query toast would
    // report the same failure twice.
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<BrandPromptView[]>(`/api/brand-prompts/${encodeURIComponent(brandId!)}`),
  });
}

/** Every stored answer, latest per (question, model). An empty `byPrompt` is
 *  "never measured", not "measured and found nothing". */
export function usePromptResults(brandId: string | undefined) {
  return useQuery<PromptResultsView>({
    queryKey: ["v2", "diagnostics", "results", brandId],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<PromptResultsView>(`/api/brand-prompts/${encodeURIComponent(brandId!)}/results`),
  });
}
