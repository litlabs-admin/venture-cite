// Business logic for shaping stored citation-check results: the per-run
// drill-down grouping and the brand-wide results aggregation.
//
// Extracted verbatim from server/routes/prompts.ts as part of the B6b
// service-layer split. No Express types - callers resolve `brand` via
// requireBrand (and the run via requireCitationRun) first and pass it in.

import { storage } from "../storage";
import {
  RAW_RESPONSE_DELIMITER,
  LEGACY_RAW_RESPONSE_DELIMITER,
  splitCitationContext,
} from "../lib/citationContextFormat";
import { extractDomain } from "../lib/brandMatcher";
import { citationRatePct } from "@shared/visibilityMetrics";
import type { Brand } from "@shared/schema";

// Drill-down into a specific citation run - returns per-prompt x
// per-platform results.
export async function buildRunDetails(brand: Brand, runId: string) {
  const rankings = await storage.getGeoRankingsByRunId(runId);

  // Build a prompt-text to orderIndex map so the result accordion is in
  // stable, user-meaningful order. With concurrency=5 in the runner,
  // rankings come back in arbitrary completion order; before this, the
  // user saw "5, 1, 7, 2, ..." with no consistent reading order. Prompts
  // no longer in the brand's set (deleted / archived) sort to the end via
  // MAX_SAFE_INTEGER.
  const allPrompts = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
  const orderIndexByText = new Map<string, number>();
  for (const p of allPrompts) {
    // First match wins - if a brand has two prompts with the same text
    // (rare but possible), we use the lowest orderIndex.
    if (!orderIndexByText.has(p.prompt)) {
      orderIndexByText.set(p.prompt, p.orderIndex);
    }
  }

  // Group by prompt text (since prompts may have been deleted/archived)
  const byPrompt = new Map<
    string,
    {
      prompt: string;
      platforms: Array<{
        platform: string;
        isCited: boolean;
        snippet: string | null;
        fullResponse: string | null;
        checkedAt: string;
        reDetectedAt: string | null;
      }>;
    }
  >();
  for (const r of rankings) {
    const key = r.prompt;
    if (!byPrompt.has(key)) {
      byPrompt.set(key, { prompt: key, platforms: [] });
    }
    const ctx = r.citationContext || "";
    const delimIdx = ctx.indexOf(RAW_RESPONSE_DELIMITER);
    const oldDelimIdx = ctx.indexOf(LEGACY_RAW_RESPONSE_DELIMITER);
    let snippet: string | null = null;
    let fullResponse: string | null = null;
    if (delimIdx !== -1) {
      snippet = ctx.substring(0, delimIdx).trim();
      fullResponse = ctx.substring(delimIdx + RAW_RESPONSE_DELIMITER.length).trim();
    } else if (oldDelimIdx !== -1) {
      snippet = ctx.substring(0, oldDelimIdx).trim();
      fullResponse = ctx.substring(oldDelimIdx + LEGACY_RAW_RESPONSE_DELIMITER.length).trim();
    } else if (ctx) {
      snippet = ctx;
    }
    byPrompt.get(key)!.platforms.push({
      platform: r.aiPlatform,
      isCited: r.isCited === 1,
      snippet,
      fullResponse,
      checkedAt: r.checkedAt?.toISOString() || new Date().toISOString(),
      reDetectedAt: (r as any).reDetectedAt
        ? ((r as any).reDetectedAt as Date).toISOString()
        : null,
    });
  }

  const sortedPrompts = Array.from(byPrompt.values()).sort((a, b) => {
    const ai = orderIndexByText.get(a.prompt) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndexByText.get(b.prompt) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  return { byPrompt: sortedPrompts };
}

// Real "Top Answers" per model, straight from data the citation check
// already computes: citationChecker.ts's per-response analyzer call
// (responseAnalyzer.ts) extracts EVERY brand an LLM response names - not
// just tracked competitors - with a 1-indexed rank when the response
// presented an ordered list, and stores the full list on the row itself
// (geo_rankings.mentioned_brands, migration 0100). Rows written before
// that column existed have mentionedBrands === null; those render an
// empty Top Answers list rather than a partial/fabricated one -
// re-running the check populates it.
function topAnswersFor(
  mentionedBrands: unknown,
  brandName: string,
): { name: string; isBrand: boolean }[] {
  if (!Array.isArray(mentionedBrands)) return [];
  const entries = mentionedBrands
    .filter(
      (b): b is { name: string; cited: boolean; rank: number | null } =>
        b && typeof b.name === "string" && b.cited === true,
    )
    .map((b) => ({
      name: b.name,
      isBrand: b.name.trim().toLowerCase() === brandName.trim().toLowerCase(),
      rank: typeof b.rank === "number" ? b.rank : null,
    }));
  // Ranked entries first (by rank ascending), then unranked ones in
  // whatever order the analyzer returned them - never inventing an order
  // the model didn't actually present.
  entries.sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
    if (a.rank !== null) return -1;
    if (b.rank !== null) return 1;
    return 0;
  });
  return entries.map(({ name, isBrand }) => ({ name, isBrand }));
}

// Aggregated results for a brand's prompt runs: by-platform and by-prompt
// rollups over the latest check per (prompt, platform) pair.
export async function buildBrandPromptResults(brand: Brand, sinceQuery: unknown) {
  const prompts = await storage.getBrandPromptsByBrandId(brand.id);
  if (prompts.length === 0) {
    return { byPlatform: [], byPrompt: [], totalChecks: 0, totalCited: 0, citationRate: 0 };
  }

  const promptIds = prompts.map((p) => p.id);
  const sinceParam = typeof sinceQuery === "string" ? new Date(sinceQuery) : undefined;
  const sinceDate = sinceParam && !isNaN(sinceParam.getTime()) ? sinceParam : undefined;

  const rankings = await storage.getGeoRankingsByBrandPromptIds(promptIds, sinceDate);

  // Keep only the latest row per (promptId, platform) so re-runs don't inflate counts.
  // (Rank movement over time is already computed by
  // usePromptScoreHistory/promptScoreHistory.ts's byPlatform - not
  // duplicated here.)
  const latestByKey = new Map<string, (typeof rankings)[number]>();
  for (const r of rankings) {
    const key = `${r.brandPromptId}__${r.aiPlatform}`;
    const existing = latestByKey.get(key);
    if (!existing || r.checkedAt > existing.checkedAt) latestByKey.set(key, r);
  }
  const latest = Array.from(latestByKey.values());

  const brandDomain = brand.website ? extractDomain(brand.website) : null;

  const platformMap = new Map<
    string,
    { platform: string; cited: number; checks: number; lastRun: Date | null }
  >();
  type PlatformEntry = {
    platform: string;
    isCited: boolean;
    // Placement within the model's answer, when the run recorded one.
    // Null for uncited checks and for rows flipped to cited by
    // re-detection (that pass has no rank signal).
    rank: number | null;
    snippet: string | null;
    fullResponse: string | null;
    checkedAt: Date;
    reDetectedAt: Date | null;
    // Sources cited for the prompt-detail page's "Sources cited" section -
    // already stored on geo_rankings, just not projected into this
    // response before now.
    citingOutletUrl: string | null;
    citingOutletName: string | null;
    citedUrls: string[];
    sourceType: string | null;
    // Ranked list of brands the model actually named in its answer,
    // derived from the same matcher re-detect-all uses - never an LLM
    // guess. [] when the response named neither the brand nor any
    // tracked competitor.
    topAnswers: { name: string; isBrand: boolean }[];
  };
  const promptMap = new Map<
    string,
    {
      promptId: string;
      prompt: string;
      rationale: string | null;
      platforms: PlatformEntry[];
      reportCount: number;
      lastCheckedAt: Date | null;
    }
  >();
  for (const p of prompts)
    promptMap.set(p.id, {
      promptId: p.id,
      prompt: p.prompt,
      rationale: p.rationale,
      platforms: [],
      reportCount: 0,
      lastCheckedAt: null,
    });

  // reportCount/lastCheckedAt come from the FULL rankings set (every check
  // ever recorded), not just the latest-per-platform rows below.
  const runIdsByPrompt = new Map<string, Set<string>>();
  for (const r of rankings) {
    if (!r.brandPromptId) continue;
    const row = promptMap.get(r.brandPromptId);
    if (!row) continue;
    if (r.runId) {
      (
        runIdsByPrompt.get(r.brandPromptId) ??
        runIdsByPrompt.set(r.brandPromptId, new Set()).get(r.brandPromptId)!
      ).add(r.runId);
    }
    if (!row.lastCheckedAt || r.checkedAt > row.lastCheckedAt) row.lastCheckedAt = r.checkedAt;
  }
  for (const [promptId, runIds] of Array.from(runIdsByPrompt)) {
    const row = promptMap.get(promptId);
    if (row) row.reportCount = runIds.size;
  }

  // Brand-wide "cited N times" count for the Sources section - counts
  // every appearance of a URL across this brand's whole ranking history
  // (within the same since-window as everything else here), not just this
  // one prompt.
  const sourceCounts: Record<string, number> = {};
  for (const r of rankings) {
    const urls = new Set<string>();
    if (r.citingOutletUrl) urls.add(r.citingOutletUrl);
    if (Array.isArray(r.citedUrls)) for (const u of r.citedUrls) urls.add(u);
    for (const u of Array.from(urls)) sourceCounts[u] = (sourceCounts[u] ?? 0) + 1;
  }

  // Support both current and legacy citationContext formats so existing
  // rows render correctly without requiring a re-run - see
  // server/lib/citationContextFormat.ts.

  let totalCited = 0;
  for (const r of latest) {
    const plat = platformMap.get(r.aiPlatform) || {
      platform: r.aiPlatform,
      cited: 0,
      checks: 0,
      lastRun: null,
    };
    plat.checks += 1;
    if (r.isCited) {
      plat.cited += 1;
      totalCited += 1;
    }
    if (!plat.lastRun || r.checkedAt > plat.lastRun) plat.lastRun = r.checkedAt;
    platformMap.set(r.aiPlatform, plat);

    if (r.brandPromptId) {
      const promptRow = promptMap.get(r.brandPromptId);
      if (promptRow) {
        const { snippet, fullResponse } = splitCitationContext(r.citationContext);
        const rank = typeof r.rank === "number" && r.rank > 0 ? r.rank : null;
        promptRow.platforms.push({
          platform: r.aiPlatform,
          isCited: r.isCited === 1,
          rank,
          snippet,
          fullResponse,
          checkedAt: r.checkedAt,
          reDetectedAt: (r as any).reDetectedAt ?? null,
          citingOutletUrl: r.citingOutletUrl ?? null,
          citingOutletName: r.citingOutletName ?? null,
          citedUrls: Array.isArray(r.citedUrls) ? r.citedUrls : [],
          sourceType: r.sourceType ?? null,
          topAnswers: topAnswersFor((r as any).mentionedBrands, brand.name),
        });
      }
    }
  }

  const byPlatform = Array.from(platformMap.values()).map((p) => ({
    ...p,
    citationRate: citationRatePct(p.cited, p.checks),
  }));
  const byPrompt = Array.from(promptMap.values());
  const totalChecks = latest.length;
  const citationRate = citationRatePct(totalCited, totalChecks);

  return {
    byPlatform,
    byPrompt,
    totalChecks,
    totalCited,
    citationRate,
    sourceCounts,
    brandDomain,
  };
}
