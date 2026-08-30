# V5 RLS correctness audit

Audit date: 2026-08-31

Scope: `migrations/0124_rls_defence_in_depth.sql`, earlier RLS migrations, server database access, server background writes, indexes, and the Supabase mirror.

This audit used source files only. It did not start Docker, connect to PostgreSQL, or run a database test.

## Effective role and whether RLS applies at all

The application pool uses the database user from the `DATABASE_URL` user component. The current workspace `.env` sets that user to `postgres.glaljfmdulqeijirsyxs` at `.env:6`. `server/db.ts:47-60` creates the pool from `process.env.DATABASE_URL`, and `server/db.ts:52-54` passes that URL without a `SET ROLE` operation.

The source does not prove whether this role owns the nine tables, has `rolbypassrls`, or has another role membership. Those values require the PostgreSQL catalogs. The effective application role is therefore `UNSETTLED-NEEDS-DB` for RLS purposes.

Migration 0124 creates or validates `venturecite_entity_request` at `migrations/0124_rls_defence_in_depth.sql:61-135`. It sets `NOBYPASSRLS` only when it creates the role. The migration does not issue `ALTER TABLE ... FORCE ROW LEVEL SECURITY` for any target table. The only `FORCE ROW LEVEL SECURITY` statement found in the migration history targets `outbox_commands` at `migrations/0098_transactional_outbox.sql:135-136`.

The server source does not reference `venturecite_entity_request`. The restricted request helper allows only `venturecite_request` and `venturecite_content_request`, then runs `SET LOCAL ROLE` and transaction-local `venturecite.user_id` at `server/data/restrictedRequestTransaction.ts:5-22`. The outbox worker uses `venturecite_outbox_worker` at `server/outbox/outboxRepository.ts:244-251`. No current server path sets the entity role.

This gives two possible live outcomes.

- If the pool role owns a target table, PostgreSQL owner bypasses RLS because 0124 does not force RLS. The new policies do not constrain that application query.
- If the pool role is not the owner and does not bypass RLS, the `TO venturecite_entity_request` policies do not match the pool role. RLS then denies the application query unless the role uses a matching role membership or `SET ROLE`, which the server source does not show.

The migration therefore does not establish tenant protection for the current application path from source alone. It also creates a possible job outage if the current pool role is not an owner or RLS bypass role.

## Per-table policy matrix

The nine target tables already have RLS enabled through `migrations/0001_auth_sync.sql` and the all-table guard in `migrations/0081_enable_rls_all_public_tables.sql:1-47`. Migration 0124 adds one SELECT policy per target table. `none` in a write column means no policy exists for that command. RLS denies that command for the entity role.

| table                  | RLS enabled    | FORCE? | SELECT                                       | INSERT       | UPDATE       | DELETE       | tenant column | index?          | initplan-wrapped? |
| ---------------------- | -------------- | ------ | -------------------------------------------- | ------------ | ------------ | ------------ | ------------- | --------------- | ----------------- |
| `competitors`          | yes, `0001:68` | no     | `competitors_entity_request_select`          | none, denied | none, denied | none, denied | `brand_id`    | yes, `0000:99`  | yes, `0124:171`   |
| `faq_items`            | yes, `0001:73` | no     | `faq_items_entity_request_select`            | none, denied | none, denied | none, denied | `brand_id`    | yes, `0000:180` | yes, `0124:187`   |
| `listicles`            | yes, `0001:70` | no     | `listicles_entity_request_select`            | none, denied | none, denied | none, denied | `brand_id`    | yes, `0000:131` | yes, `0124:203`   |
| `bofu_content`         | yes, `0001:72` | no     | `bofu_content_entity_request_select`         | none, denied | none, denied | none, denied | `brand_id`    | yes, `0000:163` | yes, `0124:219`   |
| `brand_hallucinations` | yes, `0001:77` | no     | `brand_hallucinations_entity_request_select` | none, denied | none, denied | none, denied | `brand_id`    | yes, `0000:262` | yes, `0124:235`   |
| `brand_fact_sheet`     | yes, `0001:78` | no     | `brand_fact_sheet_entity_request_select`     | none, denied | none, denied | none, denied | `brand_id`    | yes, `0000:277` | yes, `0124:251`   |
| `brand_mentions`       | yes, `0001:74` | no     | `brand_mentions_entity_request_select`       | none, denied | none, denied | none, denied | `brand_id`    | yes, `0000:198` | yes, `0124:267`   |
| `community_posts`      | yes, `0001:91` | no     | `community_posts_entity_request_select`      | none, denied | none, denied | none, denied | `brand_id`    | yes, `0000:559` | yes, `0124:283`   |
| `citation_quality`     | yes, `0001:76` | no     | `citation_quality_entity_request_select`     | none, denied | none, denied | none, denied | `brand_id`    | yes, `0000:242` | yes, `0124:299`   |

Supporting tables used by the policies have the following state.

| table        | RLS enabled    | FORCE? | SELECT                                                       | INSERT         | UPDATE         | DELETE         | tenant column | index?                                         | initplan-wrapped? |
| ------------ | -------------- | ------ | ------------------------------------------------------------ | -------------- | -------------- | -------------- | ------------- | ---------------------------------------------- | ----------------- |
| `brands`     | yes, `0001:58` | no     | `brands_entity_request_select` plus earlier request policies | no 0124 policy | no 0124 policy | no 0124 policy | `user_id`     | no dedicated `user_id` index found             | yes, `0124:156`   |
| `job_leases` | yes, `0124:15` | no     | none                                                         | none, denied   | none, denied   | none, denied   | none          | primary key and lease indexes, no tenant index | N/A               |

### Policy expressions

The 0124 brands policy is `FOR SELECT TO venturecite_entity_request` at `migrations/0124_rls_defence_in_depth.sql:151-158`.

```sql
USING (
  user_id = nullif((select current_setting('venturecite.user_id', true)), '')
  AND deleted_at IS NULL
)
```

It has no `WITH CHECK` expression. It has no INSERT, UPDATE, or DELETE policy.

Each target policy has the same predicate shape. The table name changes in the `brand_id` comparison.

```sql
USING (
  EXISTS (
    SELECT 1
    FROM public.brands
    WHERE brands.id = <table>.brand_id
      AND brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')
      AND brands.deleted_at IS NULL
  )
)
```

The concrete expressions appear at these lines.

| table                  | policy and exact predicate lines | WITH CHECK |
| ---------------------- | -------------------------------- | ---------- |
| `competitors`          | `0124:162-174`                   | none       |
| `faq_items`            | `0124:178-190`                   | none       |
| `listicles`            | `0124:194-206`                   | none       |
| `bofu_content`         | `0124:210-222`                   | none       |
| `brand_hallucinations` | `0124:226-238`                   | none       |
| `brand_fact_sheet`     | `0124:242-254`                   | none       |
| `brand_mentions`       | `0124:258-270`                   | none       |
| `community_posts`      | `0124:274-286`                   | none       |
| `citation_quality`     | `0124:290-302`                   | none       |

All nine tables contain `brand_id`. The source definitions show the columns and indexes in `migrations/0000_phase2_schema.sql:90-99`, `114-131`, `148-163`, `165-180`, `182-198`, `224-242`, `244-262`, `264-277`, and `545-559`.

The child policy joins `brands.id` to the child `brand_id`. The child indexes support the child-side lookup. The `brands.id` primary key supports the brand-side lookup. The brands policy filters by `brands.user_id`, but the migration search found no dedicated index on `brands.user_id`.

The `brands` subquery is subject to RLS when the entity role runs it. The entity brands policy permits only the same transaction-local user ID and non-deleted brands. A missing or empty GUC returns no brand rows, so the child policy fails closed. This can still produce zero rows when a caller forgets the GUC.

The missing `WITH CHECK` clauses do not create an INSERT bypass in 0124. The migration grants only SELECT on the target tables at `migrations/0124_rls_defence_in_depth.sql:160`, `176`, `192`, `208`, `224`, `240`, `256`, `272`, and `288`. The entity role has no INSERT policy or INSERT grant. Any entity-role INSERT, UPDATE, or DELETE is denied.

## GUC and pooled connection behavior

Request-scoped GUC setup uses `set_config(..., true)` inside a transaction at `server/data/restrictedRequestTransaction.ts:17-22`. The same helper sets `SET LOCAL ROLE`. The `true` argument makes the setting transaction-local. The request repositories call this helper inside a transaction, for example `server/data/requestUserRepository.ts:47-53` and `server/data/requestBrandRepository.ts:153-160`.

The outbox worker also uses transaction-local role and GUC settings at `server/outbox/outboxRepository.ts:244-251` and `server/outbox/contentCostOutboxAdapter.ts:74-79`. A pooled connection can therefore serve another request without retaining the previous request's GUC, based on the source path.

The current server paths do not set `venturecite_entity_request`. They use direct `db` access or the request and outbox roles. This means 0124's entity policies do not directly authorize those paths.

## Background write paths that the policy could block

The table below lists server background or detached work that writes one of the nine tables, plus `job_leases`, which 0124 enables. `No` in `GUC set?` means the path does not set `venturecite.user_id` before the write. `blocked?` remains conditional because the live pool role ownership and RLS bypass state are not available.

| job/file:line                                                                                                                             | table written                                | GUC set? | blocked?                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `server/lib/advisoryLock.ts:66-76,87-93,116-119`                                                                                          | `job_leases`                                 | no       | `UNSETTLED-NEEDS-DB`; denied for a non-owner, non-BYPASSRLS role because 0124 leaves zero policies; allowed for an owner |
| `server/scheduler.ts:410-413` -> `server/lib/competitorDiscovery.ts:143-160`                                                              | `competitors`                                | no       | `UNSETTLED-NEEDS-DB`; the entity role has no INSERT policy                                                               |
| `server/scheduler.ts:428-451` -> `server/lib/runMentionScan.ts:34-36` -> `server/lib/mentionScanner.ts:160-183`                           | `brand_mentions`                             | no       | `UNSETTLED-NEEDS-DB`; the entity role has no INSERT policy                                                               |
| `server/scheduler.ts:464-473` -> `server/lib/listicleScanner.ts:105-134,237-253`                                                          | `listicles`                                  | no       | `UNSETTLED-NEEDS-DB`; the entity role has no INSERT or UPDATE policy                                                     |
| `server/lib/brandActivation.ts:154-181`                                                                                                   | `brand_mentions`, `listicles`, `competitors` | no       | `UNSETTLED-NEEDS-DB`; these writes use the application storage path, not the entity role                                 |
| `server/routes/cron.ts:188` -> `server/citationChecker.ts:1187-1194,1424-1435` -> `server/lib/hallucinationDetector.ts:146-165,302-319`   | `competitors`, `brand_hallucinations`        | no       | `UNSETTLED-NEEDS-DB`; entity-role writes would fail, and non-owner app-role writes have no matching 0124 policy          |
| `server/routes/cron.ts:121-124` -> `server/lib/factAgent/v2/factScrapeBackstop.ts:58-65` -> `server/lib/factAgent/v2/aggregate.ts:94-125` | `brand_fact_sheet`                           | no       | `UNSETTLED-NEEDS-DB`; entity-role writes would fail                                                                      |
| `server/routes/cron.ts:219-247` -> `server/lib/factAgent/v2/runFactSheetRefresh.ts:202-234`                                               | `brand_fact_sheet`                           | no       | `UNSETTLED-NEEDS-DB`; entity-role writes would fail                                                                      |
| `server/lib/onboardingAutopilot.ts:173-198,229-239`                                                                                       | `brand_fact_sheet`, `competitors`            | no       | `UNSETTLED-NEEDS-DB`; detached onboarding writes have no entity-role write policy                                        |
| `server/services/factSheetV2Pipeline.ts:102-108` -> `runFullScrapeForBrand`                                                               | `brand_fact_sheet`                           | no       | `UNSETTLED-NEEDS-DB`; detached work has no entity-role write policy                                                      |
| No server background writer found in the source search                                                                                    | `faq_items`                                  | N/A      | no background path identified                                                                                            |
| No server background writer found in the source search                                                                                    | `bofu_content`                               | N/A      | no background path identified                                                                                            |
| No server background writer found in the source search                                                                                    | `community_posts`                            | N/A      | no background path identified                                                                                            |
| No server background writer found in the source search                                                                                    | `citation_quality`                           | N/A      | no background path identified                                                                                            |

The scheduler uses the in-process scheduler in `server/scheduler.ts:850-888`. The cron route also invokes the work in `server/routes/cron.ts:188-247`. None of these paths sets `venturecite.user_id` before its direct storage writes.

## Earlier RLS landscape and migration interaction

The earlier RLS review covered every migration containing `POLICY`, `ROW LEVEL SECURITY`, or `current_setting`.

- `0001_auth_sync.sql` enables RLS on the target tables.
- `0050_mentions_rebuild.sql:62` temporarily disables RLS on `brand_mentions`. `0081_enable_rls_all_public_tables.sql:1-47` restores RLS for public ordinary tables without adding policies.
- `0096_request_rls_foundation.sql:4-80` creates and validates `venturecite_request`, including membership checks. It creates user and brand request policies at `0096:225-276`.
- `0097_request_rls_content.sql:1-198` creates and validates `venturecite_content_request`, grants restricted columns, and adds content SELECT policies at `0097:200-306`.
- `0098_transactional_outbox.sql:135-136` is the only earlier target found with `FORCE ROW LEVEL SECURITY`, and it targets `outbox_commands`.
- `0104` and `0105` add content request write policies with `WITH CHECK`. 0124 does not add write policies.
- `0113_rls_current_setting_initplan.sql:4-246` wraps request GUC reads in scalar subqueries. 0124 follows that pattern in every policy predicate.
- `0114_request_brand_deletion_preview.sql:4-43` adds brand-scoped preview policies. `0118_retention_indexes_and_rls_initplan.sql:10-31` rewrites their GUC reads as InitPlans.
- `0120_revoke_data_api_grants.sql:12-19` revokes table, sequence, and function access from `anon` and `authenticated`, including default privileges for future objects. 0124 grants schema and table SELECT only to `venturecite_entity_request`. It does not grant access to `anon` or `authenticated`, so it does not re-expose the tables through PostgREST or the Supabase Data API.

## Findings

### F-01

- Severity: high
- File:line: `.env:6`; `server/db.ts:47-60`; `migrations/0124_rls_defence_in_depth.sql:15,61-135`
- What the policy does: It creates an entity role and adds SELECT policies for that role. It enables RLS on `job_leases`.
- Why it is wrong: The source does not prove the pool role's owner, superuser, or `rolbypassrls` state. It also does not prove a role switch to `venturecite_entity_request`. 0124 does not force RLS.
- Concrete break or cross-tenant read: An owner or BYPASSRLS pool role can read across tenants because the new policies do not constrain it. A non-owner, non-BYPASSRLS pool role can receive RLS denials because no 0124 policy targets the pool role. Confidence in the conditional behavior is high. The live branch is `UNSETTLED-NEEDS-DB`.

### F-02

- Severity: high
- File:line: `migrations/0124_rls_defence_in_depth.sql:15`; `server/lib/advisoryLock.ts:66-76,87-93,116-119`
- What the policy does: It enables RLS on `job_leases` without creating any policy or using `FORCE`.
- Why it is wrong: Every background job uses `job_leases` to insert, update, and delete lease rows. RLS denies each command for a non-owner, non-BYPASSRLS role because the table has no matching policy.
- Concrete break or cross-tenant read: Scheduler and cron lease acquisition can fail at `advisoryLock.ts:66-76`. Heartbeats and releases can fail at `87-93` and `116-119`. The live result is `UNSETTLED-NEEDS-DB` because the pool role catalog state is unknown.

### F-03

- Severity: medium
- File:line: `migrations/0124_rls_defence_in_depth.sql:160-302`
- What the policy does: It grants and permits SELECT only for `venturecite_entity_request` on the nine target tables.
- Why it is wrong: It does not permit writes for that role. The migration does not grant INSERT, UPDATE, or DELETE, and it adds no `WITH CHECK` clauses.
- Concrete break or cross-tenant read: Any future route or worker that switches to the entity role and calls writes such as `server/lib/competitorDiscovery.ts:143-160`, `server/lib/listicleScanner.ts:237-253`, or `server/lib/factAgent/persistFacts.ts:251-266` receives a permission or RLS denial. Current server code does not set this role, so this is a conditional break rather than a confirmed current outage. Confidence: high.

### F-04

- Severity: medium
- File:line: `migrations/0124_rls_defence_in_depth.sql:151-158`; no `brands(user_id)` index found in the migration index search
- What the policy does: It filters entity-role brand reads by `user_id` and `deleted_at`.
- Why it is wrong: The target tables have `brand_id` indexes, but the policy's direct `brands.user_id` filter has no dedicated index in the migration history. PostgreSQL may scan `brands` when evaluating the policy.
- Concrete break or cross-tenant read: Large entity-role SELECT queries may perform repeated brand scans. The exact plan and cost require `EXPLAIN` against the live database, so the measured impact is `UNSETTLED-NEEDS-DB`. Confidence that no dedicated index exists in the checked migrations: high.

### F-05

- Severity: medium
- File:line: `migrations/0124_rls_defence_in_depth.sql:90-135`; comparison `migrations/0096_request_rls_foundation.sql:32-80` and `migrations/0097_request_rls_content.sql:35-118`
- What the policy does: It validates unsafe role attributes and privileges for an existing `venturecite_entity_request` role.
- Why it is wrong: Unlike 0096 and 0097, 0124 does not inspect `pg_auth_members`. An existing managed role could have membership-based access not covered by the checked direct grants.
- Concrete break or cross-tenant read: A membership that permits `SET ROLE` or inherited privileges could change which policies and tables the role can access. `NOINHERIT` limits automatic privilege inheritance, but it does not replace membership validation. The live membership state is `UNSETTLED-NEEDS-DB`. Confidence: medium.

### F-06

- Severity: low
- File:line: `migrations/0124_rls_defence_in_depth.sql:156,171,187,203,219,235,251,267,283,299`
- What the policy does: It wraps every `current_setting('venturecite.user_id', true)` call in a scalar subquery.
- Why it is wrong: No InitPlan performance defect was found. This follows the pattern from 0113.
- Concrete break or cross-tenant read: None identified. The remaining performance question concerns indexes and live plans, not per-row GUC evaluation. Confidence: high.

## Verdict

SAFE WITH CONDITIONS

Apply only after confirming the live database role and table ownership. The release must prove that the application pool role can write `job_leases` and all scheduled target tables. It must also prove that the intended entity-role SELECT path uses `SET LOCAL ROLE venturecite_entity_request` and a transaction-local user GUC.

The source shows no cross-tenant predicate error in the nine target policies. Every target has `brand_id`, every policy joins through `brands.id`, and every GUC read uses the InitPlan form. The main risk is role applicability. The concrete outage risk is `job_leases` with RLS enabled and no policy.

The mirror is source-parity equivalent. `supabase/migrations/20260421000132_0124_rls_defence_in_depth.sql:2` declares SHA-256 `7807d0294b9d97734f538d7cdacd0e0c0e36f004524f297579d7ed407263214d`. The mirror payload after its three-line header matches `migrations/0124_rls_defence_in_depth.sql` byte-for-byte in the checked workspace.

## Unsettled without a database

- The live `current_user` and `session_user` for the application pool.
- Whether that role owns each target table.
- Whether that role has `rolsuper`, `rolbypassrls`, or relevant memberships.
- The live `relrowsecurity` and `relforcerowsecurity` values for every target table.
- The live effective grants and policies after migration 0124 applies.
- Whether the scheduler can acquire, heartbeat, and release `job_leases`.
- `EXPLAIN` plans and measured cost for the brands and child-table policies.
- A live two-tenant isolation test and a live missing-GUC test.
- The actual migration apply and reapply result. Source inspection shows every 0124 policy has a preceding `DROP POLICY IF EXISTS`, but no database run was allowed.
