# Fact Sheet v2 — Plan 1: Schema, Migrations, Canonical Types, Postgres Token Bucket

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Commits:** This project's owner manages git directly. Tasks omit explicit `git commit` steps. Executor: make the file changes, run the tests, leave staging/committing to the human reviewer.

**Goal:** Land the foundational data model + concurrency primitive that the remaining v2 plans will build on. No new endpoints, no UI changes — just types, tables, and a Postgres-backed token-bucket library that any LLM caller can wrap.

**Architecture:** Six forward-only SQL migrations (extend two existing tables, create four new tables). Mirror schema in `shared/schema.ts` (Drizzle). Add one canonical Zod schema file. Add one library file for the Postgres token bucket with tests against a real connection.

**Tech Stack:** PostgreSQL 15 (via Supabase), Drizzle ORM, Zod, Vitest. Existing migration runner auto-applies any new `migrations/*.sql` at server boot in lex order ([`server/index.ts:181-236`](../../server/index.ts#L181-L236)).

**Spec reference:** [docs/superpowers/specs/2026-05-13-brand-fact-sheet-v2-design.md](../specs/2026-05-13-brand-fact-sheet-v2-design.md) §4 (Data model) and §10 (Concurrency control).

---

## Task 1 — Migration 0062: extend `brand_fact_scrape_runs` and pages-status check constraints

**Why:** v2 adds two columns to runs (`diagnostics jsonb`, `retry_count smallint`) and widens two CHECK constraints — `triggered_by` (new values: `cron_backstop`, `onboarding`, `paste`, `user_rescrape`) and `brand_fact_scrape_pages.status` (new skipped reasons: `skipped_non_html`, `skipped_soft_404`, `skipped_cookie_wall`, `skipped_waf`, `skipped_canonical`, `skipped_redirect_loop`, `skipped_hollow_shell`).

**Files:**
- Create: `migrations/0062_fact_sheet_v2_runs_columns.sql`

- [ ] **Step 1: Write the migration SQL**

Create `migrations/0062_fact_sheet_v2_runs_columns.sql`:

```sql
-- v2: add diagnostics + retry_count to brand_fact_scrape_runs
ALTER TABLE brand_fact_scrape_runs
  ADD COLUMN IF NOT EXISTS diagnostics JSONB,
  ADD COLUMN IF NOT EXISTS retry_count SMALLINT NOT NULL DEFAULT 0;

-- v2: widen triggered_by check constraint with new origin values
ALTER TABLE brand_fact_scrape_runs
  DROP CONSTRAINT IF EXISTS brand_fact_scrape_runs_triggered_by_check;
ALTER TABLE brand_fact_scrape_runs
  ADD CONSTRAINT brand_fact_scrape_runs_triggered_by_check
  CHECK (triggered_by IN (
    'welcome_confirm','brand_create','manual_rescrape','cron_refresh',
    'cron_backstop','onboarding','paste','user_rescrape'
  ));

-- v2: widen pages.status to include new skipped reasons emitted by /scrape-one
ALTER TABLE brand_fact_scrape_pages
  DROP CONSTRAINT IF EXISTS brand_fact_scrape_pages_status_check;
ALTER TABLE brand_fact_scrape_pages
  ADD CONSTRAINT brand_fact_scrape_pages_status_check
  CHECK (status IN (
    'pending','fetching','extracting','done','failed',
    'skipped_robots','skipped_lang','skipped_spa',
    'skipped_non_html','skipped_soft_404','skipped_cookie_wall',
    'skipped_waf','skipped_canonical','skipped_redirect_loop','skipped_hollow_shell'
  ));
```

- [ ] **Step 2: Run the migration**

Run: `npm run dev` (this triggers `applyPendingMigrations` at boot). Watch the logs for `migration_applied { file: '0062_fact_sheet_v2_runs_columns.sql' }`. Expected: success line, no errors.

- [ ] **Step 3: Verify the columns exist in the DB**

Run via your Supabase SQL editor or psql:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'brand_fact_scrape_runs'
  AND column_name IN ('diagnostics','retry_count');
```

Expected: two rows — `diagnostics | jsonb | NULL`, `retry_count | smallint | 0`.

---

## Task 2 — Migration 0063: extend `brand_fact_sheet` with `disagreement_count` + `schema_version`

**Why:** v2 surfaces "needs review" UI based on `schema_version < CURRENT_SCHEMA_VERSION` and "worth reviewing" UI when `disagreement_count >= 3`. `brand_fact_sheet` already has `runId` and a `lastVerified` timestamp from Spec 2 v1, so we only need the two new columns.

**Files:**
- Create: `migrations/0063_fact_sheet_v2_sheet_columns.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- v2: add disagreement_count + schema_version to brand_fact_sheet.
-- last_verified already exists from Spec 2 v1 (column name `last_verified`).
ALTER TABLE brand_fact_sheet
  ADD COLUMN IF NOT EXISTS disagreement_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schema_version SMALLINT NOT NULL DEFAULT 1;
```

- [ ] **Step 2: Run the migration**

Run: `npm run dev`. Watch for `migration_applied { file: '0063_fact_sheet_v2_sheet_columns.sql' }`.

- [ ] **Step 3: Verify**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'brand_fact_sheet'
  AND column_name IN ('disagreement_count','schema_version');
```

Expected: two rows.

---

## Task 3 — Migration 0064: create `fact_scrape_cache`

**Why:** 24h cache for search-LLM responses keyed by `<brandId, urlHash, schemaVersion>`. Multi-tenant safe (brandId in key) so white-label setups don't collide.

**Files:**
- Create: `migrations/0064_fact_scrape_cache.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE IF NOT EXISTS fact_scrape_cache (
  cache_key   TEXT PRIMARY KEY,
  source      TEXT NOT NULL CHECK (source IN ('search_llm')),
  brand_id    VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  value_json  JSONB NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS fact_scrape_cache_brand_id_idx
  ON fact_scrape_cache (brand_id);
CREATE INDEX IF NOT EXISTS fact_scrape_cache_expires_at_idx
  ON fact_scrape_cache (expires_at);
```

- [ ] **Step 2: Run and verify**

Run `npm run dev`. Verify:

```sql
SELECT to_regclass('public.fact_scrape_cache');
```

Expected: `fact_scrape_cache` (non-null).

---

## Task 4 — Migration 0065: create `fact_scrape_logs`

**Why:** One row per (run, source) outcome. Drives the observability dashboard and support queries ("why did this brand fail").

**Files:**
- Create: `migrations/0065_fact_scrape_logs.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE IF NOT EXISTS fact_scrape_logs (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              VARCHAR NOT NULL REFERENCES brand_fact_scrape_runs(id) ON DELETE CASCADE,
  source              TEXT NOT NULL
    CHECK (source IN ('static_pages','search_llm','user_enrich','aggregate','paste')),
  status              TEXT NOT NULL CHECK (status IN ('done','failed','skipped')),
  fact_count          INTEGER NOT NULL DEFAULT 0,
  latency_ms          INTEGER,
  provider_latency_ms INTEGER,
  error_kind          TEXT,
  diagnostics         JSONB,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fact_scrape_logs_run_id_idx
  ON fact_scrape_logs (run_id);
CREATE INDEX IF NOT EXISTS fact_scrape_logs_created_at_idx
  ON fact_scrape_logs (created_at);
```

- [ ] **Step 2: Run and verify**

Run `npm run dev`, then `SELECT to_regclass('public.fact_scrape_logs');` — expected non-null.

---

## Task 5 — Migration 0066: create `llm_concurrency_slots`

**Why:** Postgres-backed token bucket. Each in-flight LLM call holds a row; row auto-expires after 60s so a crashed function can't leak a slot.

**Files:**
- Create: `migrations/0066_llm_concurrency_slots.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE IF NOT EXISTS llm_concurrency_slots (
  slot_id     TEXT PRIMARY KEY,
  provider    TEXT NOT NULL
    CHECK (provider IN ('openai','anthropic','perplexity','gemini')),
  acquired_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMP NOT NULL,
  run_id      VARCHAR
);

CREATE INDEX IF NOT EXISTS llm_concurrency_slots_provider_expires_idx
  ON llm_concurrency_slots (provider, expires_at);
```

- [ ] **Step 2: Run and verify**

Run `npm run dev`, then `SELECT to_regclass('public.llm_concurrency_slots');` — expected non-null.

---

## Task 6 — Migration 0067: create `system_state`

**Why:** Generic key/value JSON store for the cron dead-man's switch (`cron_last_fired_at`) and any future system-level flags. One row per key, json value.

**Files:**
- Create: `migrations/0067_system_state.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE IF NOT EXISTS system_state (
  key        TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Run and verify**

Run `npm run dev`, then `SELECT to_regclass('public.system_state');` — expected non-null.

---

## Task 7 — Mirror migrations in `shared/schema.ts` (Drizzle definitions)

**Why:** Drizzle is the type contract used by every server route. Forgetting to mirror migrations means runtime errors when Drizzle generates the wrong SELECT/INSERT shape.

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: Extend `brandFactScrapeRuns` with the two new columns**

Find the existing `brandFactScrapeRuns` table definition (around line 530) and add the columns inside the column object, after `progress: jsonb("progress"),`:

```ts
    diagnostics: jsonb("diagnostics"),
    retryCount: integer("retry_count").notNull().default(0),
```

(Use `integer` for `retry_count`. Drizzle has no `smallint` helper that integrates with the inference chain — `integer` works because the column is `SMALLINT` in PG but Drizzle reads it as `number`.)

- [ ] **Step 2: Extend `brandFactSheet` with the two new columns**

Find `brandFactSheet` (around line 1327) and add inside the column object:

```ts
    disagreementCount: integer("disagreement_count").notNull().default(0),
    schemaVersion: integer("schema_version").notNull().default(1),
```

- [ ] **Step 3: Add the four new tables at the end of the file (before the last group of `insert*Schema` exports if any, otherwise at the end)**

Append:

```ts
// ── Plan 1 (v2): caching layer for search-grounded LLM ─────────────────
export const factScrapeCache = pgTable(
  "fact_scrape_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    source: text("source").notNull(),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    valueJson: jsonb("value_json").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    index("fact_scrape_cache_brand_id_idx").on(table.brandId),
    index("fact_scrape_cache_expires_at_idx").on(table.expiresAt),
  ],
);
export type FactScrapeCache = typeof factScrapeCache.$inferSelect;
export type InsertFactScrapeCache = typeof factScrapeCache.$inferInsert;

// ── Plan 1 (v2): observability log per (run, source) ───────────────────
export const factScrapeLogs = pgTable(
  "fact_scrape_logs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: varchar("run_id")
      .notNull()
      .references(() => brandFactScrapeRuns.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    status: text("status").notNull(),
    factCount: integer("fact_count").notNull().default(0),
    latencyMs: integer("latency_ms"),
    providerLatencyMs: integer("provider_latency_ms"),
    errorKind: text("error_kind"),
    diagnostics: jsonb("diagnostics"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("fact_scrape_logs_run_id_idx").on(table.runId),
    index("fact_scrape_logs_created_at_idx").on(table.createdAt),
  ],
);
export type FactScrapeLog = typeof factScrapeLogs.$inferSelect;
export type InsertFactScrapeLog = typeof factScrapeLogs.$inferInsert;

// ── Plan 1 (v2): Postgres token bucket for LLM concurrency ─────────────
export const llmConcurrencySlots = pgTable(
  "llm_concurrency_slots",
  {
    slotId: text("slot_id").primaryKey(),
    provider: text("provider").notNull(),
    acquiredAt: timestamp("acquired_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    runId: varchar("run_id"),
  },
  (table) => [
    index("llm_concurrency_slots_provider_expires_idx").on(
      table.provider,
      table.expiresAt,
    ),
  ],
);
export type LlmConcurrencySlot = typeof llmConcurrencySlots.$inferSelect;

// ── Plan 1 (v2): generic JSON config store ─────────────────────────────
export const systemState = pgTable("system_state", {
  key: text("key").primaryKey(),
  valueJson: jsonb("value_json").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type SystemState = typeof systemState.$inferSelect;
```

- [ ] **Step 4: Type-check the project**

Run: `npm run check`. Expected: `tsc` exits clean. Any error here means an import/typo to fix before moving on.

---

## Task 8 — Canonical fact schema `shared/factAgent/schema.ts`

**Why:** One Zod schema, one version constant, imported everywhere. Eliminates the "every endpoint has its own slightly-different schema" drift the v1 design suffered from. Drives both the cache key and the `schema_version` column on `brand_fact_sheet`.

**Files:**
- Create: `shared/factAgent/schema.ts`
- Test: `tests/unit/factAgentSchema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/factAgentSchema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  FactSchema,
  FactsResponseSchema,
  DOMAINS,
} from "../../shared/factAgent/schema";

describe("factAgent canonical schema", () => {
  it("exposes CURRENT_SCHEMA_VERSION as a positive integer", () => {
    expect(Number.isInteger(CURRENT_SCHEMA_VERSION)).toBe(true);
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("lists the 8 canonical domains", () => {
    expect(DOMAINS).toEqual([
      "identity",
      "offerings",
      "positioning",
      "team",
      "operations",
      "credentials",
      "growth",
      "contact",
    ]);
  });

  it("accepts a well-formed fact", () => {
    const ok = FactSchema.safeParse({
      domain: "identity",
      subcategory: "description",
      factKey: "tagline",
      factValue: "We build AI tools.",
      valueType: "string",
      valuePayload: null,
      confidence: 0.9,
      sourceExcerpt: "We build AI tools for everyone.",
      sourceUrl: "https://example.com",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects an out-of-range confidence", () => {
    const bad = FactSchema.safeParse({
      domain: "identity",
      subcategory: "x",
      factKey: "y",
      factValue: "z",
      valueType: "string",
      confidence: 1.5,
      sourceExcerpt: "",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects an unknown domain", () => {
    const bad = FactSchema.safeParse({
      domain: "marketing",
      subcategory: "x",
      factKey: "y",
      factValue: "z",
      valueType: "string",
      confidence: 0.5,
      sourceExcerpt: "",
    });
    expect(bad.success).toBe(false);
  });

  it("FactsResponseSchema requires a facts array", () => {
    expect(FactsResponseSchema.safeParse({ facts: [] }).success).toBe(true);
    expect(FactsResponseSchema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/factAgentSchema.test.ts`. Expected: FAIL — cannot find module `../../shared/factAgent/schema`.

- [ ] **Step 3: Implement the schema**

Create `shared/factAgent/schema.ts`:

```ts
// Single canonical Zod schema for v2 fact extraction.
// Bump CURRENT_SCHEMA_VERSION when the shape changes meaningfully (added or
// renamed fields, changed types). The bump:
//   - busts the search-LLM cache (`...:v<N>`)
//   - tags new brand_fact_sheet rows with the new version
//   - surfaces a "needs review" badge in the UI for rows still on the old version
import { z } from "zod";

export const CURRENT_SCHEMA_VERSION = 1 as const;

export const DOMAINS = [
  "identity",
  "offerings",
  "positioning",
  "team",
  "operations",
  "credentials",
  "growth",
  "contact",
] as const;
export type Domain = (typeof DOMAINS)[number];

export const VALUE_TYPES = ["string", "number", "array"] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export const FactSchema = z.object({
  domain: z.enum(DOMAINS),
  subcategory: z.string().min(1).max(64),
  factKey: z.string().min(1).max(64),
  factValue: z.string().min(1).max(2000),
  valueType: z.enum(VALUE_TYPES),
  valuePayload: z.record(z.unknown()).nullable().optional(),
  confidence: z.number().min(0).max(1),
  sourceExcerpt: z.string().max(200).default(""),
  sourceUrl: z.string().url().optional(),
});
export type Fact = z.infer<typeof FactSchema>;

export const FactsResponseSchema = z.object({
  facts: z.array(FactSchema).default([]),
});
export type FactsResponse = z.infer<typeof FactsResponseSchema>;
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/factAgentSchema.test.ts`. Expected: 5 passed.

- [ ] **Step 5: Type-check**

Run: `npm run check`. Expected: clean.

---

## Task 9 — Postgres token bucket `server/lib/llmConcurrency.ts`

**Why:** Cap the number of in-flight LLM calls per provider so a traffic spike doesn't burn through OpenAI/Perplexity RPM. Atomic acquire (single SQL statement, no race), expiration-bounded release (crash-safe).

**Files:**
- Create: `server/lib/llmConcurrency.ts`
- Test: `tests/integration/llmConcurrency.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/llmConcurrency.test.ts`:

```ts
// Integration test: hits a real Postgres via the existing pool.
// Requires DATABASE_URL pointing at a dev/test DB (the repo's existing setup).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import {
  acquireSlot,
  releaseSlot,
  withSlot,
  PROVIDER_LIMITS,
} from "../../server/lib/llmConcurrency";

async function clearSlots() {
  await db.execute(sql`DELETE FROM llm_concurrency_slots`);
}

describe("llmConcurrency token bucket", () => {
  beforeEach(clearSlots);
  afterEach(clearSlots);

  it("acquires a slot when bucket is empty", async () => {
    const slot = await acquireSlot("openai");
    expect(slot).not.toBeNull();
    expect(typeof slot?.slotId).toBe("string");
  });

  it("returns null when bucket is full", async () => {
    // Fill the bucket manually by inserting `PROVIDER_LIMITS.openai` rows.
    const limit = PROVIDER_LIMITS.openai;
    for (let i = 0; i < limit; i++) {
      await acquireSlot("openai");
    }
    // One more should fail (no retries — we test the inner primitive here).
    const slot = await acquireSlot("openai", { maxRetries: 0 });
    expect(slot).toBeNull();
  });

  it("releaseSlot frees the bucket", async () => {
    const limit = PROVIDER_LIMITS.openai;
    const slots: string[] = [];
    for (let i = 0; i < limit; i++) {
      const s = await acquireSlot("openai");
      if (s) slots.push(s.slotId);
    }
    expect((await acquireSlot("openai", { maxRetries: 0 }))).toBeNull();
    await releaseSlot(slots[0]);
    const reacquired = await acquireSlot("openai", { maxRetries: 0 });
    expect(reacquired).not.toBeNull();
  });

  it("expired slots don't block new acquisitions", async () => {
    // Insert an expired row directly, simulating a crashed function.
    await db.execute(sql`
      INSERT INTO llm_concurrency_slots (slot_id, provider, acquired_at, expires_at)
      VALUES ('expired-1', 'openai', now() - interval '5 minutes', now() - interval '1 minute')
    `);
    // Bucket sees 0 active slots → acquire succeeds.
    const slot = await acquireSlot("openai", { maxRetries: 0 });
    expect(slot).not.toBeNull();
  });

  it("withSlot acquires, runs, and releases", async () => {
    let ran = false;
    const result = await withSlot("openai", "run-abc", async () => {
      ran = true;
      // Mid-call, bucket should have one fewer free slot than the limit.
      const used = await db.execute(
        sql`SELECT count(*)::int AS n FROM llm_concurrency_slots WHERE provider='openai' AND expires_at > now()`,
      );
      const row = (used as unknown as { rows: Array<{ n: number }> }).rows[0];
      expect(row.n).toBe(1);
      return "ok";
    });
    expect(ran).toBe(true);
    expect(result).toBe("ok");
    // After withSlot returns, the slot is released.
    const after = await db.execute(
      sql`SELECT count(*)::int AS n FROM llm_concurrency_slots WHERE provider='openai' AND expires_at > now()`,
    );
    const row = (after as unknown as { rows: Array<{ n: number }> }).rows[0];
    expect(row.n).toBe(0);
  });

  it("withSlot releases even if the callback throws", async () => {
    await expect(
      withSlot("openai", "run-err", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const after = await db.execute(
      sql`SELECT count(*)::int AS n FROM llm_concurrency_slots WHERE provider='openai' AND expires_at > now()`,
    );
    const row = (after as unknown as { rows: Array<{ n: number }> }).rows[0];
    expect(row.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/integration/llmConcurrency.test.ts`. Expected: FAIL — module not found.

- [ ] **Step 3: Implement the library**

Create `server/lib/llmConcurrency.ts`:

```ts
// Postgres-backed token bucket for capping concurrent LLM calls per provider.
//
// Why Postgres and not Redis? We already have Supabase. Adding Redis would
// mean another service, another env var, another runtime failure mode. The
// throughput cost (~10ms per acquire vs <1ms for Redis) is acceptable for
// LLM calls that take seconds anyway.
//
// Crash safety: every slot row has `expires_at = now() + 60s` set at insert
// time. A function that dies mid-call doesn't leak its slot — the next
// acquire sees the row as expired and won't count it. Daily-orchestrator
// also sweeps expired rows for housekeeping.
import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "./logger";

export type LlmProvider = "openai" | "anthropic" | "perplexity" | "gemini";

export const PROVIDER_LIMITS: Record<LlmProvider, number> = {
  openai: 20,
  anthropic: 20,
  perplexity: 10,
  gemini: 30,
};

const SLOT_TTL_MS = 60_000;
const RETRY_SLEEP_MS = 2_000;
const DEFAULT_MAX_RETRIES = 5;

export interface AcquireOptions {
  maxRetries?: number;
  runId?: string;
}

interface PgQueryResult<T> {
  rows: T[];
}

export interface AcquiredSlot {
  slotId: string;
  provider: LlmProvider;
}

/**
 * Atomically try to acquire a slot. Returns null if the bucket is full
 * after retries exhaust. Caller MUST call releaseSlot when done.
 */
export async function acquireSlot(
  provider: LlmProvider,
  opts: AcquireOptions = {},
): Promise<AcquiredSlot | null> {
  const limit = PROVIDER_LIMITS[provider];
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const runId = opts.runId ?? null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await db.execute(sql`
      WITH inserted AS (
        INSERT INTO llm_concurrency_slots (slot_id, provider, expires_at, run_id)
        SELECT
          gen_random_uuid()::text,
          ${provider}::text,
          now() + (${SLOT_TTL_MS} || ' milliseconds')::interval,
          ${runId}::varchar
        WHERE (
          SELECT count(*) FROM llm_concurrency_slots
          WHERE provider = ${provider}::text AND expires_at > now()
        ) < ${limit}
        RETURNING slot_id
      )
      SELECT slot_id FROM inserted;
    `);

    const rows = (result as unknown as PgQueryResult<{ slot_id: string }>).rows;
    if (rows[0]?.slot_id) {
      return { slotId: rows[0].slot_id, provider };
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, RETRY_SLEEP_MS));
    }
  }

  logger.warn({ provider, limit, maxRetries }, "llmConcurrency: bucket full");
  return null;
}

export async function releaseSlot(slotId: string): Promise<void> {
  try {
    await db.execute(sql`
      DELETE FROM llm_concurrency_slots WHERE slot_id = ${slotId}
    `);
  } catch (err) {
    // Release must never throw — it's always in a finally. Just log.
    logger.warn({ err, slotId }, "llmConcurrency: release failed");
  }
}

/**
 * Convenience wrapper: acquire → run → release (in finally so a throwing
 * callback still frees its slot). Throws if the bucket is full after retries.
 */
export async function withSlot<T>(
  provider: LlmProvider,
  runId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const slot = await acquireSlot(provider, { runId });
  if (!slot) {
    const err = new Error(`llmConcurrency: bucket full for ${provider}`);
    (err as Error & { code?: string }).code = "LLM_CONCURRENCY_FULL";
    throw err;
  }
  try {
    return await fn();
  } finally {
    await releaseSlot(slot.slotId);
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/integration/llmConcurrency.test.ts`. Expected: 6 passed.

If any test fails: read the assertion message, fix the implementation. The most common failure is the row-shape access — `(result as unknown as PgQueryResult<...>).rows[0]` — because Drizzle's `db.execute()` returns `node-postgres`'s `QueryResult`, not a bare array. Verified pattern already used in `server/databaseStorage.ts` (e.g. content job claim around line 1031).

- [ ] **Step 5: Type-check**

Run: `npm run check`. Expected: clean.

---

## Task 10 — Storage methods for the new tables

**Why:** The rest of the v2 plans need typed accessors. Putting raw `db.execute(sql\`...\`)` calls in every route is the path to the same shape-mismatch bug we just fixed in `tryAcquireScrapeLock`. Centralize in `storage`.

**Files:**
- Modify: `server/storage.ts` (interface)
- Modify: `server/databaseStorage.ts` (implementation)
- Test: `tests/unit/factScrapeCacheStorage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/factScrapeCacheStorage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "../../server/storage";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";

async function clear() {
  await db.execute(sql`DELETE FROM fact_scrape_cache`);
}

describe("storage.factScrapeCache", () => {
  beforeEach(clear);

  it("upserts and reads a cache entry by key", async () => {
    // First ensure a brand exists, or use an existing one. Skip if no brand
    // available (storage tests need DB seed; minimal: insert a brand directly).
    const brandRow = await db.execute(sql`
      SELECT id FROM brands LIMIT 1
    `);
    const brand = (brandRow as unknown as { rows: Array<{ id: string }> }).rows[0];
    if (!brand) {
      return; // No brands in test DB — skip rather than fail.
    }

    await storage.upsertFactScrapeCache({
      cacheKey: "search-llm:test:abc:v1",
      source: "search_llm",
      brandId: brand.id,
      valueJson: { facts: [{ k: "v" }] },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const got = await storage.getFactScrapeCache("search-llm:test:abc:v1");
    expect(got?.valueJson).toEqual({ facts: [{ k: "v" }] });

    // Expired entries shouldn't be returned.
    await db.execute(sql`
      UPDATE fact_scrape_cache SET expires_at = now() - interval '1 minute'
      WHERE cache_key = 'search-llm:test:abc:v1'
    `);
    expect(await storage.getFactScrapeCache("search-llm:test:abc:v1")).toBeNull();
  });

  it("setSystemState writes and getSystemState reads JSON", async () => {
    await storage.setSystemState("test_key", { hello: "world" });
    expect(await storage.getSystemState("test_key")).toEqual({ hello: "world" });
    await db.execute(sql`DELETE FROM system_state WHERE key = 'test_key'`);
  });

  it("insertFactScrapeLog writes a log row", async () => {
    const runRow = await db.execute(sql`
      SELECT id FROM brand_fact_scrape_runs LIMIT 1
    `);
    const run = (runRow as unknown as { rows: Array<{ id: string }> }).rows[0];
    if (!run) return;

    await storage.insertFactScrapeLog({
      runId: run.id,
      source: "static_pages",
      status: "done",
      factCount: 3,
      latencyMs: 1234,
    });
    const rows = await db.execute(sql`
      SELECT count(*)::int AS n FROM fact_scrape_logs WHERE run_id = ${run.id} AND source='static_pages'
    `);
    const n = (rows as unknown as { rows: Array<{ n: number }> }).rows[0].n;
    expect(n).toBeGreaterThanOrEqual(1);
    await db.execute(sql`DELETE FROM fact_scrape_logs WHERE run_id = ${run.id} AND source='static_pages'`);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/factScrapeCacheStorage.test.ts`. Expected: FAIL — `storage.upsertFactScrapeCache is not a function` (or similar).

- [ ] **Step 3: Extend the storage interface**

Open `server/storage.ts`. Find the `IStorage` interface (search for `export interface IStorage`). Add the new methods at a sensible place near other v2 entries:

```ts
  // ── Plan 1 (v2): cache + observability + concurrency + system state ──
  getFactScrapeCache(cacheKey: string): Promise<{ cacheKey: string; valueJson: unknown; expiresAt: Date } | null>;
  upsertFactScrapeCache(row: {
    cacheKey: string;
    source: "search_llm";
    brandId: string;
    valueJson: unknown;
    expiresAt: Date;
  }): Promise<void>;
  deleteExpiredFactScrapeCache(): Promise<number>;

  insertFactScrapeLog(row: {
    runId: string;
    source: "static_pages" | "search_llm" | "user_enrich" | "aggregate" | "paste";
    status: "done" | "failed" | "skipped";
    factCount?: number;
    latencyMs?: number;
    providerLatencyMs?: number;
    errorKind?: string;
    diagnostics?: unknown;
  }): Promise<void>;

  getSystemState(key: string): Promise<unknown | null>;
  setSystemState(key: string, value: unknown): Promise<void>;
```

- [ ] **Step 4: Implement the methods in `databaseStorage.ts`**

Use Drizzle's typed `insert`/`select`/`onConflictDoUpdate` APIs — they parameterize JSONB safely without `sql.raw` escaping. Make sure `schema.factScrapeCache`, `schema.factScrapeLogs`, `schema.systemState` are in scope (the file already imports `* as schema from "@shared/schema"`).

Add to `server/databaseStorage.ts` (near the bottom, before the class closer):

```ts
  // ── Plan 1 (v2): fact_scrape_cache ──────────────────────────────────
  async getFactScrapeCache(cacheKey: string) {
    const rows = await db
      .select({
        cacheKey: schema.factScrapeCache.cacheKey,
        valueJson: schema.factScrapeCache.valueJson,
        expiresAt: schema.factScrapeCache.expiresAt,
      })
      .from(schema.factScrapeCache)
      .where(
        and(
          eq(schema.factScrapeCache.cacheKey, cacheKey),
          gt(schema.factScrapeCache.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertFactScrapeCache(row: {
    cacheKey: string;
    source: "search_llm";
    brandId: string;
    valueJson: unknown;
    expiresAt: Date;
  }): Promise<void> {
    await db
      .insert(schema.factScrapeCache)
      .values({
        cacheKey: row.cacheKey,
        source: row.source,
        brandId: row.brandId,
        valueJson: row.valueJson,
        expiresAt: row.expiresAt,
      })
      .onConflictDoUpdate({
        target: schema.factScrapeCache.cacheKey,
        set: {
          valueJson: row.valueJson,
          expiresAt: row.expiresAt,
          createdAt: new Date(),
        },
      });
  }

  async deleteExpiredFactScrapeCache(): Promise<number> {
    const result = await db
      .delete(schema.factScrapeCache)
      .where(lt(schema.factScrapeCache.expiresAt, new Date()));
    // node-postgres returns affected rowCount on the underlying QueryResult.
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  }

  // ── Plan 1 (v2): fact_scrape_logs ───────────────────────────────────
  async insertFactScrapeLog(row: {
    runId: string;
    source: "static_pages" | "search_llm" | "user_enrich" | "aggregate" | "paste";
    status: "done" | "failed" | "skipped";
    factCount?: number;
    latencyMs?: number;
    providerLatencyMs?: number;
    errorKind?: string;
    diagnostics?: unknown;
  }): Promise<void> {
    await db.insert(schema.factScrapeLogs).values({
      runId: row.runId,
      source: row.source,
      status: row.status,
      factCount: row.factCount ?? 0,
      latencyMs: row.latencyMs ?? null,
      providerLatencyMs: row.providerLatencyMs ?? null,
      errorKind: row.errorKind ?? null,
      diagnostics: (row.diagnostics ?? null) as never,
    });
  }

  // ── Plan 1 (v2): system_state ───────────────────────────────────────
  async getSystemState(key: string) {
    const rows = await db
      .select({ valueJson: schema.systemState.valueJson })
      .from(schema.systemState)
      .where(eq(schema.systemState.key, key))
      .limit(1);
    return rows[0]?.valueJson ?? null;
  }

  async setSystemState(key: string, value: unknown): Promise<void> {
    await db
      .insert(schema.systemState)
      .values({
        key,
        valueJson: value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.systemState.key,
        set: { valueJson: value, updatedAt: new Date() },
      });
  }
```

If `and`, `eq`, `gt`, `lt` aren't already imported at the top of `databaseStorage.ts`, add them to the existing `drizzle-orm` import line (most are already in use elsewhere in this file — just add any missing names).

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/unit/factScrapeCacheStorage.test.ts`. Expected: 3 passed.

- [ ] **Step 6: Type-check and run the full test suite**

Run: `npm run check && npx vitest run`. Expected: type-check clean, all existing tests still passing.

---

## Done. What Plan 1 produced

- Migrations `0062-0067` applied.
- `shared/schema.ts` mirrors all six DB changes with typed Drizzle definitions.
- `shared/factAgent/schema.ts` is the single source of truth for the fact schema + version constant.
- `server/lib/llmConcurrency.ts` provides `acquireSlot` / `releaseSlot` / `withSlot` for any future endpoint that calls an LLM provider.
- `storage` interface gains typed accessors for cache, logs, and system_state.

No endpoints, no UI, no behavior change to the existing pipeline. Subsequent plans (Plan 2: static-pages source; Plan 3: search-LLM + user-enrich; etc.) build on this foundation.
