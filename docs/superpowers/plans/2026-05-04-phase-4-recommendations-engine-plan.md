# Phase 4 — Recommendations Engine Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement task-by-task.
>
> **No commits during execution.** Same convention as Phases 0–3.

**Goal:** A "Do this next" panel on the dashboard that says, based on the user's actual data, the next 3–5 things to do in priority order. Pure deterministic rules — no LLM cost per pageview, no surprise bills, sub-200ms response. Stacked below the onboarding ring (per Phase 1's design lock-in: dashboard shows ring + timeline + recommendations all at once for new users).

**Architecture:** One new server endpoint (`GET /api/brands/:brandId/recommendations`) added to the existing function bundle — no new Vercel function, no new cron, no new env var. Pure-function rules engine in `server/lib/recommendationsEngine.ts` is fully testable without DB/network. One new client component (`RecommendationsPanel`) on the dashboard. Localstorage-scoped 7-day soft dismiss for P1/P2 recommendations; P0 (blockers) cannot be dismissed.

**Tech Stack:** TypeScript, Drizzle ORM, Express (existing route pattern), TanStack Query, React + Radix UI primitives.

---

## Pre-conditions verified before writing this plan

- `server/databaseStorage.ts` has the storage methods needed for state assembly:
  - `getBrandById(brandId)` (existing)
  - `getBrandsByUserId(userId)` line 244
  - `getArticlesByUserIdWithStatus(userId, opts)` line 4346 (filterable by brandId)
  - `getCitationRunsByBrandId(brandId, limit)` line 703
  - `getCompetitors(brandId)` line 1390
  - `getCommunityPosts(brandId)` line 4252
  - Brand prompts, signals scans, visibility checklist progress queries can be added during implementation if missing methods aren't already there
- `shared/schema.ts:1718` exports `Brand` type via `$inferSelect`
- `server/routes/dashboard.ts` exists — natural home for the new endpoint (it's the dashboard's data layer)
- `client/src/pages/home.tsx` mounts `<OnboardingProgressRing />` and `<ResultsTimeline />` at the top per Phase 1 — `<RecommendationsPanel />` slots in below them
- `client/src/lib/clientStorage.ts:clearAllVentureCiteStorage()` auto-wipes any `venturecite-*` prefixed localStorage key on logout — so the new dismissal key needs no `use-auth.ts` edit
- TanStack Query v5 patterns are already established
- React Testing Library + happy-dom infrastructure is set up from Phase 1 — `// @vitest-environment happy-dom` per-file pragma + `cleanup()` in tests/setup.ts

---

## File structure

**Files modified:**
- `server/routes/dashboard.ts` — add `GET /api/brands/:brandId/recommendations` handler at the end of the route registration block (PR 4.1)
- `client/src/pages/home.tsx` — mount `<RecommendationsPanel />` directly below `<ResultsTimeline />` (PR 4.2)

**Files created:**
- `server/lib/recommendationsEngine.ts` — pure function `getRecommendations(state) => Recommendation[]` + the `Recommendation` and `RecommendationState` types (PR 4.1)
- `client/src/components/dashboard/RecommendationsPanel.tsx` — renders the list, handles dismiss + localStorage scoping (PR 4.2)
- `tests/unit/recommendationsEngine.test.ts` — 6 server unit tests for the engine (PR 4.1)
- `tests/unit/RecommendationsPanel.test.tsx` — 3 RTL tests for the panel (PR 4.2)

**No changes to:**
- `vercel.json` (no new function, no new cron, no new env var)
- `vitest.config.ts` (RTL setup from Phase 1 reused)
- `package.json` (no new deps)
- `shared/schema.ts` (no schema changes — engine reads existing tables)
- Any migrations (no DB changes)
- `use-auth.ts` (the `venturecite-*` prefix means localStorage cleanup happens automatically on logout)

---

## Pre-flight: baseline check

- [ ] **P4.0: Confirm baseline is green**

Run:
```
npm run check
npm test
```

Expected: typecheck clean, **264 tests passing** (baseline from end of Phase 3). If either fails, halt and address before continuing.

---

## PR 4.1 — Rules engine + endpoint (~1 day)

### Task 1: Build `recommendationsEngine.ts` — types + pure function + 6 unit tests (TDD)

**Files:**
- Create: `server/lib/recommendationsEngine.ts`
- Create: `tests/unit/recommendationsEngine.test.ts`

**Why pure function first:** The engine has zero side effects — given a state object, it returns a Recommendation[]. Trivially testable in isolation. Endpoint wiring (Task 2) is then a thin adapter that loads state from DB and calls the engine.

- [ ] **Step 1: Write the failing tests FIRST**

Create `tests/unit/recommendationsEngine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  getRecommendations,
  type RecommendationState,
} from "../../server/lib/recommendationsEngine";

// Helper: builds a minimal RecommendationState with sensible defaults
// that the test can override per-case. Defaults represent a brand-new
// user with NO data anywhere.
function state(overrides: Partial<RecommendationState> = {}): RecommendationState {
  return {
    brand: null,
    articleCount: 0,
    promptCount: 0,
    citationRunCount: 0,
    citationRate: null,
    lastSignalsScanAt: null,
    visibilityChecklistCompleted: 0,
    visibilityChecklistTotal: 4,
    competitorCount: 0,
    communityPostCount: 0,
    faqCount: 0,
    ...overrides,
  };
}

describe("getRecommendations", () => {
  it("empty state (no brand) returns only P0 #1: create brand", () => {
    const recs = getRecommendations(state());
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe("create-brand");
    expect(recs[0].priority).toBe("P0");
    expect(recs[0].dismissible).toBe(false);
  });

  it("brand created without industry returns only P0 #2: add industry", () => {
    const recs = getRecommendations(
      state({ brand: { id: "b-1", industry: null } as any }),
    );
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe("add-brand-industry");
    expect(recs[0].priority).toBe("P0");
  });

  it("full setup (brand + industry + 5 articles + 3 prompts + 2 runs) at 0% citation rate returns P1 fact-sheet + FAQ", () => {
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: "B2B SaaS" } as any,
        articleCount: 5,
        promptCount: 3,
        citationRunCount: 2,
        citationRate: 0,
        faqCount: 0,
        lastSignalsScanAt: new Date(), // not stale → rule #8 doesn't fire
        visibilityChecklistCompleted: 4,
        visibilityChecklistTotal: 4,
      }),
    );
    const ids = recs.map((r) => r.id);
    expect(ids).toContain("add-brand-fact-sheet");
    expect(ids).toContain("optimize-faq");
    // No P0 should fire because all setup is done.
    expect(recs.every((r) => r.priority !== "P0")).toBe(true);
  });

  it("all P0/P1 done at 30% citation rate returns only P2 growth recommendations", () => {
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: "B2B SaaS" } as any,
        articleCount: 10,
        promptCount: 5,
        citationRunCount: 3,
        citationRate: 0.3,
        faqCount: 5,
        lastSignalsScanAt: new Date(),
        visibilityChecklistCompleted: 4,
        visibilityChecklistTotal: 4,
        competitorCount: 0,
        communityPostCount: 0,
      }),
    );
    expect(recs.every((r) => r.priority === "P2")).toBe(true);
    const ids = recs.map((r) => r.id);
    expect(ids).toContain("add-competitors");
    expect(ids).toContain("try-community-outreach");
  });

  it("output is capped at 5 items, P0 first", () => {
    // Construct a state where many rules fire simultaneously.
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: null } as any, // P0 #2
        articleCount: 0, // P0 #3
        promptCount: 0, // P0 #4
        citationRunCount: 0, // P0 #5
        citationRate: 0.1, // P1 #6 + #7 (faqCount=0)
        lastSignalsScanAt: null, // P1 #8
        visibilityChecklistCompleted: 1,
        visibilityChecklistTotal: 4, // P1 #9
        competitorCount: 0, // P2 #10
        communityPostCount: 0, // P2 #11
      }),
    );
    expect(recs.length).toBeLessThanOrEqual(5);
    // First items are P0.
    const priorities = recs.map((r) => r.priority);
    const firstP1Index = priorities.indexOf("P1");
    if (firstP1Index >= 0) {
      // No P0 should appear after the first P1.
      expect(priorities.slice(firstP1Index).every((p) => p !== "P0")).toBe(true);
    }
  });

  it("each recommendation includes a deep-link CTA href", () => {
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: "B2B SaaS" } as any,
        articleCount: 0,
      }),
    );
    expect(recs[0].ctaHref).toMatch(/^\//); // starts with /
    expect(recs[0].ctaLabel).toBeTruthy();
    expect(recs[0].why).toBeTruthy();
  });

  it("P0 recommendations are NOT dismissible; P1 and P2 ARE", () => {
    const recs = getRecommendations(
      state({
        brand: { id: "b-1", industry: "B2B SaaS" } as any,
        articleCount: 5,
        promptCount: 3,
        citationRunCount: 2,
        citationRate: 0.1, // triggers P1
        competitorCount: 0, // triggers P2
        lastSignalsScanAt: new Date(),
        visibilityChecklistCompleted: 4,
        visibilityChecklistTotal: 4,
      }),
    );
    for (const r of recs) {
      if (r.priority === "P0") {
        expect(r.dismissible).toBe(false);
      } else {
        expect(r.dismissible).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test, expect 7 failures (module not found)**

```
npx vitest run tests/unit/recommendationsEngine.test.ts
```

- [ ] **Step 3: Create `server/lib/recommendationsEngine.ts`**

```ts
import type { Brand } from "@shared/schema";

export type RecommendationPriority = "P0" | "P1" | "P2";
export type RecommendationCategory =
  | "setup"
  | "content"
  | "citations"
  | "signals"
  | "growth";

export type Recommendation = {
  /** Stable string id — part of the public contract. NEVER reuse an id
   *  for a different rule, because clients persist dismissed-ids in
   *  localStorage; reusing an id would mis-attribute a user's dismissal
   *  to the new rule. */
  id: string;
  title: string;
  why: string;
  ctaLabel: string;
  /** Deep-link to the relevant page. Starts with `/`. May include
   *  query params for actions (e.g. `?action=run`). */
  ctaHref: string;
  priority: RecommendationPriority;
  category: RecommendationCategory;
  /** P0 = false (blockers cannot be dismissed); P1/P2 = true. */
  dismissible: boolean;
};

export type RecommendationState = {
  brand: Brand | null;
  articleCount: number;
  promptCount: number;
  citationRunCount: number;
  /** Most recent run's citation rate as a fraction 0..1. Null if no
   *  runs completed yet. */
  citationRate: number | null;
  lastSignalsScanAt: Date | null;
  visibilityChecklistCompleted: number;
  visibilityChecklistTotal: number;
  competitorCount: number;
  communityPostCount: number;
  faqCount: number;
};

const SIGNALS_STALE_DAYS = 14;
const LOW_CITATION_RATE = 0.2;
const VISIBILITY_INCOMPLETE_THRESHOLD = 0.5;
const MAX_RECOMMENDATIONS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Pure function. Given a snapshot of brand state, returns the next
 *  3–5 recommendations in priority order (P0 first, then P1, then P2).
 *  No side effects — fully testable. */
export function getRecommendations(state: RecommendationState): Recommendation[] {
  const recs: Recommendation[] = [];
  const brandId = state.brand?.id;

  // ============ P0 (blockers) ============

  // 1. No brand → must create one before anything else works.
  if (state.brand === null) {
    recs.push({
      id: "create-brand",
      title: "Create your first brand",
      why: "Brand profiles are the foundation — every other feature attaches to one.",
      ctaLabel: "Create brand",
      ctaHref: "/brands",
      priority: "P0",
      category: "setup",
      dismissible: false,
    });
    return recs; // Nothing else makes sense without a brand.
  }

  // 2. Brand has no industry → all generated content + prompts are
  //    generic until industry is set.
  if (!state.brand.industry) {
    recs.push({
      id: "add-brand-industry",
      title: "Add your industry to brand profile",
      why: "Industry powers content tone, prompt generation, and competitor matching. Generic without it.",
      ctaLabel: "Edit brand",
      ctaHref: brandId ? `/brands/${brandId}` : "/brands",
      priority: "P0",
      category: "setup",
      dismissible: false,
    });
    return recs;
  }

  // 3. No articles → generate the first one.
  if (state.articleCount === 0) {
    recs.push({
      id: "generate-first-article",
      title: "Generate your first article",
      why: "AI engines need 3–5 published articles before citation checks have signal.",
      ctaLabel: "Generate article",
      ctaHref: `/content?brandId=${brandId}`,
      priority: "P0",
      category: "content",
      dismissible: false,
    });
  }

  // 4. No prompts → can't run citation checks without them.
  if (state.promptCount === 0) {
    recs.push({
      id: "generate-citation-prompts",
      title: "Generate citation-check prompts",
      why: "Citation checks ask AI engines questions and look for your brand in the answers — you need prompts to ask.",
      ctaLabel: "Generate prompts",
      ctaHref: `/citations?brandId=${brandId}&action=generate-prompts`,
      priority: "P0",
      category: "citations",
      dismissible: false,
    });
  }

  // 5. Has prompts but no runs → trigger the first one.
  if (state.promptCount > 0 && state.citationRunCount === 0) {
    recs.push({
      id: "run-first-citation-check",
      title: "Run your first citation check",
      why: "Establishes the baseline. Subsequent runs measure progress.",
      ctaLabel: "Run check",
      ctaHref: `/citations?brandId=${brandId}&action=run`,
      priority: "P0",
      category: "citations",
      dismissible: false,
    });
  }

  // ============ P1 (improvements) ============

  // 6. Low citation rate → fact sheet improves accuracy.
  if (state.citationRate !== null && state.citationRate < LOW_CITATION_RATE) {
    recs.push({
      id: "add-brand-fact-sheet",
      title: "Add a brand fact sheet to improve citation accuracy",
      why: `Your citation rate is ${Math.round(state.citationRate * 100)}%. A fact sheet gives AI engines verified facts to cite, reducing hallucinated alternatives.`,
      ctaLabel: "Add facts",
      ctaHref: `/brand-fact-sheet?brandId=${brandId}`,
      priority: "P1",
      category: "citations",
      dismissible: true,
    });
  }

  // 7. Low citation rate AND no FAQs → FAQs are highest-ROI for citation rate.
  if (
    state.citationRate !== null &&
    state.citationRate < LOW_CITATION_RATE &&
    state.faqCount === 0
  ) {
    recs.push({
      id: "optimize-faq",
      title: "Optimize your FAQ for AI engines",
      why: "Well-structured FAQs are one of the highest-ROI inputs for citation rate.",
      ctaLabel: "Open FAQ Manager",
      ctaHref: `/faq-manager?brandId=${brandId}`,
      priority: "P1",
      category: "signals",
      dismissible: true,
    });
  }

  // 8. Signals scan stale or never run.
  const signalsStale =
    state.lastSignalsScanAt === null ||
    Date.now() - state.lastSignalsScanAt.getTime() > SIGNALS_STALE_DAYS * MS_PER_DAY;
  if (signalsStale) {
    recs.push({
      id: "rerun-geo-signals",
      title: "Re-run GEO Signals scan",
      why:
        state.lastSignalsScanAt === null
          ? "GEO Signals scores chunkability, schema, and FAQ — never run for this brand."
          : `Last scan was ${Math.floor((Date.now() - state.lastSignalsScanAt.getTime()) / MS_PER_DAY)} days ago.`,
      ctaLabel: "Run scan",
      ctaHref: `/geo-signals?brandId=${brandId}`,
      priority: "P1",
      category: "signals",
      dismissible: true,
    });
  }

  // 9. AI Visibility checklist <50% complete.
  if (
    state.visibilityChecklistTotal > 0 &&
    state.visibilityChecklistCompleted / state.visibilityChecklistTotal <
      VISIBILITY_INCOMPLETE_THRESHOLD
  ) {
    recs.push({
      id: "complete-visibility-checklist",
      title: `Complete your AI Visibility checklist (${state.visibilityChecklistCompleted}/${state.visibilityChecklistTotal} done)`,
      why: "Each item completed boosts the chance an AI cites you accurately.",
      ctaLabel: "Open checklist",
      ctaHref: "/ai-visibility",
      priority: "P1",
      category: "setup",
      dismissible: true,
    });
  }

  // ============ P2 (growth) ============

  // 10. No competitors tracked.
  if (state.competitorCount === 0) {
    recs.push({
      id: "add-competitors",
      title: "Add competitors to track relative GEO performance",
      why: "Without competitors, you can't tell whether you're winning or just running in place.",
      ctaLabel: "Add competitors",
      ctaHref: `/competitors?brandId=${brandId}`,
      priority: "P2",
      category: "growth",
      dismissible: true,
    });
  }

  // 11. No community engagement.
  if (state.communityPostCount === 0) {
    recs.push({
      id: "try-community-outreach",
      title: "Try Reddit/Quora outreach for AEO",
      why: "Posts you make today can show up in AI answers within 4–8 weeks — direct AEO signal.",
      ctaLabel: "Open Community",
      ctaHref: `/community?brandId=${brandId}`,
      priority: "P2",
      category: "growth",
      dismissible: true,
    });
  }

  // ============ Cap output to 5, P0 first ============
  // Sort: priority weight (P0=0, P1=1, P2=2), then preserve insertion order
  // within priority via the index.
  const weight = { P0: 0, P1: 1, P2: 2 } as const;
  const indexed = recs.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => weight[a.r.priority] - weight[b.r.priority] || a.i - b.i);
  return indexed.slice(0, MAX_RECOMMENDATIONS).map(({ r }) => r);
}
```

- [ ] **Step 4: Run the test, expect 7 passes**

```
npx vitest run tests/unit/recommendationsEngine.test.ts
```

If any fail, common causes:
- Test imports `Brand as any` — fine; the engine only reads `brand.id` and `brand.industry`
- Cap-test counts `recs.length <= 5` — if your implementation returns 6+ items, recheck the slice in the cap section

- [ ] **Step 5: Run typecheck + full suite**

```
npm run check
npm test
```

Expected: typecheck clean, **271 tests passing** (264 baseline + 7 new).

### Task 2: Add `GET /api/brands/:brandId/recommendations` endpoint

**Files:**
- Modify: `server/routes/dashboard.ts`

**Why:** The endpoint loads brand state via parallel storage queries, calls the pure engine, returns the result. Auth + brand-ownership check are handled by the existing `app.param("brandId", brandIdParamHandler)` interceptor — same pattern as every other `/api/brands/:brandId/...` route.

- [ ] **Step 1: Read the current `server/routes/dashboard.ts`** end-to-end. Note:
- The import block at the top (will add `getRecommendations` + types)
- The pattern of existing route handlers (likely `asyncHandler(async (req, res) => { ... })`)
- Whether `requireUser` and other ownership helpers are imported
- The end of the file where the new handler can be appended

- [ ] **Step 2: Add the imports**

At the top of `server/routes/dashboard.ts`, alongside the existing imports:

```ts
import {
  getRecommendations,
  type RecommendationState,
} from "../lib/recommendationsEngine";
```

- [ ] **Step 3: Add the new endpoint at the end of `setupDashboardRoutes(app)` (or wherever other handlers are registered)**

```ts
app.get(
  "/api/brands/:brandId/recommendations",
  asyncHandler(async (req, res) => {
    const user = requireUser(req); // existing helper from ../lib/ownership
    const brandId = req.params.brandId;

    // Load all the state the engine needs in parallel. Each query is
    // simple and Supabase Free handles 6 round-trips in <100 ms.
    const brand = await storage.getBrandById(brandId);

    // If the brand doesn't exist or isn't owned by this user, return
    // a single "create your first brand" P0 recommendation. (The
    // brandIdParamHandler middleware already 404s on miss; this is
    // belt-and-braces.)
    if (!brand || brand.userId !== user.id) {
      return res.status(404).json({ success: false, error: "Brand not found" });
    }

    // Parallel-load all the count/state queries. Wrap each in a try/catch
    // (or use Promise.allSettled) so a single slow query doesn't block —
    // but Promise.all is fine in practice since these are local Supabase
    // queries with consistent latency.
    const [
      articles,
      prompts,
      citationRuns,
      competitors,
      communityPosts,
    ] = await Promise.all([
      storage.getArticlesByUserIdWithStatus(user.id, { brandId, limit: 1, offset: 0 }).catch(() => []),
      // Prompt count — adapt to whatever method exists for brandPrompts.
      // If `getBrandPrompts(brandId)` exists, use it. Otherwise, write a
      // tiny `select count(*) from brand_prompts where brand_id = $1`
      // query inline.
      storage.getBrandPrompts?.(brandId).catch(() => []) ?? [],
      storage.getCitationRunsByBrandId(brandId, 100).catch(() => []),
      storage.getCompetitors(brandId).catch(() => []),
      storage.getCommunityPosts?.(brandId).catch(() => []) ?? [],
    ]);

    // Citation rate from the most recent COMPLETED run. Null if no runs
    // have completed yet. Stored on citation_runs as `citation_rate` per
    // shared/schema.ts — fraction is total_cited / total_checks.
    const latestCompletedRun = citationRuns.find(
      (r: any) => r.status === "completed" || r.status === "succeeded",
    );
    const citationRate =
      latestCompletedRun && latestCompletedRun.totalChecks > 0
        ? latestCompletedRun.totalCited / latestCompletedRun.totalChecks
        : null;

    // FAQ count — use storage.getFaqItems(brandId) or similar. If no
    // method exists, default to 0 and let the engine's faqCount-based
    // rule (#7) skip until the data is available. This is a defensive
    // default; doesn't break the engine.
    const faqCount = (await storage.getFaqItems?.(brandId).catch(() => []))?.length ?? 0;

    // Last GEO Signals scan — find the most recent scan timestamp.
    // If no method exists, default to null (rule #8 will fire as if
    // never scanned). Defensive — the rule's user-facing message
    // handles both null and stale cases.
    const lastSignalsScanAt =
      (await storage.getLastSignalsScan?.(brandId).catch(() => null)) ?? null;

    // Visibility checklist progress — if there's no dedicated method,
    // call /api/onboarding-status's underlying query or default to
    // 0/4 (treats user as "haven't started" — engine will recommend
    // completing the checklist).
    const visibilityProgress = (await storage
      .getVisibilityChecklistProgress?.(user.id)
      .catch(() => ({ completed: 0, total: 4 }))) ?? { completed: 0, total: 4 };

    const state: RecommendationState = {
      brand,
      articleCount: articles.length,
      promptCount: prompts.length,
      citationRunCount: citationRuns.length,
      citationRate,
      lastSignalsScanAt,
      visibilityChecklistCompleted: visibilityProgress.completed,
      visibilityChecklistTotal: visibilityProgress.total,
      competitorCount: competitors.length,
      communityPostCount: communityPosts.length,
      faqCount,
    };

    const recommendations = getRecommendations(state);

    res.json({ success: true, data: recommendations });
  }),
);
```

**IMPORTANT — adapt to the actual storage layer**: `storage.getBrandPrompts`, `storage.getFaqItems`, `storage.getLastSignalsScan`, `storage.getVisibilityChecklistProgress` may or may not exist with those exact names. Read `server/databaseStorage.ts` first to find the actual method names. If a method doesn't exist:
- For prompts: there's likely a method like `getBrandPromptsByBrandId(brandId)` — check around lines 244-300
- For FAQs: check for `getFaqItems(brandId)` near line 4252 (community methods)
- For signals scan: may need to query `geo_signals_scans` table directly via Drizzle if no helper exists
- For visibility checklist: the data feeds `/api/onboarding-status` route at `server/routes/onboarding.ts` — find the existing query and either reuse it via a helper export or duplicate the logic inline

If a defensive default fits the rule's behavior (engine doesn't crash on `0` or `null`), use the default. Don't add new storage methods just for this endpoint unless the count is actually needed for an enabled rule.

For prompt count specifically, the engine REQUIRES it (rule #4 is "no prompts → recommend generate prompts"). If there's no `getBrandPrompts` storage method, write a tiny inline query:
```ts
import { brandPrompts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../db";

const promptRows = await db
  .select({ id: brandPrompts.id })
  .from(brandPrompts)
  .where(eq(brandPrompts.brandId, brandId));
const promptCount = promptRows.length;
```

- [ ] **Step 4: Run typecheck + full suite**

```
npm run check
npm test
```

Expected: typecheck clean, 271 tests passing. The new endpoint isn't tested via integration here (the engine itself is tested in Task 1; the endpoint is a thin adapter). If you want, you can add an integration test that mocks `storage` and verifies the wiring — out of scope per the test-coverage convention.

- [ ] **Step 5: Manual smoke test**

`npm run dev`. With auth, `curl` (or browser) to `http://localhost:5000/api/brands/<some-brand-id>/recommendations`. Confirm:
- Returns 200 with `{success: true, data: Recommendation[]}` shape
- The recommendations match the brand's actual state (e.g., a brand with 0 articles returns "Generate your first article")
- A brand-id you don't own returns 404
- An unauthenticated request returns 401

### PR 4.1 verification gate

- [ ] **Final checks for PR 4.1:**

```
npm run check
npm test
npx eslint server/lib/recommendationsEngine.ts server/routes/dashboard.ts 2>&1 | tail -3
```

Expected: typecheck clean, 271 tests passing, 0 eslint errors on touched files.

---

## PR 4.2 — `RecommendationsPanel` on dashboard (~3 hours)

### Task 3: Build `RecommendationsPanel` component + 3 RTL tests (TDD)

**Files:**
- Create: `client/src/components/dashboard/RecommendationsPanel.tsx`
- Create: `tests/unit/RecommendationsPanel.test.tsx`

- [ ] **Step 1: Write the failing tests FIRST**

Create `tests/unit/RecommendationsPanel.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock auth + brand selection so we control user.id and brandId.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: vi.fn(),
}));

// Mock Wouter Link as a plain anchor — renders the children directly.
vi.mock("wouter", () => ({
  Link: ({ href, children, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import { useAuth } from "@/hooks/use-auth";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import RecommendationsPanel from "@/components/dashboard/RecommendationsPanel";

function renderPanel(opts: {
  userId?: string;
  brandId?: string;
  recs?: any[];
}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  if (opts.recs !== undefined && opts.brandId) {
    qc.setQueryData(
      [`/api/brands/${opts.brandId}/recommendations`],
      { success: true, data: opts.recs },
    );
  }
  return render(
    <QueryClientProvider client={qc}>
      <RecommendationsPanel />
    </QueryClientProvider>,
  );
}

const SAMPLE_P0_REC = {
  id: "create-brand",
  title: "Create your first brand",
  why: "Brand profiles are the foundation.",
  ctaLabel: "Create brand",
  ctaHref: "/brands",
  priority: "P0",
  category: "setup",
  dismissible: false,
};

const SAMPLE_P1_REC = {
  id: "add-brand-fact-sheet",
  title: "Add a brand fact sheet",
  why: "Improves citation accuracy.",
  ctaLabel: "Add facts",
  ctaHref: "/brand-fact-sheet",
  priority: "P1",
  category: "citations",
  dismissible: true,
};

describe("RecommendationsPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-A" },
      isLoading: false,
    } as any);
    vi.mocked(useBrandSelection).mockReturnValue({
      selectedBrandId: "brand-1",
      selectedBrand: { id: "brand-1", name: "Acme" },
      brands: [],
      isLoading: false,
    } as any);
  });
  afterEach(() => localStorage.clear());

  it("renders multiple P0 cards correctly with no dismiss button", () => {
    renderPanel({
      brandId: "brand-1",
      recs: [
        SAMPLE_P0_REC,
        { ...SAMPLE_P0_REC, id: "add-brand-industry", title: "Add industry" },
        { ...SAMPLE_P0_REC, id: "generate-first-article", title: "Generate first article" },
      ],
    });
    expect(screen.getByText("Create your first brand")).toBeInTheDocument();
    expect(screen.getByText("Add industry")).toBeInTheDocument();
    expect(screen.getByText("Generate first article")).toBeInTheDocument();
    // P0 cards have no dismiss button.
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it("dismiss button on P1 card removes it + writes localStorage with timestamp", async () => {
    renderPanel({ brandId: "brand-1", recs: [SAMPLE_P1_REC] });
    expect(screen.getByText("Add a brand fact sheet")).toBeInTheDocument();

    const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
    await userEvent.click(dismissBtn);

    // Card removed from view.
    expect(screen.queryByText("Add a brand fact sheet")).not.toBeInTheDocument();
    // localStorage written with timestamp keyed by user.id.
    const raw = localStorage.getItem("venturecite-recs-dismissed:user-A");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed["add-brand-fact-sheet"]).toBeTruthy();
    // Value is an ISO timestamp.
    expect(() => new Date(parsed["add-brand-fact-sheet"])).not.toThrow();
  });

  it("different user.id sees fresh recommendations (dismissals don't leak)", () => {
    // user-A dismissed it.
    localStorage.setItem(
      "venturecite-recs-dismissed:user-A",
      JSON.stringify({ "add-brand-fact-sheet": new Date().toISOString() }),
    );

    // Switch to user-B.
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-B" },
      isLoading: false,
    } as any);

    renderPanel({ brandId: "brand-1", recs: [SAMPLE_P1_REC] });

    // user-B sees the recommendation (their localStorage is empty).
    expect(screen.getByText("Add a brand fact sheet")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, expect 3 failures**

```
npx vitest run tests/unit/RecommendationsPanel.test.tsx
```

- [ ] **Step 3: Create `client/src/components/dashboard/RecommendationsPanel.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Info } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const DISMISS_KEY_PREFIX = "venturecite-recs-dismissed:";
const DISMISS_DURATION_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type RecommendationPriority = "P0" | "P1" | "P2";

type Recommendation = {
  id: string;
  title: string;
  why: string;
  ctaLabel: string;
  ctaHref: string;
  priority: RecommendationPriority;
  category: string;
  dismissible: boolean;
};

const PRIORITY_STYLES: Record<RecommendationPriority, string> = {
  P0: "border-red-500/30 bg-red-500/5",
  P1: "border-amber-500/30 bg-amber-500/5",
  P2: "border-border bg-card",
};

const PRIORITY_LABEL: Record<RecommendationPriority, string> = {
  P0: "Required",
  P1: "Suggested",
  P2: "Optional",
};

function readDismissed(key: string | null): Record<string, string> {
  if (!key) return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeDismissed(key: string, dismissed: Record<string, string>): void {
  try {
    localStorage.setItem(key, JSON.stringify(dismissed));
  } catch {
    // Ignore — quota errors aren't fatal.
  }
}

/** Filters out P1/P2 recommendations dismissed within the last
 *  DISMISS_DURATION_DAYS. Returns recs unchanged if dismissals map is empty. */
function applyDismissals(
  recs: Recommendation[],
  dismissed: Record<string, string>,
): Recommendation[] {
  const cutoff = Date.now() - DISMISS_DURATION_DAYS * MS_PER_DAY;
  return recs.filter((r) => {
    if (!r.dismissible) return true; // P0s always show
    const dismissedAt = dismissed[r.id];
    if (!dismissedAt) return true;
    const dismissedMs = new Date(dismissedAt).getTime();
    if (Number.isNaN(dismissedMs)) return true; // bad data — show
    return dismissedMs < cutoff; // re-show after window
  });
}

export default function RecommendationsPanel() {
  const { user } = useAuth();
  const { selectedBrandId } = useBrandSelection();

  const dismissKey = user?.id ? `${DISMISS_KEY_PREFIX}${user.id}` : null;
  const [dismissed, setDismissed] = useState<Record<string, string>>(() =>
    readDismissed(dismissKey),
  );

  // Re-read dismissals when user changes (login as different account).
  useEffect(() => {
    setDismissed(readDismissed(dismissKey));
  }, [dismissKey]);

  const { data, isLoading, isError } = useQuery<{
    success: boolean;
    data: Recommendation[];
  }>({
    queryKey: [`/api/brands/${selectedBrandId}/recommendations`],
    enabled: !!selectedBrandId,
    staleTime: 60_000, // 1 minute — don't hammer on tab focus
  });

  if (!user?.id || !selectedBrandId) return null;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Couldn't load recommendations — try refreshing.
        </CardContent>
      </Card>
    );
  }

  const allRecs = data?.data ?? [];
  const visible = applyDismissals(allRecs, dismissed);

  if (visible.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          You're caught up for now. Check back as you publish more content.
        </CardContent>
      </Card>
    );
  }

  function handleDismiss(recId: string): void {
    if (!dismissKey) return;
    const next = { ...dismissed, [recId]: new Date().toISOString() };
    setDismissed(next);
    writeDismissed(dismissKey, next);
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold">Recommended next steps</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About recommendations"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                These suggestions update as your data grows. Required items can't be dismissed.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <ul className="space-y-2">
          {visible.map((rec) => (
            <li
              key={rec.id}
              className={[
                "flex items-start gap-3 p-3 rounded-lg border",
                PRIORITY_STYLES[rec.priority],
              ].join(" ")}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {PRIORITY_LABEL[rec.priority]}
                  </span>
                </div>
                <p className="text-sm font-medium mt-1">{rec.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{rec.why}</p>
                <Link
                  href={rec.ctaHref}
                  className="inline-block mt-2 text-xs font-medium text-primary hover:underline"
                >
                  {rec.ctaLabel} →
                </Link>
              </div>
              {rec.dismissible && (
                <button
                  type="button"
                  onClick={() => handleDismiss(rec.id)}
                  aria-label={`Dismiss recommendation: ${rec.title}`}
                  className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the test, expect 3 passing**

```
npx vitest run tests/unit/RecommendationsPanel.test.tsx
```

If any fail:
- "Dismiss" button not found → check the `aria-label` matches the test's regex (`/dismiss/i`)
- localStorage write not appearing → the `userEvent.click` is async; the `await` should be enough, but if needed wrap in `await waitFor(() => expect(localStorage.getItem(...)).toBeTruthy())`

- [ ] **Step 5: Run typecheck + full suite**

```
npm run check
npm test
```

Expected: typecheck clean, **274 tests passing** (271 + 3 new).

### Task 4: Mount `<RecommendationsPanel />` on the dashboard

**Files:**
- Modify: `client/src/pages/home.tsx`

**Why:** Per the design lock-in (Phase 1's user choice "stack all three"), `<OnboardingProgressRing />`, `<ResultsTimeline />`, and `<RecommendationsPanel />` all render at the top of the dashboard simultaneously.

- [ ] **Step 1: Read the existing top-of-dashboard area in `home.tsx`**

The Phase 1 work added:
```tsx
<OnboardingProgressRing />
<ResultsTimeline />
{/* hero metrics row */}
```

- [ ] **Step 2: Add the import**

At the top of `client/src/pages/home.tsx`, alongside the existing dashboard component imports:

```ts
import RecommendationsPanel from "@/components/dashboard/RecommendationsPanel";
```

- [ ] **Step 3: Mount below `<ResultsTimeline />`**

Find the existing block:
```tsx
<OnboardingProgressRing />
<ResultsTimeline />
```

Replace with:
```tsx
<OnboardingProgressRing />
<ResultsTimeline />
<RecommendationsPanel />
```

- [ ] **Step 4: Run typecheck + tests**

```
npm run check
npm test
```

Expected: clean, 274 tests passing.

- [ ] **Step 5: Manual smoke test**

`npm run dev`. Open `/dashboard` while logged in. Confirm:
- All three panels render in order: ring → timeline → recommendations
- Loading state: panel skeleton shows briefly
- For a fresh new account (no brand): the panel either shows "Create your first brand" P0 (if endpoint returns it) OR doesn't render (if `selectedBrandId` is null because no brand exists yet — that's also valid)
- For an account with cited results: panel shows P1/P2 recommendations
- Dismiss a P1 → it disappears immediately, persists across page reloads
- Different user logs in same browser → fresh recommendations (no leak)
- Mobile (375px): cards stack cleanly

### PR 4.2 verification gate

- [ ] **Final checks for PR 4.2:**

```
npm run check
npm test
npx eslint client/src/components/dashboard/RecommendationsPanel.tsx client/src/pages/home.tsx 2>&1 | tail -3
```

Expected: typecheck clean, 274 tests, 0 eslint errors on touched files.

---

## Final verification

### Task 5: End-to-end Phase 4 verification

- [ ] **Step 1: Full type + test + lint pass**

```
npm run check
npm test
npx eslint server/ client/src/ 2>&1 | tail -3
```

Expected:
- typecheck clean
- **274 tests passing** (264 + 10 new — 7 engine + 3 RTL panel)
- 0 eslint errors

- [ ] **Step 2: Manual smoke test through dashboard**

`npm run dev`. Walk through:

1. Empty account, no brand → ring shows "0/4", timeline shows "Day 0", recommendations panel either renders "Create your first brand" P0 or doesn't render (depends on whether selectedBrandId is set without a brand).
2. Account with brand + 0 articles → ring "1/4", recommendations include "Generate your first article" P0.
3. Account with full setup, 10% citation rate → ring done (auto-dismissed), timeline "Week 4+", recommendations show P1 fact-sheet + P1 FAQ + P1 signals (mixed).
4. Click dismiss on a P1 → disappears, reload page, still gone, wait 7 days simulated (or manually edit localStorage timestamp to be 8 days ago) → reappears.
5. Different user logs in same browser → fresh state, no dismissals leak.

- [ ] **Step 3: Verify diff footprint**

```
git diff --stat client/ server/ 2>&1 | tail -10
git status --short | grep -E "recommendationsEngine|RecommendationsPanel"
```

Expected modified:
- `server/routes/dashboard.ts`
- `client/src/pages/home.tsx`

Expected new:
- `server/lib/recommendationsEngine.ts`
- `client/src/components/dashboard/RecommendationsPanel.tsx`
- `tests/unit/recommendationsEngine.test.ts`
- `tests/unit/RecommendationsPanel.test.tsx`

- [ ] **Step 4: Report Phase 4 complete**

Summarize: 11 deterministic rules covering setup → improvements → growth, sub-200ms endpoint via parallel storage queries, 7-day soft-dismiss with user.id-scoped localStorage, P0 blockers cannot be dismissed.

---

## What this plan does NOT do

Per the spec's "Out of scope" section, Phase 4 deliberately does not:

- Persist dismissals server-side — all dismissal state is in localStorage scoped by `user.id`. Pros: zero backend infra, automatic cross-tab sync via TanStack Query refetch, GDPR-friendly. Cons: dismissals don't follow the user across devices. Acceptable tradeoff for pre-launch.
- Send recommendations via email digest — display-only for now. Could be added to the weekly digest later (the engine itself is reusable; the digest emitter would call `getRecommendations()` and render).
- Add an admin / agency view of multiple brands' recommendations — single-brand only for now.
- Add ML-powered recommendations — pure deterministic rules. The 11 rules cover the most common cases; if data shows users want different prioritization, add/modify rules in `recommendationsEngine.ts`.
- Show "completed" recommendations as a celebration list — they just disappear once their condition is no longer met. Less noise than a persistent "you did this" list.

---

## Vercel Hobby compatibility

- One new endpoint added to existing function bundle — no new Vercel function. Within Hobby's deployed-function limits trivially.
- Per-request DB load: 6 simple queries via Promise.all. Total <100 ms typical on Supabase Free. No risk of approaching 60s timeout even at 100x scale.
- Zero LLM token usage per pageview — the engine is pure local computation. Predictable cost.
- Zero new env vars, zero new crons, zero new dependencies.
- Bundle delta: ~+6 KB (panel + engine types via shared module).

---

## Test count delta

| Task | Tests added |
|---|---|
| Task 1 (recommendationsEngine) | 7 server unit |
| Task 3 (RecommendationsPanel) | 3 RTL |
| **Phase 4 total** | **10 new** |

Final test count: **274** (264 baseline + 10 new).
