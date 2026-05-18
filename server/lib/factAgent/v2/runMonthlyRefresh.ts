// V2 monthly refresh. Picks brands that haven't completed a scrape in
// 30+ days and runs the full pipeline inline. Vercel 60s function ceiling
// limits us to ~3-5 brands per cron tick; subsequent ticks pick up the
// next batch via the "completed_at IS NULL OR completed_at < 30 days"
// ordering.
//
// The pipeline body lives in runFullScrape.ts (shared with onboarding
// activation); this file only selects stale brands and maps each raw
// SQL row into the pipeline's input shape.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { logger } from "../../logger";
import { runFullScrapeForBrand } from "./runFullScrape";

const REFRESH_INTERVAL_DAYS = 30;
const MAX_BRANDS_PER_TICK = 3;

interface StaleBrand {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  description: string | null;
  products_raw: unknown;
  target_audience: string | null;
  unique_selling_points_raw: unknown;
  key_values_raw: unknown;
  brand_voice: string | null;
  tone: string | null;
}

async function findStaleBrands(limit: number): Promise<StaleBrand[]> {
  const result = await db.execute(sql`
    SELECT b.id, b.name, b.website, b.industry, b.description,
           b.products AS products_raw,
           b.target_audience,
           b.unique_selling_points AS unique_selling_points_raw,
           b.key_values AS key_values_raw,
           b.brand_voice, b.tone
    FROM brands b
    WHERE b.deleted_at IS NULL
      AND b.fact_scrape_enabled = true
      AND b.website IS NOT NULL
      AND b.website <> ''
      AND NOT EXISTS (
        SELECT 1 FROM brand_fact_scrape_runs r
        WHERE r.brand_id = b.id
          AND r.status NOT IN ('completed','failed','timeout','cancelled')
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM brand_fact_scrape_runs r2
          WHERE r2.brand_id = b.id AND r2.status = 'completed'
        )
        OR (
          SELECT max(completed_at) FROM brand_fact_scrape_runs r3
          WHERE r3.brand_id = b.id AND r3.status = 'completed'
        ) < now() - (${REFRESH_INTERVAL_DAYS} || ' days')::interval
      )
    ORDER BY b.created_at ASC
    LIMIT ${limit}
  `);
  return (result as unknown as { rows: StaleBrand[] }).rows;
}

function coerceArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  return [];
}

async function refreshOneBrand(brand: StaleBrand, deadlineMs: number): Promise<void> {
  await runFullScrapeForBrand(
    {
      id: brand.id,
      name: brand.name,
      website: brand.website,
      industry: brand.industry,
      description: brand.description,
      products: coerceArray(brand.products_raw),
      targetAudience: brand.target_audience,
      uniqueSellingPoints: coerceArray(brand.unique_selling_points_raw),
      keyValues: Array.isArray(brand.key_values_raw)
        ? (brand.key_values_raw as string[]).join(", ")
        : ((brand.key_values_raw as string | null) ?? null),
      brandVoice: brand.brand_voice,
      tone: brand.tone,
    },
    deadlineMs,
    "cron_refresh",
  );
}

export async function runMonthlyFactRefresh(deadlineMs?: number): Promise<{ processed: number }> {
  const budgetEnd = deadlineMs ?? Date.now() + 45_000;
  const stale = await findStaleBrands(MAX_BRANDS_PER_TICK);
  if (stale.length === 0) return { processed: 0 };

  let processed = 0;
  for (const brand of stale) {
    if (Date.now() >= budgetEnd) break;
    try {
      await refreshOneBrand(brand, budgetEnd);
      processed += 1;
    } catch (err) {
      logger.warn({ err, brandId: brand.id }, "monthly-refresh: brand-level error");
    }
  }
  logger.info({ processed, total: stale.length }, "monthly-fact-refresh tick complete");
  return { processed };
}
