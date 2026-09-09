/**
 * Seeds a LOCAL DEVELOPMENT database with realistic rows for three domains
 * that are empty for every brand today, so a new dashboard can be demoed
 * with content instead of empty states:
 *
 *   1. brand_goals            - one active goal per brand that has facts.
 *   2. work_outcome_reviews    - a few completed outcome reviews for brands
 *                                that already have work_tasks and citation_runs.
 *   3. brand_fact_scrape_pages - page rows (under an EXISTING completed run)
 *                                for brands that have facts but no pages yet.
 *
 * Safety: `assertLocalDatabase` is the first statement inside
 * `seedLocalWorkDemo`, run before the database module is imported, so a
 * non-loopback DATABASE_URL (or DATABASE_DIRECT_URL) throws before any
 * connection is opened and before any query is built. This script never
 * creates work_award_events - points are earned only through the real
 * verification service.
 *
 * Idempotency: every insert either targets a real unique constraint with
 * `on conflict ... do nothing` (brand_goals on (brand_id, goal_key),
 * work_outcome_reviews on (task_id, task_version, cycle_key)), or - for
 * brand_fact_scrape_pages, which has no natural unique constraint - is
 * guarded by an `insert ... select ... where not exists (...)` on the
 * (run_id, url) pair. Running the script twice leaves the same row counts.
 *
 * Usage: npx tsx scripts/seedLocalWorkDemo.ts
 */

import "dotenv/config";
import { assertLocalDatabase } from "./assert-local-db";
import { sql } from "drizzle-orm";

const GOAL_KEY = "buyer-accuracy";
const REVIEW_CYCLE_KEY = "demo-2026-08";
const REVIEW_PERIOD = "2026-08";
const SMOKE_BRAND_PREFIX = "smoke-brand";
const OUTCOME_DECISIONS = ["improvement", "no_material_change", "decline", "unavailable"] as const;

/** Per-brand real subpaths, used only for the three named brands the task calls out. */
const KNOWN_SCRAPE_PATHS: Record<string, { base: string; paths: string[] }> = {
  Apple: {
    base: "https://apple.com",
    paths: [
      "/",
      "/iphone/",
      "/ipad/",
      "/mac/",
      "/watch/",
      "/airpods/",
      "/support/",
      "/newsroom/",
      "/careers/us",
      "/environment/",
    ],
  },
  Notion: {
    base: "https://notion.com",
    paths: ["/", "/product", "/pricing", "/enterprise", "/security", "/templates"],
  },
  FeatherHQ: {
    base: "https://featherhq.com",
    paths: [
      "/",
      "/product",
      "/pricing",
      "/about-us",
      "/case-studies/case-study",
      "/platform",
      "/security",
      "/careers",
      "/blog",
      "/contact",
    ],
  },
};

type Row<T> = T;

interface SeedSummary {
  brandGoalsInserted: number;
  workOutcomeReviewsInserted: number;
  scrapePagesInserted: number;
}

export async function seedLocalWorkDemo(): Promise<SeedSummary> {
  // First statement: refuse to proceed against anything but a loopback
  // host. Nothing below this line runs, and no database module is
  // imported, until this check passes.
  assertLocalDatabase(process.env.DATABASE_URL);

  const { db } = await import("../server/db");

  const brandGoalsInserted = await seedBrandGoals(db);
  const workOutcomeReviewsInserted = await seedWorkOutcomeReviews(db);
  const scrapePagesInserted = await seedScrapePages(db);

  return { brandGoalsInserted, workOutcomeReviewsInserted, scrapePagesInserted };
}

// ---------------------------------------------------------------------------
// 1. brand_goals - one active goal per brand that has facts.
// ---------------------------------------------------------------------------

async function seedBrandGoals(db: DbLike): Promise<number> {
  const brands = await db.execute<Row<{ id: string; user_id: string; name: string }>>(sql`
    select b.id, b.user_id, b.name
    from public.brands b
    where b.deleted_at is null
      and b.id not like ${SMOKE_BRAND_PREFIX + "%"}
      and exists (select 1 from public.brand_fact_sheet f where f.brand_id = b.id)
    order by b.id
  `);

  let inserted = 0;
  for (const brand of brands.rows) {
    const industry = await readIndustryFact(db, brand.id);
    const industryPhrase = industry ? ` in ${industry}` : "";

    const title = `Help buyers find accurate information about ${brand.name}`;
    const statement =
      `Buyers researching ${brand.name}${industryPhrase} should find correct, current facts ` +
      `about it wherever they ask, not stale or fabricated claims.`;
    const desiredOutcome =
      `AI assistants and search surfaces cite accurate details about ${brand.name}` +
      `${industryPhrase}, so prospective buyers can trust what they read before they reach out.`;

    const result = await db.execute(sql`
      insert into public.brand_goals
        (brand_id, user_id, goal_key, goal_kind, title, statement, desired_outcome, status)
      values
        (${brand.id}, ${brand.user_id}, ${GOAL_KEY}, 'visibility_improvement',
         ${title}, ${statement}, ${desiredOutcome}, 'active')
      on conflict (brand_id, goal_key) do nothing
      returning id
    `);
    inserted += result.rows.length;
  }
  return inserted;
}

async function readIndustryFact(db: DbLike, brandId: string): Promise<string | null> {
  const result = await db.execute<Row<{ fact_value: string }>>(sql`
    select fact_value
    from public.brand_fact_sheet
    where brand_id = ${brandId}
      and fact_key = 'industry'
      and dismissed_at is null
      and nullif(btrim(fact_value), '') is not null
    order by updated_at desc
    limit 1
  `);
  return result.rows[0]?.fact_value ?? null;
}

// ---------------------------------------------------------------------------
// 2. work_outcome_reviews - completed reviews for brands with both
//    work_tasks and citation_runs. Each row satisfies evidenceReaders.ts's
//    readDecision: the review is owned by the same user as the brand, its
//    task_id/brand_id/user_id/task_version reference a real work_tasks row,
//    and cycle_key/decision match exactly what is stored.
// ---------------------------------------------------------------------------

async function seedWorkOutcomeReviews(db: DbLike): Promise<number> {
  const brands = await db.execute<Row<{ id: string; user_id: string; name: string }>>(sql`
    select b.id, b.user_id, b.name
    from public.brands b
    where b.deleted_at is null
      and b.id not like ${SMOKE_BRAND_PREFIX + "%"}
      and exists (select 1 from public.work_tasks t where t.brand_id = b.id)
      and exists (select 1 from public.citation_runs c where c.brand_id = b.id)
    order by b.id
  `);

  let inserted = 0;
  for (let index = 0; index < brands.rows.length; index += 1) {
    const brand = brands.rows[index];
    const anchorTask = await db.execute<Row<{ id: string; task_version: number }>>(sql`
      select id, task_version
      from public.work_tasks
      where brand_id = ${brand.id} and user_id = ${brand.user_id}
      order by created_at asc
      limit 1
    `);
    const task = anchorTask.rows[0];
    if (!task) continue;

    const decision = OUTCOME_DECISIONS[index % OUTCOME_DECISIONS.length];
    const notes = `Reviewed this cycle's citation and ranking evidence for ${brand.name} and recorded the outcome.`;
    const measurementScope = JSON.stringify({ kind: "period", period: REVIEW_PERIOD });

    const result = await db.execute(sql`
      insert into public.work_outcome_reviews
        (task_id, brand_id, user_id, task_version, cycle_key, measurement_scope, decision, notes, reviewed_by)
      values
        (${task.id}, ${brand.id}, ${brand.user_id}, ${task.task_version}, ${REVIEW_CYCLE_KEY},
         ${measurementScope}::jsonb, ${decision}, ${notes}, ${brand.user_id})
      on conflict (task_id, task_version, cycle_key) do nothing
      returning id
    `);
    inserted += result.rows.length;
  }
  return inserted;
}

// ---------------------------------------------------------------------------
// 3. brand_fact_scrape_pages - page rows for brands that have facts but no
//    pages under any of their scrape runs yet. Pages attach to an EXISTING
//    completed run (never a fabricated one) and mirror the shape of the
//    real DROS AI / Venture PR rows: url === canonical_url, status "done"
//    (the one finished value in brand_fact_scrape_pages_status_check),
//    fetched_at left null, status_code 200, content_type null, lang "en".
// ---------------------------------------------------------------------------

async function seedScrapePages(db: DbLike): Promise<number> {
  // Scoped to the three named brands (Notion, Apple, FeatherHQ) rather than
  // every brand that happens to have facts but no pages: Venture PR also has
  // zero page rows today, but the task calls out exactly these three, and
  // widening the scope would be an unasked-for change to a brand nobody
  // named. The "not exists" guard keeps this idempotent and keeps it from
  // duplicating pages if one of the three ever gets real pages later.
  const brands = await db.execute<Row<{ id: string; name: string }>>(sql`
    select b.id, b.name
    from public.brands b
    where b.deleted_at is null
      and b.name = any(array['Notion', 'Apple', 'FeatherHQ'])
      and exists (select 1 from public.brand_fact_sheet f where f.brand_id = b.id)
      and not exists (
        select 1
        from public.brand_fact_scrape_pages p
        inner join public.brand_fact_scrape_runs r on r.id = p.run_id
        where r.brand_id = b.id
      )
    order by b.id
  `);

  let inserted = 0;
  for (const brand of brands.rows) {
    const run = await db.execute<Row<{ id: string }>>(sql`
      select id
      from public.brand_fact_scrape_runs
      where brand_id = ${brand.id} and status = 'completed'
      order by completed_at desc nulls last
      limit 1
    `);
    const target = run.rows[0];
    if (!target) {
      console.warn(
        `seedLocalWorkDemo: skipping pages for "${brand.name}" (${brand.id}) - no completed scrape run to attach to`,
      );
      continue;
    }

    const { base, paths } = KNOWN_SCRAPE_PATHS[brand.name];

    for (let index = 0; index < paths.length; index += 1) {
      const url = `${base}${paths[index]}`;
      const factCount = 2 + (index % 4);
      const bytes = 4000 + index * 137;

      const result = await db.execute(sql`
        insert into public.brand_fact_scrape_pages
          (run_id, url, canonical_url, status, status_code, lang, fact_count, bytes)
        select ${target.id}, ${url}, ${url}, 'done', 200, 'en', ${factCount}, ${bytes}
        where not exists (
          select 1 from public.brand_fact_scrape_pages
          where run_id = ${target.id} and url = ${url}
        )
        returning id
      `);
      inserted += result.rows.length;
    }
  }
  return inserted;
}

// A minimal shape for the drizzle db handle - enough for this script's own
// call sites, and easy to satisfy with a test double.
interface DbLike {
  execute<T = unknown>(query: unknown): Promise<{ rows: T[] }>;
}

if (process.argv[1]?.endsWith("seedLocalWorkDemo.ts")) {
  seedLocalWorkDemo()
    .then((summary) => {
      console.log("seedLocalWorkDemo: done", summary);
      process.exit(0);
    })
    .catch((error) => {
      console.error("seedLocalWorkDemo: failed", error);
      process.exit(1);
    });
}
