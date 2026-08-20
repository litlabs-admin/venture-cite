# Spec 2 — Plan 2.6: Integration Tests + Serial-Failure Alerting Cron + Structured Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the production-readiness gate for Spec 2. This plan adds (1) end-to-end integration tests across the fact-scrape pipeline that consume Plans 2.1–2.5 wiring, (2) the `detectFactScrapeFailureRate` cron from Spec 2 §4.11 with structured Pino logging + Sentry alert, (3) a structured `fact_scrape_run_completed` log line at run completion (single addition to `advanceScrapeRun.ts`, otherwise owned by Plan 2.2), and (4) a final spec-criteria spot-check that walks every checkbox in Spec 2 §9. No new agent logic, no new routes, no new UI — Plan 2.6 only adds tests + the failure-detector cron + one metrics log line.

**Architecture:** Integration tests live in `tests/integration/factSheet*.test.ts`, mounted on a bare Express app per the `tests/unit/geoSignalsAnalyzePersistence.test.ts` pattern. The agent pipeline (`advanceScrapeRun`) is exercised directly with mocked `safeFetchTextWithLockedIp` + mocked OpenAI. Storage is mocked using the `vi.hoisted` + Drizzle-chain Proxy idiom from `tests/unit/geoSignalRuns.test.ts`. The new `detectFactScrapeFailureRate` cron is registered alongside `runFactRefreshJob` in `server/scheduler.ts` and protected by the existing `withAdvisoryLock` + `cronCrashGuard` helpers (lines `server/scheduler.ts:357-361, 617-619`). Structured metrics use Pino's `logger.info({ ...fields }, "msg")` form so a Grafana panel can later read `fact_scrape_run_completed` events without app changes (Spec 2 §4.8.4 — fact VALUES are never logged; only metadata).

**Tech Stack:** Vitest, Express (mounted ad-hoc in tests), `node-cron` (existing scheduler), Pino (existing logger), Sentry via `captureAndFlush` (`server/lib/sentryReport.ts:18`). No new dependencies.

**Hard rules for all subagents:**

- ❌ NEVER run ANY git mutating command: `git commit`, `git add`, `git rm`, `git mv`, `git stash`, `git stash pop`, `git stash drop`, `git stash apply`, `git reset`, `git restore`, `git checkout` (when it discards), `git push`, `git pull`, `git fetch --prune`, `git rebase`, `git merge`, `git branch -D`, `git branch -m`, `git switch` (with dirty changes), `git clean`. Read-only is fine: `git status`, `git diff`, `git log`, `git show`, `git blame`, `git branch` (list).
- ❌ Do NOT trust .md files in this repo — verify every claim against the actual source file at the cited line.
- ❌ Do NOT add features. Plan 2.6 is tests + cron + observability ONLY. No agent changes, no route changes, no UI changes. The single permitted source-file mutation outside `tests/` is one `logger.info(...)` call appended to `server/lib/factAgent/advanceScrapeRun.ts` (Task 14) and the cron registration in `server/scheduler.ts` (Task 13).
- ❌ Do NOT introduce timing-sensitive assertions. Track 33 flagged several existing integration tests as flaky; Plan 2.6 tests MUST NOT join that list. Use `vi.useFakeTimers()` whenever a test deals with backoff / wall-clock / deadlines.
- ❌ Do NOT log fact `value` strings anywhere — Spec 2 §4.8.4 + §9 last-bullet log-hygiene rule. Only metadata IDs/counts/cents.
- ❌ Do NOT re-implement utilities owned by Plan 2.2. Tests CONSUME `canonicalize`, `robotsCache`, `langDetect`, `secretRedactor`, `validators`, `planner`, `executor`, `advanceScrapeRun`, `tryAcquireScrapeLock`, etc. If a utility is missing, halt and report — do not stub it locally.
- ❌ Do NOT mock the database in the migration verification test (Task 12). It MUST execute SQL against a real Postgres instance (the same `pool` used by `server/index.ts:181-236` migration runner).

---

## File Structure

**Tests created (integration):**

- `tests/integration/factSheetHappyPath.test.ts` — Task 1
- `tests/integration/factSheet4xxAllPages.test.ts` — Task 2
- `tests/integration/factSheetSpaEmpty.test.ts` — Task 3
- `tests/integration/factSheetRobotsBlocked.test.ts` — Task 4
- `tests/integration/factSheetTimeout.test.ts` — Task 5
- `tests/integration/factSheetLlmUnavailable.test.ts` — Task 6
- `tests/integration/factSheetRetryOnce.test.ts` — Task 7
- `tests/integration/factSheetWithinRunDedup.test.ts` — Task 8
- `tests/integration/factSheetCostCapReached.test.ts` — Task 9
- `tests/integration/factSheetAdvisoryLock.test.ts` — Task 10
- `tests/integration/factSheetDiffResolution.test.ts` — Task 11

**Tests created (migration + unit):**

- `tests/migrations/spec2Migrations.test.ts` — Task 12
- `tests/unit/detectFactScrapeFailureRate.test.ts` — Task 13

**Source files modified (narrow, observability-only):**

- `server/scheduler.ts` — Task 13 (registers `DETECT_FACT_SCRAPE_FAILURE_CRON` alongside the existing `FACT_REFRESH_CRON` block at `server/scheduler.ts:617-619`; adds `detectFactScrapeFailureRate` export near `runFactRefreshJob` at `server/scheduler.ts:357-361`).
- `server/lib/factAgent/advanceScrapeRun.ts` — Task 14 (ONE `logger.info` at run completion; owned by Plan 2.2 otherwise).

**Out of scope (deferred to v1.5 per Spec 2 §11):**

- Retention/cleanup of `brand_fact_scrape_pages`.
- Customer email notification on serial failure.
- CSV/JSON export.

---

### Task 1: Integration test — happy path (3 pages, 5 facts, completed)

**Files:**
- Create: `tests/integration/factSheetHappyPath.test.ts`

**Spec refs:** Spec 2 §4 (two-phase agent), §4.8 (extraction), §6.2 (success), §9 bullet 11 (full happy path).

**Pre-flight verification:**

- [ ] **Step 1: Confirm the Plan 2.2 advanceScrapeRun module exists**

Run: `ls server/lib/factAgent/advanceScrapeRun.ts` and `grep -n "export.*advanceScrapeRun" server/lib/factAgent/advanceScrapeRun.ts`
Expected: file exists, one exported `advanceScrapeRun(runId, deadlineMs)` function.

If not present, halt — Plan 2.2 has not landed and Plan 2.6 cannot proceed. Do not stub it.

- [ ] **Step 2: Confirm safeFetchTextWithLockedIp module path**

Run: `grep -rn "export.*safeFetchTextWithLockedIp" server/lib/ | head -3`
Expected: one definition (Plan 2.2 owns this). Note the path for the `vi.mock(...)` factory below.

- [ ] **Step 3: Write the test**

Create `tests/integration/factSheetHappyPath.test.ts` with this content:

```ts
// Spec 2 §9 bullet 11: full happy path with mocked OpenAI + HTTP fetcher.
// Drives advanceScrapeRun end-to-end. Verifies pages inserted, facts inserted
// (mix of valueTypes), run status='completed', llm_cost_cents > 0, no
// facts_redacted, advisory lock acquired + released.

import { describe, it, expect, vi, beforeEach } from "vitest";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "22222222-2222-4222-8222-222222222222";

const stubs = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  openaiCreate: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  storage: {
    getScrapeRunById: vi.fn(),
    transitionScrapeRunStatusCAS: vi.fn(),
    updateScrapeRunStatus: vi.fn(),
    incrementScrapeRunCounters: vi.fn(),
    createScrapePage: vi.fn(),
    updateScrapePageStatus: vi.fn(),
    listScrapePagesForRun: vi.fn(),
    getMonthlyCostCap: vi.fn(),
    incrementMonthlyCostCents: vi.fn(),
    upsertScrapedFact: vi.fn(),
    getBrandById: vi.fn(),
  },
}));

vi.mock("../../server/lib/factAgent/safeFetchTextWithLockedIp", () => ({
  safeFetchTextWithLockedIp: stubs.safeFetch,
}));

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: stubs.openaiCreate } };
    responses = { create: stubs.openaiCreate };
  },
}));

vi.mock("../../server/storage", () => ({ storage: stubs.storage }));

vi.mock("../../server/lib/advisoryLock", () => ({
  withAdvisoryLock: async (_k: number, _name: string, fn: () => Promise<unknown>) => fn(),
  tryAcquireScrapeLock: stubs.acquireLock,
  releaseScrapeLock: stubs.releaseLock,
  lockKeys: { factRefresh: 1, factScrape: 2 },
}));

vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { advanceScrapeRun } from "../../server/lib/factAgent/advanceScrapeRun";

beforeEach(() => {
  vi.clearAllMocks();
  stubs.acquireLock.mockResolvedValue(true);

  stubs.storage.getScrapeRunById.mockResolvedValue({
    id: RUN_ID,
    brandId: BRAND_ID,
    status: "pending",
    triggeredBy: "manual_rescrape",
    startedAt: new Date(),
    pagesPlanned: 0,
    pagesFetched: 0,
    pagesFailed: 0,
    factsExtracted: 0,
    factsValidated: 0,
    factsRedacted: 0,
    llmCostCents: 0,
    llmCalls: 0,
    llmInputTokens: 0,
    llmOutputTokens: 0,
  });

  stubs.storage.transitionScrapeRunStatusCAS.mockResolvedValue(true);
  stubs.storage.getBrandById.mockResolvedValue({
    id: BRAND_ID,
    url: "https://example.com",
    industry: "SaaS",
    factScrapeEnabled: true,
  });
  stubs.storage.getMonthlyCostCap.mockResolvedValue({
    brandId: BRAND_ID,
    monthKey: "2026-05",
    factScrapeCents: 0,
    monthlyCapCents: 500,
  });
  stubs.storage.listScrapePagesForRun.mockResolvedValue([]);

  // Planner LLM response: 3 URLs.
  // Page LLMs: extract a mix of valueTypes (string, number, array).
  let openaiCalls = 0;
  stubs.openaiCreate.mockImplementation(async () => {
    openaiCalls += 1;
    const usage = { input_tokens: 500, output_tokens: 200 };
    if (openaiCalls === 1) {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                pages: [
                  { url: "https://example.com/", reason: "homepage" },
                  { url: "https://example.com/about", reason: "about" },
                  { url: "https://example.com/pricing", reason: "pricing" },
                ],
              }),
            },
          },
        ],
        usage,
      };
    }
    // Subsequent calls — page extractions.
    return {
      choices: [
        {
          message: {
            content: JSON.stringify({
              facts: [
                {
                  domain: "identity",
                  subcategory: "description",
                  factKey: "primary",
                  valueType: "string",
                  value: "ACME builds CRMs for plumbers.",
                  confidence: 0.92,
                  sourceExcerpt: "ACME builds CRMs for plumbers.",
                },
                {
                  domain: "growth",
                  subcategory: "founding",
                  factKey: "year",
                  valueType: "number",
                  value: 2019,
                  confidence: 0.88,
                  sourceExcerpt: "Founded in 2019.",
                },
              ],
            }),
          },
        },
      ],
      usage,
    };
  });

  // Three fetched pages — well-formed HTML, > 200 chars, English.
  stubs.safeFetch.mockResolvedValue({
    status: 200,
    body: "<html><head><title>ACME</title></head><body>" +
      "<p>ACME builds CRMs for plumbers. Founded in 2019.</p>".repeat(20) +
      "</body></html>",
    contentType: "text/html",
    bytes: 1500,
    finalUrl: "https://example.com/",
  });
});

describe("Spec 2 happy path", () => {
  it("completes a run: pages fetched, facts extracted, status=completed", async () => {
    const deadline = Date.now() + 60_000;
    await advanceScrapeRun(RUN_ID, deadline);

    // Lock acquired + released.
    expect(stubs.acquireLock).toHaveBeenCalledWith(BRAND_ID);
    expect(stubs.releaseLock).toHaveBeenCalledWith(BRAND_ID);

    // 3 page rows inserted.
    expect(stubs.storage.createScrapePage).toHaveBeenCalledTimes(3);

    // At least 2 facts upserted (planner output drove ≥2 per page; dedup may merge).
    expect(stubs.storage.upsertScrapedFact.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Run reached completed status (final CAS or updateScrapeRunStatus call).
    const transitions = [
      ...stubs.storage.transitionScrapeRunStatusCAS.mock.calls,
      ...stubs.storage.updateScrapeRunStatus.mock.calls,
    ];
    const reachedCompleted = transitions.some((c) =>
      JSON.stringify(c).includes("completed"),
    );
    expect(reachedCompleted).toBe(true);

    // llm_cost_cents > 0 (planner + per-page extractions).
    const costCalls = stubs.storage.incrementMonthlyCostCents.mock.calls;
    expect(costCalls.length).toBeGreaterThan(0);
    const totalCents = costCalls.reduce((acc, [, cents]) => acc + (cents ?? 0), 0);
    expect(totalCents).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/integration/factSheetHappyPath.test.ts 2>&1 | tail -20`
Expected: 1 test passing, 0 failures.

- [ ] **Step 5: Verify no fact value strings leaked into log mocks**

Run: `grep -n "factValue\|fact_value" tests/integration/factSheetHappyPath.test.ts`
Expected: no matches (test asserts on counts/cents/status, not values).

---

### Task 2: Integration test — 4xx all pages

**Files:**
- Create: `tests/integration/factSheet4xxAllPages.test.ts`

**Spec refs:** Spec 2 §6.2 (4xx-all failure state), §9 bullet 11.

- [ ] **Step 1: Write the test**

Create `tests/integration/factSheet4xxAllPages.test.ts`:

```ts
// Spec 2 §6.2: 4xx-all failure state. Every planned page 404s.
// Verifies pages_failed=N, run status='failed', error_kind='all_pages_4xx',
// no facts inserted.

import { describe, it, expect, vi, beforeEach } from "vitest";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "22222222-2222-4222-8222-222222222222";

const stubs = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  openaiCreate: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  storage: {
    getScrapeRunById: vi.fn(),
    transitionScrapeRunStatusCAS: vi.fn(),
    updateScrapeRunStatus: vi.fn(),
    incrementScrapeRunCounters: vi.fn(),
    createScrapePage: vi.fn(),
    updateScrapePageStatus: vi.fn(),
    listScrapePagesForRun: vi.fn(),
    getMonthlyCostCap: vi.fn(),
    incrementMonthlyCostCents: vi.fn(),
    upsertScrapedFact: vi.fn(),
    getBrandById: vi.fn(),
  },
}));

vi.mock("../../server/lib/factAgent/safeFetchTextWithLockedIp", () => ({
  safeFetchTextWithLockedIp: stubs.safeFetch,
}));
vi.mock("openai", () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: stubs.openaiCreate } };
    responses = { create: stubs.openaiCreate };
  },
}));
vi.mock("../../server/storage", () => ({ storage: stubs.storage }));
vi.mock("../../server/lib/advisoryLock", () => ({
  withAdvisoryLock: async (_k: number, _n: string, fn: () => Promise<unknown>) => fn(),
  tryAcquireScrapeLock: stubs.acquireLock,
  releaseScrapeLock: stubs.releaseLock,
  lockKeys: { factRefresh: 1, factScrape: 2 },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { advanceScrapeRun } from "../../server/lib/factAgent/advanceScrapeRun";

beforeEach(() => {
  vi.clearAllMocks();
  stubs.acquireLock.mockResolvedValue(true);
  stubs.storage.getScrapeRunById.mockResolvedValue({
    id: RUN_ID,
    brandId: BRAND_ID,
    status: "pending",
    triggeredBy: "manual_rescrape",
    startedAt: new Date(),
    pagesPlanned: 0,
    pagesFetched: 0,
    pagesFailed: 0,
    factsExtracted: 0,
    factsValidated: 0,
    factsRedacted: 0,
    llmCostCents: 0,
    llmCalls: 0,
    llmInputTokens: 0,
    llmOutputTokens: 0,
  });
  stubs.storage.transitionScrapeRunStatusCAS.mockResolvedValue(true);
  stubs.storage.getBrandById.mockResolvedValue({
    id: BRAND_ID,
    url: "https://example.com",
    industry: "SaaS",
    factScrapeEnabled: true,
  });
  stubs.storage.getMonthlyCostCap.mockResolvedValue({
    brandId: BRAND_ID,
    monthKey: "2026-05",
    factScrapeCents: 0,
    monthlyCapCents: 500,
  });
  stubs.storage.listScrapePagesForRun.mockResolvedValue([]);

  // Planner returns 3 URLs.
  let calls = 0;
  stubs.openaiCreate.mockImplementation(async () => {
    calls += 1;
    if (calls === 1) {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                pages: [
                  { url: "https://example.com/", reason: "homepage" },
                  { url: "https://example.com/about", reason: "about" },
                  { url: "https://example.com/pricing", reason: "pricing" },
                ],
              }),
            },
          },
        ],
        usage: { input_tokens: 500, output_tokens: 200 },
      };
    }
    throw new Error("Page extraction should not be called when all pages 4xx");
  });

  // All page fetches return 404.
  stubs.safeFetch.mockResolvedValue({
    status: 404,
    body: "Not Found",
    contentType: "text/html",
    bytes: 9,
    finalUrl: "https://example.com/",
  });
});

describe("Spec 2 4xx-all-pages failure", () => {
  it("marks run failed with error_kind=all_pages_4xx, inserts no facts", async () => {
    await advanceScrapeRun(RUN_ID, Date.now() + 60_000);

    // No facts upserted.
    expect(stubs.storage.upsertScrapedFact).not.toHaveBeenCalled();

    // Page rows created for each planned URL.
    expect(stubs.storage.createScrapePage).toHaveBeenCalledTimes(3);

    // Run transitioned to failed with all_pages_4xx.
    const allCalls = [
      ...stubs.storage.transitionScrapeRunStatusCAS.mock.calls,
      ...stubs.storage.updateScrapeRunStatus.mock.calls,
    ];
    const failedCall = allCalls.find((c) => JSON.stringify(c).includes("failed"));
    expect(failedCall).toBeDefined();
    expect(JSON.stringify(failedCall)).toContain("all_pages_4xx");
  });
});
```

- [ ] **Step 2: Run**

Run: `npm test -- tests/integration/factSheet4xxAllPages.test.ts 2>&1 | tail -10`
Expected: 1 pass.

---

### Task 3: Integration test — SPA-empty all pages

**Files:**
- Create: `tests/integration/factSheetSpaEmpty.test.ts`

**Spec refs:** Spec 2 §4.7 (SPA detection), §6.2 (SPA-empty failure state), §9 bullet 11.

- [ ] **Step 1: Write the test**

Create `tests/integration/factSheetSpaEmpty.test.ts`. Use the exact same scaffolding as Task 2 (planner returns 3 URLs, copy the `beforeEach` block verbatim except for the `safeFetch.mockResolvedValue` line), but replace the `safeFetch.mockResolvedValue` with:

```ts
stubs.safeFetch.mockResolvedValue({
  status: 200,
  body: '<html><head><title>App</title></head><body><div id="app"></div><script src="/app.js"></script></body></html>',
  contentType: "text/html",
  bytes: 140,
  finalUrl: "https://example.com/",
});
```

And replace the describe/it block with:

```ts
describe("Spec 2 SPA-empty failure", () => {
  it("marks pages skipped_spa and run failed with error_kind=spa_empty", async () => {
    await advanceScrapeRun(RUN_ID, Date.now() + 60_000);

    expect(stubs.storage.upsertScrapedFact).not.toHaveBeenCalled();

    const pageStatusCalls = stubs.storage.updateScrapePageStatus.mock.calls;
    const spaSkips = pageStatusCalls.filter((c) =>
      JSON.stringify(c).match(/skipped_spa|spa_empty/),
    );
    expect(spaSkips.length).toBe(3);

    const runCalls = [
      ...stubs.storage.transitionScrapeRunStatusCAS.mock.calls,
      ...stubs.storage.updateScrapeRunStatus.mock.calls,
    ];
    const failed = runCalls.find((c) => JSON.stringify(c).includes("spa_empty"));
    expect(failed).toBeDefined();
  });
});
```

- [ ] **Step 2: Run**

Run: `npm test -- tests/integration/factSheetSpaEmpty.test.ts 2>&1 | tail -10`
Expected: 1 pass.

---

### Task 4: Integration test — robots.txt disallowed all pages

**Files:**
- Create: `tests/integration/factSheetRobotsBlocked.test.ts`

**Spec refs:** Spec 2 §4.6 (robots respect), §6.2 (robots-disallowed failure state), §9 bullet 11.

- [ ] **Step 1: Verify robots cache module path**

Run: `ls server/lib/factAgent/robotsCache.ts && grep -n "export" server/lib/factAgent/robotsCache.ts | head -5`
Expected: file exists. Note the exported helper name (`getRobotsForOrigin` or similar — read line 1-30 if uncertain).

- [ ] **Step 2: Write the test**

Create `tests/integration/factSheetRobotsBlocked.test.ts`. Reuse the scaffolding from Task 2. Replace `safeFetch` setup with a mock that distinguishes `/robots.txt` from other URLs:

```ts
let robotsFetchCount = 0;
stubs.safeFetch.mockImplementation(async (url: string) => {
  if (url.endsWith("/robots.txt")) {
    robotsFetchCount += 1;
    return {
      status: 200,
      body: "User-agent: *\nDisallow: /",
      contentType: "text/plain",
      bytes: 24,
      finalUrl: url,
    };
  }
  return {
    status: 200,
    body: "<html><body><p>should never be fetched</p></body></html>",
    contentType: "text/html",
    bytes: 100,
    finalUrl: url,
  };
});
// Expose for assertion below.
(globalThis as any).__robotsFetchCount = () => robotsFetchCount;
```

Replace describe/it with:

```ts
describe("Spec 2 robots-disallowed failure", () => {
  it("skips all pages, fetches robots.txt exactly once per origin, run fails", async () => {
    await advanceScrapeRun(RUN_ID, Date.now() + 60_000);

    expect(stubs.storage.upsertScrapedFact).not.toHaveBeenCalled();

    const robotsSkips = stubs.storage.updateScrapePageStatus.mock.calls.filter((c) =>
      JSON.stringify(c).includes("skipped_robots"),
    );
    expect(robotsSkips.length).toBe(3);

    // Robots fetched exactly once (cached per run).
    expect((globalThis as any).__robotsFetchCount()).toBe(1);

    const runCalls = [
      ...stubs.storage.transitionScrapeRunStatusCAS.mock.calls,
      ...stubs.storage.updateScrapeRunStatus.mock.calls,
    ];
    expect(runCalls.find((c) => JSON.stringify(c).includes("robots_disallowed"))).toBeDefined();
  });
});
```

- [ ] **Step 3: Run**

Run: `npm test -- tests/integration/factSheetRobotsBlocked.test.ts 2>&1 | tail -10`
Expected: 1 pass.

---

### Task 5: Integration test — timeout path (deadline elapsed + wall-clock)

**Files:**
- Create: `tests/integration/factSheetTimeout.test.ts`

**Spec refs:** Spec 2 §4.5 (5-min wall-clock SLA), §6.2 (timeout failure state), §9 bullet 13 (budget caps).

- [ ] **Step 1: Write the test**

Create `tests/integration/factSheetTimeout.test.ts`. Reuse the scaffolding from Task 1 (planner + fetch return well-formed responses). Add the following two test cases inside one `describe`:

```ts
describe("Spec 2 timeout", () => {
  it("aborts when deadlineMs is already in the past", async () => {
    // deadline 100ms ago — instant abort before/after planner.
    await advanceScrapeRun(RUN_ID, Date.now() - 100);

    const runCalls = [
      ...stubs.storage.transitionScrapeRunStatusCAS.mock.calls,
      ...stubs.storage.updateScrapeRunStatus.mock.calls,
    ];
    const timedOut = runCalls.find((c) => JSON.stringify(c).includes("timeout"));
    expect(timedOut).toBeDefined();
    expect(JSON.stringify(timedOut)).toContain("timeout"); // error_kind also "timeout"
  });

  it("respects the 5-minute wall-clock when started_at is older than 5min", async () => {
    // Pretend the run started 6 minutes ago.
    stubs.storage.getScrapeRunById.mockResolvedValueOnce({
      id: RUN_ID,
      brandId: BRAND_ID,
      status: "fetching",
      triggeredBy: "manual_rescrape",
      startedAt: new Date(Date.now() - 6 * 60_000),
      pagesPlanned: 3,
      pagesFetched: 1,
      pagesFailed: 0,
      factsExtracted: 1,
      factsValidated: 1,
      factsRedacted: 0,
      llmCostCents: 5,
      llmCalls: 2,
      llmInputTokens: 1000,
      llmOutputTokens: 400,
    });

    await advanceScrapeRun(RUN_ID, Date.now() + 60_000);

    const runCalls = [
      ...stubs.storage.transitionScrapeRunStatusCAS.mock.calls,
      ...stubs.storage.updateScrapeRunStatus.mock.calls,
    ];
    expect(runCalls.find((c) => JSON.stringify(c).includes("timeout"))).toBeDefined();
  });
});
```

- [ ] **Step 2: Run**

Run: `npm test -- tests/integration/factSheetTimeout.test.ts 2>&1 | tail -10`
Expected: 2 passes.

---

### Task 6: Integration test — OpenAI 503 (llm_unavailable)

**Files:**
- Create: `tests/integration/factSheetLlmUnavailable.test.ts`

**Spec refs:** Spec 2 §6.2 (llm_unavailable failure state), §9 bullet 11.

- [ ] **Step 1: Write the test**

Create `tests/integration/factSheetLlmUnavailable.test.ts`. Reuse Task 2 scaffolding but replace the OpenAI mock + assertions:

```ts
// Make the OpenAI client throw a 503 on first call (planner).
stubs.openaiCreate.mockImplementation(async () => {
  const err = new Error("Service Unavailable") as Error & { status?: number };
  err.status = 503;
  err.name = "APIError";
  throw err;
});
```

```ts
import { captureAndFlush } from "../../server/lib/sentryReport";

describe("Spec 2 llm_unavailable failure", () => {
  it("marks run failed with error_kind=llm_unavailable and captures to Sentry", async () => {
    await advanceScrapeRun(RUN_ID, Date.now() + 60_000);

    expect(stubs.storage.upsertScrapedFact).not.toHaveBeenCalled();

    const runCalls = [
      ...stubs.storage.transitionScrapeRunStatusCAS.mock.calls,
      ...stubs.storage.updateScrapeRunStatus.mock.calls,
    ];
    expect(runCalls.find((c) => JSON.stringify(c).includes("llm_unavailable"))).toBeDefined();

    expect(captureAndFlush).toHaveBeenCalled();
    const sentryArgs = (captureAndFlush as any).mock.calls[0];
    expect(JSON.stringify(sentryArgs)).toContain("factAgent");
  });
});
```

Note: the `captureAndFlush` import must reference the mocked module — the existing `vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }))` exposes it via the import.

- [ ] **Step 2: Run**

Run: `npm test -- tests/integration/factSheetLlmUnavailable.test.ts 2>&1 | tail -10`
Expected: 1 pass.

---

### Task 7: Integration test — retry-once on 5xx

**Files:**
- Create: `tests/integration/factSheetRetryOnce.test.ts`

**Spec refs:** Spec 2 §4.5 (retry-once on 5xx), §9 bullet 11.

- [ ] **Step 1: Write the test**

Create `tests/integration/factSheetRetryOnce.test.ts`. Reuse Task 1 scaffolding. Replace the `safeFetch` setup so the FIRST call returns 500, subsequent calls return 200:

```ts
let fetchCallsForFirstUrl = 0;
stubs.safeFetch.mockImplementation(async (url: string) => {
  if (url.endsWith("/robots.txt")) {
    return { status: 404, body: "", contentType: "text/plain", bytes: 0, finalUrl: url };
  }
  if (url === "https://example.com/") {
    fetchCallsForFirstUrl += 1;
    if (fetchCallsForFirstUrl === 1) {
      return { status: 500, body: "Internal Server Error", contentType: "text/html", bytes: 22, finalUrl: url };
    }
  }
  return {
    status: 200,
    body: "<html><body><p>ACME builds CRMs for plumbers. Founded in 2019.</p></body></html>".repeat(5),
    contentType: "text/html",
    bytes: 600,
    finalUrl: url,
  };
});

// Pin setTimeout via fake timers so backoff doesn't extend the test.
vi.useFakeTimers({ shouldAdvanceTime: true });
```

Add the test:

```ts
describe("Spec 2 retry-once on 5xx", () => {
  it("retries once after a 500 and succeeds on the second attempt", async () => {
    await advanceScrapeRun(RUN_ID, Date.now() + 60_000);

    // First URL was fetched twice (500 then 200).
    const homepageFetches = stubs.safeFetch.mock.calls.filter(
      (c) => c[0] === "https://example.com/",
    );
    expect(homepageFetches.length).toBe(2);

    // Final page status is 'done' for the homepage row (not 'failed').
    const homepagePageStatusCalls = stubs.storage.updateScrapePageStatus.mock.calls.filter((c) =>
      JSON.stringify(c).includes("example.com/"),
    );
    const lastHomepageStatus = JSON.stringify(homepagePageStatusCalls.at(-1));
    expect(lastHomepageStatus).toContain("done");
    expect(lastHomepageStatus).not.toContain("\"error_kind\"");
  });
});
```

- [ ] **Step 2: Run with timer flush**

Run: `npm test -- tests/integration/factSheetRetryOnce.test.ts 2>&1 | tail -10`
Expected: 1 pass.

---

### Task 8: Integration test — within-run dedup keeps higher confidence

**Files:**
- Create: `tests/integration/factSheetWithinRunDedup.test.ts`

**Spec refs:** Spec 2 §4.8.3 (within-run dedup), §9 bullet 11.

- [ ] **Step 1: Write the test**

Create `tests/integration/factSheetWithinRunDedup.test.ts`. Reuse Task 1 scaffolding. Make the planner return 2 URLs, and make BOTH page extractions return the SAME fact tuple but different confidences:

```ts
let calls = 0;
stubs.openaiCreate.mockImplementation(async () => {
  calls += 1;
  const usage = { input_tokens: 300, output_tokens: 100 };
  if (calls === 1) {
    return {
      choices: [{ message: { content: JSON.stringify({
        pages: [
          { url: "https://example.com/", reason: "homepage" },
          { url: "https://example.com/about", reason: "about" },
        ],
      })}}],
      usage,
    };
  }
  const conf = calls === 2 ? 0.55 : 0.91;
  const valueText = calls === 2 ? "Low confidence value" : "High confidence value";
  return {
    choices: [{ message: { content: JSON.stringify({
      facts: [
        {
          domain: "identity",
          subcategory: "description",
          factKey: "primary",
          valueType: "string",
          value: valueText,
          confidence: conf,
          sourceExcerpt: valueText,
        },
      ],
    })}}],
    usage,
  };
});
```

Assertion:

```ts
describe("Spec 2 within-run dedup", () => {
  it("upserts only one row per (domain, subcategory, factKey) — the higher-confidence one", async () => {
    await advanceScrapeRun(RUN_ID, Date.now() + 60_000);

    // Exactly one upsert for this tuple — dedup happened before persistence.
    expect(stubs.storage.upsertScrapedFact).toHaveBeenCalledTimes(1);

    const [persisted] = stubs.storage.upsertScrapedFact.mock.calls[0];
    expect(persisted.domain).toBe("identity");
    expect(persisted.subcategory).toBe("description");
    expect(persisted.factKey).toBe("primary");
    // Higher confidence (0.91) wins.
    expect(Number(persisted.confidence)).toBeCloseTo(0.91, 2);
    // Lower-confidence alternative stored in value_payload.alternatives.
    expect(persisted.valuePayload?.alternatives).toBeDefined();
    expect(persisted.valuePayload.alternatives.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run**

Run: `npm test -- tests/integration/factSheetWithinRunDedup.test.ts 2>&1 | tail -10`
Expected: 1 pass.

---

### Task 9: Integration test — cost cap reached returns 402

**Files:**
- Create: `tests/integration/factSheetCostCapReached.test.ts`

**Spec refs:** Spec 2 §6.2 (cost_cap_reached failure state), §9 bullet 7 (402 response).

- [ ] **Step 1: Verify Plan 2.3 route module exists**

Run: `grep -rn "POST.*brand-fact-sheet/runs\|router\.post.*brand-fact-sheet" server/routes/ | head -3`
Expected: one match (Plan 2.3 owns this route). Note the file path.

If the route file is not yet present, halt and report — cannot exercise route-level 402 without Plan 2.3.

- [ ] **Step 2: Write the test**

Create `tests/integration/factSheetCostCapReached.test.ts`. Mount the route via the same pattern as `tests/unit/geoSignalsAnalyzePersistence.test.ts:14-60`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";

const BRAND_ID = "22222222-2222-4222-8222-222222222222";

const stubs = vi.hoisted(() => ({
  requireBrand: vi.fn((_req, _res, next) => next()),
  requireUser: vi.fn((_req, _res, next) => next()),
  storage: {
    getMonthlyCostCap: vi.fn(),
    getBrandFactScrapeEnabled: vi.fn().mockResolvedValue(true),
    createScrapeRun: vi.fn(),
    tryAcquireScrapeLock: vi.fn(),
  },
}));

vi.mock("../../server/lib/ownership", () => ({
  requireBrand: stubs.requireBrand,
  requireUser: stubs.requireUser,
}));
vi.mock("../../server/storage", () => ({ storage: stubs.storage }));
vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => p.catch(() => {}) }));

// Adjust the import path below to match what Plan 2.3 exported. Default
// guess based on Appendix A of Spec 2: `server/routes/factSheet.ts`.
import { registerFactSheetRoutes } from "../../server/routes/factSheet";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerFactSheetRoutes(app);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("Spec 2 cost cap reached", () => {
  it("returns 402 when current month spend already at cap", async () => {
    stubs.storage.getMonthlyCostCap.mockResolvedValue({
      brandId: BRAND_ID,
      monthKey: new Date().toISOString().slice(0, 7),
      factScrapeCents: 495,
      monthlyCapCents: 500,
    });

    const app = makeApp();
    const res = await new Promise<any>((resolve) => {
      const req = { method: "POST", url: `/api/brand-fact-sheet/runs`, body: { brandId: BRAND_ID }, headers: {} };
      const captured: any = { statusCode: 200, body: undefined };
      const out = {
        status(code: number) { captured.statusCode = code; return out; },
        json(body: unknown) { captured.body = body; resolve(captured); return out; },
        send(body: unknown) { captured.body = body; resolve(captured); return out; },
        setHeader() {},
        end() { resolve(captured); },
      };
      (app as any).handle(req, out);
    });

    expect(res.statusCode).toBe(402);
    expect(stubs.storage.createScrapeRun).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run**

Run: `npm test -- tests/integration/factSheetCostCapReached.test.ts 2>&1 | tail -10`
Expected: 1 pass. If Plan 2.3 used a different register-function name, update the import accordingly (do not invent a fallback — read Plan 2.3's source first).

---

### Task 10: Integration test — advisory lock prevents parallel runs

**Files:**
- Create: `tests/integration/factSheetAdvisoryLock.test.ts`

**Spec refs:** Spec 2 §4.10 (advisory lock), §9 bullet 7 (409 already_running).

- [ ] **Step 1: Write the test**

Create `tests/integration/factSheetAdvisoryLock.test.ts`. Same scaffolding as Task 9. Add:

```ts
describe("Spec 2 advisory lock 409", () => {
  it("returns 409 already_running when another scrape holds the lock", async () => {
    stubs.storage.getMonthlyCostCap.mockResolvedValue({
      brandId: BRAND_ID,
      monthKey: new Date().toISOString().slice(0, 7),
      factScrapeCents: 0,
      monthlyCapCents: 500,
    });
    stubs.storage.tryAcquireScrapeLock.mockResolvedValue(false);

    const app = makeApp();
    const res = await new Promise<any>((resolve) => {
      const req = { method: "POST", url: `/api/brand-fact-sheet/runs`, body: { brandId: BRAND_ID }, headers: {} };
      const captured: any = { statusCode: 200, body: undefined };
      const out = {
        status(c: number) { captured.statusCode = c; return out; },
        json(b: unknown) { captured.body = b; resolve(captured); return out; },
        send(b: unknown) { captured.body = b; resolve(captured); return out; },
        setHeader() {},
        end() { resolve(captured); },
      };
      (app as any).handle(req, out);
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.stringify(res.body)).toContain("already_running");
  });
});
```

- [ ] **Step 2: Run**

Run: `npm test -- tests/integration/factSheetAdvisoryLock.test.ts 2>&1 | tail -10`
Expected: 1 pass.

---

### Task 11: Integration test — diff resolution flows (Use mine / Use AI's / Keep both / bulk)

**Files:**
- Create: `tests/integration/factSheetDiffResolution.test.ts`

**Spec refs:** Spec 2 §6.4 (diff resolution), §9 bullet 12 (Use mine / Use AI's / Keep both / bulk-accept per domain).

- [ ] **Step 1: Verify Plan 2.3 accept/dismiss routes**

Run: `grep -rn "facts/.*/accept\|facts/.*/dismiss\|bulk-accept" server/routes/ | head -5`
Expected: 3-4 matches across the Plan 2.3 route file.

- [ ] **Step 2: Write the test**

Create `tests/integration/factSheetDiffResolution.test.ts`:

```ts
// Spec 2 §6.4: diff resolution flows.
// Seed user + scraped fact rows for the same tuple; verify each resolution
// mode (Use mine, Use AI's, Keep both, bulk-per-domain) updates accepted_at
// and dismissed_at correctly via storage calls.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";

const BRAND_ID = "22222222-2222-4222-8222-222222222222";
const USER_FACT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SCRAPED_FACT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const stubs = vi.hoisted(() => ({
  requireBrand: vi.fn((_req, _res, next) => next()),
  storage: {
    acceptFact: vi.fn(),
    dismissFact: vi.fn(),
    getBrandFactById: vi.fn(),
    listBrandFactsByDomain: vi.fn(),
    bulkAcceptByDomain: vi.fn(),
  },
}));

vi.mock("../../server/lib/ownership", () => ({
  requireBrand: stubs.requireBrand,
  requireUser: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../server/storage", () => ({ storage: stubs.storage }));
vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { registerFactSheetRoutes } from "../../server/routes/factSheet";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerFactSheetRoutes(app);
  return app;
}

function callRoute(method: string, url: string, body: unknown = {}) {
  return new Promise<any>((resolve) => {
    const app = makeApp();
    const req = { method, url, body, headers: {} };
    const captured: any = { statusCode: 200, body: undefined };
    const out = {
      status(c: number) { captured.statusCode = c; return out; },
      json(b: unknown) { captured.body = b; resolve(captured); return out; },
      send(b: unknown) { captured.body = b; resolve(captured); return out; },
      setHeader() {},
      end() { resolve(captured); },
    };
    (app as any).handle(req, out);
  });
}

beforeEach(() => vi.clearAllMocks());

describe("Spec 2 diff resolution", () => {
  it("Use mine: accept user row, dismiss scraped row", async () => {
    stubs.storage.acceptFact.mockResolvedValue({ id: USER_FACT_ID, acceptedAt: new Date() });
    stubs.storage.dismissFact.mockResolvedValue({ id: SCRAPED_FACT_ID, dismissedAt: new Date() });

    const res = await callRoute(
      "POST",
      `/api/brand-fact-sheet/facts/${USER_FACT_ID}/accept`,
      { dismissOtherSide: true, otherFactId: SCRAPED_FACT_ID },
    );
    expect(res.statusCode).toBe(200);
    expect(stubs.storage.acceptFact).toHaveBeenCalledWith(USER_FACT_ID);
    expect(stubs.storage.dismissFact).toHaveBeenCalledWith(SCRAPED_FACT_ID);
  });

  it("Use AI's: accept scraped row, dismiss user row", async () => {
    stubs.storage.acceptFact.mockResolvedValue({ id: SCRAPED_FACT_ID, acceptedAt: new Date() });
    stubs.storage.dismissFact.mockResolvedValue({ id: USER_FACT_ID, dismissedAt: new Date() });

    const res = await callRoute(
      "POST",
      `/api/brand-fact-sheet/facts/${SCRAPED_FACT_ID}/accept`,
      { dismissOtherSide: true, otherFactId: USER_FACT_ID },
    );
    expect(res.statusCode).toBe(200);
    expect(stubs.storage.acceptFact).toHaveBeenCalledWith(SCRAPED_FACT_ID);
    expect(stubs.storage.dismissFact).toHaveBeenCalledWith(USER_FACT_ID);
  });

  it("Keep both: accept user row WITHOUT dismissing scraped row", async () => {
    stubs.storage.acceptFact.mockResolvedValue({ id: USER_FACT_ID, acceptedAt: new Date() });

    const res = await callRoute(
      "POST",
      `/api/brand-fact-sheet/facts/${USER_FACT_ID}/accept`,
      { dismissOtherSide: false },
    );
    expect(res.statusCode).toBe(200);
    expect(stubs.storage.acceptFact).toHaveBeenCalledWith(USER_FACT_ID);
    expect(stubs.storage.dismissFact).not.toHaveBeenCalled();
  });

  it("Bulk-accept per domain", async () => {
    stubs.storage.bulkAcceptByDomain.mockResolvedValue({ accepted: 4, dismissed: 4 });

    const res = await callRoute(
      "POST",
      `/api/brand-fact-sheet/brands/${BRAND_ID}/bulk-accept`,
      { domain: "offerings", preferSource: "scraped" },
    );
    expect(res.statusCode).toBe(200);
    expect(stubs.storage.bulkAcceptByDomain).toHaveBeenCalledWith(
      BRAND_ID,
      "offerings",
      "scraped",
    );
    expect(JSON.stringify(res.body)).toContain("4");
  });
});
```

- [ ] **Step 3: Run**

Run: `npm test -- tests/integration/factSheetDiffResolution.test.ts 2>&1 | tail -15`
Expected: 4 passes. If Plan 2.3 used a different `bulkAcceptByDomain` route shape, update the URL — but do NOT change the storage-method name (which is owned by Plan 2.1).

---

### Task 12: Migration forward + idempotent + backfill verification

**Files:**
- Create: `tests/migrations/spec2Migrations.test.ts`

**Spec refs:** Spec 2 §5 (all schema migrations), §9 bullets 1, 3, 4.

- [ ] **Step 1: Verify the test DB helper exists**

Run: `grep -rn "TEST_DATABASE_URL\|test database\|pg\.Pool" tests/ server/index.ts | head -10`
Expected: at minimum, `server/index.ts` shows `pool` import + migration loop at `server/index.ts:181-236`. If there's an existing `tests/setup.ts` test-DB helper, reuse it. Otherwise, this test relies on `process.env.TEST_DATABASE_URL` being set in CI.

If no test DB harness exists, halt and report: "Plan 2.6 Task 12 requires a real Postgres test DB. Either set TEST_DATABASE_URL in the test env or document this as a CI-only test."

- [ ] **Step 2: Write the test**

Create `tests/migrations/spec2Migrations.test.ts`:

```ts
// Spec 2 §9 bullet 1: migrations 0058 + 0059 + 0060 apply cleanly,
// are idempotent on re-apply, and §9 bullet 4 backfill creates user-typed
// rows in brand_fact_sheet.
//
// This test connects to TEST_DATABASE_URL (a real Postgres instance) and
// applies the migrations against an isolated schema. Skip when the env var
// is unset so unit-test runs aren't blocked.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";

const url = process.env.TEST_DATABASE_URL;
const SCHEMA = `spec2_test_${Date.now()}`;
const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

const describeIfDb = url ? describe : describe.skip;

describeIfDb("Spec 2 migrations", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    await pool.query(`SET search_path TO ${SCHEMA}, public`);

    // Seed minimal pre-existing tables that the spec 2 migrations reference.
    // We replicate the columns that 0058-0060 read (brand_fact_sheet,
    // brands). Real prior migrations would set these up; this is a
    // self-contained slice.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        description TEXT,
        target_audience TEXT,
        brand_voice TEXT,
        products TEXT[],
        key_values TEXT[],
        unique_selling_points TEXT[]
      );
      CREATE TABLE IF NOT EXISTS brand_fact_sheet (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR NOT NULL,
        fact_category TEXT,
        fact_key TEXT NOT NULL,
        fact_value TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        source_url TEXT,
        last_verified TIMESTAMP
      );
    `);

    // Seed a brand with onboarding-style answers that should be backfilled
    // as source='user' rows.
    await pool.query(`
      INSERT INTO brands (id, description, target_audience, brand_voice, products, key_values, unique_selling_points)
      VALUES (
        '99999999-9999-4999-8999-999999999999',
        'We build CRMs for plumbers.',
        'Independent plumbing contractors',
        'Direct and pragmatic',
        ARRAY['ACME CRM','ACME Mobile']::text[],
        ARRAY['Customer first','Iterate fast']::text[],
        ARRAY['Built by plumbers','Phone support']::text[]
      )
    `);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
    await pool.end();
  });

  async function applyMigration(name: string) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
    await pool.query(sql);
  }

  it("applies 0058 → 0059 → 0060 forward, columns + indexes exist", async () => {
    await applyMigration("0058_brand_fact_scrape_runs.sql");
    await applyMigration("0059_brand_fact_sheet_v2.sql");
    await applyMigration("0060_brand_fact_scrape_caps.sql");

    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
      [SCHEMA],
    );
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toContain("brand_fact_scrape_runs");
    expect(names).toContain("brand_fact_scrape_pages");
    expect(names).toContain("brand_monthly_cost_caps");

    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'brand_fact_sheet'`,
      [SCHEMA],
    );
    const colNames = cols.rows.map((r) => r.column_name);
    for (const expected of [
      "domain", "subcategory", "value_type", "value_payload",
      "confidence", "source_excerpt", "dismissed_at", "accepted_at", "run_id",
    ]) {
      expect(colNames).toContain(expected);
    }
    expect(colNames).not.toContain("fact_category"); // renamed

    const brandCols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'brands' AND column_name = 'fact_scrape_enabled'`,
      [SCHEMA],
    );
    expect(brandCols.rows.length).toBe(1);
  });

  it("re-applies all three migrations idempotently", async () => {
    await applyMigration("0058_brand_fact_scrape_runs.sql");
    await applyMigration("0059_brand_fact_sheet_v2.sql");
    await applyMigration("0060_brand_fact_scrape_caps.sql");
    // No error thrown.
  });

  it("backfills user-typed onboarding answers as source='user' rows", async () => {
    const rows = await pool.query(
      `SELECT domain, subcategory, fact_key, source, value_type
       FROM brand_fact_sheet
       WHERE brand_id = '99999999-9999-4999-8999-999999999999'`,
    );

    const find = (d: string, s: string) =>
      rows.rows.find((r) => r.domain === d && r.subcategory === s && r.source === "user");

    expect(find("identity", "description")).toBeDefined();
    expect(find("positioning", "target_audience")).toBeDefined();
    expect(find("positioning", "brand_voice")).toBeDefined();

    const products = find("offerings", "products");
    expect(products).toBeDefined();
    expect(products.value_type).toBe("array");

    const keyValues = find("positioning", "key_values");
    expect(keyValues).toBeDefined();
    expect(keyValues.value_type).toBe("array");

    const usp = find("positioning", "unique_selling_points");
    expect(usp).toBeDefined();
    expect(usp.value_type).toBe("array");
  });
});
```

- [ ] **Step 3: Run (will skip locally if no TEST_DATABASE_URL)**

Run: `TEST_DATABASE_URL=$TEST_DATABASE_URL npm test -- tests/migrations/spec2Migrations.test.ts 2>&1 | tail -15`
Expected: 3 passes when DB is set; 3 skips otherwise. Document in PR description that CI must have `TEST_DATABASE_URL` configured.

---

### Task 13: Cron job — `detectFactScrapeFailureRate` + unit test

**Files:**
- Modify: `server/scheduler.ts` (add the function + register the cron)
- Create: `tests/unit/detectFactScrapeFailureRate.test.ts`

**Spec refs:** Spec 2 §4.11 (serial-failure alerting), §9 bullet 24.

- [ ] **Step 1: Verify the lock + cronCrashGuard helpers**

Run: `grep -n "lockKeys\|cronCrashGuard\|withAdvisoryLock" server/scheduler.ts | head -10`
Expected: matches at `:10, :563, :575+`. Confirms the helpers exist (Plan 2.6 reuses, doesn't reinvent).

- [ ] **Step 2: Add a new lock key**

Open `server/lib/advisoryLock.ts`, find the `lockKeys` object, and add `factScrapeFailureDetect: <next free number>`. Confirm by running:

Run: `grep -n "lockKeys = " server/lib/advisoryLock.ts && grep -A 15 "lockKeys = {" server/lib/advisoryLock.ts`
Expected: visible object; pick the next unused integer (Plan 2.1 may have already added `factScrape: N` — coordinate by reading the file). Add exactly one line.

- [ ] **Step 3: Add `detectFactScrapeFailureRate` near `runFactRefreshJob`**

Open `server/scheduler.ts`. Locate `runFactRefreshJob` at line `:357-361`. Immediately AFTER that function, append:

```ts
// Spec 2 §4.11: serial-failure alerting.
// Daily at 11 UTC, find brands whose last 3 `triggered_by='cron_refresh'` runs
// in the past 90 days all have `status='failed'` — fire Sentry alert +
// structured log. Customer email notification deferred to v1.5.
export async function detectFactScrapeFailureRate(): Promise<{ alerted: number }> {
  return withAdvisoryLock(lockKeys.factScrapeFailureDetect, "fact-scrape-failure-detect", async () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Group brand_id and grab last 3 cron_refresh runs per brand.
    // Implementation uses a window function — keeps the query bounded.
    const result = await db.execute(sql`
      WITH ranked AS (
        SELECT brand_id, status, error_kind, started_at,
               ROW_NUMBER() OVER (PARTITION BY brand_id ORDER BY started_at DESC) AS rn
        FROM brand_fact_scrape_runs
        WHERE triggered_by = 'cron_refresh'
          AND started_at >= ${ninetyDaysAgo}
      )
      SELECT brand_id,
             array_agg(error_kind ORDER BY rn) FILTER (WHERE rn <= 3) AS error_kinds,
             MAX(started_at) FILTER (WHERE rn = 1) AS last_failure_at,
             bool_and(status = 'failed') FILTER (WHERE rn <= 3) AS all_failed,
             COUNT(*) FILTER (WHERE rn <= 3) AS recent_count
      FROM ranked
      GROUP BY brand_id
      HAVING COUNT(*) FILTER (WHERE rn <= 3) = 3
         AND bool_and(status = 'failed') FILTER (WHERE rn <= 3) = TRUE
    `);

    const rows = (result as any).rows ?? result ?? [];
    let alerted = 0;
    for (const row of rows) {
      const brandId = row.brand_id;
      const errorKinds = row.error_kinds ?? [];
      const lastFailureAt = row.last_failure_at;

      logger.warn(
        { brandId, errorKinds, lastFailureAt, event: "fact_scrape_serial_failure" },
        "Brand has 3 consecutive cron_refresh scrape failures",
      );
      captureAndFlush(
        new Error(`fact_scrape_serial_failure brand=${brandId}`),
        {
          tags: { source: "scheduler:detectFactScrapeFailureRate" },
          extra: { brandId, errorKinds, lastFailureAt },
        },
      );
      alerted += 1;
    }
    return { alerted };
  });
}
```

Also add the necessary imports at the top of `scheduler.ts` if not already present. Run: `grep -n "captureAndFlush\|^import .*sql\b" server/scheduler.ts | head -5` — if `captureAndFlush` is not imported, add `import { captureAndFlush } from "./lib/sentryReport";`. `sql` from `drizzle-orm` should already be present; verify with `grep -n "from \"drizzle-orm\"" server/scheduler.ts`.

- [ ] **Step 4: Register the cron schedule**

Below the existing `FACT_REFRESH_CRON` block at `server/scheduler.ts:617-619`, add:

```ts
const DETECT_FACT_SCRAPE_FAILURE_CRON =
  process.env.DETECT_FACT_SCRAPE_FAILURE_CRON || "0 11 * * *"; // Daily 11 UTC
if (cron.validate(DETECT_FACT_SCRAPE_FAILURE_CRON)) {
  cron.schedule(
    DETECT_FACT_SCRAPE_FAILURE_CRON,
    cronCrashGuard("detect-fact-scrape-failure", detectFactScrapeFailureRate),
  );
  logger.info({ cron: DETECT_FACT_SCRAPE_FAILURE_CRON }, "fact scrape failure detector scheduled");
}
```

- [ ] **Step 5: Write unit test**

Create `tests/unit/detectFactScrapeFailureRate.test.ts`:

```ts
// Spec 2 §4.11: serial-failure detection.
// Mocks db.execute to return rows representing brands with 3 consecutive
// cron_refresh failures; verifies logger.warn + captureAndFlush fire once
// per brand and that the alerted count matches.

import { describe, it, expect, vi, beforeEach } from "vitest";

const stubs = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  captureAndFlush: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: { execute: stubs.dbExecute },
  pool: {},
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: stubs.captureAndFlush }));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: stubs.warn, error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/advisoryLock", () => ({
  withAdvisoryLock: async (_k: number, _n: string, fn: () => Promise<unknown>) => fn(),
  lockKeys: { factScrapeFailureDetect: 42 },
}));

import { detectFactScrapeFailureRate } from "../../server/scheduler";

beforeEach(() => vi.clearAllMocks());

describe("detectFactScrapeFailureRate", () => {
  it("alerts once per brand with 3 consecutive failures", async () => {
    stubs.dbExecute.mockResolvedValue({
      rows: [
        {
          brand_id: "brand-A",
          error_kinds: ["all_pages_4xx", "all_pages_4xx", "robots_disallowed"],
          last_failure_at: new Date("2026-05-10T00:00:00Z"),
          all_failed: true,
          recent_count: 3,
        },
        {
          brand_id: "brand-B",
          error_kinds: ["spa_empty", "spa_empty", "spa_empty"],
          last_failure_at: new Date("2026-05-09T00:00:00Z"),
          all_failed: true,
          recent_count: 3,
        },
      ],
    });

    const { alerted } = await detectFactScrapeFailureRate();
    expect(alerted).toBe(2);
    expect(stubs.warn).toHaveBeenCalledTimes(2);
    expect(stubs.captureAndFlush).toHaveBeenCalledTimes(2);

    // Verify structured fields.
    const firstWarn = stubs.warn.mock.calls[0][0];
    expect(firstWarn.event).toBe("fact_scrape_serial_failure");
    expect(firstWarn.brandId).toBe("brand-A");
    expect(Array.isArray(firstWarn.errorKinds)).toBe(true);

    // Verify Sentry tag.
    const firstSentry = stubs.captureAndFlush.mock.calls[0][1];
    expect(firstSentry.tags.source).toBe("scheduler:detectFactScrapeFailureRate");
  });

  it("alerts zero when no brands meet the threshold", async () => {
    stubs.dbExecute.mockResolvedValue({ rows: [] });
    const { alerted } = await detectFactScrapeFailureRate();
    expect(alerted).toBe(0);
    expect(stubs.warn).not.toHaveBeenCalled();
    expect(stubs.captureAndFlush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run unit test + typecheck**

Run: `npm test -- tests/unit/detectFactScrapeFailureRate.test.ts 2>&1 | tail -10 && npm run check 2>&1 | tail -5`
Expected: 2 passes, 0 tsc errors.

---

### Task 14: Structured metrics log at run completion

**Files:**
- Modify: `server/lib/factAgent/advanceScrapeRun.ts` (single `logger.info` append)

**Spec refs:** Spec 2 §4.8.4 (log hygiene — only metadata), §4.11, §9 bullet 24.

- [ ] **Step 1: Verify Plan 2.2 file exists + locate the run-completion path**

Run: `grep -n "completed\|status.*complete\|finalize" server/lib/factAgent/advanceScrapeRun.ts | head -10`
Expected: at least one match showing where the run reaches a terminal status. Note the file line where the run transitions to `'completed' | 'failed' | 'timeout' | 'cancelled'`.

- [ ] **Step 2: Append the structured log**

In `server/lib/factAgent/advanceScrapeRun.ts`, locate the function that finalizes the run (call it `finalizeRun` or similar — read the actual code). Immediately AFTER the storage call that writes the terminal status (e.g., `updateScrapeRunStatus(runId, terminalStatus, ...)`), add:

```ts
logger.info(
  {
    event: "fact_scrape_run_completed",
    runId,
    brandId: run.brandId,
    status: terminalStatus,
    durationMs: Date.now() - run.startedAt.getTime(),
    pagesFetched: run.pagesFetched,
    factsExtracted: run.factsExtracted,
    llmCostCents: run.llmCostCents,
    llmCalls: run.llmCalls,
    llmInputTokens: run.llmInputTokens,
    llmOutputTokens: run.llmOutputTokens,
    errorKind: run.errorKind ?? null,
  },
  "Fact scrape run completed",
);
```

Variable names must match Plan 2.2's actual local variables — if `run` is named differently or fields are stored on a different object, adjust accordingly. The shape of the log object is fixed (these are the documented Spec 2 §9 metrics) — do NOT add `factValue` or any value-shaped field.

- [ ] **Step 3: Verify no fact values are logged**

Run: `grep -n "logger\.\(info\|warn\|error\|debug\)" server/lib/factAgent/advanceScrapeRun.ts | head -20`
Expected: scan every match. None should reference `factValue`, `value`, `subcategory` AS PART OF a fact-content log payload. Counts/IDs/cents/tokens only.

Run: `grep -nE "logger.*\bvalue\b|logger.*factValue" server/lib/factAgent/advanceScrapeRun.ts`
Expected: no output.

- [ ] **Step 4: Update the happy-path test (Task 1) to assert the log line fires**

Open `tests/integration/factSheetHappyPath.test.ts`. Reach into the mocked logger to assert the completion log fired with the right shape:

```ts
import { logger } from "../../server/lib/logger";

// inside the it():
const completionLog = (logger.info as any).mock.calls.find(
  (c: any[]) => c[0]?.event === "fact_scrape_run_completed",
);
expect(completionLog).toBeDefined();
expect(completionLog[0].runId).toBe(RUN_ID);
expect(completionLog[0].brandId).toBe(BRAND_ID);
expect(typeof completionLog[0].durationMs).toBe("number");
expect(typeof completionLog[0].llmCostCents).toBe("number");
// Critical: no value-shaped keys.
expect(completionLog[0].factValue).toBeUndefined();
expect(completionLog[0].value).toBeUndefined();
```

- [ ] **Step 5: Re-run happy path**

Run: `npm test -- tests/integration/factSheetHappyPath.test.ts 2>&1 | tail -10`
Expected: 1 pass with the new assertion green.

---

### Task 15: Plan-wide verification + log-hygiene grep

**Spec refs:** Spec 2 §9 last bullet (log hygiene), §9 bullet 25 (npm run check clean).

- [ ] **Step 1: Typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 tsc errors.

- [ ] **Step 2: Full test suite**

Run: `npm test 2>&1 | tail -30`
Expected: green baseline. Document any pre-existing flaky tests called out in Track 33 (sourceHealth, redditSource, ssrf, citationCronUnconditional, tour integration/e2e) — these are the only allowed failures (per Spec 2 §9 last bullet).

- [ ] **Step 3: Lint**

Run: `npm run lint 2>&1 | tail -10`
Expected: 0 errors.

- [ ] **Step 4: Log-hygiene grep**

Run: `grep -rnE "logger.*factValue|logger.*\bvalue:\b" server/lib/factAgent/ 2>&1`
Expected: no output. Any match = a Plan 2.6 regression (or a Plan 2.2 bug — report which).

Run: `grep -rnE "console\.(log|error|warn)" server/lib/factAgent/ server/routes/factSheet.ts 2>&1`
Expected: no output. (CLAUDE.md: never `console.log` in server code.)

- [ ] **Step 5: Document the ESLint rule deferral**

Spec 2 §9 last bullet mentions an ESLint rule for log hygiene. Plan 2.6 does NOT implement a custom ESLint rule — that is deferred (v1.5 track). Note this in the PR description:

> Plan 2.6 enforces fact-value log hygiene via the grep in Task 15 step 4 (CI gate). A custom ESLint rule (Spec 2 §9 last bullet) is deferred to v1.5 since CI grep covers the rule's intent with zero new dependencies.

---

### Task 16: Spec 2 success-criteria spot-check (production-readiness gate)

**Spec refs:** Spec 2 §9 (every checkbox).

This is the FINAL task. It is a code-grounded audit of every Spec 2 §9 bullet — not a re-read of the spec. For each bullet, identify the plan + file that closes it and verify the file exists (`ls` / `grep`). If any bullet is uncovered after all 6 plans land, halt and report which one.

- [ ] **Step 1: Walk each Spec 2 §9 checkbox**

For each row below, run the verification command and confirm the expected output.

| # | Spec 2 §9 bullet (abbreviated) | Owner plan | Verification |
|---|---|---|---|
| 1 | Three new migrations 0058/0059/0060 idempotent | Plan 2.1 | `ls migrations/0058_brand_fact_scrape_runs.sql migrations/0059_brand_fact_sheet_v2.sql migrations/0060_brand_fact_scrape_caps.sql` |
| 2 | `brand_fact_scrape_runs` + `brand_fact_scrape_pages` tables | Plan 2.1 | `grep -n "brandFactScrapeRuns\|brandFactScrapePages" shared/schema.ts \| head -4` |
| 3 | `brand_fact_sheet` has new columns; `fact_category` renamed | Plan 2.1 | `grep -n "domain\|valueType\|valuePayload\|subcategory" shared/schema.ts \| head -10` |
| 4 | Backfill user-typed onboarding answers as source='user' | Plan 2.1 + Task 12 here | `grep -c "ON CONFLICT DO NOTHING" migrations/0059_brand_fact_sheet_v2.sql` ≥ 6 |
| 5 | `brands.fact_scrape_enabled` + PATCH route | Plan 2.1 (col) + Plan 2.3 (route) | `grep -rn "fact-scrape-enabled\|factScrapeEnabled" server/routes/ shared/schema.ts \| head -5` |
| 6 | `brand_monthly_cost_caps` table + $5 default | Plan 2.1 | `grep -n "monthly_cap_cents\|500" migrations/0060_brand_fact_scrape_caps.sql` |
| 7 | `POST /api/brand-fact-sheet/runs` returns 200/402/409 | Plan 2.3 + Tasks 9 + 10 here | `grep -rn "brand-fact-sheet/runs" server/routes/ \| head -3` |
| 8 | SSE stream `GET /runs/:runId/stream` | Plan 2.3 | `grep -rn "/runs/:runId/stream\|sse\|flushHeaders" server/routes/factSheet.ts` |
| 9 | Inline-await `POST /api/brand-facts/scrape/:brandId` DELETED | Plan 2.3 | `grep -n "brand-facts/scrape" server/routes/publications.ts` → expected: no match |
| 10 | All four trigger paths create runs with correct triggered_by | Plan 2.3 + 2.5 | `grep -rn "triggered_by\|triggeredBy" server/routes/ server/lib/factAgent/ \| head -10` |
| 11 | Two-phase agent end-to-end | Plan 2.2 + Tasks 1-8 here | `ls server/lib/factAgent/planner.ts server/lib/factAgent/executor.ts server/lib/factAgent/advanceScrapeRun.ts` |
| 12 | 8 industry-tailored prompts + General fallback | Plan 2.2 | `ls server/lib/factAgent/industryPrompts/` → expected: 8 files |
| 13 | Budget caps enforced server-side (≤12 pages, ≤50¢, etc.) | Plan 2.2 | `grep -n "MAX_PAGES\|12\|50\|100000\|5 \* 60" server/lib/factAgent/ \| head -10` |
| 14 | Advisory lock prevents concurrent runs | Plan 2.1 + Task 10 here | `grep -n "tryAcquireScrapeLock" server/lib/advisoryLock.ts server/databaseStorage.ts \| head -3` |
| 15 | `/brand-fact-sheet` page header + diff + resolved sections | Plan 2.4 | `ls client/src/pages/brand-fact-sheet.tsx` |
| 16 | Diff section groups by 8 domains; per-conflict buttons | Plan 2.4 | `ls client/src/components/fact-sheet/ConflictPair.tsx` |
| 17 | Bulk actions (per-domain, page-level) | Plan 2.4 + Task 11 here | `grep -rn "bulkAccept\|bulk-accept" server/routes/factSheet.ts client/src/components/fact-sheet/` |
| 18 | Delta indicators 🆕📝❌ | Plan 2.4 | `grep -rn "isNew\|isChanged\|isRemoved\|delta" client/src/components/fact-sheet/` |
| 19 | Per-page panel SSE live render | Plan 2.4 + Plan 2.5 | `ls client/src/components/fact-sheet/ScrapePagesPanel.tsx client/src/hooks/useScrapeRunStream.ts` |
| 20 | Each failure mode renders explicit `ScrapeFailureState` | Plan 2.4 | `grep -n "all_pages_4xx\|spa_empty\|robots_disallowed\|llm_unavailable\|cost_cap_reached\|timeout" client/src/components/fact-sheet/ScrapeFailureState.tsx` → ≥7 |
| 21 | "Last verified Xd ago" sublines, muted/orange at >90/>180 | Plan 2.4 | `grep -rn "last_verified\|lastVerified\|90\|180" client/src/components/fact-sheet/FactRow.tsx` |
| 22 | SSRF DNS-rebinding hardening | Plan 2.2 | `grep -n "safeFetchTextWithLockedIp" server/lib/factAgent/safeFetchTextWithLockedIp.ts` |
| 23 | No fact value strings logged (ESLint rule) | Task 15 here (grep gate; ESLint rule deferred) | `grep -rnE "logger.*factValue\|logger.*\bvalue:\b" server/lib/factAgent/` → expected: no output |
| 24 | Serial-failure cron + structured metrics | Task 13 + Task 14 here | `grep -n "detectFactScrapeFailureRate\|fact_scrape_run_completed" server/scheduler.ts server/lib/factAgent/advanceScrapeRun.ts` |
| 25 | Tests pass (unit + integration listed) | Plan 2.1/2.2/2.3 + Tasks 1-13 here | `npm test 2>&1 \| tail -5` → baseline green |
| 26 | `npm run check` clean + tour-target verifier passes 28/28 | All plans | `npm run check && node scripts/verify-tour-targets.ts 2>&1 \| tail -3` |
| 27 | Test suite at documented baseline only | Task 15 here | Pre-existing flaky list in spec 2 §9 unchanged |

- [ ] **Step 2: Write findings**

If every checkbox passes its verification, the PR description should state:

> Spec 2 success-criteria audit: all 27 checkboxes verified against landed code. See Plan 2.6 Task 16 for the per-bullet verification commands.

If ANY checkbox fails, halt and report which Plan owes work. Do NOT attempt to fix gaps in Plan 2.6 — gaps in earlier plans must be filed back to those plan owners (Plan 2.1/2.2/2.3/2.4/2.5).

---

## Self-review checklist

Run through this checklist before declaring Plan 2.6 done:

- [ ] All 11 integration test files exist under `tests/integration/factSheet*.test.ts`.
- [ ] `tests/migrations/spec2Migrations.test.ts` exists and runs (or skips cleanly when `TEST_DATABASE_URL` is unset).
- [ ] `tests/unit/detectFactScrapeFailureRate.test.ts` exists, 2 cases.
- [ ] `server/scheduler.ts` exports `detectFactScrapeFailureRate` and registers `DETECT_FACT_SCRAPE_FAILURE_CRON` with default `0 11 * * *`.
- [ ] `lockKeys.factScrapeFailureDetect` exists in `server/lib/advisoryLock.ts`.
- [ ] `server/lib/factAgent/advanceScrapeRun.ts` has exactly ONE new `logger.info` call with `event: 'fact_scrape_run_completed'` and zero fact-value fields.
- [ ] `grep -rnE "logger.*factValue|logger.*\\bvalue:\\b" server/lib/factAgent/` returns nothing.
- [ ] `grep -rnE "console\\.(log|error|warn)" server/lib/factAgent/ server/routes/factSheet.ts` returns nothing.
- [ ] `npm run check` clean.
- [ ] `npm test` green at documented baseline (no new flakes added).
- [ ] `npm run lint` 0 errors.
- [ ] Task 16 audit table: every Spec 2 §9 checkbox has a passing verification command.
- [ ] No new files created outside `tests/`, `server/scheduler.ts`, `server/lib/advisoryLock.ts`, and `server/lib/factAgent/advanceScrapeRun.ts`.
- [ ] No git mutating commands run.
