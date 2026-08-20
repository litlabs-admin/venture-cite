# Plan 5: Recommendation Engine Persistence (§4.11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Silence the two false-positive recommendation rules (`#8 rerun-geo-signals`, `#9 complete-visibility-checklist`) by replacing hardcoded `null / 0` inputs in `server/routes/dashboard.ts:574-579` with reads from real persistence tables.

**Architecture:** `visibility_progress` table + storage methods + routes + client wiring all already exist (migration 0008). Only the dashboard read side is missing. `geo_signal_runs` is brand new — table + schema + storage methods + write side in `POST /api/geo-signals/analyze` + dashboard read all need wiring. No new rules. No engine changes. Pure plumbing.

**Tech Stack:** Drizzle ORM, PG, Express, Vitest. No new deps.

**Hard rules for all subagents:**
- ❌ Do NOT run ANY git mutating commands: `git commit`, `git add`, `git rm`, `git mv`, `git stash`, `git stash pop`, `git stash drop`, `git stash apply`, `git reset`, `git restore`, `git checkout` (when it discards), `git push`, `git pull`, `git fetch --prune`, `git rebase`, `git merge`, `git branch -D`, `git branch -m`, `git switch` (with dirty changes), `git clean`. Read-only git is allowed: `git status`, `git diff`, `git log`, `git show`, `git blame`, `git branch` (list).
- ❌ Do NOT trust .md files in this repo — verify every claim against code before acting on it.
- ❌ Do NOT add new features beyond what each task says.

---

### Task 1: Create `geo_signal_runs` table + Drizzle schema + storage methods

**Files:**
- Create: `migrations/0057_geo_signal_runs.sql`
- Modify: `shared/schema.ts` (add table, types, insert schema)
- Modify: `server/storage.ts` (add interface methods)
- Modify: `server/databaseStorage.ts` (implement methods)
- Test: `tests/unit/geoSignalRuns.test.ts`

- [ ] **Step 1: Write the migration**

Create `migrations/0057_geo_signal_runs.sql`:

```sql
-- One row per "Analyze GEO Signals" run. Powers the
-- `lastSignalsScanAt` input on the recommendations engine so rule #8
-- (`rerun-geo-signals`) stops firing on brands that have actually scanned.
CREATE TABLE IF NOT EXISTS geo_signal_runs (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      VARCHAR NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  article_id    VARCHAR REFERENCES articles(id) ON DELETE SET NULL,
  ran_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  overall_score INTEGER,
  payload       JSONB
);

CREATE INDEX IF NOT EXISTS geo_signal_runs_brand_id_ran_at_idx
  ON geo_signal_runs(brand_id, ran_at DESC);
```

Migration loader auto-applies on boot in lex order. `0057` is the next free number after `0056_user_welcomed_at.sql` (verified via `ls migrations/`).

- [ ] **Step 2: Add Drizzle schema in `shared/schema.ts`**

Place after the `visibilityProgress` block (around line 492). Insert:

```ts
// One row per "Analyze GEO Signals" run. Powers `lastSignalsScanAt`
// input on the recommendations engine so rule #8 stops firing on
// brands that have actually scanned.
export const geoSignalRuns = pgTable(
  "geo_signal_runs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    articleId: varchar("article_id").references(() => articles.id, {
      onDelete: "set null",
    }),
    ranAt: timestamp("ran_at").defaultNow().notNull(),
    overallScore: integer("overall_score"),
    payload: jsonb("payload"),
  },
  (table) => [
    index("geo_signal_runs_brand_id_ran_at_idx").on(table.brandId, table.ranAt),
  ],
);

export const insertGeoSignalRunSchema = createInsertSchema(geoSignalRuns).omit({
  id: true,
  ranAt: true,
});
export type GeoSignalRun = typeof geoSignalRuns.$inferSelect;
export type InsertGeoSignalRun = z.infer<typeof insertGeoSignalRunSchema>;
```

If `integer` or `jsonb` aren't already imported from `drizzle-orm/pg-core`, add them to the import line at the top of `shared/schema.ts`. Grep first — they are likely already imported.

- [ ] **Step 3: Add interface methods to `server/storage.ts`**

Add near the visibility-progress methods (verify location ~line 200 by grepping `getVisibilityProgress`):

```ts
recordGeoSignalRun(run: InsertGeoSignalRun): Promise<GeoSignalRun>;
getLastGeoSignalRunAt(brandId: string): Promise<Date | null>;
```

Add `GeoSignalRun, InsertGeoSignalRun` to the `@shared/schema` type import at the top of `server/storage.ts`.

- [ ] **Step 4: Implement methods in `server/databaseStorage.ts`**

Add after the `unsetVisibilityStep` method (around line 784):

```ts
async recordGeoSignalRun(run: InsertGeoSignalRun): Promise<GeoSignalRun> {
  const [row] = await db.insert(schema.geoSignalRuns).values(run).returning();
  return row;
}

async getLastGeoSignalRunAt(brandId: string): Promise<Date | null> {
  const [row] = await db
    .select({ ranAt: schema.geoSignalRuns.ranAt })
    .from(schema.geoSignalRuns)
    .where(eq(schema.geoSignalRuns.brandId, brandId))
    .orderBy(desc(schema.geoSignalRuns.ranAt))
    .limit(1);
  return row?.ranAt ?? null;
}
```

Add `GeoSignalRun, InsertGeoSignalRun` to the `@shared/schema` type import at the top of the file.

- [ ] **Step 5: Write tests**

Create `tests/unit/geoSignalRuns.test.ts`. Follow the pattern already used in `tests/unit/articlesAIGenerated.test.ts` (mock the `db` from `../../server/db` if that's the convention, otherwise use the existing test setup). Three cases:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
// Import path / mock pattern follows the conventions already in
// tests/unit/articlesAIGenerated.test.ts — replicate exactly.

describe("geoSignalRuns storage", () => {
  it("recordGeoSignalRun inserts and returns a row with brand + score", async () => {
    // arrange + act: call storage.recordGeoSignalRun({ brandId, articleId, overallScore, payload })
    // assert: returned row.id is defined, ranAt is recent, brandId matches
  });

  it("getLastGeoSignalRunAt returns null when no runs exist", async () => {
    // Insert nothing for this brand. Expect null.
  });

  it("getLastGeoSignalRunAt returns the most recent ranAt for the brand", async () => {
    // Insert 3 rows with different ranAt timestamps.
    // Expect the largest one.
  });
});
```

Run: `npx vitest run tests/unit/geoSignalRuns.test.ts`
Expected: 3 passing.

- [ ] **Step 6: Verify typecheck and full test suite still green**

Run: `npm run check 2>&1 | tail -20`
Expected: 0 errors.

Run: `npx vitest run 2>&1 | tail -10`
Expected: all passing.

---

### Task 2: Persist a row on every successful `POST /api/geo-signals/analyze`

**Files:**
- Modify: `server/routes/geoSignals.ts:515-560` (the `analyze` handler)
- Modify: `client/src/pages/geo-signals.tsx:280-294` (pass `brandId` and `articleId`)
- Test: `tests/unit/geoSignalsAnalyzePersistence.test.ts`

**Context:** The current `analyze` handler (`server/routes/geoSignals.ts:515-560`) takes `content`, `targetQuery`, `articleUpdatedAt`, `schemaCompleteness` and returns the computed signals. It does NOT take `brandId` or `articleId` today. The client (`client/src/pages/geo-signals.tsx:280-294`) DOES already pass `brandId` (verified at line 284) — so wiring is mostly server-side.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/geoSignalsAnalyzePersistence.test.ts`. Mock the storage layer. Cases:

```ts
describe("POST /api/geo-signals/analyze persistence", () => {
  it("inserts a geo_signal_runs row when brandId is provided and user owns the brand", async () => {
    // POST /api/geo-signals/analyze with { content, targetQuery, brandId, articleId }
    // Expect storage.recordGeoSignalRun called once with { brandId, articleId, overallScore, payload }
  });

  it("does NOT insert when brandId is omitted", async () => {
    // POST without brandId.
    // Expect storage.recordGeoSignalRun NOT called.
    // Response still 200 with signals (back-compat for ad-hoc usage).
  });

  it("does NOT insert when brandId is provided but the user does not own the brand", async () => {
    // POST with foreign brandId.
    // Expect 404 (anti-enumeration), no insert.
  });
});
```

Run: `npx vitest run tests/unit/geoSignalsAnalyzePersistence.test.ts -t "persistence"`
Expected: FAIL.

- [ ] **Step 2: Modify the analyze handler**

In `server/routes/geoSignals.ts`, edit the `app.post("/api/geo-signals/analyze", ...)` handler:

1. After destructuring `req.body`, also pull `brandId` and `articleId` (both optional strings).
2. After `const result = await computeSignals(...)` succeeds (right before `res.json(...)`), insert a row IF `brandId` is provided:

```ts
if (typeof brandId === "string" && brandId.length > 0) {
  const user = requireUser(req);
  // Ownership check — 404 on miss to match anti-enumeration policy.
  const brand = await storage.getBrandByIdAndUserId(brandId, user.id);
  if (!brand) {
    return res.status(404).json({ success: false, error: "Brand not found" });
  }
  await storage.recordGeoSignalRun({
    brandId: brand.id,
    articleId: typeof articleId === "string" && articleId.length > 0 ? articleId : null,
    overallScore: typeof result.overallScore === "number" ? Math.round(result.overallScore) : null,
    payload: {
      signals: result.signals,
      termCoverageRatio: result.termCoverageRatio,
      questionHeadingFraction: result.questionHeadingFraction,
      wordCount: result.wordCount,
    },
  });
}
```

Verify the ownership helper name. Grep `server/lib/ownership.ts` or `server/databaseStorage.ts` for the existing pattern (`getBrandByIdAndUserId`, `getBrandById` + manual `userId` check, or one of the `require*Ownership` helpers from `server/lib/ownership.ts`). Use whatever the rest of the file already uses for brand-scoped routes — do NOT introduce a new pattern.

- [ ] **Step 3: Verify the client passes `brandId` + `articleId`**

Read `client/src/pages/geo-signals.tsx:280-294`. The mutation type already accepts `brandId?: string`. Trace the call site (search the file for `analyzeSignalsMutation.mutate(`) and confirm:

- `brandId` is passed (the selected brand's id from the page state).
- `articleId` is passed when an article is selected (it's the per-article workspace).

If `articleId` is NOT currently in the mutation's type, add it (`articleId?: string`) and pass it from `selectedArticle?.id` at the mutate call site.

- [ ] **Step 4: Verify test passes + typecheck + full suite**

```
npx vitest run tests/unit/geoSignalsAnalyzePersistence.test.ts
npm run check 2>&1 | tail -10
npx vitest run 2>&1 | tail -10
```

Expected: new test passes, 0 tsc errors, all tests green.

---

### Task 3: Wire `dashboard.ts` to read from both persistence sources

**Files:**
- Modify: `server/routes/dashboard.ts:540-590`
- Modify: `shared/constants.ts` (add `VISIBILITY_CHECKLIST_TOTAL`)
- Test: `tests/unit/dashboardRecommendationInputs.test.ts`

**Context:** Today, `server/routes/dashboard.ts:574-579` hardcodes `lastSignalsScanAt: null, visibilityChecklistCompleted: 0, visibilityChecklistTotal: 4`. Both inputs need real reads. The total checklist size needs to match what the client computes from `aiEngines` in `client/src/pages/ai-visibility.tsx`. Putting the total in `shared/constants.ts` keeps client + server in sync.

- [ ] **Step 1: Count the real checklist total**

Open `client/src/pages/ai-visibility.tsx`. The `aiEngines` array is at line 77+; each engine has a `steps` array. The total = sum of `engine.steps.length` across all engines.

Count it manually (read the file, count steps). The spec §4.11 says "53 steps total." Verify that's still accurate — if the count differs, use the actual count.

- [ ] **Step 2: Add the constant to `shared/constants.ts`**

Add (verify file exists first; if not, the spec mentions it as already containing `AI_PLATFORMS_*`):

```ts
/**
 * Sum of `engine.steps.length` across all entries in
 * `client/src/pages/ai-visibility.tsx`'s `aiEngines` array.
 * Keep in sync with that file. Surfaced as the denominator of the
 * "AI Visibility checklist progress" recommendation input.
 */
export const VISIBILITY_CHECKLIST_TOTAL = <count from step 1>;
```

- [ ] **Step 3: Write the failing test**

Create `tests/unit/dashboardRecommendationInputs.test.ts`. Mock storage. Cases:

```ts
describe("GET /api/recommendations state assembly", () => {
  it("passes the last geo_signal_runs.ran_at as lastSignalsScanAt", async () => {
    // Mock storage.getLastGeoSignalRunAt to return a specific Date.
    // Spy on getRecommendations input. Expect state.lastSignalsScanAt to match.
  });

  it("passes null lastSignalsScanAt when no runs exist", async () => {
    // Mock storage.getLastGeoSignalRunAt to return null.
    // Expect state.lastSignalsScanAt === null.
  });

  it("passes visibility_progress row count as visibilityChecklistCompleted", async () => {
    // Mock storage.getVisibilityProgress to return [row, row, row].
    // Expect state.visibilityChecklistCompleted === 3.
    // Expect state.visibilityChecklistTotal === VISIBILITY_CHECKLIST_TOTAL.
  });

  it("rule #8 does not fire when last scan was 1 day ago", async () => {
    // Mock getLastGeoSignalRunAt → Date(now - 1 day).
    // Mock the rest with enough state to skip P0s.
    // Expect response.data to NOT contain a rec with id 'rerun-geo-signals'.
  });

  it("rule #9 does not fire when 90% of checklist is complete", async () => {
    // Mock getVisibilityProgress with > 0.5 * VISIBILITY_CHECKLIST_TOTAL rows.
    // Expect response.data to NOT contain a rec with id 'complete-visibility-checklist'.
  });
});
```

Run: `npx vitest run tests/unit/dashboardRecommendationInputs.test.ts`
Expected: FAIL.

- [ ] **Step 4: Modify the dashboard recommendations handler**

In `server/routes/dashboard.ts`, around lines 540-590, expand the `Promise.all` to fetch the two new inputs and replace the hardcoded values:

```ts
const [
  articles,
  prompts,
  citationRuns,
  competitors,
  communityPosts,
  faqItems,
  visibilityRows,
  lastSignalsScanAt,
] = await Promise.all([
  storage.getArticlesByUserIdWithStatus(user.id, { brandId, limit: 100, offset: 0 }),
  storage.getBrandPromptsByBrandId(brandId),
  storage.getCitationRunsByBrandId(brandId, 100),
  storage.getCompetitors(brandId),
  storage.getCommunityPosts(brandId),
  storage.getFaqItems(brandId),
  storage.getVisibilityProgress(brandId),
  storage.getLastGeoSignalRunAt(brandId),
]);
```

Then in the `state` object, replace:

```ts
lastSignalsScanAt: null,
visibilityChecklistCompleted: 0,
visibilityChecklistTotal: 4,
```

with:

```ts
lastSignalsScanAt,
visibilityChecklistCompleted: visibilityRows.length,
visibilityChecklistTotal: VISIBILITY_CHECKLIST_TOTAL,
```

Add the import: `import { VISIBILITY_CHECKLIST_TOTAL } from "@shared/constants";` (or relative path if `@shared` alias not configured on server — verify by checking the existing imports at the top of `dashboard.ts`).

Delete the obsolete comments at lines 544-546 and 574-578 explaining the defensive nulls — those are now lies.

- [ ] **Step 5: Verify tests pass + typecheck + full suite**

```
npx vitest run tests/unit/dashboardRecommendationInputs.test.ts
npm run check 2>&1 | tail -10
npx vitest run 2>&1 | tail -10
```

Expected: all green.

---

### Task 4: End-to-end verification

**Files:** No modifications. Read-only checks.

- [ ] **Step 1: Verify Success Criteria from §4.11**

Confirm each is true in code (not docs):

- `migrations/0057_geo_signal_runs.sql` exists and has correct DDL.
- `shared/schema.ts` exports `geoSignalRuns`, `GeoSignalRun`, `InsertGeoSignalRun`.
- `server/databaseStorage.ts` has `recordGeoSignalRun` + `getLastGeoSignalRunAt`.
- `server/routes/geoSignals.ts` analyze handler inserts a row when `brandId` is provided and ownership passes.
- `client/src/pages/geo-signals.tsx` mutation passes both `brandId` and `articleId`.
- `server/routes/dashboard.ts:540-590` reads from `getVisibilityProgress` + `getLastGeoSignalRunAt`. No `lastSignalsScanAt: null` literal remains. No `visibilityChecklistCompleted: 0` literal remains.
- `shared/constants.ts` exports `VISIBILITY_CHECKLIST_TOTAL` matching the actual sum of steps in `aiEngines`.

- [ ] **Step 2: Tour-target audit**

Run: `Grep` for `data-tour-id` markers across `client/src/`. Confirm count unchanged from prior plans (26 markers). Plan 5 touches no client-side tour targets.

- [ ] **Step 3: Manual server smoke (optional, only if a test DB is available)**

Spin `npm run dev`. POST a brand-owning user's analyze request with a real `brandId`. Confirm a row appears in `geo_signal_runs`. Hit `GET /api/recommendations`. Confirm response does NOT include `rerun-geo-signals` or `complete-visibility-checklist` if you've also created at least one `visibility_progress` row.

- [ ] **Step 4: Final report**

Report:
- Files created
- Files modified (with brief description per file)
- Tests added (counts) + final test suite result
- Tsc result
- Anything skipped / deferred and why

---

## Self-review checklist (controller runs this before declaring Plan 5 done)

- [ ] No `git commit`/stash/reset/checkout-discard touched at any point (verify `git status` shows unstaged changes only).
- [ ] Migration number `0057` not collided with anything else.
- [ ] `VISIBILITY_CHECKLIST_TOTAL` matches actual aiEngines sum (counted from the file, not from spec).
- [ ] Ownership check on the analyze endpoint uses the same helper as other brand-scoped routes in the same file.
- [ ] All new tests pass + full suite green + `npm run check` clean.
- [ ] No new dependencies introduced.
- [ ] No design-token violations introduced (server-only changes, but verify the client `geo-signals.tsx` edit if any).
