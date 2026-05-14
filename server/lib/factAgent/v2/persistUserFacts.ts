// Persist user-source facts (from /user-enrich). Replaces all existing
// source='user' rows for this brand in a single transaction so the latest
// onboarding-derived fact set is always authoritative. Does NOT touch
// source='user_manual' rows — those are user-edited overrides that survive
// every re-run.
import { db } from "../../../db";
import { and, eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { Fact } from "@shared/factAgent/schema";
import { logger } from "../../logger";

interface PersistUserArgs {
  brandId: string;
  runId: string;
}

export async function persistUserFacts(
  facts: Fact[],
  args: PersistUserArgs,
): Promise<{ inserted: number }> {
  try {
    return await db.transaction(async (tx) => {
      // 1. Wipe existing source='user' rows for this brand. user_manual
      //    rows are explicitly untouched.
      await tx
        .delete(schema.brandFactSheet)
        .where(
          and(
            eq(schema.brandFactSheet.brandId, args.brandId),
            eq(schema.brandFactSheet.source, "user"),
          ),
        );

      if (facts.length === 0) return { inserted: 0 };

      const rows = facts.map((f) => ({
        brandId: args.brandId,
        domain: f.domain,
        subcategory: f.subcategory,
        factKey: f.factKey,
        factValue: f.factValue,
        valueType: f.valueType,
        valuePayload: f.valuePayload ?? null,
        confidence: String(f.confidence),
        sourceExcerpt: f.sourceExcerpt ?? "",
        sourceUrl: f.sourceUrl ?? null,
        source: "user",
        runId: args.runId,
      }));
      await tx.insert(schema.brandFactSheet).values(rows as never);
      return { inserted: rows.length };
    });
  } catch (err) {
    logger.warn({ err, brandId: args.brandId, runId: args.runId }, "persistUserFacts failed");
    return { inserted: 0 };
  }
}
