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
 * Resolves null when there is nothing to score - a brand with no cited
 * context yet has no evidence, and a run of zero excerpts would be a
 * fabricated reading, not a low one. Callers must treat null as "not
 * measured" and leave the panel empty.
 *
 * Costs one LLM call. Callers own the rate limiting.
 */
export async function runPerceptionScoring(brand: {
  id: string;
  name: string;
  website: string | null;
}): Promise<typeof brandPerceptionRuns.$inferSelect | null> {
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
  if (evidence.length === 0) return null;

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
