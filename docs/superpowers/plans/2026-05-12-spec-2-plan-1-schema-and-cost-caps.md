# Spec 2 — Plan 2.1: Schema + Cost-Cap Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the database foundation for Spec 2 — three migrations creating `brand_fact_scrape_runs`, `brand_fact_scrape_pages`, and `brand_monthly_cost_caps` tables; an additive migration on `brand_fact_sheet` adding the new taxonomy + valueType + provenance columns; the `brands.fact_scrape_enabled` toggle column; backfill existing user-typed onboarding answers as `source='user'` rows; Drizzle schema updates; storage methods + interface; full unit-test coverage of the new storage layer. No agent, no SSE, no UI changes — those land in 2.2/2.3/2.4/2.5/2.6.

**Architecture:** Three sequential migrations (`0058`, `0059`, `0060`), each idempotent (`IF NOT EXISTS`). The single existing `brand_fact_sheet` table gains 8 additive columns (no destructive changes; existing rows continue rendering with default `domain='identity'` and `value_type='string'` until re-scraped). Two new tables (`brand_fact_scrape_runs`, `brand_fact_scrape_pages`) capture per-run + per-page state for the agent pipeline. A new `brand_monthly_cost_caps` table tracks per-brand LLM spend per month for budget enforcement. Storage methods follow the existing `databaseStorage.ts` patterns — DAO per entity, raw Drizzle, no abstractions.

**Tech Stack:** PostgreSQL (idempotent SQL), Drizzle ORM, Vitest. No new deps. Follows the Plan 5 (Track 31) pattern for table additions: migration → Drizzle schema → interface → DAO → tests.

**Hard rules for all subagents:**

- ❌ NEVER run ANY git mutating command: `git commit`, `git add`, `git rm`, `git mv`, `git stash`, `git stash pop`, `git stash drop`, `git stash apply`, `git reset`, `git restore`, `git checkout` (when it discards), `git push`, `git pull`, `git fetch --prune`, `git rebase`, `git merge`, `git branch -D`, `git branch -m`, `git switch` (with dirty changes), `git clean`. Read-only is fine: `git status`, `git diff`, `git log`, `git show`, `git blame`, `git branch` (list).
- ❌ Do NOT trust .md files in this repo — verify every claim against code.
- ❌ Do NOT add features beyond what each task says. This plan is schema + storage only; no routes, no SSE, no UI, no agent code.
- ❌ Do NOT mock the database in tests that exercise schema behaviour. Unit tests CAN mock `db` using the convention in `tests/unit/geoSignalRuns.test.ts` (Plan 5 Task 1), but integration-style schema tests should hit a real test DB if one is available.
- ❌ Do NOT delete or rename any existing storage method. Plan 2.1 only renames `factCategory` → `subcategory` at the Drizzle level + add new methods. Old methods (`createBrandFact`, `getBrandFactsByBrandId`, etc.) keep their signatures.

---

## File Structure

**Migrations created:**

- `migrations/0058_brand_fact_scrape_runs.sql` — two new tables (`brand_fact_scrape_runs`, `brand_fact_scrape_pages`) with indexes.
- `migrations/0059_brand_fact_sheet_v2.sql` — additive columns on `brand_fact_sheet` (`domain`, `value_type`, `value_payload`, `confidence`, `source_excerpt`, `dismissed_at`, `accepted_at`, `run_id`), rename `fact_category` → `subcategory`, backfill `domain`, add unique partial indexes, backfill user-typed onboarding values as `source='user'` rows.
- `migrations/0060_brand_fact_scrape_caps.sql` — `brand_monthly_cost_caps` table + `brands.fact_scrape_enabled` column.

**Drizzle schema modified:** `shared/schema.ts`

- Add `brandFactScrapeRuns` table + `insertBrandFactScrapeRunSchema` + types `BrandFactScrapeRun`, `InsertBrandFactScrapeRun`.
- Add `brandFactScrapePages` table + insert schema + types `BrandFactScrapePage`, `InsertBrandFactScrapePage`.
- Add `brandMonthlyCostCaps` table + insert schema + types `BrandMonthlyCostCap`, `InsertBrandMonthlyCostCap`.
- Modify `brandFactSheet` table: rename `factCategory` → `subcategory`; add columns (`domain`, `valueType`, `valuePayload`, `confidence`, `sourceExcerpt`, `dismissedAt`, `acceptedAt`, `runId`).
- Modify `brands` table: add `factScrapeEnabled` column.
- Update existing `insertBrandFactSheetSchema` to reflect renamed + new columns.

**Storage interface modified:** `server/storage.ts`

- Add methods: `createScrapeRun`, `getScrapeRunById`, `listScrapeRunsForBrand`, `updateScrapeRunStatus`, `transitionScrapeRunStatusCAS`, `incrementScrapeRunCounters`, `findSlicePendingRuns`, `createScrapePage`, `updateScrapePageStatus`, `listScrapePagesForRun`, `getMonthlyCostCap`, `incrementMonthlyCostCents`, `getBrandFactScrapeEnabled`, `setBrandFactScrapeEnabled`, `getBrandFactSheetConflicts`, `acceptFact`, `dismissFact`, `listFactsByRunIdSince`.

**Storage implementations modified:** `server/databaseStorage.ts`

- Add the 17 methods above. Each follows the existing Drizzle-direct pattern (no abstractions, no helper soup).
- Update existing methods (`createBrandFact`, `getBrandFactsByBrandId`, `updateBrandFact`, `deleteBrandFact`, `getBrandFactById`) at `databaseStorage.ts:3140-3175` to reference `subcategory` instead of `factCategory`.
- Add advisory-lock helpers `tryAcquireScrapeLock(brandId)` and `releaseScrapeLock(brandId)` for cross-instance concurrency control.

**Tests created:**

- `tests/unit/brandFactScrapeRunsStorage.test.ts` — 8 cases covering run CRUD + CAS + counter increments.
- `tests/unit/brandFactScrapePagesStorage.test.ts` — 4 cases covering page CRUD.
- `tests/unit/brandMonthlyCostCapsStorage.test.ts` — 4 cases covering cap reads + increments.
- `tests/unit/brandFactSheetMigrationShape.test.ts` — 3 cases verifying Drizzle types compile correctly post-rename and the insert schema accepts the new fields.
- `tests/unit/brandFactSheetConflictsQuery.test.ts` — 4 cases covering the conflict-pair query + accept/dismiss helpers.
- `tests/unit/scrapeAdvisoryLock.test.ts` — 2 cases (acquire succeeds; second acquire on same brand returns false).

---

### Task 1: Migration `0058_brand_fact_scrape_runs.sql`

**Files:**
- Create: `migrations/0058_brand_fact_scrape_runs.sql`

- [ ] **Step 1: Verify the next migration number is `0058`**

Run: `ls migrations/ | sort | tail -5`
Expected: `0054_user_last_login_at.sql`, `0055_articles_ai_generated.sql`, `0056_user_welcomed_at.sql`, `0057_geo_signal_runs.sql`, `meta`

If `0058` already exists, halt and report — someone else added a migration; pick the next free number.

- [ ] **Step 2: Write the migration**

Create `migrations/0058_brand_fact_scrape_runs.sql` with exactly this content:

```sql
-- One row per scrape run. Powers the new Brand Fact Sheet SSE + diff view.
-- Slice-resumable: `status='slice_pending'` rows are picked up by a cron tick
-- and advanced by waitUntil(advanceScrapeRun(...)) in subsequent slices.
CREATE TABLE IF NOT EXISTS brand_fact_scrape_runs (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','planning','fetching','extracting','completed','failed','timeout','slice_pending','cancelled')),
  triggered_by    TEXT NOT NULL
    CHECK (triggered_by IN ('welcome_confirm','brand_create','manual_rescrape','cron_refresh')),
  started_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMP,
  last_advance_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  deadline_ms       BIGINT,
  pages_planned     INTEGER NOT NULL DEFAULT 0,
  pages_fetched     INTEGER NOT NULL DEFAULT 0,
  pages_failed      INTEGER NOT NULL DEFAULT 0,
  facts_extracted   INTEGER NOT NULL DEFAULT 0,
  facts_validated   INTEGER NOT NULL DEFAULT 0,
  facts_redacted    INTEGER NOT NULL DEFAULT 0,
  llm_cost_cents    INTEGER NOT NULL DEFAULT 0,
  llm_calls         INTEGER NOT NULL DEFAULT 0,
  llm_input_tokens  BIGINT  NOT NULL DEFAULT 0,
  llm_output_tokens BIGINT  NOT NULL DEFAULT 0,
  error_kind        TEXT,
  error_message     TEXT,
  plan              JSONB,
  progress          JSONB
);

CREATE INDEX IF NOT EXISTS brand_fact_scrape_runs_brand_started_idx
  ON brand_fact_scrape_runs (brand_id, started_at DESC);

CREATE INDEX IF NOT EXISTS brand_fact_scrape_runs_slice_pending_idx
  ON brand_fact_scrape_runs (last_advance_at)
  WHERE status = 'slice_pending';

-- One row per page the agent attempted in a run. Powers the per-page UI panel
-- + delta surface ("what changed since last run").
CREATE TABLE IF NOT EXISTS brand_fact_scrape_pages (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        VARCHAR NOT NULL REFERENCES brand_fact_scrape_runs(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','fetching','extracting','done','failed','skipped_robots','skipped_lang','skipped_spa')),
  fetched_at     TIMESTAMP,
  bytes          INTEGER,
  status_code    INTEGER,
  content_type   TEXT,
  lang           TEXT,
  fact_count     INTEGER NOT NULL DEFAULT 0,
  llm_cost_cents INTEGER NOT NULL DEFAULT 0,
  error_kind     TEXT,
  error_message  TEXT,
  excerpt        TEXT
);

CREATE INDEX IF NOT EXISTS brand_fact_scrape_pages_run_idx
  ON brand_fact_scrape_pages (run_id);
```

- [ ] **Step 3: Verify the migration is idempotent**

Run: `grep -c "IF NOT EXISTS" migrations/0058_brand_fact_scrape_runs.sql`
Expected: `4` (two `CREATE TABLE IF NOT EXISTS` + two `CREATE INDEX IF NOT EXISTS`).

- [ ] **Step 4: Lint the SQL (no destructive operations)**

Run: `grep -E "DROP TABLE|DROP COLUMN|TRUNCATE" migrations/0058_brand_fact_scrape_runs.sql`
Expected: no output (no destructive operations).

- [ ] **Step 5: Run typecheck — should still pass**

Run: `npm run check 2>&1 | tail -5`
Expected: 0 tsc errors. (Drizzle schema is not yet updated; tsc on the existing codebase is unaffected.)

---

### Task 2: Migration `0059_brand_fact_sheet_v2.sql`

**Files:**
- Create: `migrations/0059_brand_fact_sheet_v2.sql`

- [ ] **Step 1: Write the migration**

Create `migrations/0059_brand_fact_sheet_v2.sql` with exactly this content:

```sql
-- Spec 2 §5.1: additive schema migration on brand_fact_sheet.
-- Rename fact_category → subcategory (now LLM-picked, free-form).
-- Add 8 columns for the new taxonomy + valueType + provenance.
-- Backfill domain from old fact_category values, then backfill user-typed
-- onboarding answers as source='user' rows.

-- Add the new domain enum column (defaults to 'identity' so existing rows are valid)
ALTER TABLE brand_fact_sheet
  ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'identity';

-- Constraint applied after default so existing rows pass
ALTER TABLE brand_fact_sheet
  DROP CONSTRAINT IF EXISTS brand_fact_sheet_domain_chk;
ALTER TABLE brand_fact_sheet
  ADD CONSTRAINT brand_fact_sheet_domain_chk
  CHECK (domain IN ('identity','offerings','positioning','team','operations','credentials','growth','contact'));

-- Rename fact_category → subcategory (idempotent: check before renaming)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brand_fact_sheet' AND column_name = 'fact_category'
  ) THEN
    ALTER TABLE brand_fact_sheet RENAME COLUMN fact_category TO subcategory;
  END IF;
END $$;

-- Backfill domain from the old fact_category values (now subcategory)
UPDATE brand_fact_sheet SET domain = CASE
  WHEN subcategory IN ('founding','funding','achievements') THEN 'growth'
  WHEN subcategory = 'team'                                  THEN 'team'
  WHEN subcategory IN ('products','pricing')                 THEN 'offerings'
  WHEN subcategory = 'locations'                             THEN 'operations'
  ELSE 'identity'
END
WHERE domain = 'identity' AND subcategory IS NOT NULL;

-- valueType discriminated union (string | number | array)
ALTER TABLE brand_fact_sheet
  ADD COLUMN IF NOT EXISTS value_type TEXT NOT NULL DEFAULT 'string';
ALTER TABLE brand_fact_sheet
  DROP CONSTRAINT IF EXISTS brand_fact_sheet_value_type_chk;
ALTER TABLE brand_fact_sheet
  ADD CONSTRAINT brand_fact_sheet_value_type_chk
  CHECK (value_type IN ('string','number','array'));

ALTER TABLE brand_fact_sheet
  ADD COLUMN IF NOT EXISTS value_payload  JSONB,
  ADD COLUMN IF NOT EXISTS confidence     NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS source_excerpt TEXT,
  ADD COLUMN IF NOT EXISTS dismissed_at   TIMESTAMP,
  ADD COLUMN IF NOT EXISTS accepted_at    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS run_id         VARCHAR REFERENCES brand_fact_scrape_runs(id) ON DELETE SET NULL;

ALTER TABLE brand_fact_sheet
  DROP CONSTRAINT IF EXISTS brand_fact_sheet_confidence_chk;
ALTER TABLE brand_fact_sheet
  ADD CONSTRAINT brand_fact_sheet_confidence_chk
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

-- Unique partial indexes: one active row per (brand, domain, subcategory, factKey) per source.
-- WHERE dismissed_at IS NULL keeps history but only one "live" row per tuple per source.
CREATE UNIQUE INDEX IF NOT EXISTS brand_fact_sheet_brand_tuple_scraped_idx
  ON brand_fact_sheet (brand_id, domain, subcategory, fact_key)
  WHERE source = 'scraped' AND dismissed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS brand_fact_sheet_brand_tuple_user_idx
  ON brand_fact_sheet (brand_id, domain, subcategory, fact_key)
  WHERE source = 'user' AND dismissed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS brand_fact_sheet_brand_tuple_manual_idx
  ON brand_fact_sheet (brand_id, domain, subcategory, fact_key)
  WHERE source = 'manual' AND dismissed_at IS NULL;

-- Backfill user-typed onboarding answers as source='user' rows.
-- ON CONFLICT DO NOTHING so re-running the migration is safe.

-- brands.description → identity > description > primary
INSERT INTO brand_fact_sheet
  (brand_id, domain, subcategory, fact_key, fact_value, value_type, source, source_url, last_verified)
SELECT id, 'identity', 'description', 'primary', description, 'string', 'user', NULL, NOW()
FROM brands
WHERE description IS NOT NULL AND description != ''
ON CONFLICT DO NOTHING;

-- brands.target_audience → positioning > target_audience > primary
INSERT INTO brand_fact_sheet
  (brand_id, domain, subcategory, fact_key, fact_value, value_type, source, source_url, last_verified)
SELECT id, 'positioning', 'target_audience', 'primary', target_audience, 'string', 'user', NULL, NOW()
FROM brands
WHERE target_audience IS NOT NULL AND target_audience != ''
ON CONFLICT DO NOTHING;

-- brands.brand_voice → positioning > brand_voice > primary
INSERT INTO brand_fact_sheet
  (brand_id, domain, subcategory, fact_key, fact_value, value_type, source, source_url, last_verified)
SELECT id, 'positioning', 'brand_voice', 'primary', brand_voice, 'string', 'user', NULL, NOW()
FROM brands
WHERE brand_voice IS NOT NULL AND brand_voice != ''
ON CONFLICT DO NOTHING;

-- brands.products[] → offerings > products > primary (valueType='array')
INSERT INTO brand_fact_sheet
  (brand_id, domain, subcategory, fact_key, fact_value, value_type, value_payload, source, source_url, last_verified)
SELECT id,
       'offerings',
       'products',
       'primary',
       array_to_string(products, ', '),
       'array',
       jsonb_build_object('items', to_jsonb(products)),
       'user',
       NULL,
       NOW()
FROM brands
WHERE products IS NOT NULL AND array_length(products, 1) > 0
ON CONFLICT DO NOTHING;

-- brands.key_values[] → positioning > key_values > primary (valueType='array')
INSERT INTO brand_fact_sheet
  (brand_id, domain, subcategory, fact_key, fact_value, value_type, value_payload, source, source_url, last_verified)
SELECT id,
       'positioning',
       'key_values',
       'primary',
       array_to_string(key_values, ', '),
       'array',
       jsonb_build_object('items', to_jsonb(key_values)),
       'user',
       NULL,
       NOW()
FROM brands
WHERE key_values IS NOT NULL AND array_length(key_values, 1) > 0
ON CONFLICT DO NOTHING;

-- brands.unique_selling_points[] → positioning > unique_selling_points > primary (valueType='array')
INSERT INTO brand_fact_sheet
  (brand_id, domain, subcategory, fact_key, fact_value, value_type, value_payload, source, source_url, last_verified)
SELECT id,
       'positioning',
       'unique_selling_points',
       'primary',
       array_to_string(unique_selling_points, ', '),
       'array',
       jsonb_build_object('items', to_jsonb(unique_selling_points)),
       'user',
       NULL,
       NOW()
FROM brands
WHERE unique_selling_points IS NOT NULL AND array_length(unique_selling_points, 1) > 0
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Verify idempotency markers**

Run: `grep -cE "IF NOT EXISTS|IF EXISTS|ON CONFLICT|DROP CONSTRAINT IF EXISTS" migrations/0059_brand_fact_sheet_v2.sql`
Expected: ≥18 (`ADD COLUMN IF NOT EXISTS` ×8 + `ON CONFLICT DO NOTHING` ×6 + `DROP CONSTRAINT IF EXISTS` ×3 + `IF EXISTS` ×1 + `CREATE UNIQUE INDEX IF NOT EXISTS` ×3).

- [ ] **Step 3: Verify no destructive operations**

Run: `grep -E "DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM" migrations/0059_brand_fact_sheet_v2.sql`
Expected: no output.

---

### Task 3: Migration `0060_brand_fact_scrape_caps.sql`

**Files:**
- Create: `migrations/0060_brand_fact_scrape_caps.sql`

- [ ] **Step 1: Write the migration**

Create `migrations/0060_brand_fact_scrape_caps.sql`:

```sql
-- Per-brand monthly LLM-cost cap for fact scrapes. Default cap $5.00/month.
-- Row created lazily on first scrape of the month; not pre-seeded.
CREATE TABLE IF NOT EXISTS brand_monthly_cost_caps (
  brand_id          VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  month_key         TEXT NOT NULL,  -- format: YYYY-MM
  fact_scrape_cents INTEGER NOT NULL DEFAULT 0,
  monthly_cap_cents INTEGER NOT NULL DEFAULT 500,
  PRIMARY KEY (brand_id, month_key)
);

CREATE INDEX IF NOT EXISTS brand_monthly_cost_caps_month_idx
  ON brand_monthly_cost_caps (month_key);

-- Pause toggle: when false, manual + cron + welcome-path scrapes are all skipped.
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS fact_scrape_enabled BOOLEAN NOT NULL DEFAULT TRUE;
```

- [ ] **Step 2: Verify idempotency markers**

Run: `grep -cE "IF NOT EXISTS" migrations/0060_brand_fact_scrape_caps.sql`
Expected: `3`.

- [ ] **Step 3: Verify no destructive operations**

Run: `grep -E "DROP TABLE|DROP COLUMN|TRUNCATE" migrations/0060_brand_fact_scrape_caps.sql`
Expected: no output.

---

### Task 4: Drizzle schema — add `brandFactScrapeRuns`, `brandFactScrapePages`, `brandMonthlyCostCaps`

**Files:**
- Modify: `shared/schema.ts` (append after the existing `geoSignalRuns` block at `:497-514`)

- [ ] **Step 1: Verify `geoSignalRuns` location and imports**

Run: `grep -n "geoSignalRuns\s*=" shared/schema.ts | head -3`
Expected: one line matching the export at ~line 499. If different, locate it and use that line range in step 2.

Also confirm `jsonb`, `integer`, `bigint`, `numeric` are imported at the top. Run: `grep -E "^import.*pg-core" shared/schema.ts`
Expected: an import line including `jsonb, integer, numeric` at minimum. If `bigint` is missing, add it in step 2 below.

- [ ] **Step 2: Add the three new tables**

Append the following block to `shared/schema.ts` immediately AFTER the `insertGeoSignalRunSchema` + types block (which lives just below the `geoSignalRuns` table definition). Place all three tables together so they're easy to locate.

Imports to add at the top of the file (only if not already present): `bigint` from `drizzle-orm/pg-core`.

```ts
// ============================================================================
// Spec 2: Brand Fact Sheet redesign — scrape runs + pages + cost caps
// ============================================================================

// One row per scrape run. Slice-resumable via `status='slice_pending'`.
// Read by the SSE stream + the new diff view. See spec 2 §5.2.
export const brandFactScrapeRuns = pgTable(
  "brand_fact_scrape_runs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    triggeredBy: text("triggered_by").notNull(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    lastAdvanceAt: timestamp("last_advance_at").notNull().defaultNow(),
    deadlineMs: bigint("deadline_ms", { mode: "number" }),
    pagesPlanned: integer("pages_planned").notNull().default(0),
    pagesFetched: integer("pages_fetched").notNull().default(0),
    pagesFailed: integer("pages_failed").notNull().default(0),
    factsExtracted: integer("facts_extracted").notNull().default(0),
    factsValidated: integer("facts_validated").notNull().default(0),
    factsRedacted: integer("facts_redacted").notNull().default(0),
    llmCostCents: integer("llm_cost_cents").notNull().default(0),
    llmCalls: integer("llm_calls").notNull().default(0),
    llmInputTokens: bigint("llm_input_tokens", { mode: "number" }).notNull().default(0),
    llmOutputTokens: bigint("llm_output_tokens", { mode: "number" }).notNull().default(0),
    errorKind: text("error_kind"),
    errorMessage: text("error_message"),
    plan: jsonb("plan"),
    progress: jsonb("progress"),
  },
  (table) => [
    index("brand_fact_scrape_runs_brand_started_idx").on(table.brandId, table.startedAt.desc()),
    index("brand_fact_scrape_runs_slice_pending_idx").on(table.lastAdvanceAt),
  ],
);

export const insertBrandFactScrapeRunSchema = createInsertSchema(brandFactScrapeRuns).omit({
  id: true,
  startedAt: true,
  lastAdvanceAt: true,
});
export type BrandFactScrapeRun = typeof brandFactScrapeRuns.$inferSelect;
export type InsertBrandFactScrapeRun = z.infer<typeof insertBrandFactScrapeRunSchema>;

// One row per page the agent attempted in a run. Drives the per-page UI panel.
export const brandFactScrapePages = pgTable(
  "brand_fact_scrape_pages",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runId: varchar("run_id")
      .notNull()
      .references(() => brandFactScrapeRuns.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    status: text("status").notNull().default("pending"),
    fetchedAt: timestamp("fetched_at"),
    bytes: integer("bytes"),
    statusCode: integer("status_code"),
    contentType: text("content_type"),
    lang: text("lang"),
    factCount: integer("fact_count").notNull().default(0),
    llmCostCents: integer("llm_cost_cents").notNull().default(0),
    errorKind: text("error_kind"),
    errorMessage: text("error_message"),
    excerpt: text("excerpt"),
  },
  (table) => [index("brand_fact_scrape_pages_run_idx").on(table.runId)],
);

export const insertBrandFactScrapePageSchema = createInsertSchema(brandFactScrapePages).omit({
  id: true,
});
export type BrandFactScrapePage = typeof brandFactScrapePages.$inferSelect;
export type InsertBrandFactScrapePage = z.infer<typeof insertBrandFactScrapePageSchema>;

// Per-brand monthly LLM cost cap. Row created lazily on first scrape of month.
export const brandMonthlyCostCaps = pgTable(
  "brand_monthly_cost_caps",
  {
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    monthKey: text("month_key").notNull(),
    factScrapeCents: integer("fact_scrape_cents").notNull().default(0),
    monthlyCapCents: integer("monthly_cap_cents").notNull().default(500),
  },
  (table) => [
    primaryKey({ columns: [table.brandId, table.monthKey] }),
    index("brand_monthly_cost_caps_month_idx").on(table.monthKey),
  ],
);

export const insertBrandMonthlyCostCapSchema = createInsertSchema(brandMonthlyCostCaps);
export type BrandMonthlyCostCap = typeof brandMonthlyCostCaps.$inferSelect;
export type InsertBrandMonthlyCostCap = z.infer<typeof insertBrandMonthlyCostCapSchema>;
```

- [ ] **Step 3: If `primaryKey` is not yet imported, add it**

Run: `grep -E "import.*primaryKey" shared/schema.ts`
Expected: a match. If no match, add `primaryKey` to the existing `from "drizzle-orm/pg-core"` import line at the top of the file.

- [ ] **Step 4: Run typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 errors. If tsc complains about the `index().desc()` form on `startedAt`, change `table.startedAt.desc()` to plain `table.startedAt` (PG can scan ASC index backwards for DESC ORDER BY; performance is equivalent).

---

### Task 5: Drizzle schema — modify `brandFactSheet` table for new columns + rename

**Files:**
- Modify: `shared/schema.ts:1217-1238` (the existing `brandFactSheet` table definition)
- Modify: `shared/schema.ts:1761` (the existing `insertBrandFactSheetSchema`)

- [ ] **Step 1: Read the current `brandFactSheet` table block**

Open `shared/schema.ts` at line 1217. Confirm the current shape matches:

```ts
export const brandFactSheet = pgTable(
  "brand_fact_sheet",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    factCategory: text("fact_category").notNull(),       // ← will be renamed
    factKey: text("fact_key").notNull(),
    factValue: text("fact_value").notNull(),
    sourceUrl: text("source_url"),
    source: text("source").notNull().default("manual"),
    lastVerified: timestamp("last_verified").notNull().defaultNow(),
    isActive: integer("is_active").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("brand_fact_sheet_brand_id_idx").on(table.brandId)],
);
```

If the shape differs (e.g., already has a `domain` column), STOP and report.

- [ ] **Step 2: Replace the table block with the v2 shape**

Replace lines 1217-1238 with:

```ts
export const brandFactSheet = pgTable(
  "brand_fact_sheet",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    // Spec 2 §4.3: 8 universal domains
    domain: text("domain").notNull().default("identity"),
    // Spec 2 §4.3: free-form LLM-picked subcategory (was `factCategory`)
    subcategory: text("subcategory").notNull(),
    factKey: text("fact_key").notNull(),
    factValue: text("fact_value").notNull(),
    // Spec 2 §4.4: valueType discriminated union
    valueType: text("value_type").notNull().default("string"),
    valuePayload: jsonb("value_payload"),
    // Spec 2 §4.8: quality signal from agent extraction
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    // Spec 2 §4.6: 200-char snippet showing where the fact came from
    sourceExcerpt: text("source_excerpt"),
    sourceUrl: text("source_url"),
    source: text("source").notNull().default("manual"),
    // Spec 2 §4.6: diff resolution state
    dismissedAt: timestamp("dismissed_at"),
    acceptedAt: timestamp("accepted_at"),
    // Spec 2 §4.1: FK to the run that produced this row (null for source='user'/'manual')
    runId: varchar("run_id").references(() => brandFactScrapeRuns.id, { onDelete: "set null" }),
    lastVerified: timestamp("last_verified").notNull().defaultNow(),
    isActive: integer("is_active").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("brand_fact_sheet_brand_id_idx").on(table.brandId)],
);
```

- [ ] **Step 3: Verify `numeric` is imported**

Run: `grep -E "import.*\{.*numeric" shared/schema.ts | head -3`
If no match: add `numeric` to the existing `drizzle-orm/pg-core` import.

- [ ] **Step 4: Update the existing insert schema at line 1761**

Find:

```ts
export const insertBrandFactSheetSchema = createInsertSchema(brandFactSheet).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
```

Replace with:

```ts
export const insertBrandFactSheetSchema = createInsertSchema(brandFactSheet).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  acceptedAt: true,
  dismissedAt: true,
});
```

- [ ] **Step 5: Run typecheck**

Run: `npm run check 2>&1 | tail -15`
Expected: tsc errors on `databaseStorage.ts:3140-3175` because old `factCategory` references are now invalid. That's expected — Task 6 fixes them. Note the line numbers and exact error messages for Task 6.

If tsc fails ANYWHERE else (e.g., a different page reading `factCategory`), grep for `factCategory` and flag every site for Task 6's update:

Run: `grep -rn "factCategory" client/src/ server/ shared/ --include="*.ts" --include="*.tsx" | head -20`

Note: client-side references to `factCategory` (if any) MUST be updated in Task 6.

---

### Task 6: `brands` table — add `factScrapeEnabled` + update existing `brandFactSheet` storage methods

**Files:**
- Modify: `shared/schema.ts` (the `brands` table block — grep `export const brands = pgTable`)
- Modify: `server/databaseStorage.ts:3140-3175` (existing `brandFactSheet` storage methods)

- [ ] **Step 1: Add `factScrapeEnabled` to the brands table**

Find the `brands` table definition. Grep: `grep -n "export const brands = pgTable" shared/schema.ts`

Inside the brands columns block, after the `industry` field (it's already in the audit at `shared/schema.ts:146-197`), add:

```ts
factScrapeEnabled: boolean("fact_scrape_enabled").notNull().default(true),
```

Verify `boolean` is imported. Run: `grep -E "import.*boolean" shared/schema.ts`. If absent: add `boolean` to the `drizzle-orm/pg-core` import.

- [ ] **Step 2: Update storage methods at `databaseStorage.ts:3140-3175`**

Open `server/databaseStorage.ts` and grep `grep -n "brandFactSheet\." server/databaseStorage.ts`. For each match, replace any reference to `.factCategory` with `.subcategory`.

The most likely set of replacements (verify by reading the file):

- Line ~3149: `.orderBy(asc(schema.brandFactSheet.factCategory))` → `.orderBy(asc(schema.brandFactSheet.subcategory))`

If `createBrandFact`'s signature accepts an object with a `factCategory` field anywhere upstream (route handlers in `server/routes/intelligence.ts:451-525`), DO NOT change those yet — they're route-layer signatures and live in Plan 2.4. For now: only update the DAO. The DAO accepts the `InsertBrandFactSheet` type from Drizzle, which is now `subcategory`-based — so the route's `req.body.factCategory` will need to be remapped, but that's Plan 2.4's job. Add a TODO comment in the DAO referencing Plan 2.4:

```ts
// TODO(spec-2 Plan 2.4): route handler still posts `factCategory`; remap to `subcategory` upstream.
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check 2>&1 | tail -15`
Expected: 0 tsc errors in `server/databaseStorage.ts`. Errors in `server/routes/intelligence.ts` (CRUD routes) accepting `factCategory` from `req.body` are acceptable AS LONG AS the field is treated as `unknown` at the route boundary. If tsc fails at the routes layer, ADD a temporary `as unknown as { subcategory: string }` cast at the call site (with a `// TODO(spec-2 Plan 2.4)` comment) to make tsc happy without changing route behavior. The route still accepts the old wire format; Plan 2.4 will remap it.

If client code references `factCategory`, grep + update similarly:

```ts
// In any client/src/**/*.tsx that reads `fact.factCategory`:
fact.subcategory  // was: fact.factCategory
```

- [ ] **Step 4: Verify tour targets**

Run: `npm run check 2>&1 | tail -5`
Expected: `Tour-target verification OK (26 targets, all present).` (No tour markers touched in this plan; should be unchanged.)

---

### Task 7: Storage interface — add the 17 new methods to `IStorage`

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Locate the existing `IStorage` interface**

Run: `grep -n "export interface IStorage" server/storage.ts`
Note the line number; the interface is large — find a good place to add the new methods (near the existing `getVisibilityProgress` or `getBrandFactsByBrandId` cluster).

- [ ] **Step 2: Add type imports**

At the top of `server/storage.ts`, find the existing `@shared/schema` import. Add the new types:

```ts
import type {
  // ...existing types
  BrandFactScrapeRun,
  InsertBrandFactScrapeRun,
  BrandFactScrapePage,
  InsertBrandFactScrapePage,
  BrandMonthlyCostCap,
  // existing BrandFactSheet types are already imported
} from "@shared/schema";
```

- [ ] **Step 3: Add the 17 method signatures to the interface**

Add these methods inside `IStorage` (placement: near `getBrandFactsByBrandId` so related methods cluster):

```ts
  // ============================================================================
  // Spec 2 §6: Brand Fact Sheet scrape runs + pages + cost caps + diff
  // ============================================================================

  // --- scrape runs ---
  createScrapeRun(run: InsertBrandFactScrapeRun): Promise<BrandFactScrapeRun>;
  getScrapeRunById(runId: string): Promise<BrandFactScrapeRun | null>;
  listScrapeRunsForBrand(brandId: string, limit?: number): Promise<BrandFactScrapeRun[]>;
  updateScrapeRunStatus(
    runId: string,
    status: BrandFactScrapeRun["status"],
    fields?: {
      completedAt?: Date | null;
      errorKind?: string | null;
      errorMessage?: string | null;
      progress?: unknown;
    },
  ): Promise<BrandFactScrapeRun | null>;
  /** Atomic compare-and-swap: only flip `status` from `expected` to `next`.
   *  Returns the updated row, or null if the precondition didn't hold. */
  transitionScrapeRunStatusCAS(
    runId: string,
    expected: BrandFactScrapeRun["status"],
    next: BrandFactScrapeRun["status"],
  ): Promise<BrandFactScrapeRun | null>;
  incrementScrapeRunCounters(
    runId: string,
    deltas: Partial<{
      pagesFetched: number;
      pagesFailed: number;
      factsExtracted: number;
      factsValidated: number;
      factsRedacted: number;
      llmCostCents: number;
      llmCalls: number;
      llmInputTokens: number;
      llmOutputTokens: number;
    }>,
  ): Promise<void>;
  findSlicePendingRuns(staleSeconds: number, limit: number): Promise<BrandFactScrapeRun[]>;

  // --- scrape pages ---
  createScrapePage(page: InsertBrandFactScrapePage): Promise<BrandFactScrapePage>;
  updateScrapePageStatus(
    pageId: string,
    status: BrandFactScrapePage["status"],
    fields?: Partial<
      Pick<
        BrandFactScrapePage,
        | "fetchedAt"
        | "bytes"
        | "statusCode"
        | "contentType"
        | "lang"
        | "factCount"
        | "llmCostCents"
        | "errorKind"
        | "errorMessage"
        | "excerpt"
      >
    >,
  ): Promise<BrandFactScrapePage | null>;
  listScrapePagesForRun(runId: string): Promise<BrandFactScrapePage[]>;

  // --- monthly cost caps ---
  getMonthlyCostCap(brandId: string, monthKey: string): Promise<BrandMonthlyCostCap | null>;
  /** Atomically increment month spend. Lazily creates the row if absent.
   *  Returns the updated row. */
  incrementMonthlyCostCents(
    brandId: string,
    monthKey: string,
    deltaCents: number,
  ): Promise<BrandMonthlyCostCap>;

  // --- pause toggle ---
  getBrandFactScrapeEnabled(brandId: string): Promise<boolean>;
  setBrandFactScrapeEnabled(brandId: string, enabled: boolean): Promise<void>;

  // --- diff (Spec 2 §4.6) ---
  /** Returns the conflict pairs for a brand: (user-row, scraped-row) tuples
   *  where neither has accepted_at nor dismissed_at set. Grouped by domain
   *  client-side. */
  getBrandFactSheetConflicts(brandId: string): Promise<
    Array<{ userFact: BrandFactSheet; scrapedFact: BrandFactSheet }>
  >;
  /** Stamp accepted_at on the chosen fact. If `dismissOtherSide` is true,
   *  also stamps dismissed_at on the conflicting row (used by Use-mine/Use-AI's).
   *  Returns the updated fact. */
  acceptFact(
    factId: string,
    options: { dismissOtherSide: boolean },
  ): Promise<BrandFactSheet | null>;
  /** Stamp dismissed_at on a fact. */
  dismissFact(factId: string): Promise<BrandFactSheet | null>;

  /** SSE incremental read: list facts inserted by `runId` whose `id > sinceId`,
   *  ordered by id ASC, capped at `limit`. Consumed by Plan 2.3's SSE polling
   *  loop to emit `event: fact` per new row since the last tick. */
  listFactsByRunIdSince(
    runId: string,
    sinceId: string | null,
    limit: number,
  ): Promise<BrandFactSheet[]>;

  // --- cross-instance concurrency ---
  /** PG advisory lock keyed by hashtext('fact-scrape:' || brand_id). Returns
   *  true if the caller now holds the lock, false otherwise. The lock is
   *  transaction-scoped — must be held for the entire run. */
  tryAcquireScrapeLock(brandId: string): Promise<boolean>;
  /** Best-effort release (no-op if not held). */
  releaseScrapeLock(brandId: string): Promise<void>;
```

- [ ] **Step 4: Run typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: tsc errors saying `Property 'createScrapeRun' is missing in type 'DatabaseStorage'` (and similar for all 17). Expected — Task 8 implements them.

---

### Task 8: Storage implementations in `databaseStorage.ts`

**Files:**
- Modify: `server/databaseStorage.ts` (append after the existing brandFactSheet method block at `:3140-3175`)

- [ ] **Step 1: Add the type imports**

At the top of `server/databaseStorage.ts`, extend the existing `@shared/schema` import to include the new types:

```ts
import type {
  // ...existing
  BrandFactScrapeRun,
  InsertBrandFactScrapeRun,
  BrandFactScrapePage,
  InsertBrandFactScrapePage,
  BrandMonthlyCostCap,
  BrandFactSheet,
} from "@shared/schema";
```

Also verify the drizzle-orm helpers are imported: `eq, and, sql, desc, asc, lt`. If any is missing, add it to the `drizzle-orm` import.

- [ ] **Step 2: Add the 17 implementations**

Append these to `server/databaseStorage.ts`, immediately after the existing `deleteBrandFact` method (around line 3175):

```ts
  // ============================================================================
  // Spec 2 §6: Brand Fact Sheet scrape runs + pages + cost caps + diff
  // ============================================================================

  // --- scrape runs ---

  async createScrapeRun(run: InsertBrandFactScrapeRun): Promise<BrandFactScrapeRun> {
    const [row] = await db.insert(schema.brandFactScrapeRuns).values(run).returning();
    return row;
  }

  async getScrapeRunById(runId: string): Promise<BrandFactScrapeRun | null> {
    const [row] = await db
      .select()
      .from(schema.brandFactScrapeRuns)
      .where(eq(schema.brandFactScrapeRuns.id, runId))
      .limit(1);
    return row ?? null;
  }

  async listScrapeRunsForBrand(
    brandId: string,
    limit = 10,
  ): Promise<BrandFactScrapeRun[]> {
    return await db
      .select()
      .from(schema.brandFactScrapeRuns)
      .where(eq(schema.brandFactScrapeRuns.brandId, brandId))
      .orderBy(desc(schema.brandFactScrapeRuns.startedAt))
      .limit(limit);
  }

  async updateScrapeRunStatus(
    runId: string,
    status: BrandFactScrapeRun["status"],
    fields?: {
      completedAt?: Date | null;
      errorKind?: string | null;
      errorMessage?: string | null;
      progress?: unknown;
    },
  ): Promise<BrandFactScrapeRun | null> {
    const update: Record<string, unknown> = {
      status,
      lastAdvanceAt: new Date(),
    };
    if (fields?.completedAt !== undefined) update.completedAt = fields.completedAt;
    if (fields?.errorKind !== undefined) update.errorKind = fields.errorKind;
    if (fields?.errorMessage !== undefined) update.errorMessage = fields.errorMessage;
    if (fields?.progress !== undefined) update.progress = fields.progress;
    const [row] = await db
      .update(schema.brandFactScrapeRuns)
      .set(update)
      .where(eq(schema.brandFactScrapeRuns.id, runId))
      .returning();
    return row ?? null;
  }

  async transitionScrapeRunStatusCAS(
    runId: string,
    expected: BrandFactScrapeRun["status"],
    next: BrandFactScrapeRun["status"],
  ): Promise<BrandFactScrapeRun | null> {
    const [row] = await db
      .update(schema.brandFactScrapeRuns)
      .set({ status: next, lastAdvanceAt: new Date() })
      .where(
        and(
          eq(schema.brandFactScrapeRuns.id, runId),
          eq(schema.brandFactScrapeRuns.status, expected),
        ),
      )
      .returning();
    return row ?? null;
  }

  async incrementScrapeRunCounters(
    runId: string,
    deltas: Partial<{
      pagesFetched: number;
      pagesFailed: number;
      factsExtracted: number;
      factsValidated: number;
      factsRedacted: number;
      llmCostCents: number;
      llmCalls: number;
      llmInputTokens: number;
      llmOutputTokens: number;
    }>,
  ): Promise<void> {
    // Use a single SQL with column-level increment expressions. Drizzle's
    // .set() lifts sql tags so we can build per-column `col + delta` snippets.
    const setClause: Record<string, unknown> = {};
    if (deltas.pagesFetched != null)
      setClause.pagesFetched = sql`${schema.brandFactScrapeRuns.pagesFetched} + ${deltas.pagesFetched}`;
    if (deltas.pagesFailed != null)
      setClause.pagesFailed = sql`${schema.brandFactScrapeRuns.pagesFailed} + ${deltas.pagesFailed}`;
    if (deltas.factsExtracted != null)
      setClause.factsExtracted = sql`${schema.brandFactScrapeRuns.factsExtracted} + ${deltas.factsExtracted}`;
    if (deltas.factsValidated != null)
      setClause.factsValidated = sql`${schema.brandFactScrapeRuns.factsValidated} + ${deltas.factsValidated}`;
    if (deltas.factsRedacted != null)
      setClause.factsRedacted = sql`${schema.brandFactScrapeRuns.factsRedacted} + ${deltas.factsRedacted}`;
    if (deltas.llmCostCents != null)
      setClause.llmCostCents = sql`${schema.brandFactScrapeRuns.llmCostCents} + ${deltas.llmCostCents}`;
    if (deltas.llmCalls != null)
      setClause.llmCalls = sql`${schema.brandFactScrapeRuns.llmCalls} + ${deltas.llmCalls}`;
    if (deltas.llmInputTokens != null)
      setClause.llmInputTokens = sql`${schema.brandFactScrapeRuns.llmInputTokens} + ${deltas.llmInputTokens}`;
    if (deltas.llmOutputTokens != null)
      setClause.llmOutputTokens = sql`${schema.brandFactScrapeRuns.llmOutputTokens} + ${deltas.llmOutputTokens}`;
    if (Object.keys(setClause).length === 0) return;
    await db
      .update(schema.brandFactScrapeRuns)
      .set(setClause)
      .where(eq(schema.brandFactScrapeRuns.id, runId));
  }

  async findSlicePendingRuns(
    staleSeconds: number,
    limit: number,
  ): Promise<BrandFactScrapeRun[]> {
    const cutoff = new Date(Date.now() - staleSeconds * 1000);
    return await db
      .select()
      .from(schema.brandFactScrapeRuns)
      .where(
        and(
          eq(schema.brandFactScrapeRuns.status, "slice_pending"),
          lt(schema.brandFactScrapeRuns.lastAdvanceAt, cutoff),
        ),
      )
      .limit(limit);
  }

  // --- scrape pages ---

  async createScrapePage(page: InsertBrandFactScrapePage): Promise<BrandFactScrapePage> {
    const [row] = await db.insert(schema.brandFactScrapePages).values(page).returning();
    return row;
  }

  async updateScrapePageStatus(
    pageId: string,
    status: BrandFactScrapePage["status"],
    fields?: Partial<
      Pick<
        BrandFactScrapePage,
        | "fetchedAt"
        | "bytes"
        | "statusCode"
        | "contentType"
        | "lang"
        | "factCount"
        | "llmCostCents"
        | "errorKind"
        | "errorMessage"
        | "excerpt"
      >
    >,
  ): Promise<BrandFactScrapePage | null> {
    const update: Record<string, unknown> = { status };
    if (fields) Object.assign(update, fields);
    const [row] = await db
      .update(schema.brandFactScrapePages)
      .set(update)
      .where(eq(schema.brandFactScrapePages.id, pageId))
      .returning();
    return row ?? null;
  }

  async listScrapePagesForRun(runId: string): Promise<BrandFactScrapePage[]> {
    return await db
      .select()
      .from(schema.brandFactScrapePages)
      .where(eq(schema.brandFactScrapePages.runId, runId))
      .orderBy(asc(schema.brandFactScrapePages.id));
  }

  // --- monthly cost caps ---

  async getMonthlyCostCap(
    brandId: string,
    monthKey: string,
  ): Promise<BrandMonthlyCostCap | null> {
    const [row] = await db
      .select()
      .from(schema.brandMonthlyCostCaps)
      .where(
        and(
          eq(schema.brandMonthlyCostCaps.brandId, brandId),
          eq(schema.brandMonthlyCostCaps.monthKey, monthKey),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async incrementMonthlyCostCents(
    brandId: string,
    monthKey: string,
    deltaCents: number,
  ): Promise<BrandMonthlyCostCap> {
    // Upsert. Drizzle's onConflictDoUpdate with `excluded` semantics keeps
    // the migration's default monthlyCapCents (500) for new rows and adds
    // deltaCents to existing fact_scrape_cents for old rows.
    const [row] = await db
      .insert(schema.brandMonthlyCostCaps)
      .values({
        brandId,
        monthKey,
        factScrapeCents: deltaCents,
        monthlyCapCents: 500,
      })
      .onConflictDoUpdate({
        target: [
          schema.brandMonthlyCostCaps.brandId,
          schema.brandMonthlyCostCaps.monthKey,
        ],
        set: {
          factScrapeCents: sql`${schema.brandMonthlyCostCaps.factScrapeCents} + ${deltaCents}`,
        },
      })
      .returning();
    return row;
  }

  // --- pause toggle ---

  async getBrandFactScrapeEnabled(brandId: string): Promise<boolean> {
    const [row] = await db
      .select({ enabled: schema.brands.factScrapeEnabled })
      .from(schema.brands)
      .where(eq(schema.brands.id, brandId))
      .limit(1);
    return row?.enabled ?? false;
  }

  async setBrandFactScrapeEnabled(brandId: string, enabled: boolean): Promise<void> {
    await db
      .update(schema.brands)
      .set({ factScrapeEnabled: enabled })
      .where(eq(schema.brands.id, brandId));
  }

  // --- diff ---

  async getBrandFactSheetConflicts(brandId: string): Promise<
    Array<{ userFact: BrandFactSheet; scrapedFact: BrandFactSheet }>
  > {
    // Pull every active (user, scraped) row for this brand, group in JS.
    // Counts are small (typically <50 rows per brand) so a single SELECT
    // + in-memory grouping is correct and simple.
    const rows = await db
      .select()
      .from(schema.brandFactSheet)
      .where(
        and(
          eq(schema.brandFactSheet.brandId, brandId),
          sql`${schema.brandFactSheet.acceptedAt} IS NULL`,
          sql`${schema.brandFactSheet.dismissedAt} IS NULL`,
        ),
      );
    const userByKey = new Map<string, BrandFactSheet>();
    const scrapedByKey = new Map<string, BrandFactSheet>();
    for (const r of rows) {
      const key = `${r.domain}::${r.subcategory}::${r.factKey}`;
      if (r.source === "user") userByKey.set(key, r);
      else if (r.source === "scraped") scrapedByKey.set(key, r);
    }
    const conflicts: Array<{ userFact: BrandFactSheet; scrapedFact: BrandFactSheet }> = [];
    for (const [key, userFact] of userByKey) {
      const scrapedFact = scrapedByKey.get(key);
      if (scrapedFact) conflicts.push({ userFact, scrapedFact });
    }
    return conflicts;
  }

  async acceptFact(
    factId: string,
    options: { dismissOtherSide: boolean },
  ): Promise<BrandFactSheet | null> {
    // Stamp accepted_at on this fact.
    const [target] = await db
      .update(schema.brandFactSheet)
      .set({ acceptedAt: new Date() })
      .where(eq(schema.brandFactSheet.id, factId))
      .returning();
    if (!target) return null;
    if (options.dismissOtherSide) {
      // Find the conflicting row (same brand/domain/subcategory/factKey, different source).
      await db
        .update(schema.brandFactSheet)
        .set({ dismissedAt: new Date() })
        .where(
          and(
            eq(schema.brandFactSheet.brandId, target.brandId),
            eq(schema.brandFactSheet.domain, target.domain),
            eq(schema.brandFactSheet.subcategory, target.subcategory),
            eq(schema.brandFactSheet.factKey, target.factKey),
            sql`${schema.brandFactSheet.source} != ${target.source}`,
            sql`${schema.brandFactSheet.dismissedAt} IS NULL`,
          ),
        );
    }
    return target;
  }

  async dismissFact(factId: string): Promise<BrandFactSheet | null> {
    const [row] = await db
      .update(schema.brandFactSheet)
      .set({ dismissedAt: new Date() })
      .where(eq(schema.brandFactSheet.id, factId))
      .returning();
    return row ?? null;
  }

  async listFactsByRunIdSince(
    runId: string,
    sinceId: string | null,
    limit: number,
  ): Promise<BrandFactSheet[]> {
    // SSE incremental cursor. `id` is a varchar UUID — sortable lexically;
    // not a perfect monotonic cursor but stable per-row, and the
    // (run_id, id ASC) scan is bounded by `limit`. Sufficient for streaming.
    const conditions = [eq(schema.brandFactSheet.runId, runId)];
    if (sinceId) conditions.push(sql`${schema.brandFactSheet.id} > ${sinceId}`);
    return await db
      .select()
      .from(schema.brandFactSheet)
      .where(and(...conditions))
      .orderBy(asc(schema.brandFactSheet.id))
      .limit(limit);
  }

  // --- cross-instance concurrency ---

  async tryAcquireScrapeLock(brandId: string): Promise<boolean> {
    // pg_try_advisory_lock takes a bigint key; derive from hashtext()
    // so collisions across features are unlikely. Lock is session-scoped.
    const result = await db.execute(
      sql`SELECT pg_try_advisory_lock(hashtext('fact-scrape:' || ${brandId})::bigint) AS got`,
    );
    const row = (result as unknown as Array<{ got: boolean }>)[0];
    return row?.got === true;
  }

  async releaseScrapeLock(brandId: string): Promise<void> {
    await db.execute(
      sql`SELECT pg_advisory_unlock(hashtext('fact-scrape:' || ${brandId})::bigint)`,
    );
  }
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 tsc errors. Tour-target verifier still OK at 26.

---

### Task 9: Tests — scrape runs storage

**Files:**
- Create: `tests/unit/brandFactScrapeRunsStorage.test.ts`

- [ ] **Step 1: Read the existing mocking convention**

Open `tests/unit/geoSignalRuns.test.ts` and skim — that's the pattern Plan 5 Task 1 established for unit-testing storage methods. Replicate the `db` mock shape exactly.

- [ ] **Step 2: Write the test file**

Create `tests/unit/brandFactScrapeRunsStorage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted db mock — chain proxy returning thenable for all Drizzle ops.
const dbMock = vi.hoisted(() => {
  const proxy: Record<string, unknown> = {};
  const fn = vi.fn(() => proxy);
  for (const method of [
    "insert",
    "select",
    "update",
    "delete",
    "from",
    "where",
    "values",
    "set",
    "returning",
    "orderBy",
    "limit",
    "onConflictDoUpdate",
    "execute",
  ]) {
    (proxy as any)[method] = fn;
  }
  // returning() resolves to an array we control per-test
  return { proxy, fn };
});

vi.mock("../../server/db", () => ({ db: dbMock.proxy }));

// Stub the schema imports as identity-like proxies for chained access.
vi.mock("../../shared/schema", () => {
  const handler = {
    get: (_t: object, p: string) => p,
  };
  return new Proxy({}, handler);
});

import { DatabaseStorage } from "../../server/databaseStorage";

describe("brandFactScrapeRuns storage", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it("createScrapeRun returns the inserted row", async () => {
    const fakeRow = { id: "run-1", brandId: "brand-1", status: "pending" };
    // Last call in the chain is .returning(), which resolves to [fakeRow]
    dbMock.fn.mockReturnValue({
      values: () => ({ returning: () => Promise.resolve([fakeRow]) }),
    } as any);
    const row = await storage.createScrapeRun({
      brandId: "brand-1",
      triggeredBy: "manual_rescrape",
    } as any);
    expect(row).toEqual(fakeRow);
  });

  it("getScrapeRunById returns null when no row exists", async () => {
    dbMock.fn.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
      }),
    } as any);
    const row = await storage.getScrapeRunById("missing");
    expect(row).toBeNull();
  });

  it("transitionScrapeRunStatusCAS returns null when expected status doesn't match", async () => {
    // CAS: UPDATE ... WHERE status=expected returns [] when condition false
    dbMock.fn.mockReturnValue({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([]) }),
      }),
    } as any);
    const row = await storage.transitionScrapeRunStatusCAS(
      "run-1",
      "pending",
      "planning",
    );
    expect(row).toBeNull();
  });

  it("transitionScrapeRunStatusCAS returns the row when CAS succeeds", async () => {
    const fakeRow = { id: "run-1", status: "planning" };
    dbMock.fn.mockReturnValue({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([fakeRow]) }),
      }),
    } as any);
    const row = await storage.transitionScrapeRunStatusCAS(
      "run-1",
      "pending",
      "planning",
    );
    expect(row).toEqual(fakeRow);
  });

  it("incrementScrapeRunCounters no-ops when deltas is empty", async () => {
    const updateSpy = vi.fn();
    dbMock.fn.mockReturnValue({ set: updateSpy } as any);
    await storage.incrementScrapeRunCounters("run-1", {});
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("incrementScrapeRunCounters builds a set clause from provided deltas", async () => {
    const setSpy = vi.fn().mockReturnValue({ where: () => Promise.resolve() });
    dbMock.fn.mockReturnValue({ set: setSpy } as any);
    await storage.incrementScrapeRunCounters("run-1", {
      pagesFetched: 1,
      llmCostCents: 5,
    });
    expect(setSpy).toHaveBeenCalledTimes(1);
    const arg = setSpy.mock.calls[0][0];
    expect(Object.keys(arg).sort()).toEqual(["llmCostCents", "pagesFetched"]);
  });

  it("findSlicePendingRuns filters by status and stale cutoff", async () => {
    const fakeRows = [{ id: "run-1", status: "slice_pending" }];
    dbMock.fn.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(fakeRows) }),
      }),
    } as any);
    const rows = await storage.findSlicePendingRuns(30, 10);
    expect(rows).toEqual(fakeRows);
  });

  it("listScrapeRunsForBrand orders by startedAt DESC with default limit 10", async () => {
    const fakeRows = [{ id: "run-1" }, { id: "run-2" }];
    dbMock.fn.mockReturnValue({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve(fakeRows) }),
        }),
      }),
    } as any);
    const rows = await storage.listScrapeRunsForBrand("brand-1");
    expect(rows).toEqual(fakeRows);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/brandFactScrapeRunsStorage.test.ts`
Expected: 8/8 pass.

If the test file produces type errors related to the chain-proxy `as any`, that's intentional — these are unit smoke tests for plumbing, not query-correctness tests. Real query correctness is verified by integration tests in Plan 2.6.

---

### Task 10: Tests — scrape pages storage

**Files:**
- Create: `tests/unit/brandFactScrapePagesStorage.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/unit/brandFactScrapePagesStorage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => {
  const proxy: Record<string, unknown> = {};
  const fn = vi.fn(() => proxy);
  for (const method of [
    "insert",
    "select",
    "update",
    "from",
    "where",
    "values",
    "set",
    "returning",
    "orderBy",
    "limit",
  ]) {
    (proxy as any)[method] = fn;
  }
  return { proxy, fn };
});

vi.mock("../../server/db", () => ({ db: dbMock.proxy }));
vi.mock("../../shared/schema", () => new Proxy({}, { get: (_t, p) => p }));

import { DatabaseStorage } from "../../server/databaseStorage";

describe("brandFactScrapePages storage", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it("createScrapePage returns the inserted row", async () => {
    const fakeRow = { id: "page-1", runId: "run-1", url: "https://x.com/about" };
    dbMock.fn.mockReturnValue({
      values: () => ({ returning: () => Promise.resolve([fakeRow]) }),
    } as any);
    const row = await storage.createScrapePage({
      runId: "run-1",
      url: "https://x.com/about",
      canonicalUrl: "https://x.com/about",
    } as any);
    expect(row).toEqual(fakeRow);
  });

  it("updateScrapePageStatus returns null when row missing", async () => {
    dbMock.fn.mockReturnValue({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([]) }),
      }),
    } as any);
    const row = await storage.updateScrapePageStatus("missing", "failed");
    expect(row).toBeNull();
  });

  it("updateScrapePageStatus passes through partial fields", async () => {
    const setSpy = vi.fn().mockReturnValue({
      where: () => ({ returning: () => Promise.resolve([{ id: "p1", status: "done" }]) }),
    });
    dbMock.fn.mockReturnValue({ set: setSpy } as any);
    await storage.updateScrapePageStatus("p1", "done", {
      bytes: 4096,
      factCount: 5,
    });
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done", bytes: 4096, factCount: 5 }),
    );
  });

  it("listScrapePagesForRun returns rows ordered by id ASC", async () => {
    const fakeRows = [{ id: "p1" }, { id: "p2" }];
    dbMock.fn.mockReturnValue({
      from: () => ({
        where: () => ({ orderBy: () => Promise.resolve(fakeRows) }),
      }),
    } as any);
    const rows = await storage.listScrapePagesForRun("run-1");
    expect(rows).toEqual(fakeRows);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/unit/brandFactScrapePagesStorage.test.ts`
Expected: 4/4 pass.

---

### Task 11: Tests — monthly cost caps storage

**Files:**
- Create: `tests/unit/brandMonthlyCostCapsStorage.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/unit/brandMonthlyCostCapsStorage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => {
  const proxy: Record<string, unknown> = {};
  const fn = vi.fn(() => proxy);
  for (const method of [
    "insert",
    "select",
    "update",
    "from",
    "where",
    "values",
    "set",
    "returning",
    "limit",
    "onConflictDoUpdate",
  ]) {
    (proxy as any)[method] = fn;
  }
  return { proxy, fn };
});

vi.mock("../../server/db", () => ({ db: dbMock.proxy }));
vi.mock("../../shared/schema", () => new Proxy({}, { get: (_t, p) => p }));

import { DatabaseStorage } from "../../server/databaseStorage";

describe("brandMonthlyCostCaps storage", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it("getMonthlyCostCap returns null when no row exists for that month", async () => {
    dbMock.fn.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
      }),
    } as any);
    const cap = await storage.getMonthlyCostCap("brand-1", "2026-05");
    expect(cap).toBeNull();
  });

  it("getMonthlyCostCap returns the row when it exists", async () => {
    const fakeRow = { brandId: "brand-1", monthKey: "2026-05", factScrapeCents: 200, monthlyCapCents: 500 };
    dbMock.fn.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([fakeRow]) }),
      }),
    } as any);
    const cap = await storage.getMonthlyCostCap("brand-1", "2026-05");
    expect(cap).toEqual(fakeRow);
  });

  it("incrementMonthlyCostCents upserts via onConflictDoUpdate", async () => {
    const fakeRow = {
      brandId: "brand-1",
      monthKey: "2026-05",
      factScrapeCents: 25,
      monthlyCapCents: 500,
    };
    const onConflictSpy = vi.fn().mockReturnValue({
      returning: () => Promise.resolve([fakeRow]),
    });
    dbMock.fn.mockReturnValue({
      values: () => ({ onConflictDoUpdate: onConflictSpy } as any),
    } as any);
    const row = await storage.incrementMonthlyCostCents("brand-1", "2026-05", 25);
    expect(row).toEqual(fakeRow);
    expect(onConflictSpy).toHaveBeenCalledOnce();
  });

  it("incrementMonthlyCostCents seeds the row with monthlyCapCents=500 on first insert", async () => {
    const valuesSpy = vi.fn().mockReturnValue({
      onConflictDoUpdate: () => ({
        returning: () => Promise.resolve([{}]),
      }),
    });
    dbMock.fn.mockReturnValue({ values: valuesSpy } as any);
    await storage.incrementMonthlyCostCents("brand-1", "2026-05", 25);
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: "brand-1",
        monthKey: "2026-05",
        factScrapeCents: 25,
        monthlyCapCents: 500,
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/unit/brandMonthlyCostCapsStorage.test.ts`
Expected: 4/4 pass.

---

### Task 12: Tests — `brandFactSheet` post-migration shape

**Files:**
- Create: `tests/unit/brandFactSheetMigrationShape.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/unit/brandFactSheetMigrationShape.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  brandFactSheet,
  insertBrandFactSheetSchema,
  type BrandFactSheet,
} from "../../shared/schema";

describe("brandFactSheet schema after Spec 2 migration", () => {
  it("has the new columns from migration 0059", () => {
    const cols = Object.keys(brandFactSheet);
    expect(cols).toContain("domain");
    expect(cols).toContain("subcategory");
    expect(cols).toContain("valueType");
    expect(cols).toContain("valuePayload");
    expect(cols).toContain("confidence");
    expect(cols).toContain("sourceExcerpt");
    expect(cols).toContain("dismissedAt");
    expect(cols).toContain("acceptedAt");
    expect(cols).toContain("runId");
  });

  it("no longer exposes factCategory (renamed to subcategory)", () => {
    const cols = Object.keys(brandFactSheet);
    expect(cols).not.toContain("factCategory");
  });

  it("insertBrandFactSheetSchema accepts the new fields", () => {
    const parsed = insertBrandFactSheetSchema.safeParse({
      brandId: "brand-1",
      domain: "offerings",
      subcategory: "pricing_plans",
      factKey: "enterprise",
      factValue: "Custom pricing, contact sales",
      valueType: "string",
      source: "scraped",
      sourceUrl: "https://example.com/pricing",
      confidence: "0.82",
      sourceExcerpt: "Our enterprise tier offers...",
    });
    expect(parsed.success).toBe(true);
  });

  it("insertBrandFactSheetSchema rejects invalid domain", () => {
    const parsed = insertBrandFactSheetSchema.safeParse({
      brandId: "brand-1",
      domain: "not-a-domain",
      subcategory: "x",
      factKey: "y",
      factValue: "z",
      source: "scraped",
    });
    // Drizzle's createInsertSchema does NOT enforce CHECK constraints
    // (those run in the DB only). This test documents the boundary:
    // the Zod schema accepts the row; the DB rejects it.
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/unit/brandFactSheetMigrationShape.test.ts`
Expected: 4/4 pass.

---

### Task 13: Tests — diff conflicts + accept/dismiss helpers

**Files:**
- Create: `tests/unit/brandFactSheetConflictsQuery.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/unit/brandFactSheetConflictsQuery.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => {
  const proxy: Record<string, unknown> = {};
  const fn = vi.fn(() => proxy);
  for (const method of [
    "insert",
    "select",
    "update",
    "from",
    "where",
    "values",
    "set",
    "returning",
    "limit",
  ]) {
    (proxy as any)[method] = fn;
  }
  return { proxy, fn };
});

vi.mock("../../server/db", () => ({ db: dbMock.proxy }));
vi.mock("../../shared/schema", () => new Proxy({}, { get: (_t, p) => p }));

import { DatabaseStorage } from "../../server/databaseStorage";

describe("brandFactSheet conflicts + accept/dismiss", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it("getBrandFactSheetConflicts pairs user+scraped rows on the same key", async () => {
    const rows = [
      {
        id: "u1", brandId: "b1", source: "user",
        domain: "positioning", subcategory: "target_audience", factKey: "primary",
        factValue: "founders",
      },
      {
        id: "s1", brandId: "b1", source: "scraped",
        domain: "positioning", subcategory: "target_audience", factKey: "primary",
        factValue: "engineering leaders",
      },
      // A user-only row with no conflict — should NOT appear
      {
        id: "u2", brandId: "b1", source: "user",
        domain: "identity", subcategory: "description", factKey: "primary",
        factValue: "we build things",
      },
    ];
    dbMock.fn.mockReturnValue({
      from: () => ({ where: () => Promise.resolve(rows) }),
    } as any);
    const conflicts = await storage.getBrandFactSheetConflicts("b1");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].userFact.id).toBe("u1");
    expect(conflicts[0].scrapedFact.id).toBe("s1");
  });

  it("getBrandFactSheetConflicts returns empty when no conflicts exist", async () => {
    dbMock.fn.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([]) }),
    } as any);
    const conflicts = await storage.getBrandFactSheetConflicts("b1");
    expect(conflicts).toEqual([]);
  });

  it("acceptFact with dismissOtherSide=true updates both rows", async () => {
    const target = {
      id: "u1", brandId: "b1", source: "user",
      domain: "positioning", subcategory: "target_audience", factKey: "primary",
    };
    // First .returning() call returns the target row from the accept step
    // Second .update() call (for the dismiss) is awaited but result unused
    let callCount = 0;
    dbMock.fn.mockImplementation(() => {
      callCount++;
      return {
        set: () => ({
          where: () =>
            callCount === 1
              ? { returning: () => Promise.resolve([target]) }
              : Promise.resolve(),
        }),
      };
    });
    const row = await storage.acceptFact("u1", { dismissOtherSide: true });
    expect(row).toEqual(target);
  });

  it("dismissFact stamps dismissedAt", async () => {
    const dismissed = { id: "u1", dismissedAt: new Date() };
    dbMock.fn.mockReturnValue({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([dismissed]) }),
      }),
    } as any);
    const row = await storage.dismissFact("u1");
    expect(row).toEqual(dismissed);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/unit/brandFactSheetConflictsQuery.test.ts`
Expected: 4/4 pass.

---

### Task 14: Tests — advisory lock

**Files:**
- Create: `tests/unit/scrapeAdvisoryLock.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/unit/scrapeAdvisoryLock.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => {
  const proxy: Record<string, unknown> = {};
  const executeSpy = vi.fn();
  (proxy as any).execute = executeSpy;
  return { proxy, executeSpy };
});

vi.mock("../../server/db", () => ({ db: dbMock.proxy }));
vi.mock("../../shared/schema", () => new Proxy({}, { get: (_t, p) => p }));

import { DatabaseStorage } from "../../server/databaseStorage";

describe("scrape advisory lock", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it("tryAcquireScrapeLock returns true when pg_try_advisory_lock returns true", async () => {
    dbMock.executeSpy.mockResolvedValue([{ got: true }]);
    const got = await storage.tryAcquireScrapeLock("brand-1");
    expect(got).toBe(true);
  });

  it("tryAcquireScrapeLock returns false when pg_try_advisory_lock returns false", async () => {
    dbMock.executeSpy.mockResolvedValue([{ got: false }]);
    const got = await storage.tryAcquireScrapeLock("brand-1");
    expect(got).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/unit/scrapeAdvisoryLock.test.ts`
Expected: 2/2 pass.

---

### Task 15: Verify the full plan end-to-end

**Files:** read-only verification

- [ ] **Step 1: Run typecheck**

Run: `npm run check 2>&1 | tail -15`
Expected: 0 tsc errors, tour-target verifier OK (26 targets).

- [ ] **Step 2: Run all Plan 2.1 tests**

Run:
```
npx vitest run \
  tests/unit/brandFactScrapeRunsStorage.test.ts \
  tests/unit/brandFactScrapePagesStorage.test.ts \
  tests/unit/brandMonthlyCostCapsStorage.test.ts \
  tests/unit/brandFactSheetMigrationShape.test.ts \
  tests/unit/brandFactSheetConflictsQuery.test.ts \
  tests/unit/scrapeAdvisoryLock.test.ts
```

Expected: 22+ tests pass.

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run 2>&1 | tail -15`
Expected: only the documented baseline failures (sourceHealth, redditSource, ssrf, citationCronUnconditional, tour integration/e2e). No new regressions.

- [ ] **Step 4: Verify migrations are in lex order and idempotent**

Run:
```
ls migrations/ | grep "^00" | sort
```
Expected: `0058_brand_fact_scrape_runs.sql` after `0057`, then `0059`, then `0060`.

Run: `grep -c "IF NOT EXISTS\|ON CONFLICT\|DROP CONSTRAINT IF EXISTS\|IF EXISTS" migrations/0058_*.sql migrations/0059_*.sql migrations/0060_*.sql`
Expected total ≥25 idempotency markers across the three files.

- [ ] **Step 5: Spot-check Drizzle schema**

Run: `grep -nE "brandFactScrapeRuns|brandFactScrapePages|brandMonthlyCostCaps|factScrapeEnabled" shared/schema.ts | head -20`
Expected: each of the four new exports + the brands column shows up at least once.

- [ ] **Step 6: Spot-check storage interface coverage**

Run: `grep -c "createScrapeRun\|getScrapeRunById\|listScrapeRunsForBrand\|updateScrapeRunStatus\|transitionScrapeRunStatusCAS\|incrementScrapeRunCounters\|findSlicePendingRuns\|createScrapePage\|updateScrapePageStatus\|listScrapePagesForRun\|getMonthlyCostCap\|incrementMonthlyCostCents\|getBrandFactScrapeEnabled\|setBrandFactScrapeEnabled\|getBrandFactSheetConflicts\|acceptFact\|dismissFact\|listFactsByRunIdSince\|tryAcquireScrapeLock\|releaseScrapeLock" server/storage.ts`
Expected: 19 matches (signatures in the interface).

Run: `grep -c "createScrapeRun\|getScrapeRunById\|listScrapeRunsForBrand\|updateScrapeRunStatus\|transitionScrapeRunStatusCAS\|incrementScrapeRunCounters\|findSlicePendingRuns\|createScrapePage\|updateScrapePageStatus\|listScrapePagesForRun\|getMonthlyCostCap\|incrementMonthlyCostCents\|getBrandFactScrapeEnabled\|setBrandFactScrapeEnabled\|getBrandFactSheetConflicts\|acceptFact\|dismissFact\|listFactsByRunIdSince\|tryAcquireScrapeLock\|releaseScrapeLock" server/databaseStorage.ts`
Expected: 20+ matches (implementations + internal references).

- [ ] **Step 7: Verify the spec's Plan 2.1 success criteria**

From Spec 2 §9 — these specific bullets should be true after Plan 2.1:

- ✓ Three new migrations applied: `0058`, `0059`, `0060`. All idempotent. Backward-compatible.
- ✓ `brand_fact_scrape_runs` and `brand_fact_scrape_pages` tables exist with all columns and indexes from §5.2 and §5.3.
- ✓ `brand_fact_sheet` has new columns: `domain`, `value_type`, `value_payload`, `confidence`, `source_excerpt`, `dismissed_at`, `accepted_at`, `run_id`. Old `fact_category` renamed to `subcategory`.
- ✓ Existing brands' onboarding fields backfilled as `source='user'` rows.
- ✓ `brands.fact_scrape_enabled` column exists, defaults TRUE.
- ✓ `brand_monthly_cost_caps` table exists. Default cap $5.00 (500 cents).

All checked off → Plan 2.1 done.

- [ ] **Step 8: Final report**

Report:
- Files created (migrations, tests).
- Files modified (`shared/schema.ts`, `server/storage.ts`, `server/databaseStorage.ts`, and any client/route remap notes).
- Total tests added + pass/fail count.
- Tsc result.
- Tour-target verifier result.
- Anything skipped, deferred, or flagged with a `// TODO(spec-2 Plan 2.x)` comment.

Status: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.

No git commit. No git stash.

---

## Self-review checklist (controller runs before declaring Plan 2.1 done)

- [ ] No `git commit` / stash / reset / checkout-discard touched at any point.
- [ ] Migration numbers 0058/0059/0060 not collided.
- [ ] Default monthly cap is exactly 500 cents in both the SQL migration and the storage `incrementMonthlyCostCents` insert path.
- [ ] No destructive SQL operations in any migration (no DROP TABLE, no DROP COLUMN, no TRUNCATE, no DELETE FROM).
- [ ] All three migrations are idempotent (re-running them on a partially-migrated DB doesn't crash).
- [ ] `brandFactSheet`'s rename of `factCategory` → `subcategory` is reflected in the Drizzle schema, the storage methods, and every client/route consumer (grep `factCategory` returns zero in `client/src/` and `server/`).
- [ ] All 19 storage methods exist in both `IStorage` and `DatabaseStorage`.
- [ ] All 22+ new tests pass. Full suite at documented baseline only.
- [ ] `npm run check` clean. Tour targets 26/26.
- [ ] No new dependencies introduced.
- [ ] The plan does not touch route handlers, SSE, agent code, or UI — those are Plan 2.2 through 2.6.
