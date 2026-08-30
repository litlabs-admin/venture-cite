# V1 migration safety audit

1 | blocker | migrations/0122_api_costs_cost_precision.sql:51-53
What the SQL does: It changes every existing `api_costs.est_cost_cents` value from `integer` to `numeric(12,6)`.
Why it is wrong: PostgreSQL `integer` permits -2,147,483,648 through 2,147,483,647. `numeric(12,6)` permits only six digits before the decimal point. Values below -999,999 or above 999,999 cause numeric field overflow. The cast loses no precision for values within that range, but it can error for a legal integer value. The repository contains no preflight check.
Concrete failure sequence: One row contains `1000000`. The `USING` cast raises numeric overflow. The runner rolls back the whole migration, but the migration is not safe until production data proves that every value fits.
Confidence: high

2 | none | migrations/0122_api_costs_cost_precision.sql:49-66
What the SQL does: It drops one policy, changes the column type and default, then recreates the policy. It does not update, delete, or recompute rows.
Why it is correct: Existing values such as `0` and `5` become `0.000000` and `5.000000`. The 3,500 historical zero rows remain zero. The default change affects future inserts only. The type change is exactly reversible only while all values remain integral and within the integer range.
Concrete failure sequence: No row-data failure occurs for fitting integer values. A later fractional value makes an integer rollback lossy.
Confidence: high

3 | none | migrations/0123_citation_run_last_advance.sql:37-38
What the SQL does: It adds a nullable `TIMESTAMPTZ` column to `citation_runs`.
Why it is correct: Existing rows receive `NULL`. No existing column or row value changes. The application reads `NULL` and falls back to `started_at` in server/lib/citationReconciliation.ts:53-58 and :63-76.
Concrete failure sequence: A row created before the migration remains readable. A later progress write stores a timestamp in the new column.
Confidence: high

4 | none | migrations/0124_rls_defence_in_depth.sql:15-302
What the SQL does: It enables RLS on `job_leases`, creates or validates a role, grants read access, and creates ten read policies.
Why it is correct: It contains no `INSERT`, `UPDATE`, or `DELETE` against application tables. It changes access metadata only. The current restricted request role type in server/data/restrictedRequestTransaction.ts:5-21 does not include the new role, so the new policies are dormant for current request code.
Concrete failure sequence: A future session uses `venturecite_entity_request` with no matching user setting. The policies return no rows. Existing row data remains unchanged.
Confidence: high

5 | none | migrations/0122_api_costs_cost_precision.sql:49-66; migrations/0113_rls_current_setting_initplan.sql:233-246
What the SQL does: It replaces `api_costs_outbox_worker_insert` during the type change.
Why it is correct: The role is `venturecite_outbox_worker` in both definitions. Both use `FOR INSERT`. The `WITH CHECK` predicates are equivalent in column order and tests. The only intended difference from 0099 is the `(select current_setting(...))` wrapper already established by 0113. The select policy does not reference `est_cost_cents`, so it does not block the type change. Static search found no view, index, generated column, constraint, or trigger that depends on this column.
Concrete failure sequence: A worker inserts a non-negative numeric cost after the migration. The recreated policy evaluates the same ownership, service, token, cost, and idempotency checks.
Confidence: high

6 | none | migrations/0019_api_costs.sql:12-28; migrations/0009_citation_runs.sql:5-22; migrations/0119_job_leases.sql:1-9
What the SQL does: It relies on objects created by earlier lexical migrations.
Why it is correct: 0122 relies on `api_costs`, its worker role and policy from 0098, 0099, and 0113. 0123 relies on `citation_runs` from 0009 and later status/RLS changes. 0124 relies on the listed tables and RLS state from earlier migrations. The three target files do not depend on one another.
Concrete failure sequence: The runner reads all root migration files, sorts them lexically at server/lib/migrationRunner.ts:154-158, and processes 0122, 0123, then 0124. It skips any ledger-verified file at :217-231. A missing earlier production migration is not proven by this repository audit and can block the pass.
Confidence: high

7 | high | migrations/0122_api_costs_cost_precision.sql:49-53
What the SQL does: It takes `AccessExclusiveLock` on `public.api_costs` for policy drop and table alteration. The integer-to-numeric conversion requires a heap rewrite because the types are not binary compatible. The default change does not add row work.
Why it is wrong: The lock blocks reads and writes to `api_costs` until commit. The runner holds it inside the transaction shown at server/lib/migrationRunner.ts:266-280. A 3,500-row heap is probably a short rewrite on normal storage, but lock acquisition can wait without a bound behind an existing transaction. The retention code only proves a 180-day deletion rule at server/services/cronRetention.ts:53-54. It does not prove the current heap size or rewrite time.
Concrete failure sequence: A long transaction holds `api_costs`. The migration waits. After it acquires the lock, cost writes queue during the rewrite. A live release needs a controlled low-traffic or maintenance window.
Confidence: high

8 | medium | migrations/0123_citation_run_last_advance.sql:37-38; migrations/0124_rls_defence_in_depth.sql:15,149-302
What the SQL does: 0123 takes `AccessExclusiveLock` on `citation_runs` for an additive column with no default. 0124 takes `AccessExclusiveLock` on `job_leases`, `brands`, and the nine child tables for RLS and policy DDL. Its `GRANT` statements change ACL metadata and do not rewrite heaps. Its role catalog statements lock system catalogs and do not rewrite application tables.
Why it matters: 0123 does not rewrite the table, but it can wait behind or briefly block traffic. 0124 does not rewrite rows, but it holds each table lock until its transaction commits. These files can run during live traffic only with lock monitoring and a short controlled window.
Concrete failure sequence: A request holds a long read transaction on one target table. The corresponding 0124 policy DDL waits. Later requests to that table queue behind the pending exclusive lock.
Confidence: high

9 | none | migrations/0122_api_costs_cost_precision.sql:25-67; migrations/0123_citation_run_last_advance.sql:37-38; migrations/0124_rls_defence_in_depth.sql:61-302
What the SQL does: It uses a conditional type check in 0122, `IF NOT EXISTS` in 0123, and guarded role creation plus `DROP POLICY IF EXISTS` in 0124.
Why it is correct: The runner wraps ordinary migrations in `BEGIN` and `COMMIT` and rolls back on failure at server/lib/migrationRunner.ts:266-280. A process death during a file leaves no partial DDL for a retry. 0122's `CREATE POLICY` statements are unguarded by themselves, but the preceding drop and the outer type guard make a committed replay skip them. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is a repeatable no-op, as also used by migrations/0081_enable_rls_all_public_tables.sql:42-45.
Concrete failure sequence: The runner dies before commit. PostgreSQL rolls back the policy drop and type change. The retry sees `integer` and runs the complete file. A manually executed partial file outside this runner could leave the policy absent because the outer guard would then see `numeric` and skip the repair.
Confidence: high

10 | none | migrations/0099_content_cost_idempotency.sql:9-21; migrations/0122_api_costs_cost_precision.sql:46-52
What the SQL does: 0099 grants column-level `INSERT` on `est_cost_cents` to `venturecite_outbox_worker`. 0122 does not revoke or replace that grant.
Why it is correct: `ALTER COLUMN TYPE` preserves the existing column identity and ACL. Dropping a policy does not change grants. If a database engine or manual repair removed the grant, this migration would not restore it and worker inserts would fail with permission denied.
Concrete failure sequence: The worker sets its role at server/outbox/contentCostOutboxAdapter.ts:75-77. The insert keeps its column grant after a successful 0122 run.
Confidence: high

11 | medium | migrations/0123_citation_run_last_advance.sql:37-38; shared/schema/citations.ts:137
What the SQL does: It creates `last_advance_started_at` as `TIMESTAMPTZ`, while the Drizzle schema declares `timestamp("last_advance_started_at")` without `withTimezone: true`.
Why it is wrong: The database schema and shared schema disagree. The current insert and select paths use Date values in server/storage/citationsStorage.ts:254-261, :343-359, and :376-395, so this audit cannot prove an immediate runtime error. Schema generation or a later schema comparison can propose the wrong type, and timestamp interpretation can drift.
Concrete failure sequence: The migration applies. A schema tool reads the shared declaration as `timestamp without time zone` and reports or applies a conflicting change. The old application ignores this additive column, but the current repository declares it incorrectly.
Confidence: high

12 | high | server/lib/llmBudget.ts:73-101; server/routes/assistant.ts:391-395; shared/schema/platform.ts:211
What the SQL does: 0122 permits fractional cents and the current application writes them.
Why it matters: Old code that writes whole integers remains compatible with `numeric(12,6)`. Static search found no server or shared code that reads `est_cost_cents` as an integer. The current code computes fractional values at server/lib/llmPricing.ts:125-137, so deploying this code before 0122 can send a fraction to the production integer column and fail.
Concrete failure sequence: The current code computes `0.14` cents. Production still has `integer`. The insert at server/lib/llmBudget.ts:77-97 or server/routes/assistant.ts:393-395 fails before 0122. Apply the schema migration before enabling this writer.
Confidence: high

13 | medium | migrations/0124_rls_defence_in_depth.sql:90-135; migrations/0098_transactional_outbox.sql:176-218
What the SQL does: 0124 validates role attributes and direct relation privileges for a pre-existing managed role. It does not validate role memberships, role configuration, schema privileges, object ownership, or database privileges.
Why it is wrong: The earlier managed-role migration checks memberships, role configuration, schema privileges, database privileges, and ownership. A pre-existing `venturecite_entity_request` with the expected comment can pass 0124 while carrying unreviewed role state. The actual production role state is not available in this static audit.
Concrete failure sequence: A role with the 0124 comment already exists and has an unexpected membership. The two 0124 checks pass. The migration adds grants and policies to a role whose complete privilege boundary was not verified.
Confidence: high

14 | none | migrations/20260421000130_0122_api_costs_cost_precision.sql:1-6; migrations/20260421000131_0123_citation_run_last_advance.sql:1-5; migrations/20260421000132_0124_rls_defence_in_depth.sql:1-5
What the SQL does: The three Supabase migration files add source and SHA comments, then contain the same SQL as the root files.
Why it is correct: `git diff --no-index` shows only the two header comments in each mirror. The embedded SHA values match the current root file hashes. No SQL drift exists.
Concrete failure sequence: The Supabase platform applies a mirror. Its SQL effect matches the root migration. The application runner reads only `migrations/*.sql` at server/lib/migrationRunner.ts:154-158.
Confidence: high

15 | high | migrations/0122_api_costs_cost_precision.sql:49-66
What the SQL does: It changes the column to numeric and recreates the current worker policy.
Why it matters: A rollback can restore the old type only if every post-migration value is an integral integer in range. A fractional value cannot return to integer without rounding or another lossy conversion.
Concrete failure sequence: Run this rollback only after checking that all values are integral and within the integer range:

```sql
BEGIN;
DROP POLICY IF EXISTS api_costs_outbox_worker_insert ON public.api_costs;
ALTER TABLE public.api_costs
  ALTER COLUMN est_cost_cents TYPE integer USING est_cost_cents::integer,
  ALTER COLUMN est_cost_cents SET DEFAULT 0;
CREATE POLICY api_costs_outbox_worker_insert
  ON public.api_costs
  FOR INSERT
  TO venturecite_outbox_worker
  WITH CHECK (
    user_id = nullif((select current_setting('venturecite.outbox_user_id', true)), '')
    AND service <> ''
    AND tokens_in >= 0
    AND tokens_out >= 0
    AND est_cost_cents >= 0
    AND idempotency_key IS NOT NULL
  );
COMMIT;
```

This rollback is not lossless after fractional writes.
Confidence: high

16 | none | migrations/0123_citation_run_last_advance.sql:37-38
What the SQL does: It adds one nullable column.
Why it matters: The schema-only rollback is exact only before any value is written. Dropping the column removes all progress timestamps written after the migration.
Concrete failure sequence: Use `ALTER TABLE citation_runs DROP COLUMN IF EXISTS last_advance_started_at;` only when the application no longer references the column and its values may be discarded. Otherwise no lossless rollback exists.
Confidence: high

17 | medium | migrations/0124_rls_defence_in_depth.sql:15,137,149-302
What the SQL does: It adds RLS, grants, policies, and possibly a new role.
Why it matters: A universal rollback cannot know whether `venturecite_entity_request` existed before this migration. Dropping a pre-existing role or removing grants used by another change can break access. No row data loss occurs.
Concrete failure sequence: For a role created by this migration, after no later use, run this metadata-only rollback:

```sql
BEGIN;
DROP POLICY IF EXISTS brands_entity_request_select ON public.brands;
DROP POLICY IF EXISTS competitors_entity_request_select ON public.competitors;
DROP POLICY IF EXISTS faq_items_entity_request_select ON public.faq_items;
DROP POLICY IF EXISTS listicles_entity_request_select ON public.listicles;
DROP POLICY IF EXISTS bofu_content_entity_request_select ON public.bofu_content;
DROP POLICY IF EXISTS brand_hallucinations_entity_request_select ON public.brand_hallucinations;
DROP POLICY IF EXISTS brand_fact_sheet_entity_request_select ON public.brand_fact_sheet;
DROP POLICY IF EXISTS brand_mentions_entity_request_select ON public.brand_mentions;
DROP POLICY IF EXISTS community_posts_entity_request_select ON public.community_posts;
DROP POLICY IF EXISTS citation_quality_entity_request_select ON public.citation_quality;
REVOKE SELECT (id, user_id, deleted_at) ON public.brands FROM venturecite_entity_request;
REVOKE SELECT ON public.competitors, public.faq_items, public.listicles,
  public.bofu_content, public.brand_hallucinations, public.brand_fact_sheet,
  public.brand_mentions, public.community_posts, public.citation_quality
  FROM venturecite_entity_request;
REVOKE USAGE ON SCHEMA public FROM venturecite_entity_request;
ALTER TABLE public.job_leases DISABLE ROW LEVEL SECURITY;
DROP ROLE venturecite_entity_request;
COMMIT;
```

For a pre-existing role, do not run `DROP ROLE`; there is no safe universal rollback without production catalog state.
Confidence: high

## Verdict

NOT SAFE

Blocking reasons: 0122 can fail on legal existing integer values outside the `numeric(12,6)` range. The repository has no production min/max proof. 0122 also needs a controlled lock window, and the current fractional-cost writer must not run before the type change. Fix the 0123 Drizzle timezone declaration and verify the 0124 role boundary before release.

## Unsettled without a database

- The actual minimum and maximum `api_costs.est_cost_cents` values.
- The actual current `api_costs` heap size and rows retained by the 180-day rule.
- The actual lock wait and rewrite duration under production traffic.
- Whether any earlier dependency migration is absent from the production ledger.
- Whether `venturecite_entity_request` already exists, and its memberships, configuration, privileges, and ownership.
- Whether production has any manually created dependency on `est_cost_cents` not represented in repository SQL.
- Whether a deployed old binary has custom PostgreSQL type parsers. Repository reads do not select `est_cost_cents` directly.
