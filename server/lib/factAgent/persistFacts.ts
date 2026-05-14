// Spec 2 §4.2 Phase 2 step 9: persist scraped facts to brand_fact_sheet.
//
// Upsert keyed on the partial unique index Plan 2.1 created at
// migrations/0059_brand_fact_sheet_v2.sql — namely
//   (brand_id, domain, subcategory, fact_key) WHERE source='scraped' AND dismissed_at IS NULL.
// Drizzle's onConflictDoUpdate with the target columns will match that
// partial index (PG figures out the index from the column tuple + source filter).

import { db } from "../../db";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { logger } from "../logger";
import type { ExtractedFact } from "./types";

interface PersistArgs {
  brandId: string;
  runId: string;
  sourceUrl: string;
}

export async function persistFacts(
  facts: ExtractedFact[],
  args: PersistArgs,
): Promise<{ inserted: number }> {
  if (facts.length === 0) return { inserted: 0 };

  let inserted = 0;
  for (const f of facts) {
    try {
      // CRITICAL 4: A previously-dismissed scraped row is excluded from
      // the partial unique index, so ON CONFLICT won't match it and a
      // fresh row would silently reappear. Respect the prior dismissal
      // by skipping the insert entirely when one is on file.
      const existingDismissed = await db
        .select({ id: schema.brandFactSheet.id })
        .from(schema.brandFactSheet)
        .where(
          and(
            eq(schema.brandFactSheet.brandId, args.brandId),
            eq(schema.brandFactSheet.domain, f.domain),
            eq(schema.brandFactSheet.subcategory, f.subcategory),
            eq(schema.brandFactSheet.factKey, f.factKey),
            eq(schema.brandFactSheet.source, "scraped"),
            sql`${schema.brandFactSheet.dismissedAt} IS NOT NULL`,
          ),
        )
        .limit(1);
      if (existingDismissed.length > 0) continue;

      await db
        .insert(schema.brandFactSheet)
        .values({
          brandId: args.brandId,
          domain: f.domain,
          subcategory: f.subcategory,
          factKey: f.factKey,
          factValue: f.factValue,
          valueType: f.valueType,
          valuePayload: f.valuePayload,
          confidence: f.confidence as never,
          sourceExcerpt: f.sourceExcerpt,
          sourceUrl: f.sourceUrl || args.sourceUrl,
          source: "scraped",
          runId: args.runId,
          lastVerified: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            schema.brandFactSheet.brandId,
            schema.brandFactSheet.domain,
            schema.brandFactSheet.subcategory,
            schema.brandFactSheet.factKey,
          ],
          // CRITICAL 3: the unique index is partial — we MUST also pass
          // its WHERE predicate via targetWhere so PG can pick the
          // matching arbiter index. Without this, PG raises 42P10
          // (no unique/exclusion constraint matching ON CONFLICT spec).
          targetWhere: sql`source = 'scraped' AND dismissed_at IS NULL`,
          set: {
            factValue: f.factValue,
            valueType: f.valueType,
            valuePayload: f.valuePayload,
            confidence: f.confidence as never,
            sourceExcerpt: f.sourceExcerpt,
            sourceUrl: f.sourceUrl || args.sourceUrl,
            runId: args.runId,
            lastVerified: new Date(),
            updatedAt: new Date(),
          },
        });
      inserted++;
    } catch (err) {
      // ON CONFLICT can still raise if the user/manual partial indexes match;
      // we log and continue rather than aborting the whole page.
      logger.warn(
        {
          brandId: args.brandId,
          runId: args.runId,
          domain: f.domain,
          subcategory: f.subcategory,
          factKey: f.factKey,
          err,
        },
        "persistFacts: insert failed (likely user/manual partial-index clash)",
      );
    }
  }
  return { inserted };
}
