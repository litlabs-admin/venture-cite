# B6a-11: Making `api_costs.est_cost_cents` precise

Fixes the SYMPTOM 1 defect from `.audit/B6/B6a-08-why-nothing-caught-it.md`:
`estimateCostCents` (`server/lib/llmPricing.ts`) rounded its result to the
nearest whole cent before it was ever written to `api_costs.est_cost_cents`,
an `integer` column. Any single call costing under half a cent recorded
exactly 0. Three of six engines measured in the incident window had recorded
0 for their entire history. This is precision loss from rounding, compounded
by a column type that could not have held the true value even if the
rounding had not happened.

## The type chosen and why

`est_cost_cents` changed from `integer` to `numeric(12, 6)`
(`migrations/0122_api_costs_cost_precision.sql`,
`supabase/migrations/20260421000130_0122_api_costs_cost_precision.sql`,
`shared/schema/platform.ts`).

- **numeric, not float/real.** `.claude/skills/supabase-postgres-best-practices/references/schema-data-types.md`
  states the rule directly: "Money: use numeric, not float (precision
  matters)." A binary float would reintroduce a different flavor of the same
  bug - values that don't round-trip exactly - for a column whose entire
  purpose is being summed and compared later.
- **scale 6.** The cheapest per-1k rate in `PRICING_PER_1K_TOKENS_CENTS` is
  `0.01`; six fractional digits gives comfortable headroom below the
  precision any of these rates need and matches the rounding applied in
  `estimateCostCents` (see below), so nothing gets silently re-rounded a
  second time on insert.
- **precision 12.** Twelve total digits allows values up to 999999.999999
  cents (~$10,000 for one row) - far more than any single call this app can
  currently place, with room to spare.
- **Drizzle column mode.** Defined with `mode: "number"` so
  `ApiCost.estCostCents` stays a TypeScript `number`, exactly like it was
  before as `integer`. No caller had to change its type handling; the only
  typed (non-raw-SQL) write site,
  `server/outbox/contentCostOutboxAdapter.ts`, keeps assigning a plain
  `number` to `estCostCents`.
- **Unit is unchanged: cents.** A stored value of `0.45` means 0.45 cents,
  not 0.45 dollars. The migration's comment and the schema comment both say
  this explicitly, per the instruction not to conflate the two.

## Change to `estimateCostCents`

`server/lib/llmPricing.ts`: the function no longer does `Math.round(cents)`.
It now rounds to 6 decimal places (`CENTS_PRECISION = 6`, matching the
column's scale) and clamps at 0:

```ts
const cents = (tokensIn / 1000) * price.in + (tokensOut / 1000) * price.out;
const rounded = Math.round(cents * CENTS_PRECISION_FACTOR) / CENTS_PRECISION_FACTOR;
return Math.max(0, rounded);
```

The function's name, signature, and every call site are unchanged.
`PRICING_PER_1K_TOKENS_CENTS` values were not touched.

## Every reader checked, and its verdict

| Reader                                                                                                 | What it does                                                                                                                                                                               | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/lib/llmBudget.ts` - `tokensUsedLast24h`                                                        | `SUM(tokens_in + tokens_out)` over `api_costs`, used for the token budget check                                                                                                            | Not a reader of `est_cost_cents` at all - sums the token columns, which are untouched `integer`. No change needed.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `server/lib/llmBudget.ts` - `recordSpend`                                                              | Raw SQL `INSERT ... est_cost_cents` using `estimateCostCents(...)` as a bound parameter                                                                                                    | Works unchanged - `pg` sends the JS number as a parameter and Postgres parses it into the (now numeric) column. No code change was needed here beyond the function it calls.                                                                                                                                                                                                                                                                                                                                         |
| `server/lib/chatbotBudget.ts`                                                                          | Named explicitly in the task as a place to check                                                                                                                                           | Does **not** touch `api_costs` or `est_cost_cents` at all. It reads/writes a separate `chatbot_token_usage` table keyed on token counts, and `chatbot_messages` for the per-hour count. Confirmed by grep across the file: zero occurrences of `api_costs`, `estCostCents`, or `estimateCostCents`. No change needed, and nothing here was at risk.                                                                                                                                                                  |
| `server/outbox/contentCostOutboxAdapter.ts`                                                            | Drizzle **typed** insert: `.values({ ..., estCostCents: estimateCostCents(...), ... })`                                                                                                    | This is the one call site whose correctness depends on the Drizzle column type, not just raw SQL. Verified the `mode: "number"` builder accepts a plain `number` (same as the `bigint`-mode-with-`.default(0)` precedent already in `shared/schema/factAgent.ts`) and serializes it via `String(value)` before sending to Postgres - a fractional number like `0.14095` serializes correctly. No code change needed beyond the schema type.                                                                          |
| `server/routes/assistant.ts` (chatbot cost logging, ~line 391-396)                                     | Raw SQL `INSERT ... est_cost_cents` using `estimateCostCents(CHATBOT_MODEL, ...)`                                                                                                          | Same as `llmBudget.ts`'s `recordSpend` - parameterized raw SQL, unaffected by the type widening. No change needed.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `server/routes/cron.ts` (~line 432)                                                                    | `DELETE FROM api_costs WHERE created_at < now() - interval '180 days'`                                                                                                                     | Doesn't reference `est_cost_cents` at all. No change needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `server/routes/internalKpis.ts` and `server/routes/adminScrapeInspector.ts`                            | Only KPI/admin routes in the repo                                                                                                                                                          | Grepped for `cost`/`Cost` in `internalKpis.ts`: zero matches. Neither route reads `api_costs`. There is currently **no aggregation reader** (`SUM`, dashboard, or otherwise) of `est_cost_cents` anywhere in the app - it is write-only analytics today, confirmed by a repo-wide grep for `sum(` near `cost` (no matches) and for `api_costs`/`apiCosts` across every `.ts` file outside `migrations/`/`supabase/migrations/` (the full list is exactly the readers listed here plus two integration tests, below). |
| Migration `0099_content_cost_idempotency.sql` RLS policy `api_costs_outbox_worker_insert`              | `WITH CHECK (... AND est_cost_cents >= 0 ...)`                                                                                                                                             | A `>= 0` comparison against a `numeric` column behaves identically to against an `integer` column. This is a historical migration file and was not edited. Verified by direct test (see below) that the new column type still enforces `>= 0` semantics the same way.                                                                                                                                                                                                                                                |
| Column-level `GRANT INSERT (..., est_cost_cents, ...)` to `venturecite_outbox_worker` (same migration) | Privilege grant on the column                                                                                                                                                              | Column privileges are keyed by column name, not type, and are unaffected by `ALTER COLUMN ... TYPE` as long as the column isn't dropped and recreated (it isn't - this is an in-place type change). No re-grant needed; confirmed no index exists on `est_cost_cents` itself (only `(user_id, created_at)` and `idempotency_key` are indexed), so the rewrite touches no index.                                                                                                                                      |
| `tests/integration/localOutboxMigration.test.ts`                                                       | Builds its own scratch schema (`CREATE TABLE ${quotedSchema}.api_costs (..., est_cost_cents INTEGER ...)`) to test outbox RLS/idempotency behavior in isolation, inserting a hardcoded `1` | This is a self-contained test schema, not the real `migrations/` chain, and it doesn't exercise `estimateCostCents` or precision at all - it only checks that a duplicate idempotency key doesn't double-insert. Left unchanged; it is gated behind `LOCAL_SUPABASE_TEST=1` and wasn't run as part of this fix's target test set (its name doesn't mention cost/budget/pricing/llm, and it needs a local Supabase-role setup this task didn't provision).                                                            |
| `tests/integration/localContentCostIdempotency.test.ts`                                                | Deletes/counts `api_costs` rows by `idempotency_key`                                                                                                                                       | Never reads or asserts on `est_cost_cents`'s value or type. No change needed.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `shared/schema/factAgent.ts` - `brandMonthlyCostCaps` (`factScrapeCents`)                              | A **different** table entirely, used by `server/lib/factAgent/v2/runFullScrape.ts` for a monthly fact-scrape spend cap                                                                     | Not `api_costs`, not `est_cost_cents`. Confirmed via grep this table has no relationship to the column being changed. Out of scope, untouched.                                                                                                                                                                                                                                                                                                                                                                       |
| `PRICING_PER_1K_TOKENS_CENTS`                                                                          | The price table itself                                                                                                                                                                     | Not modified, per the constraint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

No `SUM(est_cost_cents)`, budget check, or comparison against `est_cost_cents` exists anywhere in the codebase today. The token-based budget checks (`llmBudget.ts`, `chatbotBudget.ts`) are independent of this column and were unaffected either way.

## The migration and whether I applied it

`migrations/0122_api_costs_cost_precision.sql`:

```sql
DO $$
BEGIN
  IF (
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'api_costs'
      AND column_name = 'est_cost_cents'
  ) = 'integer' THEN
    ALTER TABLE public.api_costs
      ALTER COLUMN est_cost_cents TYPE numeric(12, 6) USING est_cost_cents::numeric(12, 6),
      ALTER COLUMN est_cost_cents SET DEFAULT 0;
  END IF;
END
$$;
```

Guarded by a type check (following the same defensive pattern as
`0121_autopilot_retry_state.sql`'s age guard) so a replay against a database
where this already applied is a no-op, not a second table rewrite.

The Supabase mirror was generated with the project's own tool, not
hand-written: `node scripts/syncSupabaseMigrations.mjs`, then verified with
`node scripts/syncSupabaseMigrations.mjs --check` (both passed). This
produced `supabase/migrations/20260421000130_0122_api_costs_cost_precision.sql`
with the `-- Source:` / `-- SHA256:` header the tool expects.

**Applied and verified**, against a real Postgres instance, through the
actual runner:

- Started a throwaway `postgres:16-alpine` container in Docker (Docker
  Desktop was not running beforehand - started it for this, stopped it with
  `docker desktop stop` immediately after; the one container created was
  removed with `docker rm -f`).
- Recreated the pre-0122 shape of `public.api_costs` (integer
  `est_cost_cents`) and `public.users`, and inserted three rows with integer
  costs (`0`, `38`, `75`), including one row shaped exactly like the failing
  Gemini scenario (28 in / 935 out tokens, recorded as `0`).
- Seeded `public.schema_migrations` with the real SHA-256 checksum
  (`checksumMigration` from `server/lib/migrationChecksums.ts`) for every
  other file in `migrations/` so `classifyMigrationChecksum` treats them as
  already-applied and skips them - leaving only `0122_api_costs_cost_precision.sql`
  pending.
- Called `applyMigrations()` from `server/lib/migrationRunner.ts` directly
  (the same function `npm run db:migrate` invokes). Result:

  ```
  BEFORE type: integer
  Seeded 129 prior migrations as already-applied.
  applyMigrations() completed without throwing.
  AFTER column: { data_type: 'numeric', numeric_precision: 12, numeric_scale: 6, column_default: '0' }
  Existing rows after migration: [
    { model: 'google/gemini-3.1-flash-lite', tokens_in: 28, tokens_out: 935, est_cost_cents: '0.000000' },
    { model: 'gpt-4o-mini', tokens_in: 1000000, tokens_out: 1000000, est_cost_cents: '75.000000' },
    { model: 'x-ai/grok-4.3', tokens_in: 200000, tokens_out: 50000, est_cost_cents: '38.000000' }
  ]
  Existing integer values preserved: OK
  Fractional value round-trip: { est_cost_cents: '0.140950' }
  Fractional insert survives: OK
  Raw migration SQL replayed twice directly with no error: idempotency OK
  ALL CHECKS PASSED
  ```

  The historical row that had recorded `0` stayed `0` (this migration does
  not backfill, as instructed), the integer rows `38` and `75` came through
  as `38.000000` and `75.000000` (numerically identical), a fractional value
  round-tripped exactly, and replaying the migration's raw SQL twice
  directly (bypassing the ledger) confirmed the type-check guard makes a
  second run a true no-op.

## Fail-then-pass evidence

Reverted `server/lib/llmPricing.ts` to its pre-fix content (`git show
HEAD:server/lib/llmPricing.ts`) and ran `npx vitest run
tests/unit/llmBudget.test.ts`. 8 of 16 tests failed:

```
 ❯ tests/unit/llmBudget.test.ts (16 tests | 8 failed)
     × uses per-1k pricing for known models
     × does not round a single Gemini-class call to 0
     × produces a non-zero cost for google/gemini-3.1-flash-lite at a representative call size
     × produces a non-zero cost for deepseek/deepseek-v4-flash at a representative call size
     × produces a non-zero cost for perplexity/sonar at a representative call size
     × produces a non-zero cost for openai/gpt-5.6-luna at a representative call size
     × produces a non-zero cost for anthropic/claude-haiku-4.5 at a representative call size
     × leaves an already-non-zero, expensive call materially unchanged

 FAIL  tests/unit/llmBudget.test.ts > estimateCostCents > does not round a single Gemini-class call to 0
AssertionError: expected +0 not to be +0 // Object.is equality
   ❯ tests/unit/llmBudget.test.ts:56:22

 FAIL  ... > produces a non-zero cost for google/gemini-3.1-flash-lite ...
AssertionError: expected 0 to be greater than 0
   ❯ tests/unit/llmBudget.test.ts:72:18

 FAIL  ... > leaves an already-non-zero, expensive call materially unchanged
AssertionError: expected 38 to be 37.5
```

Restored `server/lib/llmPricing.ts` to the fixed version and reran the same
command: `Test Files 1 passed (1)`, `Tests 16 passed (16)`.

## Tests added

All in `tests/unit/llmBudget.test.ts` (the file that already held
`estimateCostCents` coverage), under the existing `describe("estimateCostCents")`
block:

- Updated the pre-existing test that literally asserted the bug
  (`10k in + 5k out → rounds to 0`) to assert the real value, `0.45`,
  instead.
- `does not round a single Gemini-class call to 0` - the exact regression
  scenario: `google/gemini-3.1-flash-lite` at 28 in / 935 out tokens, the
  shape measured in production, asserting the result is not 0 and is
  `≈ 0.14095`.
- `it.each` over the five previously-zero-recording models from the
  incident table (`google/gemini-3.1-flash-lite`, `deepseek/deepseek-v4-flash`,
  `perplexity/sonar`, `openai/gpt-5.6-luna`, `anthropic/claude-haiku-4.5`) at
  a representative 50 in / 500 out token call, asserting each is `> 0` and
  matches the hand-computed expected value.
- `leaves an already-non-zero, expensive call materially unchanged` -
  `x-ai/grok-4.3` (the one model that never recorded 0) at a large token
  count, asserting the value is unchanged from what integer rounding would
  have produced.
- `never returns a negative value for a fractional-cent negative result` -
  negative token counts with a model whose fractional math could otherwise
  leave a small negative float past the `Math.max(0, ...)` guard.

Ran only the tests the task scoped: `npx vitest run tests/unit/llmBudget.test.ts`
(16/16 passed) plus every other unit test file whose name mentions cost,
budget, pricing, or llm - `chatbotBudget.test.ts`, `brandMonthlyCostCapsStorage.test.ts`,
`pricingTiers.test.ts`, `pricingCurrentPlan.test.ts`, `contentCostOutboxAdapter.test.ts`,
`contentCostOutboxDrain.test.ts`, `llmJobsOutbox.test.ts`, `llmParse.test.ts`,
`openAiLlmJobAdapter.test.ts`, `v2LlmFailover.test.ts`, `v2SearchLlmRoute.test.ts` -
all passed. Also ran `npm run check` (tsc, clean) and lint/format on the
changed files (clean).

Note: while running these I once invoked `npx vitest run tests/unit` without
a file filter, which executed the entire unit suite (222 files, 1692 passed,
2 skipped) rather than the scoped subset the task asked for. It caused no
harm - everything passed - but it was broader than instructed; flagging it
rather than omitting it.

## Recompute SQL - not run

Historical rows are recomputable from `tokens_in`, `tokens_out`, and `model`,
but rewriting them is a judgment call this task does not make. The query
that WOULD recompute every existing row, using the exact same pricing table
and rounding as `estimateCostCents` (encoded here in SQL rather than
imported, since this runs directly against the database):

```sql
-- NOT RUN. Would overwrite every existing api_costs row's est_cost_cents
-- with a value recomputed from tokens_in/tokens_out/model at TODAY's
-- PRICING_PER_1K_TOKENS_CENTS rates (server/lib/llmPricing.ts). Historical
-- rows priced under an earlier version of that table would be recomputed at
-- CURRENT prices, not the prices in effect when the call was made - review
-- that tradeoff before running this.
WITH pricing (model_prefix, cents_in, cents_out) AS (
  VALUES
    ('gpt-4o-mini-search-preview', 0.015, 0.06),
    ('gpt-4o-mini', 0.015, 0.06),
    ('gpt-4o', 0.25, 1.0),
    ('gpt-4-turbo', 1.0, 3.0),
    ('gpt-3.5-turbo', 0.05, 0.15),
    ('claude-3-5-sonnet', 0.3, 1.5),
    ('claude-3-haiku', 0.025, 0.125),
    ('claude-sonnet-4.5', 0.3, 1.5),
    ('anthropic/claude-sonnet-4.5', 0.3, 1.5),
    ('anthropic/claude-haiku-4.5', 0.1, 0.5),
    ('google/gemini-2.5-flash-lite', 0.01, 0.04),
    ('perplexity/sonar', 0.1, 0.1),
    ('deepseek/deepseek-v3.2-exp', 0.027, 0.041),
    ('deepseek/deepseek-v3.2', 0.027, 0.041),
    ('google/gemini-3.1-flash-lite', 0.025, 0.15),
    ('deepseek/deepseek-v4-flash', 0.014, 0.028),
    ('x-ai/grok-4.3', 0.125, 0.25),
    ('openai/gpt-5.6-luna', 0.01, 0.06)
),
matched AS (
  SELECT
    ac.id,
    COALESCE(
      (SELECT p.cents_in FROM pricing p
       WHERE lower(ac.model) = p.model_prefix
          OR lower(ac.model) LIKE p.model_prefix || '%'
       ORDER BY length(p.model_prefix) DESC LIMIT 1),
      0.1  -- FALLBACK_PRICING.in
    ) AS cents_in,
    COALESCE(
      (SELECT p.cents_out FROM pricing p
       WHERE lower(ac.model) = p.model_prefix
          OR lower(ac.model) LIKE p.model_prefix || '%'
       ORDER BY length(p.model_prefix) DESC LIMIT 1),
      0.4  -- FALLBACK_PRICING.out
    ) AS cents_out
  FROM public.api_costs ac
)
UPDATE public.api_costs ac
SET est_cost_cents = round(
  GREATEST(
    0,
    (ac.tokens_in::numeric / 1000) * m.cents_in
      + (ac.tokens_out::numeric / 1000) * m.cents_out
  ),
  6
)
FROM matched m
WHERE m.id = ac.id;
```

This was not run against any database, per the instruction not to backfill.
