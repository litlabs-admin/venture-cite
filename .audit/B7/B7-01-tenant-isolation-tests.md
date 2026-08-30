# B7-01 — Closing the tenant-isolation coverage gap on `server/lib/ownership.ts`

Scope: the gap identified in
[`.audit/B6/B6b-01-mutation-auth-ownership.md`](../B6/B6b-01-mutation-auth-ownership.md)
Target 1 (`server/lib/ownership.ts`) - every existing test that touches this
file replaces it with a `vi.mock`, so the real database-querying code, where
the tenant-isolation decision actually happens, was never executed by any
test in the repository.

New file:
[`tests/integration/ownershipTenantIsolation.test.ts`](../../tests/integration/ownershipTenantIsolation.test.ts)
(38 tests). It imports `server/lib/ownership.ts` with **no mocks** and runs
every helper's real query against a real local Supabase Postgres instance,
seeded with two real users (`userAId`, `userBId`) and two real brands
(`brandAId` owned by A, `brandBId` owned by B).

## Design decisions

- **Function-level, not HTTP-level.** Tests call the exported `require*`
  functions directly rather than standing up the ~10 different Express
  route modules that call them (`articles.ts`, `contentTypes.ts`,
  `intelligence.ts`, `publications.ts`, `assistant.ts`, mentions routes,
  ...). This is sound because `sendOwnershipError()` in `ownership.ts` does
  `res.status(err.status).json(...)` - it forwards `OwnershipError.status`
  to the HTTP layer verbatim, with no translation in between. Asserting
  `err.status` is therefore equivalent to asserting the HTTP status a route
  would send.
- **"No row leaks into the response"** is asserted by checking that the
  thrown `OwnershipError`'s only enumerable own property is `status`
  (`Object.keys(err)` equals `["status"]`) and that `message` equals the
  helper's fixed not-found label. `Error.prototype.message` is
  non-enumerable, so this is a real check on what a route's
  `res.json({ success: false, error: err.message })` could ever surface -
  not a tautology. For `requireMentionOwnership` (which resolves `null`
  instead of throwing), the check is that the result is `null`, not the row.
- **Cleanup via cascade.** Every table this file writes to has
  `onDelete: "cascade"` back to `brands` or `users` (verified in
  `shared/schema/*.ts`), so `afterAll` only deletes the two seeded users;
  everything else cascades.

## Requirement 1 + 2 — every `require*` helper, owner vs. non-owner

All of the following are exercised for real (owner reads the row; a
non-owner gets `OwnershipError(404)`, never 403, with no row leaking):

| Helper                                         | Table                  | Notes                                                  |
| ---------------------------------------------- | ---------------------- | ------------------------------------------------------ |
| `requireBrand`                                 | `brands`               | direct `userId` FK                                     |
| `requireChatbotThread`                         | `chatbot_threads`      | direct `userId` FK                                     |
| `requireCitation`                              | `citations`            | direct `userId` FK                                     |
| `requireCitationRun`                           | `citation_runs`        | two-step brand join (BOLA guard)                       |
| `requireMentionOwnership`                      | `brand_mentions`       | resolves `null`, never throws                          |
| `requireUser`                                  | n/a (reads `req.user`) | returns the user; throws 401 (not 404/403) when absent |
| `getUserBrandIds`                              | `brands`               | returns only the caller's own brand ids                |
| the 11 `loadEntityThroughBrand`-backed helpers | see requirement 3      |                                                        |

## Requirement 3 — all 11 `loadEntityThroughBrand` entity types, enumerated

Every one of the 11 entity types named in `B6b-01` §1d is seeded and tested
individually (`describe.each`, not sampled - the test file asserts
`expect(brandBackedEntities).toHaveLength(11)` so a future edit that drops
one from the array fails loudly):

1. `requireArticle` / `articles`
2. `requireCompetitor` / `competitors`
3. `requireFaq` / `faq_items`
4. `requireListicle` / `listicles`
5. `requireBofuContent` / `bofu_content`
6. `requireHallucination` / `brand_hallucinations`
7. `requireBrandFact` / `brand_fact_sheet`
8. `requireBrandMention` / `brand_mentions`
9. `requireCommunityPost` / `community_posts`
10. `requireCitationQuality` / `citation_quality`
11. `requireKeywordResearch` / `keyword_research`

All 11 were successfully seeded; none needed to be skipped.

## Requirement 4 — soft-deleted rows

**Finding, stated rather than hidden behind a green test:** no `require*`
helper in `ownership.ts` filters soft-deleted rows at all. Of the tables
these helpers read, only `brands` and `competitors` have a `deletedAt`
column; `requireBrand` and `loadEntityThroughBrand` (which backs
`requireCompetitor`) both omit any `deletedAt` predicate. This matches the
out-of-scope note at the end of `B6b-01`. The test file seeds a
soft-deleted competitor and a soft-deleted brand and documents the actual
(gap) behavior explicitly:

- `"known gap: requireCompetitor still returns a soft-deleted competitor to
its owner"` - passes, because that is what the code does today.
- `"known gap: requireBrand still returns a soft-deleted brand to its
owner"` - passes, same reason.
- A third test confirms every other helper covered here (`articles`,
  `faq_items`, `listicles`, `bofu_content`, `brand_hallucinations`,
  `brand_fact_sheet`, `brand_mentions`, `community_posts`,
  `citation_quality`, `keyword_research`, `chatbot_threads`, `citations`,
  `citation_runs`) backs a table with **no** soft-delete column at all, so
  "excludes them" is vacuously inapplicable there.

I did not fabricate a passing test asserting the opposite of current
behavior, and I did not modify `ownership.ts` to add the missing filter -
both are out of this task's scope (no ownership.ts changes may be
permanent). Flagging this as a real, separate, pre-existing gap: `requireBrand`
and `requireCompetitor` currently hand a soft-deleted row back to its own
owner, which is inconsistent with `storage/brandsStorage.ts`'s
`isNull(schema.brands.deletedAt)` pattern used elsewhere in the app.

## Mutation proof — each mutation applied, watched fail, restored, watched pass

Method: for each mutation, `server/lib/ownership.ts` was edited, only
`tests/integration/ownershipTenantIsolation.test.ts` was run against the
real local database, the failure was captured, the file was restored, and
the same command was re-run to confirm a clean pass before moving to the
next mutation. `git diff --stat server/lib/ownership.ts` was empty at every
restore point, confirmed again at the end (see below).

Baseline (before any mutation): `38 passed (38)`.

### 1. `requireChatbotThread` — drop the `userId` predicate

```diff
-    .where(and(eq(schema.chatbotThreads.id, id), eq(schema.chatbotThreads.userId, userId)))
+    .where(and(eq(schema.chatbotThreads.id, id)))
```

Result: `1 failed | 37 passed (38)`.

```
FAIL  ... > requireChatbotThread > rejects a non-owner with 404 (not 403) and leaks no row
Error: expected the promise to reject with OwnershipError
```

Restored → `38 passed (38)`.

### 2. `requireBrand` — drop the `userId` predicate

```diff
-    .where(and(eq(schema.brands.id, id), eq(schema.brands.userId, userId)))
+    .where(and(eq(schema.brands.id, id)))
```

Result: `1 failed | 37 passed (38)` - exactly the `requireBrand` cross-tenant
test, nothing else (confirms the mutation's blast radius is isolated to
`requireBrand` and does not touch `loadEntityThroughBrand`'s separate,
duplicated brand-ownership query).

```
FAIL  ... > requireBrand > rejects a non-owner with 404 (not 403) and leaks no row
Error: expected the promise to reject with OwnershipError
```

Restored → `38 passed (38)`.

### 3. `loadEntityThroughBrand` — delete the brand-ownership guard clause (affects all 11 entity types)

```diff
   const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
   if (!row) throw new OwnershipError(404, notFoundLabel);
-  const brandId = (row as any).brandId;
-  if (!brandId) throw new OwnershipError(404, notFoundLabel);
-  const [brand] = await db
-    .select({ id: schema.brands.id })
-    .from(schema.brands)
-    .where(and(eq(schema.brands.id, brandId), eq(schema.brands.userId, userId)))
-    .limit(1);
-  if (!brand) throw new OwnershipError(404, notFoundLabel);
   return row;
```

Result: `11 failed | 27 passed (38)` - **all 11** entity types failed, one
failure per type, nothing else. This is the exact regression that survived
every existing test in `B6b-01` §1d; this suite catches it 11/11 times, not
just once.

```
FAIL  ... > 'requireArticle / articles' > rejects a non-owner with 404 (not 403) and leaks no row
FAIL  ... > 'requireCompetitor / competitors' > rejects a non-owner with 404 (not 403) and leaks no row
FAIL  ... > 'requireFaq / faq_items' > rejects a non-owner with 404 (not 403) and leaks no row
FAIL  ... > 'requireListicle / listicles' > rejects a non-owner with 404 (not 403) and leaks no row
FAIL  ... > 'requireBofuContent / bofu_content' > rejects a non-owner with 404 (not 403) and leaks no row
FAIL  ... > 'requireHallucination / brand_hallucinations' > rejects a non-owner with 404 (not 403) and leaks no row
FAIL  ... > 'requireBrandFact / brand_fact_sheet' > rejects a non-owner with 404 (not 403) and leaks no row
FAIL  ... > 'requireBrandMention / brand_mentions' > rejects a non-owner with 404 (not 403) and leaks no row
FAIL  ... > 'requireCommunityPost / community_posts' > rejects a non-owner with 404 (not 403) and leaks no row
FAIL  ... > 'requireCitationQuality / citation_quality' > rejects a non-owner with 404 (not 403) and leaks no row
FAIL  ... > 'requireKeywordResearch / keyword_research' > rejects a non-owner with 404 (not 403) and leaks no row
Error: expected the promise to reject with OwnershipError
```

Restored → `38 passed (38)`.

### 4. Anti-enumeration violation — 404 → 403 (applied to `requireBrand`)

```diff
-  if (!row) throw new OwnershipError(404, "Brand not found");
+  if (!row) throw new OwnershipError(403, "Brand not found");
```

Result: `1 failed | 37 passed (38)`.

```
FAIL  ... > requireBrand > rejects a non-owner with 404 (not 403) and leaks no row
AssertionError: expected 403 to be 404 // Object.is equality
- 404
+ 403
```

Restored → `38 passed (38)`.

### 5. `requireMentionOwnership` — remove the ownership check

```diff
   if (!row) return null;
-  const [brand] = await db
-    .select({ id: schema.brands.id })
-    .from(schema.brands)
-    .where(and(eq(schema.brands.id, row.brandId), eq(schema.brands.userId, userId)))
-    .limit(1);
-  if (!brand) return null;
   return row;
```

Result: `1 failed | 37 passed (38)`.

```
FAIL  ... > requireMentionOwnership > resolves null (never throws, never leaks the row) for a non-owner
AssertionError: expected { …the full brand_mentions row… } to be null
```

The captured diff showed the complete leaked row (id, brandId, sourceUrl,
platform, etc.) - the exact "no row leaks" failure this suite exists to
catch.

Restored → `38 passed (38)`.

**All 5 mutations from the task brief were applied, individually confirmed
to fail this suite, and reverted.** Final verification:

```
$ git diff --stat server/lib/ownership.ts
(empty)
```

## CI wiring

No wiring change was needed. `tests/integration/ownershipTenantIsolation.test.ts`
matches the existing glob in `.github/workflows/ci.yml`'s `integration` job:

```
npx vitest run --no-file-parallelism tests/integration tests/migrations \
  tests/unit/factScrapeCacheStorage.test.ts tests/unit/v2LifecycleStorage.test.ts
```

`tests/integration/**` is included wholesale, so this file runs automatically
in the `integration` job (which sets `LOCAL_SUPABASE_TEST=1` and
`TEST_DATABASE_URL` exactly as this file expects, via
`configureDestructiveDatabaseTest`). No file was added or changed in
`.github/workflows/ci.yml`.

## An unrelated, severe bug found while bringing up the database

`npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor`
from a **completely fresh** volume failed deterministically, every time,
before I could run anything:

```
ERROR: cannot alter type of a column used in a policy definition (SQLSTATE 0A000)
policy api_costs_outbox_worker_insert on table api_costs depends on column "est_cost_cents"
At statement: 0
-- Source: migrations/0122_api_costs_cost_precision.sql
```

Root cause: `migrations/0099_content_cost_idempotency.sql` (later touched by
`migrations/0113_rls_current_setting_initplan.sql`) creates RLS policy
`api_costs_outbox_worker_insert` whose `WITH CHECK` clause references
`est_cost_cents`. `migrations/0122_api_costs_cost_precision.sql` tries to
`ALTER COLUMN est_cost_cents TYPE numeric(12, 6)` without first dropping
that policy. Since `0099 < 0122`, **every** database that applies migrations
in order already has this policy in place before 0122 runs - this is not a
mirror-ordering artifact, it is a bug in migration 0122 itself, and it would
break `npm run db:migrate:release` in production exactly the same way it
broke a fresh local Supabase bring-up here. (Docker also showed containers
named `supabase-fresh-replay` from 5 days ago, suggesting a previous session
hit the same wall.)

This is outside this task's scope (`server/lib/ownership.ts` tenant
isolation), and I did not fix it permanently:

- I temporarily patched **only** the generated mirror file
  `supabase/migrations/20260421000130_0122_api_costs_cost_precision.sql`
  (wrapping the `ALTER` with `DROP POLICY` / `CREATE POLICY`, recreating the
  policy verbatim from its final form after 0113's `ALTER POLICY`) solely to
  get a working local database for this task's own tests.
- That file was reverted to its committed content before this task ended.
  `git diff --stat supabase/migrations/20260421000130_0122_api_costs_cost_precision.sql`
  is empty. `migrations/0122_api_costs_cost_precision.sql` (the real source
  of truth) was never touched.
- Filed as a separate flagged task (`task_e7554627`, "Fix migration 0122:
  ALTER fails on existing api_costs policy") with the root cause, the exact
  fix, and the verification command, for someone to pick up outside this
  wave.

## Container discipline

- Docker Desktop was not running at the start of this task; it was started,
  and I waited for the daemon before touching `supabase`.
- `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor`
  was run once, immediately before the test-and-mutation phase.
- `npx supabase stop --no-backup` was run immediately after the final
  mutation cycle completed and `git diff --stat server/lib/ownership.ts`
  was confirmed empty.
- **Confirmed stopped:** `docker ps` (no filter) returns zero rows after
  `supabase stop`. No `venturecite`-project container is in a running state.

## Final state

```
$ git diff --stat server/lib/ownership.ts
(empty)

$ git diff --stat supabase/migrations/20260421000130_0122_api_costs_cost_precision.sql
(empty)

$ git status --porcelain
```

only shows this new file
(`tests/integration/ownershipTenantIsolation.test.ts`) and this report
(`.audit/B7/B7-01-tenant-isolation-tests.md`) as additions from this task;
every other entry in `git status --porcelain` at the time of writing belongs
to other, concurrent work in this repository (other `.audit/B7/*.md`
reports, `docs/*`, and various `tests/unit/*` files this task never opened).

`npm run check`, `npm run lint`, and `npm run format:check` were run scoped
to the new file (`npx tsc --noEmit -p .` full-project, `npx eslint
tests/integration/ownershipTenantIsolation.test.ts`, `npx prettier --check
tests/integration/ownershipTenantIsolation.test.ts`) and are clean. Per the
task's test-run rule, the full suite, `tests/integration/`, and
`tests/unit/` were deliberately not run in this task to avoid competing with
other agents' concurrent test runs.
