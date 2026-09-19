/**
 * Backfill geo_rankings.cited_urls rows that hold Google's
 * vertexaisearch.cloud.google.com/grounding-api-redirect/<token> wrapper
 * instead of the real cited page.
 *
 * Why this exists: before server/lib/groundingRedirect.ts was wired into
 * server/citationChecker.ts's runPlatformCitationCheck, every Gemini
 * structuredCitations entry that came back from OpenRouter's web grounding
 * was one of these redirect wrappers, and citationChecker copied it
 * verbatim into geo_rankings.cited_urls. New runs resolve the wrapper at
 * write time (see resolveGroundingRedirects); this script cleans up the
 * rows written before that fix landed. citing_outlet_url never holds one of
 * these URLs (confirmed against production data), so only cited_urls needs
 * touching.
 *
 * Tokens expire - a redirect written weeks ago may now 404. Those URLs are
 * DROPPED from the array, never rewritten as the dead wrapper link, exactly
 * like the live resolver does.
 *
 * Usage:
 *   npx tsx scripts/backfillGroundingRedirects.ts                (dry run - default, writes nothing)
 *   npx tsx scripts/backfillGroundingRedirects.ts --limit=25     (dry run over first N affected rows)
 *   npx tsx scripts/backfillGroundingRedirects.ts --apply        (writes; batches updates)
 *   npx tsx scripts/backfillGroundingRedirects.ts --apply --batch-size=200
 *   npx tsx scripts/backfillGroundingRedirects.ts --concurrency=16
 *
 * Resolution is by distinct redirect URL, not by row - many rows can share
 * the same token (same grounded search hit reused across prompts). Each
 * distinct URL is resolved exactly once, via a small worker pool (see
 * RESOLVE_CONCURRENCY below).
 *
 * Run against production on 2026-09-19, after taking a snapshot of the
 * affected rows' cited_urls. Result: 1,584 rows rewritten, 14,548 URLs
 * resolved, 1,397 expired tokens dropped, 156 rows left with no cited URLs
 * (every entry on those rows was an expired token). 0 redirect URLs
 * remained afterward. This script is kept as a record of that run, not as
 * something still to run.
 */

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { resolveGroundingRedirects } from "../server/lib/groundingRedirect";

const REDIRECT_HOST = "vertexaisearch.cloud.google.com";
const REDIRECT_PATH_PREFIX = "/grounding-api-redirect/";

function isGroundingRedirectUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.hostname === REDIRECT_HOST && url.pathname.startsWith(REDIRECT_PATH_PREFIX);
}

// Extracted so tests/unit/backfillGroundingRedirectsQuery.test.ts can assert
// the rendered SQL shape (one bound text[] param, not a row expression)
// without a database - see the sql.param()/::text[] comment at the call
// site for why this shape matters.
export function buildUpdateQuery(id: string, citedUrls: string[]) {
  return sql`
          UPDATE geo_rankings
          SET cited_urls = ${sql.param(citedUrls)}::text[]
          WHERE id = ${id}
        `;
}

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const APPLY = process.argv.includes("--apply");
const LIMIT = arg("limit", 0);
const BATCH_SIZE = arg("batch-size", 100);
const RESOLVE_CONCURRENCY = arg("concurrency", 8);

interface Row {
  id: string;
  citedUrls: string[];
}

async function loadAffectedRows(): Promise<Row[]> {
  // %grounding-api-redirect/% is a cheap pre-filter to shrink the scan to
  // rows that could possibly contain a redirect wrapper; the precise
  // host+path check still happens per-URL in isGroundingRedirectUrl.
  const res = await db.execute(sql`
    SELECT id, cited_urls
    FROM geo_rankings
    WHERE cited_urls IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM unnest(cited_urls) AS u
        WHERE u LIKE ${"%" + REDIRECT_HOST + REDIRECT_PATH_PREFIX + "%"}
      )
    ORDER BY id
    ${LIMIT ? sql`LIMIT ${LIMIT}` : sql``}
  `);
  return (res.rows as any[]).map((r) => ({
    id: r.id,
    citedUrls: Array.isArray(r.cited_urls) ? r.cited_urls : [],
  }));
}

async function main() {
  const started = Date.now();
  console.log(`[backfillGroundingRedirects] ${APPLY ? "APPLY" : "DRY RUN"} mode`);
  console.log(`[backfillGroundingRedirects] loading affected rows...`);
  const rows = await loadAffectedRows();
  console.log(`[backfillGroundingRedirects] ${rows.length} rows hold at least one redirect URL`);

  if (rows.length === 0) {
    await pool.end();
    return;
  }

  // Resolve each DISTINCT redirect URL once - resolveGroundingRedirects
  // also caches internally, but collecting the distinct set first means we
  // report "N distinct tokens, M resolved, K dropped" instead of a
  // per-row-inflated count.
  const distinctRedirects = new Set<string>();
  for (const row of rows) {
    for (const url of row.citedUrls) {
      if (isGroundingRedirectUrl(url)) distinctRedirects.add(url);
    }
  }
  const distinctList = Array.from(distinctRedirects);
  console.log(`[backfillGroundingRedirects] ${distinctList.length} distinct redirect URLs`);

  // resolveGroundingRedirects doesn't hand back a redirect->resolved map, so
  // resolve one URL at a time to build one for reporting + rewriting below.
  // Production scale is ~15,945 distinct redirect URLs against the
  // resolver's 5,000-entry bounded cache - calling it once with the whole
  // list (to "warm" the cache) and then again one by one would push ~11,000
  // URLs out of the cache before the second pass reads them, so those would
  // be requested twice: double the run time and double the HEAD-request
  // traffic to Google. Resolving each URL exactly once, via a worker pool,
  // avoids that entirely.
  const redirectToResolved = new Map<string, string | null>();
  let cursor = 0;
  let resolvedSoFar = 0;
  const resolveWorker = async (): Promise<void> => {
    for (;;) {
      const idx = cursor++;
      if (idx >= distinctList.length) return;
      const url = distinctList[idx];
      const single = await resolveGroundingRedirects([url]);
      redirectToResolved.set(url, single[0] ?? null);
      resolvedSoFar += 1;
      if (resolvedSoFar % 1000 === 0) {
        console.log(
          `[backfillGroundingRedirects] resolved ${resolvedSoFar}/${distinctList.length}`,
        );
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(RESOLVE_CONCURRENCY, distinctList.length) }, () =>
      resolveWorker(),
    ),
  );

  const resolvedCount = Array.from(redirectToResolved.values()).filter((v) => v !== null).length;
  const droppedCount = distinctList.length - resolvedCount;
  console.log(
    `[backfillGroundingRedirects] ${resolvedCount} would resolve, ${droppedCount} would be dropped (expired/unsafe)`,
  );

  let rowsChanged = 0;
  let rowsEmptiedCompletely = 0;
  const updates: Array<{ id: string; citedUrls: string[] }> = [];
  for (const row of rows) {
    const rewritten: string[] = [];
    const seen = new Set<string>();
    for (const url of row.citedUrls) {
      const replacement = isGroundingRedirectUrl(url) ? (redirectToResolved.get(url) ?? null) : url;
      if (!replacement) continue; // drop unresolved redirect
      if (seen.has(replacement)) continue; // same dedupe rule as the live resolver
      seen.add(replacement);
      rewritten.push(replacement);
    }
    const changed =
      rewritten.length !== row.citedUrls.length || rewritten.some((u, i) => u !== row.citedUrls[i]);
    if (!changed) continue;
    rowsChanged += 1;
    if (rewritten.length === 0) rowsEmptiedCompletely += 1;
    updates.push({ id: row.id, citedUrls: rewritten });
  }

  console.log(`[backfillGroundingRedirects] ${rowsChanged} rows would change`);
  console.log(
    `[backfillGroundingRedirects] ${rowsEmptiedCompletely} rows would end up with an empty cited_urls array`,
  );

  if (!APPLY) {
    console.log(`[backfillGroundingRedirects] DRY RUN - nothing written. Re-run with --apply.`);
    await pool.end();
    return;
  }

  console.log(
    `[backfillGroundingRedirects] applying ${updates.length} updates in batches of ${BATCH_SIZE}...`,
  );
  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    await db.transaction(async (tx) => {
      for (const u of batch) {
        // drizzle's sql`` interpolates a JS array as a row expression
        // ($1, $2, ...), not a Postgres array literal - `SET cited_urls =
        // ${u.citedUrls}` renders as a `record`, which Postgres rejects
        // when the column is `text[]` ("cannot cast type record to
        // text[]"). sql.param() forces it through as ONE bound parameter,
        // and the explicit ::text[] cast tells Postgres how to read it -
        // this also correctly turns an empty JS array into `{}` rather
        // than an empty row expression. See buildUpdateQuery above.
        await tx.execute(buildUpdateQuery(u.id, u.citedUrls));
      }
    });
    written += batch.length;
    console.log(`[backfillGroundingRedirects] ${written}/${updates.length} rows written`);
  }

  const mins = (Date.now() - started) / 60000;
  console.log(`[backfillGroundingRedirects] done in ${mins.toFixed(1)} min`);
  await pool.end();
}

main().catch(async (err) => {
  console.error("[backfillGroundingRedirects] fatal:", err);
  await pool.end();
  process.exit(1);
});
