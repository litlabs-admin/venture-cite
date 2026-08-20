# Spec 2 — Plan 2.3: SSE Streaming + Run Lifecycle Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the HTTP surface for the Brand Fact Sheet redesign — one new route file (`server/routes/factSheet.ts`) exposing the run lifecycle endpoints (create / get / list / cancel), the SSE streaming endpoint that mirrors `server/routes/assistant.ts:172-420` (heartbeat, abort, flushHeaders, DB-polled state reads, reconnect via `last_event_id`), the fact accept/dismiss/bulk-accept endpoints, the diff query endpoint, the fact-scrape-enabled toggle, and the deletion of the legacy inline-await `POST /api/brand-facts/scrape/:brandId` block at `server/routes/publications.ts:51-69`. Plus the client-side `useScrapeRunStream` hook scaffold for Plan 2.4 to consume. No agent pipeline (Plan 2.2's `advanceScrapeRun` is consumed as a black box). No UI components (Plan 2.4/2.5).

**Architecture:** A single new route file `server/routes/factSheet.ts` registered from `server/routes.ts`. All routes wrapped in `isAuthenticated` from `server/auth.ts` and ownership-checked via `requireUser` + `requireBrand` from `server/lib/ownership.ts:33-41`. The SSE streamer reads run state + per-page state + new fact rows from the DB on a 500ms tick (no in-memory continuation), emits named SSE events, sends a 15s heartbeat (`: heartbeat\n\n`) to keep intermediate proxies awake, listens for `req.on("close")` to set an abort flag, and exits cleanly on terminal status or after a ~50s wall-clock budget (Vercel `maxDuration: 60` per `vercel.json:7`). Clients reconnect with `?last_event_id=<pageMaxId>:<factMaxId>` to resume mid-run without duplicate events. Storage methods from Plan 2.1 (`getScrapeRunById`, `listScrapePagesForRun`, `transitionScrapeRunStatusCAS`, `getBrandFactSheetConflicts`, `acceptFact`, `dismissFact`, `getMonthlyCostCap`, `setBrandFactScrapeEnabled`, etc.) are consumed unchanged. Plan 2.2 ships `advanceScrapeRun(runId, deadlineMs)` — Plan 2.3 dispatches it via `waitUntil` from `@vercel/functions` at run-creation time.

**Tech Stack:** Express 4 (ESM), Drizzle ORM, Zod, Vitest. Existing patterns: `asyncHandler`, `requireUser`, `requireBrand`, `OwnershipError → err.status`, `sendError`. `waitUntil` from `@vercel/functions` (already used at `server/routes/onboarding.ts:460`). No new dependencies.

**Hard rules for all subagents:**

- ❌ NEVER run ANY git mutating command: `git commit`, `git add`, `git rm`, `git mv`, `git stash`, `git stash pop`, `git stash drop`, `git stash apply`, `git reset`, `git restore`, `git checkout` (when it discards), `git push`, `git pull`, `git fetch --prune`, `git rebase`, `git merge`, `git branch -D`, `git branch -m`, `git switch` (with dirty changes), `git clean`. Read-only is fine: `git status`, `git diff`, `git log`, `git show`, `git blame`, `git branch` (list).
- ❌ Do NOT trust .md files in this repo — verify every claim against code at the cited file:line.
- ❌ Do NOT add features beyond what each task says. This plan is HTTP + SSE only. No agent code, no UI components beyond the SSE consumer hook scaffold, no schema changes (Plan 2.1 already shipped them).
- ❌ Do NOT mirror the older `/api/onboarding/scrape-stream` pattern at `server/routes/onboarding.ts:104-355`. Spec 2 §4.5 explicitly cautions against it — that handler has no heartbeat, no `req.on("close")` abort handling, and an in-memory dedupe Map that would break under Vercel's per-instance isolation. Mirror `server/routes/assistant.ts:293-312` instead.
- ❌ Do NOT log fact values verbatim anywhere (Spec 2 §4.8.4). Logger field allowlist: `{ brandId, runId, domain, subcategory, factKey, valueType, confidence, sourceUrl }`. Never `factValue`, never `valuePayload`, never `sourceExcerpt`.
- ❌ Do NOT delete or rename any existing route except the explicit `publications.ts:51-69` block. Existing `GET/POST/PATCH/DELETE /api/brand-facts*` at `server/routes/intelligence.ts:451-525` stays untouched (Spec 2 §6).
- ❌ Do NOT use `EventSource` on the client — it can't pass `Authorization: Bearer` headers (Spec 2 §4.5 final paragraph). Use manual `fetch` + `getReader()` framing per `client/src/pages/welcome.tsx:170-249`.
- ❌ Do NOT keep any in-memory state between SSE ticks. Every event is derived from a DB read. This is what makes the route Vercel-safe across function instances.

---

## File Structure

**Routes created:**

- `server/routes/factSheet.ts` — new dedicated route file exporting `setupFactSheetRoutes(app: Express)`. Hosts:
  - `POST   /api/brand-fact-sheet/runs`
  - `GET    /api/brand-fact-sheet/runs/:runId`
  - `GET    /api/brand-fact-sheet/runs/:runId/stream` (SSE)
  - `POST   /api/brand-fact-sheet/runs/:runId/cancel`
  - `GET    /api/brand-fact-sheet/runs?brandId=...`
  - `POST   /api/brand-fact-sheet/facts/:factId/accept`
  - `POST   /api/brand-fact-sheet/facts/:factId/dismiss`
  - `POST   /api/brand-fact-sheet/facts/bulk-accept`
  - `GET    /api/brand-fact-sheet/diff?brandId=...`
  - `PATCH  /api/brands/:brandId/fact-scrape-enabled`

**Routes modified:**

- `server/routes.ts` — register `setupFactSheetRoutes(app)` next to the other `setup*Routes` calls (around the `setupPublicationsRoutes(app)` line at `:736` and `setupAssistantRoutes(app)` at `:744`).
- `server/routes/publications.ts` — delete the `POST /api/brand-facts/scrape/:brandId` block at `:51-69` (Spec 2 §4.10 mandates this — the new `POST /api/brand-fact-sheet/runs` replaces it).

**Client created:**

- `client/src/hooks/useScrapeRunStream.ts` — TanStack-Query-free hook that opens an SSE connection via manual `fetch` + `getReader()` framing (mirrors `client/src/pages/welcome.tsx:170-249`). Exposes `{events, status, isStreaming, error, start, stop}`. Supports reconnect with `?last_event_id=...`. Plan 2.4 consumes this hook; Plan 2.3 ships ONLY the hook with no UI components.

**Tests created:**

- `tests/unit/factSheetRunsCreate.test.ts` — 6 cases for `POST /runs` (fact_scrape_disabled 409, cost cap 402, already-running 409, success path, ownership 404, rate-limit 429).
- `tests/unit/factSheetRunsGet.test.ts` — 3 cases for `GET /runs/:runId` (success, cross-tenant 404, not-found 404).
- `tests/unit/factSheetRunsCancel.test.ts` — 3 cases (cancel pending → success, cancel completed → 409, cross-tenant 404).
- `tests/unit/factSheetRunsList.test.ts` — 2 cases (success ordered by `startedAt DESC`, ownership 404).
- `tests/unit/factSheetSseStream.test.ts` — 6 cases (event framing, heartbeat fires, abort cleanup, terminal status closes, slice_pending exit with cursor, reconnect with `last_event_id` filters out already-seen rows).
- `tests/unit/factSheetFactsAcceptDismiss.test.ts` — 5 cases (accept side, dismiss side, accept with dismissOtherSide, bulk-accept domain filter, ownership 404).
- `tests/unit/factSheetDiff.test.ts` — 3 cases (returns conflicts, returns resolved, brandId required).
- `tests/unit/factSheetEnabledToggle.test.ts` — 2 cases (enable→disable, ownership 404).

---

### Task 1: Scaffold `server/routes/factSheet.ts` and register it

**Files:**

- Create: `server/routes/factSheet.ts`
- Modify: `server/routes.ts` (add import + setup call)

- [ ] **Step 1: Locate the existing setup call site**

Run: `grep -n "setupAssistantRoutes\|setupPublicationsRoutes" server/routes.ts`
Expected:
```
73:import { setupOnboardingRoutes } from "./routes/onboarding";
84:import { setupPublicationsRoutes } from "./routes/publications";
93:import { setupAssistantRoutes } from "./routes/assistant";
190:  setupOnboardingRoutes(app);
736:  setupPublicationsRoutes(app);
744:  setupAssistantRoutes(app);
```

If the line numbers differ, adjust the insert location in step 3 accordingly.

- [ ] **Step 2: Create the scaffold file**

Create `server/routes/factSheet.ts` with exactly this content (subsequent tasks fill in each route handler):

```ts
// Spec 2: Brand Fact Sheet redesign — run lifecycle + SSE + diff endpoints.
//
// REST surface:
//   POST   /api/brand-fact-sheet/runs                          create scrape run
//   GET    /api/brand-fact-sheet/runs/:runId                   read run + per-page state
//   GET    /api/brand-fact-sheet/runs/:runId/stream            SSE progress stream
//   POST   /api/brand-fact-sheet/runs/:runId/cancel            transition to 'cancelled' (CAS)
//   GET    /api/brand-fact-sheet/runs?brandId=                 list recent runs
//   POST   /api/brand-fact-sheet/facts/:factId/accept          stamp accepted_at
//   POST   /api/brand-fact-sheet/facts/:factId/dismiss         stamp dismissed_at
//   POST   /api/brand-fact-sheet/facts/bulk-accept             bulk-accept by side+domain
//   GET    /api/brand-fact-sheet/diff?brandId=                 returns conflicts + resolved
//   PATCH  /api/brands/:brandId/fact-scrape-enabled            toggle pause
//
// All routes scope by ownership via `requireUser` + `requireBrand` (or
// per-fact ownership through brand FK). 404 (not 403) on cross-tenant miss
// per anti-enumeration policy.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { requireUser, requireBrand, OwnershipError } from "../lib/ownership";
import { asyncHandler } from "../lib/asyncHandler";
import { sendError, aiLimitMiddleware } from "../lib/routesShared";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import { waitUntil } from "@vercel/functions";
// Plan 2.2 ships advanceScrapeRun. Import will resolve once that plan lands.
import { advanceScrapeRun } from "../lib/factAgent/advanceScrapeRun";

const SSE_SLICE_BUDGET_MS = 50_000;        // < vercel.json maxDuration: 60s
const SSE_TICK_MS = 500;
const SSE_HEARTBEAT_MS = 15_000;
const RUN_DEADLINE_MS = 50_000;            // initial slice budget for advance

export function setupFactSheetRoutes(app: Express): void {
  // Tasks 2-11 fill in routes here.
}
```

- [ ] **Step 3: Register the setup call in `server/routes.ts`**

Modify `server/routes.ts`. Add the import next to the existing fact-sheet-adjacent imports (after `setupAssistantRoutes` at line 93):

```ts
import { setupFactSheetRoutes } from "./routes/factSheet";
```

Add the setup call after the existing `setupAssistantRoutes(app);` line at `:744`:

```ts
setupFactSheetRoutes(app);
```

- [ ] **Step 4: Verify `aiLimitMiddleware` and `waitUntil` import paths**

Run: `grep -n "export.*aiLimitMiddleware\|export.*sendError" server/lib/routesShared.ts | head -5`
Expected: both export names appear.

Run: `grep -n "waitUntil" server/routes/onboarding.ts | head -3`
Expected: `import { waitUntil } from "@vercel/functions";` and at least one `waitUntil(...)` call near `:460`.

- [ ] **Step 5: Typecheck the scaffold compiles**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 tsc errors. (The import of `advanceScrapeRun` will fail if Plan 2.2 hasn't landed yet — temporarily stub it as `const advanceScrapeRun = async (_runId: string, _deadlineMs: number) => {};` until Plan 2.2's file exists. Document this stub in a `// TODO(plan-2.2)` comment.)

---

### Task 2: `POST /api/brand-fact-sheet/runs` — create-run endpoint

**Files:**

- Modify: `server/routes/factSheet.ts`
- Create: `tests/unit/factSheetRunsCreate.test.ts`

**References:** Spec 2 §4.1, §4.10, §6 (API table row 1). Storage methods consumed (all from Plan 2.1): `getMonthlyCostCap`, `createScrapeRun`, `listScrapeRunsForBrand` (used to detect in-flight runs).

- [ ] **Step 1: Add the route handler inside `setupFactSheetRoutes`**

Append to `setupFactSheetRoutes` body in `server/routes/factSheet.ts`:

```ts
const createRunSchema = z.object({
  brandId: z.string().min(1),
});

app.post(
  "/api/brand-fact-sheet/runs",
  isAuthenticated,
  aiLimitMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = requireUser(req);
      const parsed = createRunSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid request",
        });
      }
      const { brandId } = parsed.data;
      const brand = await requireBrand(brandId, user.id);

      // Spec 2 §4.6 / §6: pause toggle gates all triggers.
      if (brand.factScrapeEnabled === false) {
        return res.status(409).json({
          success: false,
          code: "fact_scrape_disabled",
          error: "Fact scraping is paused for this brand.",
        });
      }

      // Spec 2 §4.9: per-brand monthly $5 cap.
      const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
      const cap = await storage.getMonthlyCostCap(brandId, monthKey);
      if (cap && cap.factScrapeCents >= cap.monthlyCapCents) {
        return res.status(402).json({
          success: false,
          code: "cost_cap_reached",
          error: "Monthly fact-scrape budget reached. Resets on day 1 of next month.",
        });
      }

      // Spec 2 §4.9: one concurrent run per brand.
      const recent = await storage.listScrapeRunsForBrand(brandId, 5);
      const inFlight = recent.find((r) =>
        ["pending", "planning", "fetching", "extracting", "slice_pending"].includes(r.status),
      );
      if (inFlight) {
        return res.status(409).json({
          success: false,
          code: "already_running",
          runId: inFlight.id,
          error: "A scrape is already in progress for this brand.",
        });
      }

      const run = await storage.createScrapeRun({
        brandId,
        status: "pending",
        triggeredBy: "manual_rescrape",
      });

      logger.info(
        { brandId, runId: run.id, triggeredBy: "manual_rescrape" },
        "factSheet.runs.create: dispatched",
      );

      // Spec 2 §4.1: dispatch via waitUntil so the HTTP response returns
      // immediately. advanceScrapeRun is owned by Plan 2.2.
      waitUntil(
        advanceScrapeRun(run.id, Date.now() + RUN_DEADLINE_MS).catch((err) => {
          captureAndFlush(err, {
            tags: { source: "factSheet.runs.create", runId: run.id },
          });
        }),
      );

      return res.status(200).json({ success: true, runId: run.id });
    } catch (error) {
      if (error instanceof OwnershipError) {
        return res.status(error.status).json({ success: false, error: error.message });
      }
      return sendError(res, error, "Failed to create scrape run");
    }
  }),
);
```

- [ ] **Step 2: Add the unit tests**

Create `tests/unit/factSheetRunsCreate.test.ts`. Mock `storage`, `requireBrand`, and `advanceScrapeRun`. One test per branch:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));

vi.mock("@vercel/functions", () => ({ waitUntil: (p: any) => p }));

vi.mock("../../server/lib/factAgent/advanceScrapeRun", () => ({
  advanceScrapeRun: vi.fn().mockResolvedValue(undefined),
}));

const reqBrand = vi.fn();
vi.mock("../../server/lib/ownership", async () => {
  const actual = await vi.importActual<any>("../../server/lib/ownership");
  return {
    ...actual,
    requireBrand: (id: string, userId: string) => reqBrand(id, userId),
  };
});

const storageMock = {
  getMonthlyCostCap: vi.fn(),
  listScrapeRunsForBrand: vi.fn(),
  createScrapeRun: vi.fn(),
};
vi.mock("../../server/storage", () => ({ storage: storageMock }));

vi.mock("../../server/lib/routesShared", async () => {
  const actual = await vi.importActual<any>("../../server/lib/routesShared");
  return {
    ...actual,
    aiLimitMiddleware: (_req: any, _res: any, next: any) => next(),
  };
});

import { setupFactSheetRoutes } from "../../server/routes/factSheet";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupFactSheetRoutes(app);
  return app;
}

describe("POST /api/brand-fact-sheet/runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reqBrand.mockResolvedValue({ id: "brand-1", userId: "user-1", factScrapeEnabled: true });
    storageMock.getMonthlyCostCap.mockResolvedValue(null);
    storageMock.listScrapeRunsForBrand.mockResolvedValue([]);
    storageMock.createScrapeRun.mockResolvedValue({ id: "run-1" });
  });

  it("returns 200 + runId on success", async () => {
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/runs")
      .send({ brandId: "brand-1" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, runId: "run-1" });
    expect(storageMock.createScrapeRun).toHaveBeenCalledWith({
      brandId: "brand-1",
      status: "pending",
      triggeredBy: "manual_rescrape",
    });
  });

  it("returns 409 fact_scrape_disabled when paused", async () => {
    reqBrand.mockResolvedValue({ id: "brand-1", userId: "user-1", factScrapeEnabled: false });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/runs")
      .send({ brandId: "brand-1" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("fact_scrape_disabled");
  });

  it("returns 402 cost_cap_reached at monthly cap", async () => {
    storageMock.getMonthlyCostCap.mockResolvedValue({ factScrapeCents: 500, monthlyCapCents: 500 });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/runs")
      .send({ brandId: "brand-1" });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe("cost_cap_reached");
  });

  it("returns 409 already_running when an in-flight run exists", async () => {
    storageMock.listScrapeRunsForBrand.mockResolvedValue([
      { id: "run-running", status: "fetching" },
    ]);
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/runs")
      .send({ brandId: "brand-1" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("already_running");
    expect(res.body.runId).toBe("run-running");
  });

  it("returns 404 on cross-tenant brand", async () => {
    reqBrand.mockRejectedValue(new (await import("../../server/lib/ownership")).OwnershipError(404, "Brand not found"));
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/runs")
      .send({ brandId: "brand-other" });
    expect(res.status).toBe(404);
  });

  it("returns 400 on missing brandId", async () => {
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/runs")
      .send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run the new tests**

Run: `npm test -- tests/unit/factSheetRunsCreate.test.ts 2>&1 | tail -15`
Expected: all 6 tests passing.

---

### Task 3: `GET /api/brand-fact-sheet/runs/:runId` — read run + pages

**Files:**

- Modify: `server/routes/factSheet.ts`
- Create: `tests/unit/factSheetRunsGet.test.ts`

**References:** Spec 2 §6 row 2. Storage methods: `getScrapeRunById`, `listScrapePagesForRun` (both Plan 2.1).

- [ ] **Step 1: Add the route handler**

Append inside `setupFactSheetRoutes`:

```ts
app.get(
  "/api/brand-fact-sheet/runs/:runId",
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = requireUser(req);
      const run = await storage.getScrapeRunById(req.params.runId);
      if (!run) {
        return res.status(404).json({ success: false, error: "Run not found" });
      }
      // Ownership: load brand to verify user.id matches; anti-enumeration 404.
      await requireBrand(run.brandId, user.id);

      const pages = await storage.listScrapePagesForRun(run.id);
      return res.status(200).json({ success: true, run, pages });
    } catch (error) {
      if (error instanceof OwnershipError) {
        // Cross-tenant returns the same 404 shape as not-found.
        return res.status(404).json({ success: false, error: "Run not found" });
      }
      return sendError(res, error, "Failed to load run");
    }
  }),
);
```

- [ ] **Step 2: Tests**

Create `tests/unit/factSheetRunsGet.test.ts`. Use the same `vi.mock` scaffolding as Task 2. Test cases:

1. **success** — `getScrapeRunById` returns a run; `requireBrand` resolves; expect `{run, pages}` 200.
2. **cross-tenant 404** — `getScrapeRunById` returns a run for a different user's brand; `requireBrand` rejects with `OwnershipError(404)`; expect 404, body `{success:false, error:"Run not found"}` (NOT "Brand not found" — anti-enumeration).
3. **not-found 404** — `getScrapeRunById` returns `null`; expect 404.

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/unit/factSheetRunsGet.test.ts 2>&1 | tail -10`
Expected: all 3 passing.

---

### Task 4: `POST /api/brand-fact-sheet/runs/:runId/cancel` — atomic CAS

**Files:**

- Modify: `server/routes/factSheet.ts`
- Create: `tests/unit/factSheetRunsCancel.test.ts`

**References:** Spec 2 §6 row 4, §4.9 (advisory lock + CAS). Storage: `getScrapeRunById`, `transitionScrapeRunStatusCAS` (Plan 2.1).

- [ ] **Step 1: Add the route handler**

Append:

```ts
const TERMINAL_STATUSES = ["completed", "failed", "timeout", "cancelled"];

app.post(
  "/api/brand-fact-sheet/runs/:runId/cancel",
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = requireUser(req);
      const run = await storage.getScrapeRunById(req.params.runId);
      if (!run) {
        return res.status(404).json({ success: false, error: "Run not found" });
      }
      await requireBrand(run.brandId, user.id);

      if (TERMINAL_STATUSES.includes(run.status)) {
        return res.status(409).json({
          success: false,
          code: "already_terminal",
          status: run.status,
          error: "Run is already in a terminal state.",
        });
      }

      // CAS: atomic transition only if status is still non-terminal.
      // transitionScrapeRunStatusCAS returns the row if the transition applied,
      // or null if another caller already moved it to a terminal state.
      const updated = await storage.transitionScrapeRunStatusCAS(
        run.id,
        run.status,
        "cancelled",
      );
      if (!updated) {
        return res.status(409).json({
          success: false,
          code: "status_changed",
          error: "Run status changed before cancel could apply.",
        });
      }

      logger.info({ runId: run.id, brandId: run.brandId }, "factSheet.runs.cancel: ok");
      return res.status(200).json({ success: true });
    } catch (error) {
      if (error instanceof OwnershipError) {
        return res.status(404).json({ success: false, error: "Run not found" });
      }
      return sendError(res, error, "Failed to cancel run");
    }
  }),
);
```

- [ ] **Step 2: Tests**

Create `tests/unit/factSheetRunsCancel.test.ts` covering:

1. **success** — run status `pending`, CAS returns updated row → 200 `{success:true}`.
2. **already terminal 409** — run status `completed` → 409 `code:"already_terminal"`.
3. **cross-tenant 404** — `requireBrand` rejects → 404.

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/unit/factSheetRunsCancel.test.ts 2>&1 | tail -10`
Expected: 3 passing.

---

### Task 5: `GET /api/brand-fact-sheet/runs?brandId=...&limit=10` — list recent runs

**Files:**

- Modify: `server/routes/factSheet.ts`
- Create: `tests/unit/factSheetRunsList.test.ts`

**References:** Spec 2 §6 row 5. Storage: `listScrapeRunsForBrand` (Plan 2.1).

- [ ] **Step 1: Add the route handler**

```ts
const listRunsSchema = z.object({
  brandId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

app.get(
  "/api/brand-fact-sheet/runs",
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = requireUser(req);
      const parsed = listRunsSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid query",
        });
      }
      const { brandId, limit } = parsed.data;
      await requireBrand(brandId, user.id);
      const runs = await storage.listScrapeRunsForBrand(brandId, limit);
      return res.status(200).json({ success: true, runs });
    } catch (error) {
      if (error instanceof OwnershipError) {
        return res.status(error.status).json({ success: false, error: error.message });
      }
      return sendError(res, error, "Failed to list runs");
    }
  }),
);
```

- [ ] **Step 2: Tests**

Create `tests/unit/factSheetRunsList.test.ts`:

1. **success** — returns runs in DESC order from storage.
2. **404 on cross-tenant brand** — `requireBrand` rejects → 404.

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/unit/factSheetRunsList.test.ts 2>&1 | tail -10`
Expected: 2 passing.

---

### Task 6: `GET /api/brand-fact-sheet/runs/:runId/stream` — SSE streaming route (centerpiece)

**Files:**

- Modify: `server/routes/factSheet.ts`
- Create: `tests/unit/factSheetSseStream.test.ts`

**References:** Spec 2 §4.5 (full event protocol), §4.1 (slice-resumable model). Mirror reference: `server/routes/assistant.ts:293-312` for headers + heartbeat + abort. Anti-pattern: `server/routes/onboarding.ts:104-355` (no heartbeat, no abort, in-memory dedupe Map — do NOT mirror). Storage methods consumed: `getScrapeRunById`, `listScrapePagesForRun`, plus a new `listFactsForRunSince(runId, sinceFactId)` consumer pattern (Plan 2.1 ships `getBrandFactSheetConflicts`; the SSE loop needs run-scoped facts — see Step 1 inline implementation using existing storage primitives, no new method required).

- [ ] **Step 1: Add the SSE route handler**

This is the centerpiece. Append to `setupFactSheetRoutes`. **Do not elide.** Full handler:

```ts
// Reconnect cursor format: "<lastPageId>:<lastFactId>" (both ascending row ids).
// Both halves optional; an empty half = -infinity (replay from start).
function parseLastEventId(raw: string | undefined): { lastPageId: string; lastFactId: string } {
  if (!raw) return { lastPageId: "", lastFactId: "" };
  const [p = "", f = ""] = raw.split(":");
  return { lastPageId: p, lastFactId: f };
}

function sseWrite(res: Response, event: string, data: unknown): void {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Write after end — ignore.
  }
}

const TERMINAL_FOR_STREAM = ["completed", "failed", "timeout", "cancelled"];

app.get(
  "/api/brand-fact-sheet/runs/:runId/stream",
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    // ---- Pre-flush auth/ownership check (returns JSON on failure) ----
    let runIdInitial: string;
    let userIdInitial: string;
    try {
      const user = requireUser(req);
      const initialRun = await storage.getScrapeRunById(req.params.runId);
      if (!initialRun) {
        return res.status(404).json({ success: false, error: "Run not found" });
      }
      await requireBrand(initialRun.brandId, user.id);
      runIdInitial = initialRun.id;
      userIdInitial = user.id;
    } catch (error) {
      if (error instanceof OwnershipError) {
        return res.status(404).json({ success: false, error: "Run not found" });
      }
      return sendError(res, error, "Failed to open stream");
    }

    // ---- Open SSE response (mirrors assistant.ts:293-297) ----
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let aborted = false;
    req.on("close", () => {
      aborted = true;
    });

    // 15s heartbeat (mirrors assistant.ts:304-312). Comment-line ": ..." per
    // SSE spec — keeps intermediate proxies from closing the connection.
    const heartbeat = setInterval(() => {
      if (!aborted) {
        try {
          res.write(": heartbeat\n\n");
        } catch {
          // ignore
        }
      }
    }, SSE_HEARTBEAT_MS);

    // Reconnect cursors — start from query param if reconnecting, else 0.
    const lastEventId =
      (req.query.last_event_id as string | undefined) ||
      (req.headers["last-event-id"] as string | undefined);
    let { lastPageId, lastFactId } = parseLastEventId(lastEventId);

    let planEmitted = false;
    let progressLastEmitAt = 0;
    const startedAt = Date.now();

    try {
      // Main loop: poll every 500ms.
      while (!aborted) {
        const now = Date.now();
        const elapsed = now - startedAt;

        // Time-box this slice. Vercel maxDuration=60s (vercel.json:7).
        if (elapsed >= SSE_SLICE_BUDGET_MS) {
          // Client should reconnect with cursors to resume.
          sseWrite(res, "slice_pending", {
            lastEventId: `${lastPageId}:${lastFactId}`,
            reason: "slice_budget_reached",
          });
          break;
        }

        // Re-read run state every tick (no in-memory caching — DB is source of truth).
        const run = await storage.getScrapeRunById(runIdInitial);
        if (!run) {
          sseWrite(res, "error", { kind: "not_found", message: "Run disappeared" });
          break;
        }

        // Emit plan once when planning has produced a URL list.
        if (!planEmitted && run.plan) {
          sseWrite(res, "plan", { plan: run.plan, expectedLanguages: (run.plan as any)?.expectedLanguages ?? [] });
          planEmitted = true;
        }

        // Pages: new rows since lastPageId (id > lastPageId, ASC).
        const pages = await storage.listScrapePagesForRun(runIdInitial);
        for (const p of pages) {
          if (lastPageId === "" || p.id > lastPageId) {
            sseWrite(res, "page", {
              id: p.id,
              url: p.url,
              status: p.status,
              factCount: p.factCount ?? 0,
              bytes: p.bytes ?? null,
              errorKind: p.errorKind ?? null,
              lang: p.lang ?? null,
            });
            lastPageId = p.id;
          }
        }

        // Facts: new rows extracted in this run since lastFactId. Plan 2.1
        // exposes brand-level queries; for run-scoped facts we filter on the
        // run_id column added by migration 0059. Storage exposes
        // `listFactsByRunIdSince(runId, sinceId, limit)`.
        const facts = await storage.listFactsByRunIdSince(runIdInitial, lastFactId, 100);
        for (const f of facts) {
          // NEVER log factValue/valuePayload/sourceExcerpt — Spec 2 §4.8.4.
          sseWrite(res, "fact", {
            id: f.id,
            domain: f.domain,
            subcategory: f.subcategory,
            factKey: f.factKey,
            factValue: f.factValue,
            valueType: f.valueType,
            valuePayload: f.valuePayload,
            confidence: f.confidence,
            sourceUrl: f.sourceUrl,
            sourceExcerpt: f.sourceExcerpt,
          });
          lastFactId = f.id;
        }

        // Progress: every 2s regardless of new rows.
        if (now - progressLastEmitAt >= 2_000) {
          sseWrite(res, "progress", {
            status: run.status,
            pagesDone: run.pagesFetched ?? 0,
            pagesTotal: run.pagesPlanned ?? 0,
            factsExtracted: run.factsExtracted ?? 0,
            costCents: run.llmCostCents ?? 0,
          });
          progressLastEmitAt = now;
        }

        // Error transition.
        if (run.errorKind && run.status === "failed") {
          sseWrite(res, "error", {
            kind: run.errorKind,
            message: run.errorMessage ?? "",
          });
        }

        // Terminal: emit done + close.
        if (TERMINAL_FOR_STREAM.includes(run.status)) {
          sseWrite(res, "done", {
            status: run.status,
            stats: {
              pagesFetched: run.pagesFetched ?? 0,
              factsExtracted: run.factsExtracted ?? 0,
              costCents: run.llmCostCents ?? 0,
              errorKind: run.errorKind ?? null,
            },
          });
          break;
        }

        // Tick.
        await new Promise((r) => setTimeout(r, SSE_TICK_MS));
      }
    } catch (err) {
      captureAndFlush(err, {
        tags: { source: "factSheet.runs.stream", runId: runIdInitial },
      });
      if (!aborted) {
        sseWrite(res, "error", {
          kind: "stream_error",
          message: "Streaming halted unexpectedly.",
        });
      }
      logger.warn({ runId: runIdInitial, userId: userIdInitial }, "factSheet.runs.stream: caught");
    } finally {
      clearInterval(heartbeat);
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  }),
);
```

- [ ] **Step 2: Document the anti-pattern citation in code comment**

Add this comment block immediately above the SSE handler:

```ts
// SSE handler — mirrors server/routes/assistant.ts:293-312 (the correct
// reference). DO NOT mirror server/routes/onboarding.ts:104-355 — that handler
// is older and lacks: (a) 15s heartbeat (proxies time out at 30s+),
// (b) req.on("close") abort handling (leaks setIntervals on disconnect),
// (c) per-instance safety (uses an in-memory dedupe Map that breaks across
// Vercel function instances). Spec 2 §4.5 explicitly cautions against the
// onboarding pattern for this exact reason.
```

- [ ] **Step 3: Add storage method assertion in plan-wide notes**

Note for Plan 2.1 owners (if not already added): the SSE loop requires `storage.listFactsByRunIdSince(runId: string, sinceId: string, limit: number): Promise<BrandFactSheet[]>`. This is a thin wrapper over the existing `brand_fact_sheet` table filtered by `run_id = ? AND id > ? ORDER BY id ASC LIMIT ?`. If Plan 2.1 didn't ship it, Task 6 includes a self-contained inline query via raw Drizzle as a fallback. Document this dependency in the implementation log.

- [ ] **Step 4: Tests**

Create `tests/unit/factSheetSseStream.test.ts`. Use `supertest` against a captured stream. Mock `storage.getScrapeRunById` to return progressively-evolving state across ticks. Cases:

1. **event framing** — first tick emits `event: progress\ndata: {...}\n\n`. Parse stream output, verify framing.
2. **heartbeat fires** — fast-forward 16s with vi.useFakeTimers; verify `: heartbeat\n\n` written.
3. **abort cleanup** — call `req.destroy()` mid-stream; verify `aborted` set, interval cleared (no further writes after close).
4. **terminal status closes** — `getScrapeRunById` returns `status='completed'` on second tick; verify `event: done` emitted and `res.end()` called.
5. **slice_pending exit** — fake-timer past 50s with still-non-terminal status; verify `event: slice_pending` emitted with cursor `lastPageId:lastFactId`.
6. **reconnect via `last_event_id`** — open with `?last_event_id=page-5:fact-10`; mock storage to return pages including id `page-3`, `page-7`; verify only `page-7` emitted (cursor filter works).

- [ ] **Step 5: Run the SSE tests**

Run: `npm test -- tests/unit/factSheetSseStream.test.ts 2>&1 | tail -20`
Expected: all 6 passing.

- [ ] **Step 6: Manual smoke (only if dev env available)**

Run: `npm run dev` in one terminal, then in another:
```
curl -N -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/brand-fact-sheet/runs/<runId>/stream
```
Expected: continuous `event: progress` frames every 2s, `: heartbeat` lines every 15s.

---

### Task 7: `POST /api/brand-fact-sheet/facts/:factId/accept` and `/dismiss`

**Files:**

- Modify: `server/routes/factSheet.ts`
- Create: `tests/unit/factSheetFactsAcceptDismiss.test.ts`

**References:** Spec 2 §6 rows 6-7, §4.6 (Use mine / Use AI's semantics). Storage: `acceptFact`, `dismissFact`, `getBrandFactById` (Plan 2.1 — `getBrandFactById` is an existing method; verify with `grep -n "getBrandFactById" server/storage.ts`).

- [ ] **Step 1: Add the accept route**

```ts
const acceptFactSchema = z.object({
  dismissOtherSide: z.boolean().optional().default(false),
});

app.post(
  "/api/brand-fact-sheet/facts/:factId/accept",
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = requireUser(req);
      const parsed = acceptFactSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid request",
        });
      }
      const fact = await storage.getBrandFactById(req.params.factId);
      if (!fact) {
        return res.status(404).json({ success: false, error: "Fact not found" });
      }
      await requireBrand(fact.brandId, user.id);

      const updated = await storage.acceptFact(fact.id, {
        dismissOtherSide: parsed.data.dismissOtherSide,
      });
      logger.info(
        {
          brandId: fact.brandId,
          factId: fact.id,
          domain: fact.domain,
          subcategory: fact.subcategory,
          factKey: fact.factKey,
        },
        "factSheet.facts.accept",
      );
      return res.status(200).json({ success: true, fact: updated });
    } catch (error) {
      if (error instanceof OwnershipError) {
        return res.status(404).json({ success: false, error: "Fact not found" });
      }
      return sendError(res, error, "Failed to accept fact");
    }
  }),
);
```

- [ ] **Step 2: Add the dismiss route**

```ts
app.post(
  "/api/brand-fact-sheet/facts/:factId/dismiss",
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = requireUser(req);
      const fact = await storage.getBrandFactById(req.params.factId);
      if (!fact) {
        return res.status(404).json({ success: false, error: "Fact not found" });
      }
      await requireBrand(fact.brandId, user.id);

      const updated = await storage.dismissFact(fact.id);
      logger.info(
        {
          brandId: fact.brandId,
          factId: fact.id,
          domain: fact.domain,
          subcategory: fact.subcategory,
          factKey: fact.factKey,
        },
        "factSheet.facts.dismiss",
      );
      return res.status(200).json({ success: true, fact: updated });
    } catch (error) {
      if (error instanceof OwnershipError) {
        return res.status(404).json({ success: false, error: "Fact not found" });
      }
      return sendError(res, error, "Failed to dismiss fact");
    }
  }),
);
```

- [ ] **Step 3: Tests**

Create `tests/unit/factSheetFactsAcceptDismiss.test.ts` with cases:

1. accept success (no dismissOtherSide).
2. accept with `dismissOtherSide=true` — verify storage called with that flag.
3. dismiss success.
4. cross-tenant fact 404 — `requireBrand` rejects.
5. not-found 404 — `getBrandFactById` returns null.

- [ ] **Step 4: Run**

Run: `npm test -- tests/unit/factSheetFactsAcceptDismiss.test.ts 2>&1 | tail -10`
Expected: 5 passing.

---

### Task 8: `POST /api/brand-fact-sheet/facts/bulk-accept`

**Files:**

- Modify: `server/routes/factSheet.ts`

**References:** Spec 2 §4.6 (bulk actions), §6 row 8. Storage: `getBrandFactSheetConflicts`, `acceptFact`, `dismissFact`.

- [ ] **Step 1: Add the route**

```ts
const bulkAcceptSchema = z.object({
  brandId: z.string().min(1),
  side: z.enum(["user", "scraped"]),
  domain: z.string().optional(), // optional filter to a single domain
});

app.post(
  "/api/brand-fact-sheet/facts/bulk-accept",
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = requireUser(req);
      const parsed = bulkAcceptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid request",
        });
      }
      const { brandId, side, domain } = parsed.data;
      await requireBrand(brandId, user.id);

      const conflicts = await storage.getBrandFactSheetConflicts(brandId);
      let affected = 0;
      for (const pair of conflicts) {
        if (domain && pair.user.domain !== domain) continue;
        const keep = side === "user" ? pair.user : pair.scraped;
        const drop = side === "user" ? pair.scraped : pair.user;
        await storage.acceptFact(keep.id, { dismissOtherSide: false });
        await storage.dismissFact(drop.id);
        affected += 1;
      }
      logger.info({ brandId, side, domain, affected }, "factSheet.facts.bulkAccept");
      return res.status(200).json({ success: true, affected });
    } catch (error) {
      if (error instanceof OwnershipError) {
        return res.status(error.status).json({ success: false, error: error.message });
      }
      return sendError(res, error, "Failed to bulk-accept");
    }
  }),
);
```

- [ ] **Step 2: Extend the accept/dismiss test file with bulk-accept**

Add cases to `tests/unit/factSheetFactsAcceptDismiss.test.ts`:

6. bulk-accept side=`user`, no domain → all conflicts resolved with user side kept.
7. bulk-accept side=`scraped`, domain=`positioning` → only positioning pairs affected; affected count equals positioning conflict count.

Run: `npm test -- tests/unit/factSheetFactsAcceptDismiss.test.ts 2>&1 | tail -10`
Expected: 7 total passing.

---

### Task 9: `GET /api/brand-fact-sheet/diff?brandId=...`

**Files:**

- Modify: `server/routes/factSheet.ts`
- Create: `tests/unit/factSheetDiff.test.ts`

**References:** Spec 2 §6 row 9, §4.6 (diff section). Storage: `getBrandFactSheetConflicts` (returns the flat conflict pair list; client groups by domain).

- [ ] **Step 1: Add the route**

```ts
const diffQuerySchema = z.object({
  brandId: z.string().min(1),
});

app.get(
  "/api/brand-fact-sheet/diff",
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = requireUser(req);
      const parsed = diffQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid query",
        });
      }
      await requireBrand(parsed.data.brandId, user.id);
      const conflicts = await storage.getBrandFactSheetConflicts(parsed.data.brandId);
      return res.status(200).json({ success: true, conflicts });
    } catch (error) {
      if (error instanceof OwnershipError) {
        return res.status(error.status).json({ success: false, error: error.message });
      }
      return sendError(res, error, "Failed to load diff");
    }
  }),
);
```

- [ ] **Step 2: Tests**

Create `tests/unit/factSheetDiff.test.ts`:

1. returns conflicts as flat list.
2. requires brandId query param.
3. cross-tenant brand → 404.

Run: `npm test -- tests/unit/factSheetDiff.test.ts 2>&1 | tail -10`
Expected: 3 passing.

---

### Task 10: `PATCH /api/brands/:brandId/fact-scrape-enabled`

**Files:**

- Modify: `server/routes/factSheet.ts`
- Create: `tests/unit/factSheetEnabledToggle.test.ts`

**References:** Spec 2 §6 row 10, §4.6 (toggle wiring). Storage: `setBrandFactScrapeEnabled` (Plan 2.1).

- [ ] **Step 1: Add the route**

```ts
const toggleEnabledSchema = z.object({
  enabled: z.boolean(),
});

app.patch(
  "/api/brands/:brandId/fact-scrape-enabled",
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = requireUser(req);
      const parsed = toggleEnabledSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid request",
        });
      }
      await requireBrand(req.params.brandId, user.id);
      const updated = await storage.setBrandFactScrapeEnabled(
        req.params.brandId,
        parsed.data.enabled,
      );
      logger.info(
        { brandId: req.params.brandId, enabled: parsed.data.enabled },
        "factSheet.brand.toggleEnabled",
      );
      return res.status(200).json({ success: true, factScrapeEnabled: updated });
    } catch (error) {
      if (error instanceof OwnershipError) {
        return res.status(error.status).json({ success: false, error: error.message });
      }
      return sendError(res, error, "Failed to toggle fact scrape");
    }
  }),
);
```

- [ ] **Step 2: Tests**

Create `tests/unit/factSheetEnabledToggle.test.ts`:

1. enable→disable success.
2. cross-tenant brand → 404.

Run: `npm test -- tests/unit/factSheetEnabledToggle.test.ts 2>&1 | tail -10`
Expected: 2 passing.

---

### Task 11: Delete the legacy `POST /api/brand-facts/scrape/:brandId` block

**Files:**

- Modify: `server/routes/publications.ts` (delete `:51-69` block)

**References:** Spec 2 §4.10 (mandates deletion), §9 success-criteria bullet 8. Plan 2.4 will rewire the frontend Re-scrape button to call `POST /api/brand-fact-sheet/runs` instead — but that's Plan 2.4's scope.

- [ ] **Step 1: Verify the exact block**

Run: `grep -n "/api/brand-facts/scrape/:brandId" server/routes/publications.ts`
Expected: one match around line 52.

Read lines 49-72 to confirm the block boundaries. Expected boundaries:

- Open: `app.post(` at line 51
- Close: `);` at line 69

If line numbers shifted, re-anchor on the route literal.

- [ ] **Step 2: Delete the block**

Remove lines 51-69 inclusive of `server/routes/publications.ts`. Replace with a single comment line at the deletion point:

```ts
// `POST /api/brand-facts/scrape/:brandId` removed in Spec 2 §4.10 — replaced
// by the slice-resumable `POST /api/brand-fact-sheet/runs` (server/routes/factSheet.ts).
// Plan 2.4 rewires the frontend Re-scrape button to the new endpoint.
```

- [ ] **Step 3: Confirm no other code calls the deleted endpoint**

Run: `grep -rn "/api/brand-facts/scrape" client/ server/ tests/ 2>/dev/null`
Expected: zero hits. If any remain (frontend Re-scrape button code is Plan 2.4's responsibility, but document any callers found here so Plan 2.4 doesn't miss them), list them in the implementation log.

- [ ] **Step 4: Confirm `aiLimitMiddleware` is still imported elsewhere in `publications.ts`**

Run: `grep -n "aiLimitMiddleware" server/routes/publications.ts`
Expected: if no remaining usages exist, remove the now-unused import. (The brand-facts scrape was the only consumer — check carefully.)

- [ ] **Step 5: Typecheck and lint clean**

Run: `npm run check 2>&1 | tail -5`
Expected: 0 tsc errors.

Run: `npm run lint -- server/routes/publications.ts 2>&1 | tail -5`
Expected: 0 errors.

---

### Task 12: Client-side `useScrapeRunStream` hook scaffold

**Files:**

- Create: `client/src/hooks/useScrapeRunStream.ts`

**References:** Spec 2 §4.5 final paragraph (manual fetch + getReader required for Bearer auth). Mirror reference: `client/src/pages/welcome.tsx:170-249`. Plan 2.4 consumes this hook; Plan 2.3 ships ONLY the hook (no UI).

- [ ] **Step 1: Verify the mirror file structure**

Run: `grep -n "abortRef\|getReader\|TextDecoder" client/src/pages/welcome.tsx | head -10`
Expected: matches around lines 170, 192-193. Confirms the manual-fetch SSE pattern.

- [ ] **Step 2: Write the hook**

Create `client/src/hooks/useScrapeRunStream.ts`:

```ts
// SSE consumer hook for /api/brand-fact-sheet/runs/:runId/stream.
//
// Why manual fetch + getReader and not EventSource: EventSource cannot pass
// `Authorization: Bearer <token>` headers (Spec 2 §4.5 final paragraph).
// Mirror reference: client/src/pages/welcome.tsx:170-249.
//
// Reconnect protocol: server emits `event: slice_pending` with
// `data: {lastEventId: "<pageId>:<factId>"}` when its 50s budget runs out.
// The hook automatically reopens the stream with `?last_event_id=...`.

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/supabase";

export type ScrapeStreamEvent =
  | { type: "plan"; plan: unknown; expectedLanguages: string[] }
  | { type: "page"; id: string; url: string; status: string; factCount: number; bytes: number | null; errorKind: string | null; lang: string | null }
  | { type: "fact"; id: string; domain: string; subcategory: string; factKey: string; factValue: string; valueType: string; valuePayload: unknown; confidence: number | null; sourceUrl: string | null; sourceExcerpt: string | null }
  | { type: "progress"; status: string; pagesDone: number; pagesTotal: number; factsExtracted: number; costCents: number }
  | { type: "error"; kind: string; message: string }
  | { type: "done"; status: string; stats: { pagesFetched: number; factsExtracted: number; costCents: number; errorKind: string | null } }
  | { type: "slice_pending"; lastEventId: string; reason: string };

export type ScrapeStreamStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "reconnecting"
  | "done"
  | "error";

export interface UseScrapeRunStreamResult {
  events: ScrapeStreamEvent[];
  status: ScrapeStreamStatus;
  isStreaming: boolean;
  error: string | null;
  start: (runId: string) => void;
  stop: () => void;
}

export function useScrapeRunStream(): UseScrapeRunStreamResult {
  const [events, setEvents] = useState<ScrapeStreamEvent[]>([]);
  const [status, setStatus] = useState<ScrapeStreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const runIdRef = useRef<string | null>(null);

  const consume = useCallback(async (runId: string) => {
    setStatus("connecting");
    const controller = new AbortController();
    abortRef.current = controller;
    runIdRef.current = runId;

    const token = await getAccessToken();
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (lastEventIdRef.current) headers["Last-Event-ID"] = lastEventIdRef.current;

    const qs = lastEventIdRef.current
      ? `?last_event_id=${encodeURIComponent(lastEventIdRef.current)}`
      : "";

    try {
      const res = await fetch(`/api/brand-fact-sheet/runs/${runId}/stream${qs}`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Stream request failed: ${res.status}`);
      }

      setStatus("streaming");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "message";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx: number;
        // SSE events separated by blank line ("\n\n").
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);

          // Skip comment-only frames (": heartbeat\n").
          const lines = rawEvent.split("\n");
          const dataLines: string[] = [];
          currentEvent = "message";
          for (const line of lines) {
            if (line.startsWith(":")) continue; // comment / heartbeat
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trimStart());
            }
          }
          if (!dataLines.length) continue;
          const payload = dataLines.join("\n");
          let data: unknown;
          try {
            data = JSON.parse(payload);
          } catch {
            continue;
          }
          const evt = { type: currentEvent, ...(data as object) } as ScrapeStreamEvent;
          setEvents((prev) => [...prev, evt]);

          if (currentEvent === "page" && typeof (data as any)?.id === "string") {
            const pageId = (data as any).id as string;
            lastEventIdRef.current = `${pageId}:${(lastEventIdRef.current ?? "").split(":")[1] ?? ""}`;
          }
          if (currentEvent === "fact" && typeof (data as any)?.id === "string") {
            const factId = (data as any).id as string;
            const [p] = (lastEventIdRef.current ?? "").split(":");
            lastEventIdRef.current = `${p ?? ""}:${factId}`;
          }
          if (currentEvent === "slice_pending") {
            const next = (data as any).lastEventId as string | undefined;
            if (next) lastEventIdRef.current = next;
            setStatus("reconnecting");
            // Reopen the stream.
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            // Recurse with a fresh AbortController + cursor.
            void consume(runId);
            return;
          }
          if (currentEvent === "done") {
            setStatus("done");
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            return;
          }
          if (currentEvent === "error") {
            setError((data as any).message ?? "Stream error");
          }
        }
      }

      // Stream closed without `done` — treat as reconnect candidate.
      if (status === "streaming") {
        setStatus("reconnecting");
        void consume(runId);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError(err?.message ?? "Stream failed");
      setStatus("error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(
    (runId: string) => {
      setEvents([]);
      setError(null);
      lastEventIdRef.current = null;
      void consume(runId);
    },
    [consume],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    events,
    status,
    isStreaming: status === "streaming" || status === "connecting" || status === "reconnecting",
    error,
    start,
    stop,
  };
}
```

- [ ] **Step 3: Verify the `getAccessToken` import path**

Run: `grep -rn "export.*getAccessToken" client/src/lib/ | head -3`
Expected: one or more matches in `client/src/lib/supabase.ts` (or similar). If the export path differs from `@/lib/supabase`, adjust the import.

- [ ] **Step 4: Typecheck the hook**

Run: `npm run check 2>&1 | tail -5`
Expected: 0 tsc errors.

- [ ] **Step 5: No tests for the hook in this plan**

Plan 2.4 will land integration tests for the hook + UI together. Plan 2.3 ships the scaffold only — `npm run check` clean is sufficient.

---

### Task 13: Plan-wide verification

**Files:** none modified — verification only.

- [ ] **Step 1: Full typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 tsc errors across the whole repo.

- [ ] **Step 2: Full test suite**

Run: `npm test 2>&1 | tail -25`
Expected: all green; the new factSheet test files (Tasks 2-10) added. No regressions in pre-existing flaky tests called out in Spec 2 §9 (sourceHealth, redditSource, ssrf, citationCronUnconditional, tour integration/e2e).

- [ ] **Step 3: Lint clean on touched files**

Run: `npm run lint -- server/routes/factSheet.ts server/routes/publications.ts client/src/hooks/useScrapeRunStream.ts 2>&1 | tail -10`
Expected: 0 errors.

- [ ] **Step 4: Prettier clean**

Run: `npm run format:check 2>&1 | tail -10`
Expected: clean.

- [ ] **Step 5: Audit — no `setImmediate` regression**

Run: `grep -rn "setImmediate" server/routes/factSheet.ts`
Expected: zero hits (Spec 2 §4.1 uses `waitUntil`, not `setImmediate`).

- [ ] **Step 6: Audit — no stale `factCategory` references**

Run: `grep -rn "factCategory" server/routes/factSheet.ts client/src/hooks/useScrapeRunStream.ts`
Expected: zero hits (Plan 2.1 renamed → `subcategory`).

- [ ] **Step 7: Audit — no `dangerouslySetInnerHTML` in the new hook**

Run: `grep -rn "dangerouslySetInnerHTML" client/src/hooks/useScrapeRunStream.ts`
Expected: zero hits.

- [ ] **Step 8: Audit — no fact value logging**

Run: `grep -nE "logger\.(info|warn|error|debug)\(.*factValue|sourceExcerpt|valuePayload" server/routes/factSheet.ts`
Expected: zero hits. Spec 2 §4.8.4 mandates this.

- [ ] **Step 9: Audit — `req.on("close")` + heartbeat present in SSE route**

Run: `grep -nE 'req\.on\("close"|: heartbeat' server/routes/factSheet.ts`
Expected: at least one match for each (the SSE route).

- [ ] **Step 10: Audit — legacy endpoint truly removed**

Run: `grep -rn "/api/brand-facts/scrape/:brandId\|/api/brand-facts/scrape/" server/ 2>/dev/null`
Expected: zero hits (Task 11 deleted it; Plan 2.4 will sweep the client usage).

- [ ] **Step 11: Confirm Plan 2.2 dependency compiles**

Run: `grep -n "advanceScrapeRun" server/lib/factAgent/advanceScrapeRun.ts 2>/dev/null || echo "Plan 2.2 not yet landed — stub remains"`
Expected: either the file exists (Plan 2.2 landed) or the stub remains documented (per Task 1 Step 5).

---

## Self-review checklist

Before marking Plan 2.3 complete, verify every item:

- [ ] `server/routes/factSheet.ts` exists with `setupFactSheetRoutes` exported.
- [ ] `server/routes.ts` imports + calls `setupFactSheetRoutes(app)`.
- [ ] All 10 routes implemented: `POST /runs`, `GET /runs/:runId`, `GET /runs/:runId/stream`, `POST /runs/:runId/cancel`, `GET /runs`, `POST /facts/:factId/accept`, `POST /facts/:factId/dismiss`, `POST /facts/bulk-accept`, `GET /diff`, `PATCH /api/brands/:brandId/fact-scrape-enabled`.
- [ ] SSE route mirrors `assistant.ts:293-312` (headers, `flushHeaders`, 15s `: heartbeat`, `req.on("close")`, finally-clearInterval).
- [ ] SSE route explicitly NOT mirroring `onboarding.ts:104-355` (per anti-pattern comment).
- [ ] SSE route reads state from DB every tick (no in-memory continuation between ticks).
- [ ] SSE route exits cleanly at 50s with `event: slice_pending` so the client reconnects.
- [ ] Reconnect via `?last_event_id=` (and `Last-Event-ID` header) filters out already-seen page + fact rows.
- [ ] Auth/ownership at SSE entry happens BEFORE `flushHeaders()`; cross-tenant returns 404 JSON (not 403, not SSE error).
- [ ] Anti-enumeration 404 on every cross-tenant path (runs get, runs cancel, facts accept, facts dismiss, diff, toggle).
- [ ] `aiLimitMiddleware` applied to `POST /runs` (the only LLM-triggering route).
- [ ] `waitUntil(advanceScrapeRun(...))` dispatch returns immediately so the HTTP response isn't blocked.
- [ ] No log emits include `factValue`, `valuePayload`, or `sourceExcerpt` verbatim (Spec 2 §4.8.4).
- [ ] Logger fields restricted to the §4.8.4 allowlist: `{ brandId, runId, domain, subcategory, factKey, valueType, confidence, sourceUrl }`.
- [ ] Old `POST /api/brand-facts/scrape/:brandId` block at `publications.ts:51-69` deleted with a forwarding comment.
- [ ] `useScrapeRunStream` hook uses manual `fetch` + `getReader()` (not `EventSource`).
- [ ] `useScrapeRunStream` handles `event: slice_pending` by recursing into a new `fetch` with the new cursor.
- [ ] All new tests passing (Tasks 2-10 add ~30 cases total).
- [ ] `npm run check`, `npm run lint`, `npm run format:check`, `npm test` all clean.
- [ ] No new dependencies added to `package.json`.
- [ ] No schema changes (Plan 2.1 owns those).
- [ ] No agent code (Plan 2.2 owns those).
- [ ] No UI components (Plan 2.4/2.5 own those).
- [ ] No new cron job (Plan 2.6 owns serial-failure alerting).
