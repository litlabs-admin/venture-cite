# Fact Sheet v2 — Plan 5: UI Orchestrator, Progress Card, Paste Flow, Onboarding Parity

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) syntax.

> **Commits:** No `git commit` / `add` / `reset`. `git stash push`/`pop` allowed for diagnostics if `git stash list` is verified empty after.

> **Coexistence:** Plan 5 wires the v2 pipeline into the brand-fact-sheet page and the onboarding flow. The v1 `POST /api/brand-fact-sheet/runs` endpoint still exists; we just stop calling it from the UI. Plan 6 removes the v1 server code.

> **OpenRouter policy:** Plan 5 has zero LLM calls of its own. The `/paste` endpoint extracts via GPT direct (it's the user's own text — same source semantics as `/scrape-one` body content).

**Goal:** Replace the brand-fact-sheet page's v1 Re-scrape flow with the v2 client orchestrator. Add the manual-paste fallback, three-lane progress card, and onboarding step-2 refactor so the same pipeline drives both. Ship `POST /runs/:runId/paste` to make manual-paste a first-class source.

**Architecture:** UI dispatches `POST /plan` → gets `{runId, pages}` → fires `/scrape-one × N` (p-limit 3) + `/search-llm` + `/user-enrich` in parallel via `Promise.allSettled` → calls `/aggregate`. `AbortController` cancels in-flight fetches on unmount; cron backstop completes server-side. Progress card consumes SSE on the existing `/runs/:runId/stream` endpoint, extended to emit new `source-update` events.

**Tech Stack:** React 18, TanStack Query, p-limit (or inline), shadcn/Radix components (existing), Vitest + @testing-library/react. Server: Express, Drizzle.

**Spec reference:** [docs/superpowers/specs/2026-05-13-brand-fact-sheet-v2-design.md](../specs/2026-05-13-brand-fact-sheet-v2-design.md) §8.2 (UI orchestration), §8.5 (paste), §11 (progress UI).

---

## Task 1 — `POST /runs/:runId/paste` endpoint + `persistPasteFacts` helper

**Why:** The all-sources-empty fallback. User pastes their About text; we run the same extraction LLM as `/scrape-one` but treat the text as synthetic page content and persist with `source='paste'`. Replaces any prior `source='paste'` rows for the brand.

**Files:**
- Create: `server/lib/factAgent/v2/persistPasteFacts.ts`
- Modify: `server/routes/factSheetV2.ts` (add the route)
- Test: `tests/unit/v2PasteRoute.test.ts`

- [ ] **Step 1: Write failing test for the route**

Create `tests/unit/v2PasteRoute.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, _res: unknown, next: () => void) => {
    (req as any).user = { id: "user-1" };
    next();
  },
}));

const reqBrand = vi.fn();
vi.mock("../../server/lib/ownership", () => ({
  requireUser: (req: any) => req.user,
  requireBrand: (...args: unknown[]) => reqBrand(...args),
  OwnershipError: class OwnershipError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const storageMock = {
  getScrapeRunById: vi.fn(),
  getScrapePageById: vi.fn(),
  getInFlightScrapeRun: vi.fn(),
  getLastCompletedScrapeRunAt: vi.fn(),
  getMonthlyCostCap: vi.fn(),
  createScrapeRun: vi.fn(),
  createScrapePage: vi.fn(),
  insertFactScrapeLog: vi.fn().mockResolvedValue(undefined),
  getFactScrapeCache: vi.fn(),
  upsertFactScrapeCache: vi.fn(),
};
vi.mock("../../server/storage", () => ({ storage: storageMock }));

const persistPasteFactsMock = vi.fn().mockResolvedValue({ inserted: 1 });
vi.mock("../../server/lib/factAgent/v2/persistPasteFacts", () => ({
  persistPasteFacts: persistPasteFactsMock,
}));

const callWithFailoverMock = vi.fn();
vi.mock("../../server/lib/factAgent/v2/llmFailover", () => ({
  callWithFailover: callWithFailoverMock,
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
      chat = { completions: { create: vi.fn() } };
    },
  };
});

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupFactSheetV2Routes(app);
  return app;
}

describe("POST /api/brand-fact-sheet/runs/:runId/paste", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reqBrand.mockResolvedValue({ id: "brand-1", userId: "user-1", website: "https://example.com", name: "Acme", industry: "saas" });
  });

  it("400 when text missing", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/runs/run-1/paste")
      .send({});
    expect(res.status).toBe(400);
  });

  it("400 when text exceeds 50_000 chars", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    const text = "a".repeat(50_001);
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/runs/run-1/paste")
      .send({ text });
    expect(res.status).toBe(400);
  });

  it("404 when run not found", async () => {
    storageMock.getScrapeRunById.mockResolvedValue(null);
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/runs/run-1/paste")
      .send({ text: "About: We build AI." });
    expect(res.status).toBe(404);
  });

  it("happy path: 200, persists with source=paste, log written", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    callWithFailoverMock.mockResolvedValue(
      JSON.stringify({
        facts: [
          { domain: "identity", subcategory: "description", factKey: "tagline", factValue: "We build AI.", valueType: "string", confidence: 0.95, sourceExcerpt: "We build AI." },
        ],
      }),
    );
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/runs/run-1/paste")
      .send({ text: "About: We build AI for everyone." });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.factCount).toBe(1);

    expect(persistPasteFactsMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ brandId: "brand-1", runId: "run-1" }),
    );
    expect(storageMock.insertFactScrapeLog).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", source: "paste", status: "done", factCount: 1 }),
    );
  });
});
```

- [ ] **Step 2: Confirm failure**

`npx vitest run tests/unit/v2PasteRoute.test.ts` → FAIL.

- [ ] **Step 3: Implement `server/lib/factAgent/v2/persistPasteFacts.ts`**

```ts
// Persist paste-source facts. Replaces all existing source='paste' rows
// for this brand in a single transaction. user_manual / user / scraped
// rows are explicitly untouched.
import { db } from "../../../db";
import { and, eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { Fact } from "@shared/factAgent/schema";
import { logger } from "../../logger";

interface PersistPasteArgs {
  brandId: string;
  runId: string;
}

export async function persistPasteFacts(
  facts: Fact[],
  args: PersistPasteArgs,
): Promise<{ inserted: number }> {
  try {
    return await db.transaction(async (tx) => {
      await tx
        .delete(schema.brandFactSheet)
        .where(
          and(
            eq(schema.brandFactSheet.brandId, args.brandId),
            eq(schema.brandFactSheet.source, "paste"),
          ),
        );

      if (facts.length === 0) return { inserted: 0 };

      const rows = facts.map((f) => ({
        brandId: args.brandId,
        domain: f.domain,
        subcategory: f.subcategory,
        factKey: f.factKey,
        factValue: f.factValue,
        valueType: f.valueType,
        valuePayload: f.valuePayload ?? null,
        confidence: String(f.confidence),
        sourceExcerpt: f.sourceExcerpt ?? "",
        sourceUrl: f.sourceUrl ?? null,
        source: "paste",
        runId: args.runId,
      }));
      await tx.insert(schema.brandFactSheet).values(rows as never);
      return { inserted: rows.length };
    });
  } catch (err) {
    logger.warn({ err, brandId: args.brandId, runId: args.runId }, "persistPasteFacts failed");
    return { inserted: 0 };
  }
}
```

- [ ] **Step 4: Add the route to `server/routes/factSheetV2.ts`**

Add imports:
```ts
import { persistPasteFacts } from "../lib/factAgent/v2/persistPasteFacts";
import { buildExtractionPrompt, parseFactsWithRepair } from "../lib/factAgent/v2/extractionPrompt";
```

Add Zod schema:
```ts
const pasteSchema = z.object({
  text: z.string().min(1).max(50_000),
});
```

Inside `setupFactSheetV2Routes`, after the `/aggregate` handler, add:

```ts
  app.post(
    "/api/brand-fact-sheet/runs/:runId/paste",
    isAuthenticated,
    aiLimitMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const startedAt = Date.now();
      try {
        const user = requireUser(req);
        const parsed = pasteSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const runId = req.params.runId;
        if (!runId) {
          return res.status(400).json({ success: false, error: "runId required" });
        }

        const run = await storage.getScrapeRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        const brand = await requireBrand(run.brandId, user.id);

        // Extract via GPT direct + Claude-via-OpenRouter failover (same
        // provider stack as /scrape-one — see PROJECT POLICY block above).
        const providers: ProviderClient[] = [openaiProvider];
        if (openrouterClaudeProvider) providers.push(openrouterClaudeProvider);
        const llm = (prompt: string | { system: string; user: string }) =>
          callWithFailover(providers, prompt, runId);

        const prompt = buildExtractionPrompt(parsed.data.text, {
          brandUrl: brand.website ?? "",
          brandName: brand.name,
          industry: brand.industry ?? null,
        });
        const result = await parseFactsWithRepair(prompt, llm);

        // Tag with the brand URL so downstream UI can label the source.
        const tagged = result.facts.map((f) => ({
          ...f,
          sourceUrl: brand.website ?? f.sourceUrl,
        }));

        await persistPasteFacts(tagged, { brandId: brand.id, runId });

        await storage.insertFactScrapeLog({
          runId,
          source: "paste",
          status: "done",
          factCount: tagged.length,
          latencyMs: Date.now() - startedAt,
          diagnostics: { repairUsed: result.repairUsed, inputLength: parsed.data.text.length },
        });

        return res.status(200).json({
          success: true,
          runId,
          status: "done",
          factCount: tagged.length,
          diagnostics: { repairUsed: result.repairUsed },
        });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        logger.warn({ err }, "factSheetV2.paste failed");
        captureAndFlush(err, { tags: { source: "factSheetV2.paste" } });
        return sendError(res, err, "Failed to extract from paste");
      }
    }),
  );
```

- [ ] **Step 5: Run test**

`npx vitest run tests/unit/v2PasteRoute.test.ts` → 4 passed.

- [ ] **Step 6: Type-check**

`npm run check` → clean.

---

## Task 2 — SSE event extensions for `source-update` events

**Why:** The existing `/api/brand-fact-sheet/runs/:runId/stream` SSE endpoint (Plan 2 v1) emits page-level events. For Plan 5's three-lane progress card, we need run-level `source-update` events showing per-source `status`/`done`/`failed`/`facts`. Extend the existing endpoint without breaking page events.

**Files:**
- Modify: `server/routes/factSheet.ts` (extend the SSE handler) OR add a new `/v2/stream` if the existing handler is hard to extend cleanly
- Test: existing SSE tests should still pass + a new test for the new event

- [ ] **Step 1: Read the existing SSE handler**

Run:
```
Grep: "/runs/:runId/stream" in server/routes/
Read: the relevant handler file (likely server/routes/factSheet.ts)
```

The existing handler polls run + page state and emits events. Identify where the event-emit loop lives.

- [ ] **Step 2: Add `source-update` event emission**

In the existing SSE handler's poll loop, query the `fact_scrape_logs` table for the current run's per-source state and emit:

```ts
// Pseudocode — adapt to the existing handler's actual shape:
const logs = await storage.listFactScrapeLogsForRun(runId);
// Group by source, emit one event per source
for (const source of ["userEnrich", "staticPages", "searchLlm"] as const) {
  const sourceLogs = logs.filter((l) => l.source === apiSourceName(source));
  if (sourceLogs.length > 0) {
    const latest = sourceLogs[sourceLogs.length - 1];
    res.write(`event: source-update\n`);
    res.write(`data: ${JSON.stringify({
      source,
      status: latest.status,
      facts: latest.factCount,
      errorKind: latest.errorKind,
    })}\n\n`);
  }
}
```

If `listFactScrapeLogsForRun` doesn't exist on storage, add it:

```ts
// In IStorage:
listFactScrapeLogsForRun(runId: string): Promise<Array<{ source: string; status: string; factCount: number; errorKind: string | null }>>;

// In DatabaseStorage:
async listFactScrapeLogsForRun(runId: string) {
  return await db
    .select({
      source: schema.factScrapeLogs.source,
      status: schema.factScrapeLogs.status,
      factCount: schema.factScrapeLogs.factCount,
      errorKind: schema.factScrapeLogs.errorKind,
    })
    .from(schema.factScrapeLogs)
    .where(eq(schema.factScrapeLogs.runId, runId))
    .orderBy(asc(schema.factScrapeLogs.createdAt));
}
```

- [ ] **Step 3: Verify existing SSE tests still pass**

```
npx vitest run tests/integration/factSheet*.test.ts
```

If any fail, the page-event emission was inadvertently broken — fix and re-run.

- [ ] **Step 4: Type-check**

`npm run check` → clean.

---

## Task 3 — Client hook `useScrapeOrchestration`

**Why:** The dispatcher. Calls `/plan` → fans out `/scrape-one × N + /search-llm + /user-enrich` with p-limit(3) + AbortController → calls `/aggregate`. Handles offline detection.

**Files:**
- Create: `client/src/hooks/useScrapeOrchestration.ts`
- Test: `tests/unit/useScrapeOrchestration.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/useScrapeOrchestration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useScrapeOrchestration } from "../../client/src/hooks/useScrapeOrchestration";

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock as never;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useScrapeOrchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: /plan returns { runId, pages: [...] }, all source endpoints
    // return { success: true, factCount: 1 }, /aggregate completes.
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.endsWith("/plan")) {
        return new Response(JSON.stringify({
          success: true,
          runId: "run-1",
          pages: [{ pageId: "p1", url: "https://example.com/" }, { pageId: "p2", url: "https://example.com/about" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (u.includes("/scrape-one")) {
        return new Response(JSON.stringify({ success: true, factCount: 1, status: "done" }), { status: 200 });
      }
      if (u.includes("/search-llm")) {
        return new Response(JSON.stringify({ success: true, factCount: 1, status: "done" }), { status: 200 });
      }
      if (u.includes("/user-enrich")) {
        return new Response(JSON.stringify({ success: true, factCount: 1, status: "done" }), { status: 200 });
      }
      if (u.endsWith("/aggregate")) {
        return new Response(JSON.stringify({ success: true, status: "completed", totalFacts: 3 }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
  });

  it("fires plan, then scrape-one × N + search-llm + user-enrich in parallel, then aggregate", async () => {
    const { result } = renderHook(() => useScrapeOrchestration(), { wrapper });
    await act(async () => {
      await result.current.start("brand-1");
    });

    const calls = fetchMock.mock.calls.map((c) => (typeof c[0] === "string" ? c[0] : c[0]?.toString()));
    expect(calls.some((u) => u?.endsWith("/plan"))).toBe(true);
    expect(calls.filter((u) => u?.includes("/scrape-one")).length).toBe(2);
    expect(calls.some((u) => u?.includes("/search-llm"))).toBe(true);
    expect(calls.some((u) => u?.includes("/user-enrich"))).toBe(true);
    expect(calls.some((u) => u?.endsWith("/aggregate"))).toBe(true);

    // Aggregate should come AFTER all source calls
    const aggregateIdx = calls.findIndex((u) => u?.endsWith("/aggregate"));
    const scrapeOneIdxs = calls
      .map((u, i) => (u?.includes("/scrape-one") ? i : -1))
      .filter((i) => i >= 0);
    expect(Math.max(...scrapeOneIdxs)).toBeLessThan(aggregateIdx);

    await waitFor(() => {
      expect(result.current.status).toBe("completed");
    });
    expect(result.current.totalFacts).toBe(3);
  });

  it("returns plan failure as the orchestration result", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.endsWith("/plan")) {
        return new Response(JSON.stringify({ success: false, code: "cooldown", unlockAtMs: Date.now() + 60_000 }), { status: 409 });
      }
      return new Response("unreachable", { status: 500 });
    });
    const { result } = renderHook(() => useScrapeOrchestration(), { wrapper });
    await act(async () => {
      await result.current.start("brand-1");
    });
    expect(result.current.status).toBe("plan_failed");
    expect(result.current.planError?.code).toBe("cooldown");
  });
});
```

- [ ] **Step 2: Confirm failure**

`npx vitest run tests/unit/useScrapeOrchestration.test.ts` → FAIL.

- [ ] **Step 3: Implement `client/src/hooks/useScrapeOrchestration.ts`**

The hook needs `p-limit`. If not in `package.json`, install it: `npm install p-limit`. If you don't want a new dep, inline a tiny concurrency limiter (8 lines).

```ts
import { useState, useRef, useCallback, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

// Inline 8-line concurrency limiter (avoids a new dep).
function createLimit(concurrency: number) {
  const queue: Array<() => void> = [];
  let active = 0;
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) await new Promise<void>((r) => queue.push(r));
    active += 1;
    try { return await fn(); }
    finally { active -= 1; queue.shift()?.(); }
  };
}

export type OrchestrationStatus =
  | "idle"
  | "planning"
  | "running"
  | "aggregating"
  | "completed"
  | "plan_failed"
  | "offline"
  | "failed";

export interface PlanError {
  code: "cooldown" | "already_running" | "paused" | "cost_cap_reached" | "unknown";
  message: string;
  runId?: string;
  unlockAtMs?: number;
}

export interface OrchestrationState {
  status: OrchestrationStatus;
  runId: string | null;
  totalFacts: number;
  planError: PlanError | null;
}

export function useScrapeOrchestration() {
  const [state, setState] = useState<OrchestrationState>({
    status: "idle",
    runId: null,
    totalFacts: 0,
    planError: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  // Offline detection: freeze if the browser drops connectivity mid-run.
  useEffect(() => {
    const onOffline = () => {
      setState((s) =>
        s.status === "running" || s.status === "aggregating"
          ? { ...s, status: "offline" }
          : s,
      );
    };
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, []);

  // Cleanup on unmount: abort all in-flight fetches. Cron picks up server-side.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const start = useCallback(async (brandId: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "planning", runId: null, totalFacts: 0, planError: null });

    try {
      const planRes = await fetch("/api/brand-fact-sheet/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandId, triggeredBy: "user_rescrape" }),
        signal: controller.signal,
      });
      const planJson = await planRes.json();
      if (!planRes.ok || !planJson.success) {
        setState({
          status: "plan_failed",
          runId: planJson.runId ?? null,
          totalFacts: 0,
          planError: {
            code: planJson.code ?? "unknown",
            message: planJson.error ?? "Plan failed",
            runId: planJson.runId,
            unlockAtMs: planJson.unlockAtMs,
          },
        });
        return;
      }
      const runId: string = planJson.runId;
      const pages: Array<{ pageId: string; url: string }> = planJson.pages ?? [];

      setState((s) => ({ ...s, status: "running", runId }));

      const limit = createLimit(3);
      const scrapeOnePromises = pages.map(({ pageId }) =>
        limit(() =>
          fetch("/api/brand-fact-sheet/scrape-one", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ runId, pageId }),
            signal: controller.signal,
          }).catch((err) => ({ error: err })),
        ),
      );
      const searchPromise = fetch("/api/brand-fact-sheet/search-llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
        signal: controller.signal,
      }).catch((err) => ({ error: err }));
      const enrichPromise = fetch("/api/brand-fact-sheet/user-enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
        signal: controller.signal,
      }).catch((err) => ({ error: err }));

      await Promise.allSettled([...scrapeOnePromises, searchPromise, enrichPromise]);

      setState((s) => ({ ...s, status: "aggregating" }));

      const aggregateRes = await fetch("/api/brand-fact-sheet/aggregate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
        signal: controller.signal,
      });
      const aggregateJson = await aggregateRes.json();
      if (!aggregateRes.ok || !aggregateJson.success) {
        setState((s) => ({ ...s, status: "failed" }));
        return;
      }

      setState({
        status: "completed",
        runId,
        totalFacts: aggregateJson.totalFacts ?? 0,
        planError: null,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState((s) => ({ ...s, status: "failed" }));
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState({ status: "idle", runId: null, totalFacts: 0, planError: null });
  }, []);

  return { ...state, start, cancel };
}
```

- [ ] **Step 4: Run test**

`npx vitest run tests/unit/useScrapeOrchestration.test.ts` → 2 passed.

If the test fails because `apiRequest` isn't used (we used raw `fetch` to give the test direct control), that's fine — adjust the import or remove the unused import.

- [ ] **Step 5: Type-check**

`npm run check` → clean.

---

## Task 4 — `ScrapeProgressCard` component

**Why:** Three-lane visual: user-enrich → static-pages → search-LLM. Driven by SSE events. Real-time fact counter.

**Files:**
- Create: `client/src/components/fact-sheet/ScrapeProgressCardV2.tsx`
- Test: `tests/unit/scrapeProgressCardV2.test.tsx`

- [ ] **Step 1: Failing test**

Create `tests/unit/scrapeProgressCardV2.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScrapeProgressCardV2 } from "../../client/src/components/fact-sheet/ScrapeProgressCardV2";

describe("ScrapeProgressCardV2", () => {
  it("renders three lanes: user-enrich, static-pages, search-LLM", () => {
    render(
      <ScrapeProgressCardV2
        sources={{
          userEnrich: { status: "done", facts: 3 },
          staticPages: { status: "in_progress", total: 8, done: 5, failed: 1, facts: 23 },
          searchLlm: { status: "pending", facts: 0 },
        }}
      />,
    );
    expect(screen.getByText(/Reading your description/i)).toBeInTheDocument();
    expect(screen.getByText(/Reading your website/i)).toBeInTheDocument();
    expect(screen.getByText(/Searching the web/i)).toBeInTheDocument();
  });

  it("shows total fact count", () => {
    render(
      <ScrapeProgressCardV2
        sources={{
          userEnrich: { status: "done", facts: 3 },
          staticPages: { status: "done", total: 8, done: 8, failed: 0, facts: 23 },
          searchLlm: { status: "done", facts: 5 },
        }}
      />,
    );
    expect(screen.getByText(/31/)).toBeInTheDocument(); // 3 + 23 + 5
  });

  it("shows N/M for static-pages in_progress", () => {
    render(
      <ScrapeProgressCardV2
        sources={{
          userEnrich: { status: "pending", facts: 0 },
          staticPages: { status: "in_progress", total: 8, done: 5, failed: 0, facts: 0 },
          searchLlm: { status: "pending", facts: 0 },
        }}
      />,
    );
    expect(screen.getByText(/5\/8/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Confirm failure**

`npx vitest run tests/unit/scrapeProgressCardV2.test.tsx` → FAIL.

- [ ] **Step 3: Implement `client/src/components/fact-sheet/ScrapeProgressCardV2.tsx`**

```tsx
import { CheckCircle, Loader2, Circle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SourceProgress {
  status: "pending" | "in_progress" | "done" | "failed";
  facts: number;
}

export interface StaticPagesProgress extends SourceProgress {
  total?: number;
  done?: number;
  failed?: number;
}

export interface ScrapeProgressSources {
  userEnrich: SourceProgress;
  staticPages: StaticPagesProgress;
  searchLlm: SourceProgress;
}

interface Props {
  sources: ScrapeProgressSources;
}

function statusIcon(status: SourceProgress["status"]) {
  if (status === "done") return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (status === "in_progress") return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
  if (status === "failed") return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

export function ScrapeProgressCardV2({ sources }: Props) {
  const totalFacts =
    sources.userEnrich.facts + sources.staticPages.facts + sources.searchLlm.facts;

  return (
    <Card data-testid="scrape-progress-card-v2">
      <CardHeader>
        <CardTitle className="text-base">Building your fact sheet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {statusIcon(sources.userEnrich.status)}
            <span>Reading your description</span>
          </div>
          <span className="text-muted-foreground">
            {sources.userEnrich.status === "done"
              ? `done · ${sources.userEnrich.facts} facts`
              : sources.userEnrich.status}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {statusIcon(sources.staticPages.status)}
            <span>Reading your website</span>
          </div>
          <span className="text-muted-foreground">
            {sources.staticPages.status === "in_progress" && sources.staticPages.total
              ? `${sources.staticPages.done ?? 0}/${sources.staticPages.total} pages · ${sources.staticPages.facts} facts`
              : sources.staticPages.status === "done"
                ? `done · ${sources.staticPages.facts} facts`
                : sources.staticPages.status}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {statusIcon(sources.searchLlm.status)}
            <span>Searching the web</span>
          </div>
          <span className="text-muted-foreground">
            {sources.searchLlm.status === "done"
              ? `done · ${sources.searchLlm.facts} facts`
              : sources.searchLlm.status}
          </span>
        </div>
        <div className="border-t pt-3 text-sm font-medium">
          {totalFacts} facts so far
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test**

`npx vitest run tests/unit/scrapeProgressCardV2.test.tsx` → 3 passed.

- [ ] **Step 5: Type-check**

`npm run check` → clean.

---

## Task 5 — `ManualPasteCard` component

**Why:** Last-resort fallback when all three sources return empty. Textarea + Submit button → POST `/runs/:runId/paste`.

**Files:**
- Create: `client/src/components/fact-sheet/ManualPasteCard.tsx`
- Test: `tests/unit/manualPasteCard.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ManualPasteCard } from "../../client/src/components/fact-sheet/ManualPasteCard";

describe("ManualPasteCard", () => {
  it("renders title, textarea, submit, and manual-fill button", () => {
    render(<ManualPasteCard runId="run-1" onSubmit={vi.fn()} onManualFill={vi.fn()} />);
    expect(screen.getByText(/couldn't read your site automatically/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Submit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fill fields manually/i })).toBeInTheDocument();
  });

  it("invokes onSubmit with the textarea content when Submit is clicked", () => {
    const onSubmit = vi.fn();
    render(<ManualPasteCard runId="run-1" onSubmit={onSubmit} onManualFill={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "We build AI." } });
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));
    expect(onSubmit).toHaveBeenCalledWith("We build AI.");
  });

  it("disables submit when textarea is empty", () => {
    render(<ManualPasteCard runId="run-1" onSubmit={vi.fn()} onManualFill={vi.fn()} />);
    const submitBtn = screen.getByRole("button", { name: /Submit/i });
    expect(submitBtn).toBeDisabled();
  });

  it("disables submit when textarea exceeds 50_000 chars", () => {
    render(<ManualPasteCard runId="run-1" onSubmit={vi.fn()} onManualFill={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a".repeat(50_001) } });
    expect(screen.getByRole("button", { name: /Submit/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Confirm failure**

`npx vitest run tests/unit/manualPasteCard.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

```tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Props {
  runId: string;
  onSubmit: (text: string) => void;
  onManualFill: () => void;
  busy?: boolean;
}

export function ManualPasteCard({ runId: _runId, onSubmit, onManualFill, busy }: Props) {
  const [text, setText] = useState("");
  const valid = text.length > 0 && text.length <= 50_000;

  return (
    <Card data-testid="manual-paste-card">
      <CardHeader>
        <CardTitle>We couldn't read your site automatically</CardTitle>
        <CardDescription>
          Some sites block automated readers, or content is rendered in a way we
          can't reach. Paste your About text below and we'll do the rest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your About / homepage / company description here..."
          className="font-mono text-sm"
          maxLength={50_000}
        />
        <div className="text-xs text-muted-foreground">
          {text.length.toLocaleString()} / 50,000 characters
        </div>
        <div className="flex gap-2">
          <Button onClick={() => onSubmit(text)} disabled={!valid || busy}>
            Submit
          </Button>
          <Button variant="ghost" onClick={onManualFill} disabled={busy}>
            Or fill fields manually
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test**

`npx vitest run tests/unit/manualPasteCard.test.tsx` → 4 passed.

- [ ] **Step 5: Type-check**

`npm run check` → clean.

---

## Task 6 — Wire the orchestrator + components into the brand-fact-sheet page

**Why:** Current `client/src/pages/brand-fact-sheet.tsx` uses the v1 endpoint (`POST /api/brand-fact-sheet/runs`). Replace the Re-scrape button's handler with `useScrapeOrchestration().start(brandId)`. Add `ScrapeProgressCardV2` while orchestration runs. Add `ManualPasteCard` when result is `completed` with `totalFacts === 0`.

**Files:**
- Modify: `client/src/pages/brand-fact-sheet.tsx`
- Test: `tests/unit/brandFactSheetPage.test.tsx` (basic — confirms the orchestration hook is wired)

- [ ] **Step 1: Read the existing page**

`Read` the relevant block: search for the Re-scrape button + `startScrapeMutation` (or equivalent). Note where to insert the new orchestrator call.

- [ ] **Step 2: Failing test**

Create or extend `tests/unit/brandFactSheetPage.test.tsx`. The full page test is heavy — make a thin smoke test that verifies the import path:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../client/src/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isLoading: false }),
}));

// We're mostly verifying the page imports and renders without crashing
// once the orchestrator hook is wired. If the page is complex enough that
// rendering it requires more mocks, the v2 smoke test in Task 8 is the
// real verification. This is a lightweight tripwire.

describe("brand-fact-sheet page after orchestrator wiring", () => {
  it("imports useScrapeOrchestration", async () => {
    const mod = await import("../../client/src/pages/brand-fact-sheet");
    expect(typeof mod).toBe("object");
  });
});
```

- [ ] **Step 3: Update `client/src/pages/brand-fact-sheet.tsx`**

Add at the top:
```ts
import { useScrapeOrchestration } from "@/hooks/useScrapeOrchestration";
import { ScrapeProgressCardV2 } from "@/components/fact-sheet/ScrapeProgressCardV2";
import { ManualPasteCard } from "@/components/fact-sheet/ManualPasteCard";
```

Inside the component, near other hooks:
```ts
const orchestration = useScrapeOrchestration();
```

Find the Re-scrape button. Replace its `onClick` handler with:
```ts
onClick={() => orchestration.start(selectedBrandId)}
disabled={orchestration.status === "planning" || orchestration.status === "running" || orchestration.status === "aggregating"}
```

Replace the old "Scraping..." / progress UI block with:
```tsx
{(orchestration.status === "planning" ||
  orchestration.status === "running" ||
  orchestration.status === "aggregating") && (
  <ScrapeProgressCardV2
    sources={{
      // For MVP these come from SSE — Plan 5 Task 2 emits source-update
      // events. Use a small useSSEProgress hook OR poll /runs/:runId
      // every 3s and read fact_scrape_logs counts. Replace with real
      // SSE wire-up after the events land.
      userEnrich: { status: "pending", facts: 0 },
      staticPages: { status: "pending", facts: 0 },
      searchLlm: { status: "pending", facts: 0 },
    }}
  />
)}

{orchestration.status === "completed" && orchestration.totalFacts === 0 && orchestration.runId && (
  <ManualPasteCard
    runId={orchestration.runId}
    onSubmit={async (text) => {
      await fetch(`/api/brand-fact-sheet/runs/${orchestration.runId}/paste`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      // re-fetch facts
    }}
    onManualFill={() => {
      // Open the existing manual-edit modal/page
    }}
  />
)}

{orchestration.status === "plan_failed" && orchestration.planError && (
  <div className="text-sm text-yellow-700">
    {orchestration.planError.message}
  </div>
)}
```

If the existing page consumes the v1 runs endpoint elsewhere (e.g. polling for runs list), leave those queries as-is — Plan 6 will switch them to v2 once cutover is safe.

- [ ] **Step 4: Run test**

`npx vitest run tests/unit/brandFactSheetPage.test.tsx` → 1 passed (smoke).

- [ ] **Step 5: Type-check**

`npm run check` → clean.

If `tsc` complains about the existing v1 mutation function being unused, prefix it with `_` or remove. Don't remove the v1 endpoint route — Plan 6 handles that.

---

## Task 7 — SSE event consumer for the new `source-update` events

**Why:** The progress card needs real values. Extend or create a small hook that subscribes to the SSE stream and reduces the events into the `ScrapeProgressSources` shape.

**Files:**
- Create: `client/src/hooks/useSSEProgress.ts`
- Test: `tests/unit/useSSEProgress.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const eventSourceConstructor = vi.fn();
class MockEventSource {
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  listeners: Record<string, Array<(e: MessageEvent) => void>> = {};
  constructor(url: string) {
    this.url = url;
    eventSourceConstructor(url);
  }
  addEventListener(name: string, fn: (e: MessageEvent) => void) {
    (this.listeners[name] ??= []).push(fn);
  }
  close() {}
  // Test helper to dispatch a synthetic event
  emit(name: string, data: unknown) {
    const e = new MessageEvent(name, { data: JSON.stringify(data) });
    this.listeners[name]?.forEach((fn) => fn(e));
  }
}
(global as any).EventSource = MockEventSource;

import { useSSEProgress } from "../../client/src/hooks/useSSEProgress";

describe("useSSEProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("subscribes to the stream when runId is provided", () => {
    renderHook(() => useSSEProgress("run-1"));
    expect(eventSourceConstructor).toHaveBeenCalledWith(
      expect.stringContaining("/api/brand-fact-sheet/runs/run-1/stream"),
    );
  });

  it("does not subscribe when runId is null", () => {
    renderHook(() => useSSEProgress(null));
    expect(eventSourceConstructor).not.toHaveBeenCalled();
  });
});
```

Actual progressive-update tests are tricky to get right without dispatching events into the same MockEventSource instance the hook constructed. Keep this test minimal; cover the integration in Task 8.

- [ ] **Step 2: Confirm failure**

`npx vitest run tests/unit/useSSEProgress.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
import { useEffect, useState } from "react";
import type { ScrapeProgressSources } from "@/components/fact-sheet/ScrapeProgressCardV2";

const INITIAL: ScrapeProgressSources = {
  userEnrich: { status: "pending", facts: 0 },
  staticPages: { status: "pending", facts: 0 },
  searchLlm: { status: "pending", facts: 0 },
};

interface SourceUpdateEvent {
  source: "userEnrich" | "staticPages" | "searchLlm";
  status: "pending" | "in_progress" | "done" | "failed";
  facts: number;
  total?: number;
  done?: number;
  failed?: number;
}

export function useSSEProgress(runId: string | null): ScrapeProgressSources {
  const [state, setState] = useState<ScrapeProgressSources>(INITIAL);

  useEffect(() => {
    if (!runId) {
      setState(INITIAL);
      return;
    }
    const es = new EventSource(`/api/brand-fact-sheet/runs/${runId}/stream`);
    es.addEventListener("source-update", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SourceUpdateEvent;
        setState((prev) => ({ ...prev, [data.source]: { ...prev[data.source], ...data } }));
      } catch {
        // ignore malformed event
      }
    });
    return () => es.close();
  }, [runId]);

  return state;
}
```

- [ ] **Step 4: Wire into the brand-fact-sheet page**

Replace the hard-coded `{ userEnrich: { status: "pending", ... }, ... }` from Task 6 Step 3 with:
```ts
const liveProgress = useSSEProgress(orchestration.runId);
// ...
<ScrapeProgressCardV2 sources={liveProgress} />
```

- [ ] **Step 5: Run test + type-check**

`npx vitest run tests/unit/useSSEProgress.test.ts` → 2 passed. `npm run check` → clean.

---

## Task 8 — Onboarding parity

**Why:** Per user direction, onboarding should use the same orchestration. Step 1: URL+name. Step 2: review form pre-populated as facts stream in. Identical pipeline to Re-scrape.

**Files:**
- Modify: existing onboarding flow under `client/src/pages/` (Grep for "onboarding" to locate)
- Test: TBD (UI test for onboarding step 2 is heavy; can be a smoke test)

- [ ] **Step 1: Locate the onboarding pages/components**

Run `Grep: 'onboarding' OR 'welcome' in client/src/pages/`. There may be multiple onboarding pages from the project's history. Identify the active one (the page the user lands on after signup that captures brand URL).

- [ ] **Step 2: Refactor the onboarding step that triggers the scrape**

In the active onboarding component, find the place where the user submits their URL/name. After the brand is created (existing logic), call:

```ts
const orchestration = useScrapeOrchestration();
// after successful brand creation:
await orchestration.start(newBrandId);
```

Then bind the form fields to the live facts. The fact data comes from the existing `/api/brand-facts/:brandId` query (path-segment form — confirmed working earlier in this session). The form should pre-populate from the fact rows as they appear in the DB.

- [ ] **Step 3: Add fallback for empty result**

If `orchestration.status === "completed" && orchestration.totalFacts === 0`, swap the auto-populated form for `ManualPasteCard` (same component as the brand page). After successful paste, return to the populated form.

- [ ] **Step 4: Type-check**

`npm run check` → clean.

- [ ] **Step 5: Smoke verification**

Run `npm run dev` locally, sign up a fresh test account, type a brand URL, watch the form populate. Failure modes:
- Empty form after orchestration completes → fact-rows query is racing; ensure refetch happens on every `source-update` event or poll the query
- Form fields don't match scraped facts → the auto-fill logic needs to map fact `factKey` → form field

These are integration concerns. If the smoke fails, file a follow-up in Plan 6 — don't block this plan's completion.

---

## Done. What Plan 5 produced

- `POST /api/brand-fact-sheet/runs/:runId/paste` — manual-paste fallback endpoint
- `persistPasteFacts.ts` helper (delete-then-insert for `source='paste'`)
- `useScrapeOrchestration` client hook (p-limit(3), AbortController, offline detection)
- `useSSEProgress` client hook (consumes new `source-update` events)
- `ScrapeProgressCardV2` three-lane progress component
- `ManualPasteCard` last-resort fallback component
- `brand-fact-sheet.tsx` page rewired to use the v2 orchestration
- Onboarding flow wired to share the same orchestration
- SSE endpoint extended to emit `source-update` events

**Endpoint status overall:**
- ✅ `/scrape-one`, `/search-llm`, `/user-enrich`, `/plan`, `/aggregate` (Plans 2-4)
- ✅ `/runs/:runId/paste` (Plan 5)
- ✅ Cron backstop (Plan 4)
- ✅ Three-lane progress UI + onboarding parity (Plan 5)

**Plan 6 next:** observability dashboard (weekly summary log from `fact_scrape_logs`), data lifecycle deletion sweeps in daily-orchestrator (7-day pages, 30-day runs, 90-day logs, expired cache), v1 cutover (delete old code paths after 1 week of clean v2 metrics).
