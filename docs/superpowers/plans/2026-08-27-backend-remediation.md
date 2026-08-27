# Backend Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the three measured performance root causes and close the correctness gaps found in the 2026-08-27 backend audit, without changing product behaviour.

**Architecture:** Every change is local to an existing file. No new services, no framework changes, no migration off Express or Drizzle. Work proceeds in dependency order: cheap round-trip wins first, then indexes, then SQL pushdown, then lock semantics, then the database role switch.

**Tech Stack:** TypeScript, Express 5, Drizzle ORM, node-postgres, Supabase Postgres 17 (transaction pooler, port 6543), Vitest.

**Spec:** The 2026-08-27 backend audit, recorded in `docs/superpowers/REGISTER.md` and backed by `pg_stat_statements` and Supabase advisor output captured 2026-08-27 against project `glaljfmdulqeijirsyxs`.

## Global Constraints

- **Database role:** the app currently connects as `postgres` (`DATABASE_URL` user is `postgres.glaljfmdulqeijirsyxs`). Do not assume RLS is enforcing anything until Task 9.
- **Pooler mode:** `DATABASE_URL` is the transaction pooler on port **6543**. Session-scoped Postgres features are unavailable. Session Mode on 6543 was removed by Supavisor on 2025-02-28.
- **Migrations are immutable once applied.** `server/lib/migrationChecksums.ts` throws on any checksum mismatch. Never edit an existing file in `migrations/`; always add a new numbered one.
- **Migration filenames:** follow the existing `NNNN_snake_case_name.sql` convention in `migrations/`. After adding one, run `npm run supabase:migrations:sync` so `supabase/migrations/` stays a verified mirror; CI runs `--check`.
- **Never run `apply_migration` against production from an agent session.** Migrations are applied by `npm run db:migrate:release`, a human-invoked step.
- **Index builds must be `CONCURRENTLY`** and therefore cannot run inside a transaction block.
- **Do not commit.** Leave changes in the working tree for human review.
- **Test command:** `npm test` (Vitest). Type check: `npm run check`.

---

### Task 1: Return the inserted row instead of re-selecting it

**Files:**

- Modify: `server/databaseStorage.ts:2129-2167` (`createCompetitorGeoRanking`)
- Modify: `server/databaseStorage.ts:614-642` (`createGeoRanking`)
- Test: `tests/unit/databaseStorage.insertReturning.test.ts` (create)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: no signature changes. `createCompetitorGeoRanking(...)` and `createGeoRanking(...)` keep returning `Promise<CompetitorGeoRanking>` / `Promise<GeoRanking>`.

**Why:** each call currently does `INSERT ... ON CONFLICT ... RETURNING id` followed by a second `SELECT * WHERE id = $1` purely to satisfy the return type. Production ran 84,892 of these inserts.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";

describe("createCompetitorGeoRanking", () => {
  it("issues exactly one database round trip", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [{ id: "r1", competitor_id: "c1", ai_platform: "ChatGPT", is_cited: 1 }],
    });
    const { makeStorage } = await import("../../server/databaseStorage");
    const storage = makeStorage({ execute } as never);

    const row = await storage.createCompetitorGeoRanking({
      competitorId: "c1",
      runId: "run1",
      brandPromptId: "p1",
      aiPlatform: "ChatGPT",
      isCited: 1,
    } as never);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(row.id).toBe("r1");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/databaseStorage.insertReturning.test.ts`
Expected: FAIL — `execute` called 2 times, or `makeStorage` is not exported.

If `makeStorage` does not exist, add a named export that constructs `DatabaseStorage` with an injected query executor, keeping the existing default export untouched. Do not restructure the class.

- [ ] **Step 3: Change the SQL to return every column**

In `createCompetitorGeoRanking`, change the `RETURNING id` clause to `RETURNING *` and delete the follow-up `SELECT`. Map the returned row through the same shape the old `SELECT` produced.

- [ ] **Step 4: Apply the identical change to `createGeoRanking`** (`server/databaseStorage.ts:614-642`).

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/databaseStorage.insertReturning.test.ts && npm run check`
Expected: PASS, and no type errors.

---

### Task 2: Add the five composite indexes

**Files:**

- Create: `migrations/0117_geo_rankings_checked_at_indexes.sql` (use the next unused number — check `ls migrations/` first)
- Modify: `shared/schema.ts` — add the matching index declarations to `geoRankings` (near line 1135) and `competitorGeoRankings` (near line 1272)

**Interfaces:**

- Consumes: nothing.
- Produces: index names that Task 4 relies on for index-only aggregate scans.

**Why:** every hot query filters `checked_at`, and neither table has a single index touching that column.

- [ ] **Step 1: Confirm the next migration number**

Run: `ls migrations/ | tail -5`

- [ ] **Step 2: Write the migration**

```sql
-- Composite indexes for the geo_rankings read path.
-- Equality columns first, range column last.
-- CONCURRENTLY: cannot run inside a transaction block.

create index concurrently if not exists geo_rankings_brand_prompt_id_checked_at_idx
  on geo_rankings (brand_prompt_id, checked_at desc);

create index concurrently if not exists geo_rankings_article_id_checked_at_idx
  on geo_rankings (article_id, checked_at desc);

create index concurrently if not exists geo_rankings_bp_cited_checked_at_idx
  on geo_rankings (brand_prompt_id, checked_at desc)
  where is_cited = 1;

create index concurrently if not exists cgr_competitor_id_checked_at_idx
  on competitor_geo_rankings (competitor_id, checked_at desc);

create index concurrently if not exists cgr_competitor_cited_checked_at_idx
  on competitor_geo_rankings (competitor_id, checked_at desc)
  where is_cited = 1;
```

- [ ] **Step 3: Mirror the declarations in `shared/schema.ts`** so future `drizzle-kit` diffs do not try to drop them.

- [ ] **Step 4: Sync the Supabase mirror**

Run: `npm run supabase:migrations:sync && npm run supabase:migrations:check`
Expected: check passes with no diff.

- [ ] **Step 5: Type check**

Run: `npm run check`

---

### Task 3: Batch the competitor ranking insert

**Files:**

- Modify: `server/citationChecker.ts:925-969`
- Modify: `server/databaseStorage.ts` — add `createCompetitorGeoRankings(rows)` beside the existing single-row method
- Test: `tests/unit/citationChecker.batchInsert.test.ts` (create)

**Interfaces:**

- Consumes: Task 1's single-round-trip `createCompetitorGeoRanking`.
- Produces: `createCompetitorGeoRankings(rows: InsertCompetitorGeoRanking[]): Promise<CompetitorGeoRanking[]>`. Task 4 does not depend on it.

**Why:** the insert sits inside `for (const comp of competitors)` nested in the per-prompt × per-platform loop, each call awaited sequentially.

- [ ] **Step 1: Write the failing test** asserting that processing one response with three competitors results in exactly one insert call carrying three rows.

- [ ] **Step 2: Run it and confirm it fails** (expect three calls of one row each).

- [ ] **Step 3: Add the batch method**

```ts
async createCompetitorGeoRankings(rows: InsertCompetitorGeoRanking[]) {
  if (rows.length === 0) return [];
  return db.insert(schema.competitorGeoRankings)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        schema.competitorGeoRankings.competitorId,
        schema.competitorGeoRankings.runId,
        schema.competitorGeoRankings.brandPromptId,
        schema.competitorGeoRankings.aiPlatform,
      ],
      set: {
        isCited: sql`excluded.is_cited`,
        rank: sql`excluded.rank`,
        relevanceScore: sql`excluded.relevance_score`,
        citationContext: sql`excluded.citation_context`,
        citingOutletUrl: sql`excluded.citing_outlet_url`,
        checkedAt: sql`now()`,
      },
    })
    .returning();
}
```

Verify the conflict target matches the real unique constraint before writing this — read the index declarations on `competitorGeoRankings` in `shared/schema.ts` and use those exact columns.

- [ ] **Step 4: Hoist the write out of the loop** in `citationChecker.ts`. Build an array inside the competitor loop; call the batch method once after it.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/citationChecker.batchInsert.test.ts && npm run check`

---

### Task 4: Push the metrics-snapshot aggregation into SQL

**Files:**

- Modify: `server/lib/metricsSnapshot.ts:37-88`
- Modify: `server/databaseStorage.ts` — add the two aggregate methods below, immediately after `getGeoRankingsByBrandPromptIds` (~line 666)
- Test: `tests/unit/metricsSnapshotAggregate.test.ts` (create)

**Interfaces:**

- Consumes: Task 2's `geo_rankings_brand_prompt_id_checked_at_idx`.
- Produces:
  - `getPromptCitationCounts(promptIds: string[]): Promise<Array<{ promptId: string; checks: number; cited: number }>>`
  - `getCitedRelevanceStats(promptIds: string[]): Promise<{ cited: number; scored: number; avgRelevance: number | null }>`

**Why:** this runs after **every** citation run, passes no date filter, and reduces every
returned row to a handful of counters in JavaScript. It is the largest single contributor
to the 2,117,407 rows measured on the top query.

**Read `server/lib/metricsSnapshot.ts:37-88` before writing anything.** The existing JS has
three properties that are easy to lose and must be preserved exactly:

1. `byPromptMap` groups by `brandPromptId` **only** — NOT by `ai_platform`. Grouping by
   both would change the shape of `metricDetails.byPrompt`.
2. Rows with a null `brandPromptId` are skipped (`if (!r.brandPromptId) continue`).
3. The `citation_quality` snapshot is written **only when at least one cited row has a
   non-null `relevanceScore`** (`if (withRelevance.length > 0)`), and `metricDetails`
   carries both `cited` (all cited rows) and `scored` (cited rows with a score).

- [ ] **Step 1: Write the failing test** asserting that, given fixed aggregate rows,
      `recordCurrentMetrics` writes byte-identical `metricValue` and `metricDetails` to
      what today's JS produces. Capture today's expected values by reading
      `metricsSnapshot.ts:50-88` first — do not invent them.

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Add the per-prompt aggregate**

```sql
select brand_prompt_id,
       count(*)::int                             as checks,
       count(*) filter (where is_cited = 1)::int as cited
from geo_rankings
where brand_prompt_id = any($1)
group by brand_prompt_id;
```

`brand_prompt_id = any($1)` already excludes nulls, which reproduces property 2 above.

- [ ] **Step 4: Add the relevance aggregate**

```sql
select count(*) filter (where is_cited = 1)::int                            as cited,
       count(relevance_score) filter (where is_cited = 1)::int              as scored,
       (avg(relevance_score) filter (where is_cited = 1))::float8           as avg_relevance
from geo_rankings
where brand_prompt_id = any($1);
```

Three things this must get right:

- `count(relevance_score)` counts NON-NULL values, which is exactly `withRelevance.length`.
- `relevance_score` is `integer`, so bare `avg()` returns `numeric`, and **node-postgres
  returns `numeric` as a JavaScript string**. The `::float8` cast makes it a real number.
  Without it, `.toFixed(2)` on the result would throw.
- `avg` returns NULL when no cited row has a score; that is the `scored === 0` case.

- [ ] **Step 5: Replace the JS reductions** in `metricsSnapshot.ts`. Keep the
      `scored > 0` guard around the `citation_quality` snapshot, and keep
      `metricValue: avgRelevance.toFixed(2)`. Delete the now-unused raw fetch.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/unit/metricsSnapshotAggregate.test.ts && npm run check && npm test`
Expected: PASS, and `npm test` 0 failed.

### Task 5: Push the citation-trend bucketing into SQL

**Files:**

- Modify: `server/routes/dashboard.ts:995-1041`
- Modify: `server/databaseStorage.ts` — add `getWeeklyCitationTrend(promptIds, since)`
- Test: `tests/unit/dashboard.citationTrend.test.ts` (create)

**Interfaces:**

- Consumes: Task 2's index; the aggregate-row shape from Task 4.
- Produces: `getWeeklyCitationTrend(promptIds: string[], since: Date): Promise<Array<{ weekStart: string; total: number; cited: number }>>`.

**Why:** the handler pulls an 8-week window of full rows and hand-rolls Monday-anchored buckets.

- [ ] **Step 1: Write the failing test** asserting that a brand with no rankings in week 3 still returns 8 buckets, with week 3 zeroed. This preserves today's behaviour, which seeds all 8 weeks.

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Write the query**

```sql
select date_trunc('week', checked_at)::date as week_start,
       count(*)::int                              as total,
       count(*) filter (where is_cited = 1)::int  as cited
from geo_rankings
where brand_prompt_id = any($1) and checked_at >= $2
group by 1
order by 1;
```

Postgres `date_trunc('week', ...)` is Monday-anchored, matching the existing `weekStartOf` helper. Keep the zero-fill for empty weeks in JavaScript — the query returns only weeks with rows.

- [ ] **Step 4: Replace the handler's loop** with a read of those rows plus the zero-fill.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/dashboard.citationTrend.test.ts && npm run check`

---

### Task 6: Collapse the gap-matrix N+1

**Files:**

- Modify: `server/routes/dashboard.ts:913-965`
- Modify: `server/databaseStorage.ts` — add `getCompetitorRankingsForCompetitors(competitorIds, since)`
- Test: `tests/unit/dashboard.gapMatrix.test.ts` (create)

**Interfaces:**

- Consumes: Task 2's `cgr_competitor_id_checked_at_idx`.
- Produces: `getCompetitorRankingsForCompetitors(competitorIds: string[], since: Date)` returning rows keyed by `competitorId`.

**Why:** the handler issues one `getCompetitorGeoRankings` per competitor inside `Promise.all` — up to six full reads where one `WHERE competitor_id = ANY(...)` suffices.

- [ ] **Step 1: Write the failing test** asserting one query for six competitors.
- [ ] **Step 2: Run it and confirm it fails** (expect six).
- [ ] **Step 3: Add the batched method** using `inArray(schema.competitorGeoRankings.competitorId, competitorIds)`.
- [ ] **Step 4: Group by `competitorId` in the handler**, preserving the existing response shape exactly.
- [ ] **Step 5: Run the tests.**

---

### Task 7: Convert every advisory lock to transaction scope

**Files:**

- Modify: `server/lib/advisoryLock.ts:52-117`
- Modify: `server/lib/workflowEngine.ts:74-124`
- Modify: `server/lib/migrationRunner.ts:163-264`
- Modify: `server/databaseStorage.ts:3852-3869`
- Test: `tests/unit/advisoryLock.test.ts` (create or extend)

**Interfaces:**

- Consumes: nothing.
- Produces: `withAdvisoryLock(key, fn)` and `withDynamicAdvisoryLock(ns, id, fn)` keep their signatures. Internally they now run inside one transaction and release on commit.

**Why:** five of six lock sites use session-scoped locks on a transaction-mode pooler. `pg_advisory_lock` showed a 64-second max block in production. `databaseStorage.ts:3852-3869` is the worst — acquire and release are two independent pool round trips with a full scrape between them.

- [ ] **Step 1: Write the failing test** asserting that `withAdvisoryLock` issues `pg_try_advisory_xact_lock` inside a transaction and issues **no** explicit unlock.

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Rewrite the helpers**

```ts
export async function withAdvisoryLock<T>(key: number, fn: () => Promise<T>): Promise<T | null> {
  return db.transaction(async (tx) => {
    const got = await tx.execute(sql`select pg_try_advisory_xact_lock(${key}) as locked`);
    if (!got.rows[0]?.locked) return null;
    return fn();
  });
}
```

Note the behavioural consequence and keep it: the callback now runs inside a transaction, so anything it does is part of that transaction. Before changing each call site, confirm the callback performs no network I/O. The audit found none do — verify per site rather than trusting that.

- [ ] **Step 4: Delete `tryAcquireScrapeLock` / `releaseScrapeLock`** and route those call sites through `withDynamicAdvisoryLock` with the `fullBrandScrape` namespace, so one mechanism guards the resource.

- [ ] **Step 5: Fix `migrationRunner.ts`** — wrap the whole apply pass in one transaction using `pg_advisory_xact_lock`, and delete the manual unlock at line 259.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/unit/advisoryLock.test.ts && npm run check`

---

### Task 8: Retention, constraints, and the two RLS policies

**Files:**

- Create: `migrations/0118_retention_and_constraints.sql` (next unused number)
- Modify: `server/routes/cron.ts` — extend the `signals-retention-prune` step

**Interfaces:**

- Consumes: nothing.
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Add CHECK constraints** to the four status columns that gate invariants, using the idempotent pattern already used in `migrations/0026`:

```sql
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'articles_status_check') then
    alter table articles add constraint articles_status_check
      check (status in ('draft','generating','ready','failed'));
  end if;
end $$;
```

Repeat for `content_generation_jobs.status`, `citation_runs.status`, and `brand_fact_scrape_runs.status`. **Before writing each constraint, query the live distinct values** so an existing row cannot fail the constraint:

```sql
select status, count(*) from articles group by 1;
```

- [ ] **Step 2: Fix the two RLS policies** flagged by the advisor, wrapping `current_setting` in a sub-select exactly as migration 0113 did elsewhere:

```sql
alter policy brand_prompts_content_request_select on brand_prompts
  using (exists (
    select 1 from brands
    where brands.id::text = brand_prompts.brand_id::text
      and brands.user_id::text = (select nullif(current_setting('venturecite.user_id', true), ''))
      and brands.deleted_at is null));
```

Do the same for `citation_runs_content_request_select`.

- [ ] **Step 3: Add the three foreign-key indexes that earn their keep** — `brand_fact_sheet.run_id`, `brand_perception_probes.brand_id`, `faq_items.article_id`. Skip the other nine flagged FKs; their columns are never queried and the tables are under 1,000 rows.

- [ ] **Step 4: Extend the retention cron** in `server/routes/cron.ts` to prune `api_costs`, `geo_rankings`, `competitor_geo_rankings`, and `competitor_citation_snapshots`, copying the 90-day-age plus per-brand-cap pattern already at `cron.ts:412-440`.

- [ ] **Step 5: Sync and check**

Run: `npm run supabase:migrations:sync && npm run supabase:migrations:check && npm run check`

---

### Task 9: Switch the app to the runtime role — STAGING ONLY

**Files:**

- Modify: `.env.example` — document `DATABASE_RUNTIME_ROLE_NAME`
- Modify: `docs/deploy-runbook.md` — document the cutover and the rollback

**Interfaces:**

- Consumes: every prior task.
- Produces: nothing.

**Why:** the app connects as `postgres`, so migrations 0096–0114 — three roles, column-level grants, 26 policies — enforce nothing outside the four route files that call `SET LOCAL ROLE`. `venturecite_runtime` exists and is correctly a member of all three restricted roles.

**This task does not touch production.** It produces a tested staging cutover and a written rollback.

- [ ] **Step 1: Enumerate what breaks.** Run the full test suite against a database where the connection role is `venturecite_runtime`. Record every failure — each one is a query that was silently relying on owner privileges.

- [ ] **Step 2: Write the missing grants** as a new migration, one table at a time, driven by the failures from Step 1. Do not blanket-grant.

- [ ] **Step 3: Re-run the suite until clean.**

- [ ] **Step 4: Write the runbook entry** — the exact `DATABASE_URL` change, how to verify (`select current_user`), and the one-line rollback.

- [ ] **Step 5: Stop.** Hand the cutover to a human. Do not change production `DATABASE_URL` from an agent session.

---

## Deferred, with reasons

- **Primary key types.** 57 legacy tables use `varchar` UUIDs; 9 newer tables already use native `uuid`. Migrating would touch 81 FK columns to save single-digit MB. Keep `uuid` for new tables; cast `auth.uid()::text` in policies.
- **Dropping unused indexes.** They total 2.2 MB of 48 MB and mostly sit on sub-1,000-row tables for features that exist in code but have not seen traffic. Re-adding later costs a lock that scales with the table.
- **Partitioning.** Largest table is 72,209 rows — three orders of magnitude below where it pays.
- **Revoking the 994 `anon`/`authenticated` grants.** Correct and cheap, but do it _after_ Task 9, so that a permissions failure has one possible cause rather than two.
