// One perception run: gather evidence, score it, persist it.
//
// This used to live inline in POST /api/dashboard/perception/:brandId/run,
// which is why the Perception panel was empty for every brand whose owner
// never visited /perception and clicked the button - the only code path that
// could write brand_perception_runs was behind that one handler. Extracted so
// the weekly brand-activation job can call it too.
//
// The route keeps its own concerns (ownership, aiLimitMiddleware, the 1h
// cooldown, the 429 response); none of that belongs here. What IS here is the
// part both callers need to agree on: which excerpts count as evidence, and
// what a run row looks like.

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { brandPerceptionRuns, geoRankings } from "@shared/schema";
import { gatherEvidence, scoreBrandPerception } from "./perceptionScorer";

/** Newest run's timestamp, or null when the brand has never been scored. */
export async function getLastPerceptionRunAt(brandId: string): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: brandPerceptionRuns.createdAt })
    .from(brandPerceptionRuns)
    .where(eq(brandPerceptionRuns.brandId, brandId))
    .orderBy(desc(brandPerceptionRuns.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

/**
 * Score one brand and persist the run.
 *
 * When there is no evidence, this still writes a run row - with every axis
 * NULL and evidenceCount 0 - instead of returning nothing. That row is the
 * only way the UI can tell "we tried and the brand was never named in an AI
 * answer" apart from "this brand has never been scored at all". No LLM call
 * is made in that case: a run of zero excerpts must never buy a fabricated
 * reading.
 *
 * Costs one LLM call when evidence exists. Callers own the rate limiting.
 */
export async function runPerceptionScoring(brand: {
  id: string;
  name: string;
  website: string | null;
}): Promise<typeof brandPerceptionRuns.$inferSelect> {
  const rows = await db
    .select({
      citationContext: geoRankings.citationContext,
      aiPlatform: geoRankings.aiPlatform,
    })
    .from(geoRankings)
    .where(and(eq(geoRankings.brandId, brand.id), isNotNull(geoRankings.citationContext)))
    .orderBy(desc(geoRankings.checkedAt))
    .limit(400);

  // Pass the brand identity so only snippets that actually DISCUSS this brand
  // are scored. The bare registrable domain rides along as an alias, so an
  // answer that cites the site without naming the company still counts.
  const domainAlias = (brand.website ?? "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split(".")[0];

  const evidence = gatherEvidence(rows, {
    brandName: brand.name,
    aliases: domainAlias ? [domainAlias] : [],
  });

  // scoreBrandPerception already returns an all-null result for zero
  // evidence WITHOUT calling the LLM (see perceptionScorer.ts), so calling
  // it unconditionally here still costs nothing when there is nothing to
  // score - it just gives us one shape to insert either way.
  const result = await scoreBrandPerception({ brandName: brand.name, evidence });

  // Drizzle's `numeric` columns accept strings on write (and return strings on
  // read). Convert the number|null axis values accordingly; null stays null.
  const toNumericInput = (v: number | null): string | null => (v === null ? null : String(v));

  const [inserted] = await db
    .insert(brandPerceptionRuns)
    .values({
      brandId: brand.id,
      trust: toNumericInput(result.trust),
      quality: toNumericInput(result.quality),
      value: toNumericInput(result.value),
      market: toNumericInput(result.market),
      innovation: toNumericInput(result.innovation),
      overall: toNumericInput(result.overall),
      praised: result.praised,
      questioned: result.questioned,
      evidenceCount: result.evidenceCount,
      model: result.model,
    })
    .returning();

  return inserted;
}
