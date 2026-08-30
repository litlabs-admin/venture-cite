// Business logic for "re-detect all": re-running brand/competitor detection
// across every stored surface (geo_rankings, listicles, wikipedia_mentions)
// using the shared matcher, with no AI calls.
//
// Extracted verbatim from server/routes/prompts.ts as part of the B6b
// service-layer split. No Express types - callers resolve `brand` via
// requireBrand first and pass it in.

import { storage } from "../storage";
import { detectBrandAndCompetitors, matchEntity } from "../lib/brandMatcher";
import { logger } from "../lib/logger";
import {
  RAW_RESPONSE_DELIMITER,
  LEGACY_RAW_RESPONSE_DELIMITER,
  buildCitationContext,
} from "../lib/citationContextFormat";
import type { Brand } from "@shared/schema";

// Per-brand rate limit. Matcher-only re-checks are cheap but iterating
// thousands of stored rows still burns DB bandwidth; 60s keeps repeated
// button clicks from stampeding. Enforced from system_state
// (storage.getReDetectAllLastRunAt/setReDetectAllLastRunAt) rather than an
// in-memory Map: a Map resets on every redeploy and does not coordinate
// between instances, so either would let the cooldown be bypassed outright.
const RE_DETECT_COOLDOWN_MS = 60_000;

export type ReDetectAllResult =
  | { outcome: "cooldown"; retryAfterSeconds: number }
  | {
      outcome: "ok";
      data: {
        counts: { rankings: number; listicles: number; wikipedia: number; newlyCited: number };
        durationMs: number;
      };
    };

// Re-run detection across every stored surface using the shared matcher -
// no AI calls. Picks up new name variations added since the original run
// so historical rows stay aligned with the current detector. Rank stays
// null on rows that flip to cited here (the rank signal came from the
// original LLM pass).
export async function reDetectAllForBrand(brand: Brand): Promise<ReDetectAllResult> {
  const last = await storage.getReDetectAllLastRunAt(brand.id);
  if (last) {
    const since = Date.now() - last.getTime();
    if (since < RE_DETECT_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((RE_DETECT_COOLDOWN_MS - since) / 1000);
      return { outcome: "cooldown", retryAfterSeconds: retryAfterSec };
    }
  }
  await storage.setReDetectAllLastRunAt(brand.id, new Date());

  // Re-detect does not write a citation_runs row. An earlier pass added
  // one to fire the live banner, but History is meant to be a record of
  // fresh AI runs - re-detect re-evaluates *existing* responses and adds
  // nothing new to the story. The completion toast is enough; no banner
  // needed for an operation that finishes in <2s and makes no AI calls.

  const startedAt = Date.now();
  const competitors = await storage.getCompetitors(brand.id);
  const brandEntity = {
    id: brand.id,
    name: brand.name,
    nameVariations: Array.isArray(brand.nameVariations) ? brand.nameVariations : [],
    website: brand.website ?? null,
  };
  const competitorEntities = competitors.map((c) => ({
    id: c.id,
    name: c.name,
    nameVariations: Array.isArray((c as any).nameVariations)
      ? ((c as any).nameVariations as string[])
      : [],
    domain: c.domain ?? null,
  }));

  const counts = { rankings: 0, listicles: 0, wikipedia: 0, newlyCited: 0 };
  const affectedRunIds = new Set<string>();

  // --- geo_rankings ---
  const prompts = await storage.getBrandPromptsByBrandId(brand.id);
  if (prompts.length > 0) {
    const rankings = await storage.getGeoRankingsByBrandPromptIds(prompts.map((p) => p.id));
    for (const r of rankings) {
      const ctx = r.citationContext || "";
      const delimIdx = ctx.indexOf(RAW_RESPONSE_DELIMITER);
      const oldDelimIdx = ctx.indexOf(LEGACY_RAW_RESPONSE_DELIMITER);
      let responseText = "";
      if (delimIdx !== -1) {
        responseText = ctx.substring(delimIdx + RAW_RESPONSE_DELIMITER.length).trim();
      } else if (oldDelimIdx !== -1) {
        responseText = ctx.substring(oldDelimIdx + LEGACY_RAW_RESPONSE_DELIMITER.length).trim();
      }
      if (!responseText) continue;

      const result = detectBrandAndCompetitors(responseText, brandEntity, competitorEntities);
      const newIsCited = result.brand.matched ? 1 : 0;
      const becameCited = newIsCited === 1 && r.isCited === 0;
      const isChanged = newIsCited !== r.isCited;

      if (isChanged) {
        const patch: Record<string, unknown> = {
          isCited: newIsCited,
          // Rank came from the original LLM run. If this re-check reveals
          // a new citation we have no honest way to assign rank, so null
          // it and badge the row as re-detected.
          rank: becameCited ? null : r.rank,
        };
        if (becameCited) {
          patch.reDetectedAt = new Date();
          counts.newlyCited += 1;
        }
        const newStatusLine = newIsCited === 1 ? "Cited" : "Not cited";
        patch.citationContext = buildCitationContext(newStatusLine, responseText);
        await storage.updateGeoRanking(r.id, patch as any);
        counts.rankings += 1;
        if (r.runId) affectedRunIds.add(r.runId);
      }
    }

    // Use the canonical aggregator. The previous inline implementation was
    // duplicated logic that drifted from updates elsewhere; some users
    // ended up with run headers showing "2/50" while the drill-down
    // summed to 16/50. Migration 0039 fixed the existing rows; using the
    // helper here keeps future re-detects in sync.
    for (const runId of Array.from(affectedRunIds)) {
      try {
        await storage.recomputeCitationRunAggregate(runId);
      } catch (err) {
        logger.warn({ err: err }, `[re-detect-all] aggregate recompute failed for run ${runId}:`);
      }
    }
  }

  // --- listicles ---
  const listicles = await storage.getListicles(brand.id).catch(() => [] as any[]);
  for (const l of listicles) {
    // No raw page text is persisted - use title + stored item names as the
    // searchable surface. Accurate for the common case where listicle
    // items contain the brand name.
    const searchText = [l.title ?? "", ...((l.competitorsMentioned ?? []) as string[])].join(
      " \n ",
    );
    if (!searchText.trim()) continue;
    const r = matchEntity(searchText, brandEntity);
    const newIsIncluded = r.matched ? 1 : 0;
    if (newIsIncluded !== l.isIncluded) {
      await storage.updateListicle(l.id, { isIncluded: newIsIncluded });
      counts.listicles += 1;
    }
  }

  // --- wikipedia_mentions ---
  const wikiRows = await storage.getWikipediaMentions(brand.id).catch(() => [] as any[]);
  for (const w of wikiRows) {
    const text = w.mentionContext ?? "";
    if (!text) continue;
    const r = matchEntity(text, brandEntity);
    const newType: "existing" | "opportunity" = r.matched ? "existing" : "opportunity";
    const newActive = r.matched ? 1 : 0;
    const typeChanged = newType !== w.mentionType;
    const activeChanged = newActive !== w.isActive;
    if (typeChanged || activeChanged) {
      await storage.updateWikipediaMention(w.id, {
        mentionType: newType,
        isActive: newActive,
      });
      counts.wikipedia += 1;
    }
  }

  return {
    outcome: "ok",
    data: {
      counts,
      durationMs: Date.now() - startedAt,
    },
  };
}
