/**
 * Backfill geo_rankings.mentioned_brands from the raw response already stored
 * in citation_context.
 *
 * Why this is safe to run: the full model answer is persisted behind the
 * "||| RAW_RESPONSE |||" delimiter, so this re-runs ONLY the analyzer. No
 * citation engine is queried, no new answers are fetched, nothing else on the
 * row is touched. mentioned_brands is the single column written.
 *
 * Scope: the latest row per (brand_prompt_id, ai_platform) - the only rows the
 * per-question diagnosis actually reads. Older rows stay as they are; paying to
 * fix data nothing renders would be waste.
 *
 * Usage:
 *   npx tsx scripts/backfillMentionedBrands.ts --dry-run
 *   npx tsx scripts/backfillMentionedBrands.ts --limit=25
 *   npx tsx scripts/backfillMentionedBrands.ts --concurrency=12
 *
 * --dry-run reports scope and projected spend and writes nothing.
 * Resumable: rows that now have a populated mentioned_brands are skipped, so a
 * killed run can simply be restarted.
 */

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { analyzeResponse, type TrackedEntity } from "../server/lib/responseAnalyzer";

const RAW_DELIM = "||| RAW_RESPONSE |||";

// openai/gpt-5.6-luna via OpenRouter, per openrouter.ai/api/v1/models.
// NOTE: modelConfig.ts's comment says $0.10/$0.60 - that comment is stale by 2x.
const IN_RATE = 0.2 / 1_000_000;
const OUT_RATE = 1.2 / 1_000_000;
const TOK_PER_BRAND = 200; // matches the sizing comment in responseAnalyzer
const CHARS_PER_TOK = 4;
const PROMPT_OVERHEAD_CHARS = 2557; // system prompt + user template
const MAX_RESPONSE_CHARS = 8000; // mirrors responseAnalyzer's own cap

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = arg("concurrency", 8);
const LIMIT = arg("limit", 0);

interface Row {
  id: string;
  brandId: string | null;
  brandPromptId: string;
  aiPlatform: string;
  citationContext: string;
}

/** Everything after the delimiter. Empty when the row has no usable answer. */
function rawResponse(context: string): string {
  const at = context.indexOf(RAW_DELIM);
  if (at === -1) return "";
  return context.slice(at + RAW_DELIM.length).trim();
}

async function loadRows(): Promise<Row[]> {
  const res = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (brand_prompt_id, ai_platform)
        id, brand_id, brand_prompt_id, ai_platform, mentioned_brands, citation_context
      FROM geo_rankings
      WHERE brand_prompt_id IS NOT NULL
      ORDER BY brand_prompt_id, ai_platform, checked_at DESC
    )
    SELECT id, brand_id, brand_prompt_id, ai_platform, citation_context
    FROM latest
    WHERE (mentioned_brands IS NULL
           OR jsonb_typeof(mentioned_brands) <> 'array'
           OR jsonb_array_length(mentioned_brands) = 0)
      AND COALESCE(citation_context, '') LIKE ${"%" + RAW_DELIM + "%"}
    ORDER BY brand_prompt_id, ai_platform
    ${LIMIT ? sql`LIMIT ${LIMIT}` : sql``}
  `);
  return (res.rows as any[]).map((r) => ({
    id: r.id,
    brandId: r.brand_id,
    brandPromptId: r.brand_prompt_id,
    aiPlatform: r.ai_platform,
    citationContext: r.citation_context ?? "",
  }));
}

/** brand + its competitors, so the analyzer resolves tracked entities exactly
 *  as the live pipeline does. Cached per brand - most rows share one. */
const entityCache = new Map<string, TrackedEntity[]>();
async function entitiesForBrand(brandId: string | null): Promise<TrackedEntity[]> {
  if (!brandId) return [];
  const hit = entityCache.get(brandId);
  if (hit) return hit;
  // Mirrors citationChecker.ts's own TrackedEntity construction: competitors
  // key off `domain` (they have no `website` column) and are passed WITHOUT
  // aliases, while the brand's aliases are nameVariations + companyName.
  // Divergence here would make the backfill extract differently from the live
  // pipeline, which is the one thing this script must not do.
  const res = await db.execute(sql`
    SELECT 'brand' AS kind, id, name, website, industry, description,
           name_variations, company_name
      FROM brands WHERE id = ${brandId}
    UNION ALL
    SELECT 'competitor', id, name, domain, industry, description,
           NULL::text[], NULL::text
      FROM competitors WHERE brand_id = ${brandId} AND deleted_at IS NULL
  `);
  const entities: TrackedEntity[] = (res.rows as any[]).map((r) => ({
    kind: r.kind,
    id: r.id,
    name: r.name,
    website: r.website || null,
    industry: r.industry || null,
    description: r.description || null,
    aliases:
      r.kind === "brand"
        ? [...(Array.isArray(r.name_variations) ? r.name_variations : []), r.company_name].filter(
            (s: unknown): s is string => typeof s === "string" && s.trim().length > 0,
          )
        : undefined,
  }));
  entityCache.set(brandId, entities);
  return entities;
}

const stats = {
  processed: 0,
  written: 0,
  emptyResult: 0,
  noRaw: 0,
  failed: 0,
  brandsTotal: 0,
  inTokens: 0,
  outTokens: 0,
};
const failures: Array<{ id: string; platform: string; reason: string }> = [];
const emptyRows: Array<{ id: string; platform: string; rawChars: number }> = [];

async function processRow(row: Row): Promise<void> {
  const raw = rawResponse(row.citationContext);
  // Short bodies are error stubs ("Check failed: ..."), not answers.
  if (raw.length < 200) {
    stats.noRaw += 1;
    return;
  }

  const entities = await entitiesForBrand(row.brandId);
  let analysis;
  try {
    analysis = await analyzeResponse({ responseText: raw, trackedEntities: entities });
  } catch (err) {
    stats.failed += 1;
    failures.push({
      id: row.id,
      platform: row.aiPlatform,
      reason: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  stats.inTokens +=
    (PROMPT_OVERHEAD_CHARS + Math.min(raw.length, MAX_RESPONSE_CHARS)) / CHARS_PER_TOK;
  stats.outTokens += analysis.brands.length * TOK_PER_BRAND;

  // analyzeResponse swallows malformed JSON and returns an empty result rather
  // than throwing. That is NOT a success - surface it, or a run that extracted
  // nothing at all would report as clean.
  if (analysis.brands.length === 0) {
    stats.emptyResult += 1;
    emptyRows.push({ id: row.id, platform: row.aiPlatform, rawChars: raw.length });
    return;
  }

  // Same projection the live pipeline stores (citationChecker.ts).
  const mentionedBrands = analysis.brands
    .slice(0, 15)
    .map((b) => ({ name: b.name, cited: b.cited, rank: b.rank }));
  stats.brandsTotal += mentionedBrands.length;

  if (!DRY_RUN) {
    await db.execute(sql`
      UPDATE geo_rankings
      SET mentioned_brands = ${JSON.stringify(mentionedBrands)}::jsonb
      WHERE id = ${row.id}
    `);
  }
  stats.written += 1;
}

async function main() {
  const started = Date.now();
  console.log(`[backfill] loading candidate rows...`);
  const rows = await loadRows();
  console.log(`[backfill] ${rows.length} rows in scope`);

  if (DRY_RUN) {
    let inTok = 0;
    let usable = 0;
    for (const r of rows) {
      const raw = rawResponse(r.citationContext);
      if (raw.length < 200) continue;
      usable += 1;
      inTok += (PROMPT_OVERHEAD_CHARS + Math.min(raw.length, MAX_RESPONSE_CHARS)) / CHARS_PER_TOK;
    }
    // 8.49 brands/row is the measured average from rows already populated.
    const outTok = usable * 8.49 * TOK_PER_BRAND;
    const cost = inTok * IN_RATE + outTok * OUT_RATE;
    console.log(`[backfill] DRY RUN - nothing written`);
    console.log(`[backfill]   usable rows      : ${usable}`);
    console.log(`[backfill]   skipped (no raw) : ${rows.length - usable}`);
    console.log(`[backfill]   est input tokens : ${Math.round(inTok).toLocaleString()}`);
    console.log(`[backfill]   est output tokens: ${Math.round(outTok).toLocaleString()}`);
    console.log(`[backfill]   PROJECTED COST   : $${cost.toFixed(2)}`);
    await pool.end();
    return;
  }

  // Fixed-size worker pool pulling off a shared cursor.
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= rows.length) return;
      await processRow(rows[i]);
      stats.processed += 1;
      if (stats.processed % 25 === 0 || stats.processed === rows.length) {
        const pct = ((stats.processed / rows.length) * 100).toFixed(1);
        const spend = stats.inTokens * IN_RATE + stats.outTokens * OUT_RATE;
        console.log(
          `[backfill] ${stats.processed}/${rows.length} (${pct}%) ` +
            `written=${stats.written} empty=${stats.emptyResult} ` +
            `noraw=${stats.noRaw} failed=${stats.failed} $${spend.toFixed(3)}`,
        );
      }
    }
  });
  await Promise.all(workers);

  const spend = stats.inTokens * IN_RATE + stats.outTokens * OUT_RATE;
  const mins = (Date.now() - started) / 60000;
  console.log(`\n[backfill] ===== DONE in ${mins.toFixed(1)} min =====`);
  console.log(`[backfill] rows processed : ${stats.processed}`);
  console.log(`[backfill] rows written   : ${stats.written}`);
  console.log(`[backfill] empty result   : ${stats.emptyResult}`);
  console.log(`[backfill] no raw response: ${stats.noRaw}`);
  console.log(`[backfill] failed         : ${stats.failed}`);
  console.log(
    `[backfill] avg brands/row : ${stats.written ? (stats.brandsTotal / stats.written).toFixed(2) : "n/a"}`,
  );
  console.log(`[backfill] actual spend   : $${spend.toFixed(2)}`);

  if (failures.length) {
    console.log(`\n[backfill] FAILURES (${failures.length}):`);
    for (const f of failures.slice(0, 20)) {
      console.log(`  ${f.platform} ${f.id}: ${f.reason}`);
    }
    if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
  }
  if (emptyRows.length) {
    console.log(
      `\n[backfill] EMPTY EXTRACTIONS (${emptyRows.length}) - analyzer returned no brands:`,
    );
    for (const e of emptyRows.slice(0, 20)) {
      console.log(`  ${e.platform} ${e.id} (${e.rawChars} raw chars)`);
    }
    if (emptyRows.length > 20) console.log(`  ... and ${emptyRows.length - 20} more`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error("[backfill] fatal:", err);
  await pool.end();
  process.exit(1);
});
