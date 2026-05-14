// Persist paste-source facts. Replaces all existing source='paste' rows
// for this brand in a single transaction. user_manual / user / scraped
// rows are explicitly untouched.
import { db } from "../../../db";
import { and, eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { Fact } from "@shared/factAgent/schema";
import { logger } from "../../logger";

interface PersistPasteArgs {
  brandId: string;
  runId: string;
}

export async function persistPasteFacts(
  facts: Fact[],
  args: PersistPasteArgs,
): Promise<{ inserted: number }> {
  try {
    return await db.transaction(async (tx) => {
      await tx
        .delete(schema.brandFactSheet)
        .where(
          and(
            eq(schema.brandFactSheet.brandId, args.brandId),
            eq(schema.brandFactSheet.source, "paste"),
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
        source: "paste",
        runId: args.runId,
      }));
      await tx.insert(schema.brandFactSheet).values(rows as never);
      return { inserted: rows.length };
    });
  } catch (err) {
    logger.warn({ err, brandId: args.brandId, runId: args.runId }, "persistPasteFacts failed");
    return { inserted: 0 };
  }
}
