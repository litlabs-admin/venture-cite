# Fact Sheet v2 — Plan 6: Observability, Lifecycle, V1 Cutover

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) syntax.

> **Commits:** No `git commit` / `add` / `reset`. `git stash push/pop` allowed for diagnostics if `git stash list` empty after.

> **Final plan in the v2 series.** After Plan 6, the new pipeline is the only pipeline.

**Goal:** Add the operational layer — lifecycle deletion sweeps (so the DB doesn't bloat), weekly observability summary (so we know when things break in production), and v1 cutover (delete the old `advanceScrapeRun` / `planner` / `executor` / `industryPrompts` / `factExtractor` code paths now that v2 has full coverage). Verify the suite stays green throughout.

**Architecture:** Five new storage methods for the deletion sweeps + one weekly-summary computation + four cutover tasks. No new endpoints, no new modules, no LLM calls. Everything runs inside the existing `daily-orchestrator` cron.

**Tech Stack:** Drizzle ORM, raw SQL via `db.execute(sql\`...\`)` for batched deletes, Vitest. No new runtime deps.

**Spec reference:** [docs/superpowers/specs/2026-05-13-brand-fact-sheet-v2-design.md](../specs/2026-05-13-brand-fact-sheet-v2-design.md) §12 (Observability), §13 (Data lifecycle), §15 (Migration).

---

## Task 1 — Storage methods for lifecycle deletion sweeps

**Why:** Daily-orchestrator needs typed accessors to delete expired rows from 5 tables. Each is a simple `DELETE WHERE created_at < now() - interval '...'` or `WHERE expires_at < now()`, but we centralize so the orchestrator stays small.

**Files:**
- Modify: `server/storage.ts` (interface)
- Modify: `server/databaseStorage.ts` (5 implementations)
- Test: `tests/unit/v2LifecycleStorage.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/v2LifecycleStorage.test.ts`:

```ts
// Integration test against real DB. Each method is a DELETE that returns
// the number of affected rows.
import "dotenv/config";
import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "../../server/storage";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";

async function nukeCache() {
  await db.execute(sql`DELETE FROM fact_scrape_cache WHERE cache_key LIKE 'lifecycle-test:%'`);
}

async function nukeSlots() {
  await db.execute(sql`DELETE FROM llm_concurrency_slots WHERE slot_id LIKE 'lifecycle-test-%'`);
}

describe("storage lifecycle sweeps", () => {
  beforeEach(async () => {
    await nukeCache();
    await nukeSlots();
  });

  it("deleteExpiredFactScrapeCache deletes expired rows and returns count", async () => {
    // Need a brand to satisfy the FK; reuse any existing one.
    const brandRow = await db.execute(sql`SELECT id FROM brands LIMIT 1`);
    const brand = (brandRow as unknown as { rows: Array<{ id: string }> }).rows[0];
    if (!brand) return; // skip if no brand in test DB

    // Seed: 2 expired + 1 valid
    await db.execute(sql`
      INSERT INTO fact_scrape_cache (cache_key, source, brand_id, value_json, expires_at)
      VALUES
        ('lifecycle-test:exp1', 'search_llm', ${brand.id}, '{}'::jsonb, now() - interval '1 hour'),
        ('lifecycle-test:exp2', 'search_llm', ${brand.id}, '{}'::jsonb, now() - interval '5 minutes'),
        ('lifecycle-test:valid', 'search_llm', ${brand.id}, '{}'::jsonb, now() + interval '1 hour')
    `);

    const deleted = await storage.deleteExpiredFactScrapeCache();
    expect(deleted).toBeGreaterThanOrEqual(2);

    // Valid row should still exist
    const survivor = await db.execute(sql`
      SELECT cache_key FROM fact_scrape_cache WHERE cache_key = 'lifecycle-test:valid'
    `);
    expect((survivor as unknown as { rows: Array<unknown> }).rows.length).toBe(1);

    await nukeCache();
  });

  it("deleteExpiredLlmConcurrencySlots deletes expired slots", async () => {
    await db.execute(sql`
      INSERT INTO llm_concurrency_slots (slot_id, provider, expires_at)
      VALUES
        ('lifecycle-test-exp1', 'openai', now() - interval '1 minute'),
        ('lifecycle-test-valid', 'openai', now() + interval '1 minute')
    `);
    const deleted = await storage.deleteExpiredLlmConcurrencySlots();
    expect(deleted).toBeGreaterThanOrEqual(1);
    const survivor = await db.execute(sql`
      SELECT slot_id FROM llm_concurrency_slots WHERE slot_id = 'lifecycle-test-valid'
    `);
    expect((survivor as unknown as { rows: Array<unknown> }).rows.length).toBe(1);
    await nukeSlots();
  });

  it("deleteOldFactScrapePages, deleteOldFactScrapeRuns, deleteOldFactScrapeLogs are callable and return a count", async () => {
    // These would need real runs to test concretely. Just confirm they
    // don't throw and return a non-negative number.
    expect(typeof (await storage.deleteOldFactScrapePages(7))).toBe("number");
    expect(typeof (await storage.deleteOldFactScrapeRuns(30))).toBe("number");
    expect(typeof (await storage.deleteOldFactScrapeLogs(90))).toBe("number");
  });
});
```

- [ ] **Step 2: Confirm failure**

`npx vitest run tests/unit/v2LifecycleStorage.test.ts` → FAIL (methods don't exist).

- [ ] **Step 3: Extend IStorage in `server/storage.ts`**

Add to the interface near other v2 storage methods:

```ts
  // Plan 6: lifecycle deletion sweeps (called by daily-orchestrator)
  deleteOldFactScrapePages(olderThanDays: number): Promise<number>;
  deleteOldFactScrapeRuns(olderThanDays: number): Promise<number>;
  deleteOldFactScrapeLogs(olderThanDays: number): Promise<number>;
  deleteExpiredLlmConcurrencySlots(): Promise<number>;
  // deleteExpiredFactScrapeCache already exists from Plan 1 — confirm.
```

(`deleteExpiredFactScrapeCache` was added in Plan 1 Task 10 — verify with Grep before duplicating.)

- [ ] **Step 4: Implement in `server/databaseStorage.ts`**

Group with other v2 methods near the bottom. Each method uses raw `sql` via `db.execute()` for the DELETE so we can pass the interval cleanly:

```ts
  // ── Plan 6: lifecycle sweeps ─────────────────────────────────────────
  async deleteOldFactScrapePages(olderThanDays: number): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM brand_fact_scrape_pages
      WHERE run_id IN (
        SELECT id FROM brand_fact_scrape_runs
        WHERE started_at < now() - (${olderThanDays} || ' days')::interval
      )
    `);
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  }

  async deleteOldFactScrapeRuns(olderThanDays: number): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM brand_fact_scrape_runs
      WHERE started_at < now() - (${olderThanDays} || ' days')::interval
    `);
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  }

  async deleteOldFactScrapeLogs(olderThanDays: number): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM fact_scrape_logs
      WHERE created_at < now() - (${olderThanDays} || ' days')::interval
    `);
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  }

  async deleteExpiredLlmConcurrencySlots(): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM llm_concurrency_slots WHERE expires_at < now()
    `);
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  }
```

Run order matters: pages before runs (FK CASCADE handles it but explicit-first is faster on large tables). Logs are independent.

- [ ] **Step 5: Run test**

`npx vitest run tests/unit/v2LifecycleStorage.test.ts` → 3 passed (assuming a brand exists in the test DB).

- [ ] **Step 6: Type-check**

`npm run check` → clean.

---

## Task 2 — Wire deletion sweeps into daily-orchestrator

**Why:** The cleanup runs nightly. One handler in `server/routes/cron.ts` (`daily-orchestrator`) already invokes many step functions; we add five small calls.

**Files:**
- Modify: `server/routes/cron.ts`

- [ ] **Step 1: Read the existing cron.ts**

`Read: server/routes/cron.ts` (full file or first 300 lines). Find the orchestrator loop that calls steps via `orch.run(...)`. Note the `STEP_CAPS_MS` map shape.

- [ ] **Step 2: Add a single cleanup step**

Add to imports (top of file):
```ts
import { storage } from "../storage";
```
(may already be imported — Grep first)

Add to `STEP_CAPS_MS`:
```ts
"v2-lifecycle-cleanup": 30_000,
```

Add this step inside the orchestrator function (after the `fact-scrape-backstop` step Plan 4 added):

```ts
await orch.run("v2-lifecycle-cleanup", async () => {
  const pages = await storage.deleteOldFactScrapePages(7);
  const runs = await storage.deleteOldFactScrapeRuns(30);
  const logs = await storage.deleteOldFactScrapeLogs(90);
  const cache = await storage.deleteExpiredFactScrapeCache();
  const slots = await storage.deleteExpiredLlmConcurrencySlots();
  logger.info(
    { pages, runs, logs, cache, slots },
    "v2-lifecycle-cleanup: deleted rows",
  );
});
```

- [ ] **Step 3: Type-check**

`npm run check` → clean.

- [ ] **Step 4: Verify existing cron tests still pass**

```
npx vitest run tests/unit/cronOrchestrator.test.ts
```

If the cron test mocks specific step functions and asserts an exact step count or order, you may need to add `v2-lifecycle-cleanup` to its mocked list. Read the test and adapt the mock.

---

## Task 3 — Weekly observability summary

**Why:** §12. Once a week, emit a structured log summarizing the past 7 days: success rate per source, top error kinds, average latency per source, brands consistently hitting `all_sources_empty`. The log goes to Pino (which Sentry picks up); operators query it to spot regressions.

**Files:**
- Create: `server/lib/factAgent/v2/weeklySummary.ts`
- Test: `tests/unit/v2WeeklySummary.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/v2WeeklySummary.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

const dbExecuteMock = vi.fn();
vi.mock("../../server/db", () => ({ db: { execute: dbExecuteMock } }));

const loggerMock = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock("../../server/lib/logger", () => ({ logger: loggerMock }));

import { runWeeklySummary } from "../../server/lib/factAgent/v2/weeklySummary";

describe("runWeeklySummary", () => {
  it("queries fact_scrape_logs and emits a single info log with the summary", async () => {
    // Mock the SQL query result.
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        { source: "static_pages", total_runs: 10, done_runs: 7, failed_runs: 2, skipped_runs: 1, total_facts: 35, avg_latency_ms: 1200 },
        { source: "search_llm", total_runs: 10, done_runs: 8, failed_runs: 2, skipped_runs: 0, total_facts: 22, avg_latency_ms: 4500 },
        { source: "user_enrich", total_runs: 10, done_runs: 10, failed_runs: 0, skipped_runs: 0, total_facts: 40, avg_latency_ms: 800 },
      ],
    });
    // Top error kinds query
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        { error_kind: "llm_unavailable", count: 3 },
        { error_kind: "fetch_failed", count: 1 },
      ],
    });
    // Empty-fact brands query
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        { brand_id: "brand-a", empty_run_count: 4 },
      ],
    });

    const result = await runWeeklySummary();

    expect(result.sources.length).toBe(3);
    expect(result.topErrorKinds).toHaveLength(2);
    expect(result.consistentlyEmptyBrands).toHaveLength(1);
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "fact_scrape_v2_weekly_summary" }),
      expect.any(String),
    );
  });

  it("handles an empty week without error", async () => {
    dbExecuteMock.mockResolvedValue({ rows: [] });
    const result = await runWeeklySummary();
    expect(result.sources).toEqual([]);
    expect(result.topErrorKinds).toEqual([]);
    expect(result.consistentlyEmptyBrands).toEqual([]);
  });
});
```

- [ ] **Step 2: Confirm failure**

`npx vitest run tests/unit/v2WeeklySummary.test.ts` → FAIL.

- [ ] **Step 3: Implement `server/lib/factAgent/v2/weeklySummary.ts`**

```ts
// Weekly observability summary. Reads fact_scrape_logs for the past 7 days
// and emits a single info log capturing health metrics. Operators query
// the log stream (or Sentry breadcrumbs) for the `fact_scrape_v2_weekly_summary`
// event to see weekly health at a glance.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { logger } from "../../logger";

export interface SourceStats {
  source: string;
  totalRuns: number;
  doneRuns: number;
  failedRuns: number;
  skippedRuns: number;
  totalFacts: number;
  avgLatencyMs: number;
  successRate: number;
}

export interface WeeklySummaryResult {
  sources: SourceStats[];
  topErrorKinds: Array<{ errorKind: string; count: number }>;
  consistentlyEmptyBrands: Array<{ brandId: string; emptyRunCount: number }>;
}

interface PgResult<T> {
  rows: T[];
}

export async function runWeeklySummary(): Promise<WeeklySummaryResult> {
  // 1. Per-source aggregates
  const perSourceRows = await db.execute(sql`
    SELECT
      source,
      count(*)::int AS total_runs,
      count(*) FILTER (WHERE status = 'done')::int AS done_runs,
      count(*) FILTER (WHERE status = 'failed')::int AS failed_runs,
      count(*) FILTER (WHERE status = 'skipped')::int AS skipped_runs,
      coalesce(sum(fact_count), 0)::int AS total_facts,
      coalesce(avg(latency_ms), 0)::int AS avg_latency_ms
    FROM fact_scrape_logs
    WHERE created_at >= now() - interval '7 days'
      AND source IN ('static_pages','search_llm','user_enrich','aggregate','paste')
    GROUP BY source
    ORDER BY source
  `);
  const sources: SourceStats[] = (
    perSourceRows as unknown as PgResult<{
      source: string;
      total_runs: number;
      done_runs: number;
      failed_runs: number;
      skipped_runs: number;
      total_facts: number;
      avg_latency_ms: number;
    }>
  ).rows.map((r) => ({
    source: r.source,
    totalRuns: r.total_runs,
    doneRuns: r.done_runs,
    failedRuns: r.failed_runs,
    skippedRuns: r.skipped_runs,
    totalFacts: r.total_facts,
    avgLatencyMs: r.avg_latency_ms,
    successRate: r.total_runs > 0 ? r.done_runs / r.total_runs : 0,
  }));

  // 2. Top error kinds
  const errorRows = await db.execute(sql`
    SELECT error_kind, count(*)::int AS count
    FROM fact_scrape_logs
    WHERE created_at >= now() - interval '7 days'
      AND error_kind IS NOT NULL
    GROUP BY error_kind
    ORDER BY count DESC
    LIMIT 10
  `);
  const topErrorKinds = (
    errorRows as unknown as PgResult<{ error_kind: string; count: number }>
  ).rows.map((r) => ({ errorKind: r.error_kind, count: r.count }));

  // 3. Brands consistently hitting all_sources_empty (3+ empty runs in week)
  const emptyBrandRows = await db.execute(sql`
    SELECT r.brand_id, count(*)::int AS empty_run_count
    FROM brand_fact_scrape_runs r
    WHERE r.error_kind = 'all_sources_empty'
      AND r.completed_at >= now() - interval '7 days'
    GROUP BY r.brand_id
    HAVING count(*) >= 3
    ORDER BY count(*) DESC
    LIMIT 20
  `);
  const consistentlyEmptyBrands = (
    emptyBrandRows as unknown as PgResult<{ brand_id: string; empty_run_count: number }>
  ).rows.map((r) => ({ brandId: r.brand_id, emptyRunCount: r.empty_run_count }));

  const result: WeeklySummaryResult = { sources, topErrorKinds, consistentlyEmptyBrands };

  logger.info(
    {
      event: "fact_scrape_v2_weekly_summary",
      sources: result.sources,
      topErrorKinds: result.topErrorKinds,
      consistentlyEmptyBrands: result.consistentlyEmptyBrands,
      window: "7d",
    },
    "fact-scrape v2 weekly summary",
  );

  return result;
}
```

- [ ] **Step 4: Run test**

`npx vitest run tests/unit/v2WeeklySummary.test.ts` → 2 passed.

- [ ] **Step 5: Type-check**

`npm run check` → clean.

---

## Task 4 — Wire weekly summary into daily-orchestrator

**Why:** Run the summary once per week (Mondays). Daily-orchestrator runs every day; we gate on `getDay() === 1`.

**Files:**
- Modify: `server/routes/cron.ts`

- [ ] **Step 1: Add the conditional step**

Add to imports:
```ts
import { runWeeklySummary } from "../lib/factAgent/v2/weeklySummary";
```

Add to `STEP_CAPS_MS`:
```ts
"v2-weekly-summary": 20_000,
```

Inside the orchestrator function, after `v2-lifecycle-cleanup`:

```ts
// Weekly: run on Mondays only.
if (new Date().getUTCDay() === 1) {
  await orch.run("v2-weekly-summary", async () => {
    await runWeeklySummary();
  });
}
```

- [ ] **Step 2: Type-check + existing tests**

```
npm run check
npx vitest run tests/unit/cronOrchestrator.test.ts
```

Both clean.

---

## Task 5 — V1 cutover: delete the old pipeline files

> **GATE:** Before executing this task, confirm the following:
> 1. Plan 5 has been deployed to production for at least 1 week with no fact-scrape regressions reported.
> 2. Daily-orchestrator's `fact-scrape-backstop` step has logged successful completion at least 3 times.
> 3. No external code references `advanceScrapeRun`, `planScrape`, `executePage`, or `factExtractor` outside the files we plan to delete.
>
> If any of these is unverifiable, reply `BLOCKED — awaiting production verification` and stop. Do NOT execute Step 1 onward.

**Why:** The v2 pipeline is now the only path the UI uses (Plan 5). The v1 server-side modules are dead code. Delete them so future maintainers don't get confused about which path is current.

**Files to DELETE:**
- `server/lib/factAgent/advanceScrapeRun.ts`
- `server/lib/factAgent/planner.ts`
- `server/lib/factAgent/executor.ts`
- `server/lib/factAgent/industryPrompts/` (entire directory)
- `server/lib/factExtractor.ts` (legacy pre-v1 file, if still present)

**Files to KEEP (v2 depends on them):**
- `server/lib/factAgent/canonicalize.ts`
- `server/lib/factAgent/dedup.ts`
- `server/lib/factAgent/validators.ts`
- `server/lib/factAgent/secretRedactor.ts`
- `server/lib/factAgent/promptInjectionSanitizer.ts`
- `server/lib/factAgent/langDetect.ts`
- `server/lib/factAgent/robotsCache.ts`
- `server/lib/factAgent/persistFacts.ts` (v2's persistUserFacts/persistPasteFacts mirror this pattern; the original handles `source='scraped'`)
- `server/lib/factAgent/types.ts` (keep — older callers may still use the v1 `ExtractedFact` type via dedup.ts/etc.)

- [ ] **Step 1: Verify no dangling imports**

Run a Grep for each soon-to-be-deleted module:
```
Grep: 'advanceScrapeRun' (excluding the file itself and the routes/factSheet.ts caller — Task 6 removes that caller)
Grep: 'planScrape' / 'planner'
Grep: 'executePage' / 'executor'
Grep: 'industryPrompts'
Grep: 'factExtractor'
```

Expected callers: `server/routes/factSheet.ts` (handles via Task 6) and `server/scheduler.ts` (legacy `runFactScrapeDrainJob`). Note them as dependencies for Task 6.

- [ ] **Step 2: Delete the files**

Use the `Bash` tool (NOT the `Edit` tool) to delete:
```bash
rm server/lib/factAgent/advanceScrapeRun.ts
rm server/lib/factAgent/planner.ts
rm server/lib/factAgent/executor.ts
rm -rf server/lib/factAgent/industryPrompts/
rm -f server/lib/factExtractor.ts
```

Run them in sequence, NOT in parallel — the rm of `industryPrompts/` is recursive.

- [ ] **Step 3: Type-check (expect failures)**

`npm run check` → will fail with "Cannot find module" errors from anything that imports the deleted modules. The errors are the punch-list for Task 6.

---

## Task 6 — Update callers: remove v1 endpoint route + scheduler hooks

**Why:** Task 5's deletions broke imports. Fix the callers.

**Files:**
- Modify: `server/routes/factSheet.ts` (remove `POST /api/brand-fact-sheet/runs` handler that calls `advanceScrapeRun`)
- Modify: `server/scheduler.ts` (remove `runFactScrapeDrainJob` if it imports anything deleted)
- Modify: `server/routes/cron.ts` (remove the `drain-pending-fact-scrape-runs` step that called the deleted scheduler function)

- [ ] **Step 1: Remove the v1 `POST /runs` handler from `server/routes/factSheet.ts`**

Read the file. Find the `app.post("/api/brand-fact-sheet/runs", ...)` handler. Delete it along with the `import { advanceScrapeRun } from "../lib/factAgent/advanceScrapeRun";` line. Keep the rest of the routes (SSE handler, run-detail GET, diff, cancel, etc. — those are still v2-compatible).

If the file becomes empty after the delete (unlikely — it still has many handlers), no further action. If imports go unused after the delete, TypeScript will flag them; remove them.

- [ ] **Step 2: Remove `runFactScrapeDrainJob` from `server/scheduler.ts`**

Read `server/scheduler.ts`. Find `runFactScrapeDrainJob`. It's the v1 cron-drain that pulled pending runs and called `advanceScrapeRun`. The v2 equivalent is `runFactScrapeBackstop` (Plan 4). Delete `runFactScrapeDrainJob`. Update the exports at the top of the file.

- [ ] **Step 3: Remove `drain-pending-fact-scrape-runs` step from `server/routes/cron.ts`**

In `daily-orchestrator`, find the `orch.run("drain-pending-fact-scrape-runs", ...)` line and delete it. The v2 `fact-scrape-backstop` step already handles all cleanup; the drain is redundant.

Also remove the `STEP_CAPS_MS["drain-pending-fact-scrape-runs"]` entry if present.

Remove the import: `import { runFactScrapeDrainJob } from "../scheduler";` (if isolated; if it's part of a multi-import line, drop just that name).

- [ ] **Step 4: Type-check**

`npm run check` → clean.

- [ ] **Step 5: Update v1 tests (delete or rewrite)**

Run:
```
Grep: 'advanceScrapeRun' OR 'planScrape' OR 'executePage' in tests/
```

For each test file that imports a deleted module:
- If the test is testing v1 behavior we no longer support → DELETE the test file (`rm path`).
- If the test is testing a helper that still exists (canonicalize, dedup, etc.) → keep, just remove the v1-specific import.

Candidate v1-only tests to delete (verify before deleting):
- `tests/unit/factSheetPlanner.test.ts`
- `tests/unit/factSheetExecutor.test.ts`
- `tests/unit/factSheetAdvanceScrapeRun.test.ts`
- `tests/integration/factSheetHappyPath.test.ts`
- `tests/integration/factSheetFailure*.test.ts` (most of these test the v1 advance loop)
- `tests/integration/factSheetTimeout.test.ts`
- `tests/integration/factSheetLlmUnavailable.test.ts`
- `tests/integration/factSheetRetryOnce.test.ts`
- `tests/integration/factSheetAdvisoryLockParallel.test.ts`
- `tests/integration/factSheetCostCapReached.test.ts`
- `tests/integration/factSheetDedupHighestConfidence.test.ts`
- `tests/integration/factSheetDiffResolution.test.ts`

DO NOT DELETE (still valid for v2 or shared helpers):
- `tests/unit/factAgentSchema.test.ts`
- `tests/unit/factScrapeCacheStorage.test.ts`
- `tests/unit/factSheetCanonicalize.test.ts`
- `tests/unit/factSheetMigrationShape.test.ts`
- `tests/unit/factSheetSseStream.test.ts` (extended by Plan 5)
- `tests/unit/factSheetSsrfLockedIp.test.ts`
- Any `v2*.test.ts` / `v2*.test.tsx` (all of Plans 1-5)

Verify each candidate by Reading the file. If a test imports `advanceScrapeRun` or `planScrape` or `executePage`, delete it; otherwise keep.

- [ ] **Step 6: Run full suite**

```
npm run check
npx vitest run
```

Expected: clean type-check, all remaining tests pass. Pre-existing failures from earlier sessions (redditSource, sourceHealth) may still fail — those are out of scope.

---

## Task 7 — Final smoke test: full v2 pipeline against real DB

**Why:** Confidence check. One test that does plan → orchestrate → aggregate end-to-end, mocking only the LLM calls.

**Files:**
- Test: `tests/integration/v2EndToEndSmoke.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/v2EndToEndSmoke.test.ts`:

```ts
// Plan 6 smoke: full v2 pipeline end-to-end (plan → scrape-one × N →
// search-llm + user-enrich → aggregate). Mocks LLM at the failover layer
// + the OpenRouter client + the sitemap fetcher to inject known content.
import "dotenv/config";
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { sql } from "drizzle-orm";
import { db } from "../../server/db";

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, _res: unknown, next: () => void) => {
    req.user = { id: "smoke-user" };
    next();
  },
}));

vi.mock("../../server/lib/routesShared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/routesShared");
  return {
    ...real,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    openai: { chat: { completions: { create: vi.fn() } } },
  };
});

vi.mock("openai", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("openai");
  return {
    ...actual,
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    facts: [
                      { domain: "identity", subcategory: "description", factKey: "tagline", factValue: "End-to-end test brand.", valueType: "string", confidence: 1.0, sourceExcerpt: "" },
                    ],
                  }),
                },
              },
            ],
          }),
        },
      };
    },
  };
});

vi.mock("../../server/lib/ssrf", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/ssrf");
  return {
    ...real,
    safeFetchTextWithLockedIp: vi.fn().mockResolvedValue({
      status: 200,
      text: `<html><head>
        <title>E2E Brand</title>
        <meta name="description" content="E2E brand description." />
      </head><body>Some body content ${"filler ".repeat(40)}</body></html>`,
      contentType: "text/html",
      headers: {},
    }),
  };
});

vi.mock("../../server/lib/factAgent/v2/sitemapDiscovery", () => ({
  discoverSitemapUrls: vi.fn().mockResolvedValue([
    "https://example.com/about",
  ]),
}));

vi.mock("../../server/lib/factAgent/v2/openrouterClient", () => ({
  getOpenrouterClient: () => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  facts: [
                    { domain: "team", subcategory: "founders", factKey: "ceo", factValue: "Alice", valueType: "string", confidence: 0.9, sourceExcerpt: "", sourceUrl: "https://example.com" },
                  ],
                }),
              },
            },
          ],
        }),
      },
    },
  }),
}));

vi.mock("../../server/lib/factAgent/v2/llmFailover", () => ({
  callWithFailover: vi.fn().mockResolvedValue(
    JSON.stringify({
      facts: [
        { domain: "identity", subcategory: "description", factKey: "tagline", factValue: "E2E brand description.", valueType: "string", confidence: 0.95, sourceExcerpt: "" },
      ],
    }),
  ),
}));

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

const TEST_USER_ID = "smoke-user";
const TEST_BRAND_ID = "smoke-brand-e2e";

async function seed() {
  await db.execute(sql`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (${TEST_USER_ID}, 'smoke@test.local', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO brands (id, user_id, name, company_name, website, industry, created_at, updated_at)
    VALUES (${TEST_BRAND_ID}, ${TEST_USER_ID}, 'E2E Brand', 'E2E Brand', 'https://example.com', 'saas', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function cleanup() {
  await db.execute(sql`DELETE FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID}`);
  await db.execute(sql`DELETE FROM fact_scrape_cache WHERE brand_id = ${TEST_BRAND_ID}`);
  await db.execute(sql`DELETE FROM fact_scrape_logs WHERE run_id IN (SELECT id FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID})`);
  await db.execute(sql`DELETE FROM brand_fact_scrape_pages WHERE run_id IN (SELECT id FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID})`);
  await db.execute(sql`DELETE FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID}`);
}

describe("Plan 6 smoke: full v2 pipeline persists facts end-to-end", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  it("plan → scrape-one + search-llm + user-enrich → aggregate", async () => {
    const app = express();
    app.use(express.json());
    setupFactSheetV2Routes(app);

    // 1. Plan
    const planRes = await request(app)
      .post("/api/brand-fact-sheet/plan")
      .send({ brandId: TEST_BRAND_ID });
    expect(planRes.status).toBe(200);
    const { runId, pages } = planRes.body;
    expect(typeof runId).toBe("string");
    expect(pages.length).toBeGreaterThanOrEqual(1);

    // 2. Fire each source
    for (const page of pages) {
      const r = await request(app)
        .post("/api/brand-fact-sheet/scrape-one")
        .send({ runId, pageId: page.pageId });
      expect(r.status).toBe(200);
    }
    const searchRes = await request(app)
      .post("/api/brand-fact-sheet/search-llm")
      .send({ runId });
    expect(searchRes.status).toBe(200);

    const enrichRes = await request(app)
      .post("/api/brand-fact-sheet/user-enrich")
      .send({ runId });
    expect(enrichRes.status).toBe(200);

    // 3. Aggregate
    const aggRes = await request(app)
      .post("/api/brand-fact-sheet/aggregate")
      .send({ runId });
    expect(aggRes.status).toBe(200);
    expect(aggRes.body.status).toBe("completed");
    expect(aggRes.body.totalFacts).toBeGreaterThan(0);

    // 4. Verify facts persisted from at least one source
    const factRows = await db.execute(sql`
      SELECT fact_key, source FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID}
    `);
    const facts = (factRows as unknown as { rows: Array<{ fact_key: string; source: string }> }).rows;
    expect(facts.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run**

`npx vitest run tests/integration/v2EndToEndSmoke.test.ts` → 1 passed.

If it fails, the failure tells us which seam broke during the cutover. Fix and re-run.

- [ ] **Step 3: Type-check**

`npm run check` → clean.

---

## Task 8 — Final full-suite verification

**Why:** Confirm the cutover didn't break anything else.

- [ ] **Step 1: Run the full test suite**

```
npx vitest run
```

Compare to the baseline from earlier in the session (pre-Plan 6). Acceptable outcomes:
- All v2 tests pass
- All non-v2, non-deleted tests pass
- A small number of pre-existing failures (redditSource, sourceHealth from earlier sessions) — out of scope

Unacceptable:
- A test that previously passed now fails because of Plan 6's deletions → investigate, fix or revert

- [ ] **Step 2: Final type-check**

`npm run check` → clean.

- [ ] **Step 3: Verify no stray imports of deleted modules**

```
Grep: 'advanceScrapeRun' OR 'planScrape' OR 'executePage' OR 'industryPrompts' OR 'factExtractor' in server/ client/
```

Expected: zero matches outside `docs/` and any test files we haven't touched yet. Each match outside that is a bug — fix it.

---

## Done. What Plan 6 produced

- 5 new storage methods for lifecycle deletion
- `weeklySummary.ts` module + daily-orchestrator wiring
- v1 pipeline (`advanceScrapeRun`, `planner`, `executor`, `industryPrompts`, `factExtractor`) deleted
- v1 endpoint `POST /api/brand-fact-sheet/runs` removed
- v1 scheduler hook `runFactScrapeDrainJob` removed
- v1 tests deleted (a dozen files)
- End-to-end smoke test for the complete v2 pipeline

**Total v2 series:**
- Plan 1: schema + concurrency primitive
- Plan 2: `/scrape-one` (static-pages source)
- Plan 3: `/search-llm` + `/user-enrich`
- Plan 4: `/plan` + `/aggregate` + cron backstop
- Plan 5: UI orchestrator + paste flow + onboarding parity
- Plan 6: observability + lifecycle + v1 cutover

After Plan 6, the only fact-scrape code path is v2. The brand-fact-sheet works against modern SPAs (RSC + hydration extraction), Cloudflare-protected sites (search-LLM), and pure-JS pages (search-LLM); user-typed facts have first-class lifecycle; observability log emits weekly health.
