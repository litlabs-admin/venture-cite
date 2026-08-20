# Foundations Plan 1 — Faking-as-Real Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every UI surface that lies to the user — dead buttons that don't do anything, fake platform options for systems we don't actually integrate with, fabricated metrics displayed as if measured, fake progress theatre, and orphan-link CTAs that 404. After this plan lands, every button, dropdown option, and metric on a sidebar-reachable page is either real or doesn't render.

**Architecture:** Twelve focused tasks, each touching a narrow surface (1–4 files per task). All tasks are independent — no shared state, no ordering constraints. Suitable for parallel subagent execution. Each task ends with a verification step (grep / build / test). Per user instruction, **no `git commit` steps in this plan** — engineer leaves changes staged or unstaged; user commits manually.

**Tech Stack:** React 18 + Vite + Wouter + TanStack Query + Tailwind + shadcn/Radix; Express 4 + Drizzle ORM + Pino on the server; Vitest for tests.

**Plan-wide rules:**
- **Do not commit.** Per user standing instruction. Run `npm run check` and `npm run lint` for each touched file; let the user decide when to commit.
- **Verify file:line claims before editing.** The Foundations spec references specific line numbers from 2026-05-10; the codebase ships fast. Every task starts with a grep step to confirm the target still exists where the spec says it does.
- **No new external services.** Vercel Hobby ceiling. Nothing introduced here adds infrastructure.
- **Parallel-safe.** Tasks 1–12 may run in parallel except where explicit cross-file coordination is called out (Task 2 Quora purge touches 3+1 files together).

**Spec reference:** [docs/superpowers/specs/2026-05-10-foundations-design.md §4.5](../specs/2026-05-10-foundations-design.md), items a/b/c/d/e/f/g/h/i/j/k/l/m/q/r/s/t. Items n/o/p of §4.5 are deferred to **Foundations Plan 2** (they require the `<StatusDot>` primitive which doesn't exist yet).

---

## Task 1: Reports page cleanup (items a, b, c, d)

**Spec:** §4.5 items a, b, c, d.

**Goal:**
- Remove the **Export PDF** button entirely (no CSV stand-in).
- Remove the **Share** button entirely.
- **Wire** the **Schedule Weekly Report** toggle to the existing `weeklyReportEnabled` user preference.
- Replace the static "Next update in 24 hours" copy with a live "Last refreshed: <relative time>" sourced from the query response timestamp.

**Files:**
- Modify: `client/src/pages/client-reports.tsx`
- Modify (small): `server/routes/users.ts` (or wherever `PATCH /api/user/notification-preferences` lives — verify in Step 1)
- Reference (do not modify): `server/scheduler.ts` (existing weekly-report cron — confirm it gates on `weeklyReportEnabled`)

### Steps

- [ ] **Step 1: Locate current state.**

```bash
# Confirm the three buttons exist where the spec says
grep -n "Export PDF\|Schedule Weekly Report\|Next update in 24 hours" client/src/pages/client-reports.tsx
# Find the weekly report cron and confirm it reads weeklyReportEnabled
grep -n "weeklyReportEnabled\|weekly" server/scheduler.ts
# Find the existing user-prefs PATCH route
grep -rn "weeklyReportEnabled" server/routes/
```

Expected: line numbers near the spec's references (~111-119 Export, ~120-123 Share, ~423-426 Schedule, ~421 copy). If line numbers have drifted, use the discovered locations.

- [ ] **Step 2: Remove Export PDF and Share buttons.**

In `client/src/pages/client-reports.tsx`, locate the action button cluster in the page header and delete:
- The `<Button>` whose label is `Export PDF` (and its surrounding wrapper if it's empty after removal)
- The `<Button>` whose label is `Share`

Leave the page header row otherwise intact.

- [ ] **Step 3: Wire the Schedule Weekly Report toggle.**

The button currently renders without an `onClick`. Convert it to a controlled toggle that drives `user.weeklyReportEnabled` via the existing TanStack Query mutation pattern used elsewhere in the file (or follow `client/src/pages/settings.tsx` if there's an existing notification-pref mutation).

```tsx
// Inside the Reports page header, replacing the dead button:
const { data: prefs } = useQuery({
  queryKey: ["/api/user/notification-preferences"],
  queryFn: () => apiRequest("GET", "/api/user/notification-preferences").then((r) => r.json()),
});

const togglePref = useMutation({
  mutationFn: (enabled: boolean) =>
    apiRequest("PATCH", "/api/user/notification-preferences", { weeklyReportEnabled: enabled }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/user/notification-preferences"] }),
});

<div className="flex items-center gap-2">
  <Switch
    checked={!!prefs?.weeklyReportEnabled}
    onCheckedChange={(v) => togglePref.mutate(v)}
    disabled={togglePref.isPending}
    aria-label="Weekly report email"
  />
  <Label className="text-sm text-muted-foreground">Email me weekly</Label>
</div>
```

Replace the actual existing imports of `useQuery`/`useMutation`/`apiRequest`/`queryClient` with whatever the page already has — don't duplicate.

- [ ] **Step 4: Replace the stale copy.**

Find the line that reads `Next update in 24 hours` (~`client-reports.tsx:421` per spec). Replace with:

```tsx
<p className="text-sm text-muted-foreground">
  Last refreshed: {formatRelative(query.dataUpdatedAt)}
</p>
```

Where `query` is the existing TanStack Query that loads report data. `dataUpdatedAt` is built-in (epoch ms). Use the existing `date-fns` import (or wherever the project already imports relative time formatting) — check `client/src/lib/` first; if no helper exists, inline:

```tsx
const ageMs = Date.now() - query.dataUpdatedAt;
const ageMin = Math.round(ageMs / 60000);
const label = ageMin < 1 ? "just now" : ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin/60)}h ago`;
```

- [ ] **Step 5: Confirm the cron path is unchanged.**

Open `server/scheduler.ts` and verify the weekly-report cron job iterates over users with `weeklyReportEnabled === true`. Do not modify scheduler.ts in this task. (If the cron does NOT gate on the flag, file a follow-up — but per the spec recon, it does.)

- [ ] **Step 6: Verify the route handles the PATCH.**

Confirm `PATCH /api/user/notification-preferences` accepts `weeklyReportEnabled` in the body and persists it. If it accepts the field but ignores it for any reason, fix that.

- [ ] **Step 7: Confirm-clean.**

```bash
grep -n "Export PDF\|Share\b\|Next update in 24 hours" client/src/pages/client-reports.tsx
```

Expected: only `Share` matches if the word appears legitimately elsewhere (e.g., inside a description string); no buttons labeled Export PDF or Share remain.

```bash
npm run check 2>&1 | tail -40
npm run lint -- client/src/pages/client-reports.tsx 2>&1 | tail -20
```

Expected: no new errors in client-reports.tsx.

- [ ] **Step 8: Manual smoke test.**

Run `npm run dev`. Log in. Navigate to `/client-reports` (or whatever sidebar entry surfaces it). Confirm:
- No Export PDF, no Share button.
- Weekly toggle reflects the current pref and persists after page reload.
- Header shows "Last refreshed: Xm ago" updating on refresh.

Do not commit.

---

## Task 2: Quora full purge (items e, f, g)

**Spec:** §4.5 items e, f, g.

**Goal:** Remove every Quora reference from in-use UI and server code. Quora is not implemented (no scanner in `server/lib/mentionScanner.ts`). The classifier mapping `quora.com → "community"` in citationChecker stays — that's source classification, harmless.

**Files:**
- Modify: `client/src/pages/community-engagement.tsx`
- Modify: `client/src/pages/geo-opportunities.tsx`
- Modify: `client/src/components/articles/DistributeDialog.tsx`
- Modify: `server/routes/analytics.ts` (delete `INDUSTRY_QUORA_TOPICS` map and the response branch that uses it)

### Steps

- [ ] **Step 1: Locate every Quora reference.**

```bash
grep -rn -i "quora" client/src/
grep -rn -i "quora" server/
```

Expected: spec lists hits in 3 client files + 1 server file. Save the full list — every match needs to be classified as **purge** or **keep** (only the citationChecker classifier mapping is keep).

- [ ] **Step 2: Strip Quora from `community-engagement.tsx`.**

Remove:
- `import { SiQuora } from "react-icons/si"` (if present)
- The Quora entry from any `platformIcons` / `platformOptions` / `PLATFORMS` array
- The Quora `<SelectItem>` from the platform dropdown
- Any prompt branch keyed on `platform === "quora"`
- The Quora row in any best-practices section
- Header copy mentioning Quora

- [ ] **Step 3: Strip Quora from `geo-opportunities.tsx`.**

Remove:
- The entire `<TabsTrigger>` for Quora and the corresponding `<TabsContent>` block
- The `quora` key from any opportunities reducer/selector
- Any `INDUSTRY_QUORA_TOPICS` references on the client (if imported via shared module)

- [ ] **Step 4: Strip Quora from `DistributeDialog.tsx`.**

Remove:
- The Quora entry in the platforms array (~line 37 per spec)
- Any conditional rendering keyed on a Quora platform value

- [ ] **Step 5: Delete the server-side Quora map.**

Open `server/routes/analytics.ts`. Locate `INDUSTRY_QUORA_TOPICS` (~lines 1327-1369 per spec).

```bash
grep -n "INDUSTRY_QUORA_TOPICS\|quora" server/routes/analytics.ts
```

Delete the constant. Delete the response branch in the `/api/geo-opportunities` handler that constructs the `quora` bucket. Update the response shape: the returned object no longer has a `quora` field.

- [ ] **Step 6: Update consumers if the response shape change is breaking.**

```bash
grep -rn "opportunities.quora\|\\.quora" client/src/
```

If the client now reads `opportunities.quora`, remove those reads.

- [ ] **Step 7: Verify nothing references Quora outside the citationChecker classifier.**

```bash
grep -rn -i "quora" client/src/ server/
```

Expected output: **only** `server/citationChecker.ts:~182` mapping `quora.com → "community"` for source classification. Anything else needs to be cleaned.

- [ ] **Step 8: Build + type check.**

```bash
npm run check 2>&1 | tail -40
```

Expected: passes. If broken (likely because a removed type field is still referenced), fix the call sites surfaced by the type errors.

- [ ] **Step 9: Manual smoke test.**

`npm run dev`. Navigate to `/community-engagement` and `/geo-opportunities`. Confirm no Quora option in dropdowns, no Quora tab, no Quora copy.

Do not commit.

---

## Task 3: AI Visibility 404 quick-action audit (item h)

**Spec:** §4.5 item h.

**Goal:** Repoint or drop every `quickAction.link` value on `/ai-visibility` that points to a route that doesn't exist.

**Files:**
- Modify: `client/src/pages/ai-visibility.tsx`
- Reference: `client/src/App.tsx` (route table — source of truth for what routes exist)

### Steps

- [ ] **Step 1: Build the source-of-truth route list.**

```bash
grep -n "<Route path=" client/src/App.tsx
```

Save the list of every `path="/..."` value. This is the universe of valid in-product destinations.

- [ ] **Step 2: List every `quickAction.link` value in ai-visibility.tsx.**

```bash
grep -n "link:" client/src/pages/ai-visibility.tsx
```

Each match is a candidate. Cross-reference each against the route list from Step 1.

- [ ] **Step 3: Apply per-link decision.**

For each `quickAction.link` value:
- **In the route table → keep.**
- **Not in the route table, has a near-equivalent live page →** repoint to the equivalent. Known cases per spec:
  - `/geo-rankings` → repoint to `/citations`
- **Not in the route table, no equivalent →** drop the entire `quickAction` field (not just the link — drop the property so the CTA button doesn't render). Known cases per spec:
  - `/publications` → drop the quickAction entirely on the step at `~ai-visibility.tsx:513`

- [ ] **Step 4: Sweep for any other broken links.**

```bash
grep -n 'navigate("/\|Link to="/\|href="/' client/src/pages/ai-visibility.tsx
```

Cross-check each against the route table. Any miss → repoint or drop.

- [ ] **Step 5: Verify no 404 destinations remain.**

For every link still present in `ai-visibility.tsx`, confirm the path appears in the route list from Step 1.

- [ ] **Step 6: Build + lint.**

```bash
npm run check 2>&1 | tail -30
npm run lint -- client/src/pages/ai-visibility.tsx 2>&1 | tail -20
```

- [ ] **Step 7: Manual smoke test.**

`npm run dev` → log in → navigate to `/ai-visibility`. For each visible quickAction button, click it. Expected: every click lands on a real page, not 404.

Do not commit.

---

## Task 4: PHASE_BANDS removal + honest progress + Cancel button (item i)

**Spec:** §4.5 item i.

**Goal:** Replace the time-driven fake phase-name rotation with an honest single line showing elapsed seconds. Add a Cancel button that aborts a running generation.

**Files:**
- Modify: `server/routes/content.ts` (delete `PHASE_BANDS`, `phaseFor`)
- Modify: `client/src/pages/content.tsx` (or wherever the phase UI renders — verify in Step 1)
- Create: `server/routes/content-cancel.ts` is **not** required; add the cancel endpoint inline to `routes/content.ts`
- Test: `tests/content-cancel.test.ts`

### Steps

- [ ] **Step 1: Locate current state.**

```bash
grep -n "PHASE_BANDS\|phaseFor" server/routes/content.ts
grep -rn "phase\|Phase" client/src/pages/content.tsx | head -40
```

Save the phase indicator's exact location in the client.

- [ ] **Step 2: Decide cancel mechanism.**

The content generation runs in `server/contentGenerationWorker.ts` (polling worker). Cancellation = set `content_generation_jobs.status = 'cancelled'` for the job belonging to this article+user. The worker checks status before each LLM step and bails on `cancelled`.

```bash
grep -n "FOR UPDATE SKIP LOCKED\|status" server/contentGenerationWorker.ts | head -20
```

Verify the worker reads status from the job row at LLM-call boundaries. If it doesn't, add a re-read between the major calls (outline → sections → polish).

- [ ] **Step 3: Write the failing test.**

`tests/content-cancel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../server/app";
import { withTestUser, seedArticle, seedJob } from "./helpers";

describe("POST /api/content/:articleId/cancel", () => {
  it("marks the running job as cancelled and returns 200", async () => {
    const { token, userId, brandId } = await withTestUser();
    const article = await seedArticle({ userId, brandId, status: "queued" });
    const job = await seedJob({ articleId: article.id, status: "running" });

    const res = await request(app)
      .post(`/api/content/${article.id}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send();

    expect(res.status).toBe(200);
    // Re-read job status from DB
    const updated = await getJob(job.id);
    expect(updated.status).toBe("cancelled");
  });

  it("returns 404 when the article belongs to a different user (anti-enumeration)", async () => {
    const { token: ownerToken } = await withTestUser();
    const otherUser = await withTestUser();
    const article = await seedArticle({ userId: otherUser.userId, status: "queued" });

    const res = await request(app)
      .post(`/api/content/${article.id}/cancel`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });
});
```

Adapt to existing test helpers in `tests/` — they may be named differently. Inspect `tests/helpers.ts` or equivalent before writing.

- [ ] **Step 4: Run the test to confirm it fails.**

```bash
npx vitest run tests/content-cancel.test.ts
```

Expected: FAIL with 404 on the POST (route doesn't exist yet).

- [ ] **Step 5: Add the cancel route.**

In `server/routes/content.ts`:

```ts
router.post("/:articleId/cancel", isAuthenticated, requireArticleOwnership, async (req, res) => {
  const articleId = req.params.articleId;
  await pool.query(
    `UPDATE content_generation_jobs SET status = 'cancelled', updated_at = NOW()
     WHERE article_id = $1 AND status IN ('queued', 'running')`,
    [articleId]
  );
  res.status(200).json({ ok: true });
});
```

Use the actual ownership middleware from `server/lib/ownership.ts` — verify the helper name in `grep -n "requireArticleOwnership\|require.*Article" server/lib/ownership.ts`.

- [ ] **Step 6: Run the test again.**

```bash
npx vitest run tests/content-cancel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Delete `PHASE_BANDS` and `phaseFor` from `server/routes/content.ts`.**

Find the constant array (~lines 58-77) and the `phaseFor` function. Delete both. Find every call site of `phaseFor` and replace with the elapsed seconds value:

```ts
// Where phaseFor(elapsedMs) was returning a band like { name: "Drafting outline" }, replace with:
const elapsedSeconds = Math.round(elapsedMs / 1000);
```

Update the SSE event payload (or polling response, depending on transport) to send `{ elapsedSeconds: number, status: "running" | "ready" | "cancelled" | "failed" }` — drop the fake `phase: string` field.

- [ ] **Step 8: Update the client.**

In `client/src/pages/content.tsx`, find the phase indicator UI. Replace the fake phase-label render with:

```tsx
<div className="text-sm text-muted-foreground">
  Generating ({elapsedSeconds}s)
</div>
```

Add a Cancel button:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => cancelMutation.mutate(articleId)}
  disabled={cancelMutation.isPending}
>
  Cancel
</Button>
```

Where:

```tsx
const cancelMutation = useMutation({
  mutationFn: (id: string) => apiRequest("POST", `/api/content/${id}/cancel`).then((r) => r.json()),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/articles", articleId] }),
});
```

- [ ] **Step 9: Re-run tests.**

```bash
npx vitest run
npm run check
```

Expected: all tests pass; tsc clean.

- [ ] **Step 10: Manual smoke test.**

`npm run dev` → trigger a content generation → confirm the phase label shows seconds, not fake phase names → click Cancel → confirm the article moves to a cancelled state (or job status reads cancelled in DB) and UI reflects it.

Do not commit.

---

## Task 5: Keyword Research provenance + AI-estimated badges (item j)

**Spec:** §4.5 item j.

**Goal:** Add a `provenance` column to `keyword_research` rows so the system can later distinguish AI-estimated vs measured data. Tag every existing AI-generated row with `provenance = 'ai-estimate'`. Surface an "AI-estimated" badge + tooltip on every numeric metric in the UI.

**Files:**
- Create: `migrations/0052_keyword_research_provenance.sql`
- Modify: `shared/schema.ts` (add `provenance` column to `keywordResearch` table)
- Modify: `server/routes/content.ts` (insert path — write `provenance: 'ai-estimate'`)
- Modify: `client/src/pages/keyword-research.tsx` (render badge + tooltip)
- Test: `tests/keyword-research-provenance.test.ts`

### Steps

- [ ] **Step 1: Verify current schema.**

```bash
grep -n "keywordResearch\|keyword_research" shared/schema.ts
ls migrations/ | tail -5
```

Note the latest migration number. Use the next sequential number (probably 0052).

- [ ] **Step 2: Write the migration.**

`migrations/0052_keyword_research_provenance.sql`:

```sql
ALTER TABLE keyword_research
  ADD COLUMN provenance TEXT NOT NULL DEFAULT 'ai-estimate';

CREATE INDEX IF NOT EXISTS keyword_research_provenance_idx ON keyword_research(provenance);
```

- [ ] **Step 3: Update the Drizzle schema.**

In `shared/schema.ts`, add to the `keywordResearch` table:

```ts
provenance: text("provenance").notNull().default("ai-estimate"),
```

- [ ] **Step 4: Write the failing test.**

`tests/keyword-research-provenance.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../server/app";
import { withTestUser } from "./helpers";

describe("POST /api/keyword-research", () => {
  it("persists rows with provenance = 'ai-estimate'", async () => {
    const { token, brandId } = await withTestUser();
    const res = await request(app)
      .post("/api/keyword-research")
      .set("Authorization", `Bearer ${token}`)
      .send({ brandId, seedTopic: "test topic" });

    expect(res.status).toBe(200);
    const row = res.body.results[0];
    expect(row.provenance).toBe("ai-estimate");
  });
});
```

- [ ] **Step 5: Run test — expect fail.**

```bash
npx vitest run tests/keyword-research-provenance.test.ts
```

Expected: FAIL (column doesn't exist yet OR field not returned).

- [ ] **Step 6: Apply migration.**

The app auto-applies migrations on boot from `migrations/*.sql` per CLAUDE.md. Run:

```bash
npm run dev  # in another shell; migration runs on boot
# Then stop the dev server once you see the migration log line
```

Alternatively if there's a `npm run db:migrate` script, use that.

- [ ] **Step 7: Update insert path.**

In `server/routes/content.ts` (or wherever `/api/keyword-research` is handled — verify with `grep -rn "keyword.research\|keywordResearch" server/routes/`), include `provenance: 'ai-estimate'` in the insert.

- [ ] **Step 8: Run test — expect pass.**

```bash
npx vitest run tests/keyword-research-provenance.test.ts
```

Expected: PASS.

- [ ] **Step 9: Add the UI badge + tooltip.**

In `client/src/pages/keyword-research.tsx`, wherever numeric columns render (search volume, difficulty, opportunity score, AI citation potential), wrap with a tooltip:

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <span className="inline-flex items-center gap-1">
      {value.toLocaleString()}
      <Sparkles className="h-3 w-3 text-muted-foreground" />
    </span>
  </TooltipTrigger>
  <TooltipContent>
    AI-estimated, not measured. We don't yet integrate a real search-volume source.
  </TooltipContent>
</Tooltip>
```

Use the project's existing Tooltip primitive (`@/components/ui/tooltip` per shadcn convention). Verify import path with `grep -n "Tooltip" client/src/components/ui/tooltip.tsx`.

Add a single info banner at the top of the results table:

```tsx
<Alert variant="default" className="mb-4">
  <Sparkles className="h-4 w-4" />
  <AlertDescription>
    These figures are AI-estimated, not measured. Real search-volume integration is planned.
  </AlertDescription>
</Alert>
```

- [ ] **Step 10: Run all tests + type check.**

```bash
npx vitest run
npm run check
```

- [ ] **Step 11: Manual smoke test.**

`/keyword-research` → seed a topic → confirm badges + tooltip text + banner appear.

Do not commit.

---

## Task 6: AI_PLATFORMS split + "9 platforms" copy correction (item k)

**Spec:** §4.5 item k.

**Goal:** Eliminate the claim "9 AI platforms" because only 5 produce data. Split the constant into `AI_PLATFORMS_ACTIVE` (5) and `AI_PLATFORMS_PLANNED` (the rest). Update geo-analytics copy and platform rendering to consume only ACTIVE.

**Files:**
- Modify: `shared/constants.ts` (or wherever `AI_PLATFORMS` lives — verify in Step 1)
- Modify: `client/src/pages/geo-analytics.tsx` (lines ~227, ~361 per spec — and any platform-breakdown component)
- Reference: `server/citationChecker.ts` (~lines 42-48 — source of truth for which engines actually produce data)

### Steps

- [ ] **Step 1: Locate the constant.**

```bash
grep -rn "AI_PLATFORMS\b" shared/ client/src/ server/
```

Confirm where the canonical list is defined.

- [ ] **Step 2: Confirm which 5 platforms are real.**

```bash
grep -n "engines\|EngineName\|platform" server/citationChecker.ts | head -30
```

Expected: ChatGPT, Claude, Perplexity, Gemini, DeepSeek. Anything not in this list is the PLANNED set.

- [ ] **Step 3: Split the constant.**

In the file containing `AI_PLATFORMS`, replace:

```ts
export const AI_PLATFORMS = [
  { id: "chatgpt", name: "ChatGPT", ... },
  { id: "claude", ... },
  ...all 9...
] as const;
```

With:

```ts
export const AI_PLATFORMS_ACTIVE = [
  { id: "chatgpt", name: "ChatGPT", ... },
  { id: "claude", name: "Claude", ... },
  { id: "perplexity", name: "Perplexity", ... },
  { id: "gemini", name: "Gemini", ... },
  { id: "deepseek", name: "DeepSeek", ... },
] as const;

export const AI_PLATFORMS_PLANNED = [
  { id: "grok", name: "Grok", ... },
  { id: "microsoft-copilot", name: "Microsoft Copilot", ... },
  { id: "meta-ai", name: "Meta AI", ... },
  { id: "google-ai-overview", name: "Google AI Overview", ... },
] as const;

// Backwards-compatible export for any remaining consumers
export const AI_PLATFORMS = AI_PLATFORMS_ACTIVE;
```

Preserve every existing `id`, `name`, `icon`, and other metadata fields from the original constant — only the grouping changes.

- [ ] **Step 4: Update the copy in `geo-analytics.tsx`.**

```bash
grep -n "9 AI platforms\|nine\|platforms" client/src/pages/geo-analytics.tsx
```

Replace every "9 AI platforms" / "across 9 platforms" with "5 AI platforms (ChatGPT, Claude, Perplexity, Gemini, DeepSeek)" — or use `AI_PLATFORMS_ACTIVE.length` for the count and `.map(p => p.name).join(", ")` for the list.

- [ ] **Step 5: Update consumers of the old `AI_PLATFORMS`.**

```bash
grep -rn "AI_PLATFORMS\b" client/src/
```

Anywhere consumed for rendering "platforms with data," switch to `AI_PLATFORMS_ACTIVE`. Anywhere consumed for a roadmap surface (if such exists), use `AI_PLATFORMS_PLANNED`.

- [ ] **Step 6: Type-check.**

```bash
npm run check 2>&1 | tail -30
```

Fix any consumer that breaks due to the rename.

- [ ] **Step 7: Manual smoke test.**

`/geo-analytics` → confirm "5 AI platforms" copy and that only the 5 active platforms render in any breakdown.

Do not commit.

---

## Task 7: Per-platform icons on Competitors (item l)

**Spec:** §4.5 item l.

**Goal:** `competitors.tsx:~496` uses `SiOpenai` for every platform row (Claude / Gemini / Perplexity all visually show OpenAI's logo — a visual lie). Use one icon per platform.

**Files:**
- Modify: `client/src/pages/competitors.tsx`

### Steps

- [ ] **Step 1: Locate the icon usage.**

```bash
grep -n "SiOpenai\|platform" client/src/pages/competitors.tsx | head -30
```

- [ ] **Step 2: Discover available brand icons.**

```bash
grep -rn "react-icons/si" client/src/ | head -20
```

Verify which `react-icons/si` glyphs are already in use elsewhere. For platforms without a dedicated brand glyph in react-icons, use a `lucide-react` semantic icon (`Brain`, `Sparkles`, `Search`) as fallback — never reuse `SiOpenai`.

- [ ] **Step 3: Build a per-platform icon map.**

```tsx
import { SiOpenai, SiGoogle } from "react-icons/si";
import { Brain, Sparkles, Search } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

const platformIcon: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  chatgpt: SiOpenai,
  claude: Brain,       // no Anthropic glyph in react-icons/si
  gemini: SiGoogle,
  perplexity: Sparkles,
  deepseek: Search,
};

// Usage:
const Icon = platformIcon[row.platformId] ?? Brain;
<Icon className="h-4 w-4" />
```

If `react-icons` has `SiAnthropic` or `SiPerplexity` available in the installed version, prefer those. Verify with:

```bash
node -e "const all = require('react-icons/si'); console.log(Object.keys(all).filter(k => k.match(/Anthropic|Perplexity|Deepseek/i)))"
```

- [ ] **Step 4: Replace the icon render at `competitors.tsx:~496`.**

Swap the unconditional `<SiOpenai />` for the mapped icon.

- [ ] **Step 5: Type-check + lint.**

```bash
npm run check 2>&1 | tail -20
npm run lint -- client/src/pages/competitors.tsx 2>&1 | tail -20
```

- [ ] **Step 6: Manual smoke test.**

`/competitors` → confirm each platform row shows a different glyph.

Do not commit.

---

## Task 8: Delete Competitors Snapshot dialog (item m)

**Spec:** §4.5 item m.

**Goal:** The snapshot dialog at `competitors.tsx:~768-828` asks users to manually type a citation count. That's fabricated data. Delete the dialog entirely and remove the trigger button at `~competitors.tsx:651-655`.

**Files:**
- Modify: `client/src/pages/competitors.tsx`

### Steps

- [ ] **Step 1: Locate the dialog + trigger.**

```bash
grep -n "Snapshot\|snapshot\|<Dialog" client/src/pages/competitors.tsx | head -30
```

Confirm the trigger `<Plus />` icon button in the row actions and the `<Dialog>` block that opens on click.

- [ ] **Step 2: Delete the dialog block.**

Remove the entire `<Dialog>` JSX block + any `useState` it owns + any mutation hooks specific to it.

- [ ] **Step 3: Delete the trigger button.**

In the row actions, remove the `<Button>` that triggered the dialog.

- [ ] **Step 4: Delete any orphan server route.**

```bash
grep -rn "competitors.*snapshot\|snapshot.*competitor" server/routes/
```

If a `POST /api/competitors/:id/snapshots` route exists for this dialog only, delete it.

- [ ] **Step 5: Type-check + lint.**

```bash
npm run check 2>&1 | tail -20
```

- [ ] **Step 6: Manual smoke test.**

`/competitors` → confirm no Plus icon in row actions, no Snapshot dialog opens anywhere.

Do not commit.

---

## Task 9: FAQ Manager JSON-LD viewer chrome neutralization (item q)

**Spec:** §4.5 item q.

**Goal:** The JSON-LD viewer on the FAQ Manager Schema tab uses `bg-slate-900 text-green-400` — a dark "terminal" aesthetic that breaks the canonical light workspace. Replace with neutral chrome (`bg-muted font-mono text-sm border-border`).

**Files:**
- Modify: `client/src/pages/faq-manager.tsx`

### Steps

- [ ] **Step 1: Locate the code block.**

```bash
grep -n "bg-slate-900\|text-green-400\|JSON-LD\|json-ld" client/src/pages/faq-manager.tsx
```

- [ ] **Step 2: Replace the chrome.**

Change:

```tsx
<pre className="bg-slate-900 text-green-400 p-4 rounded-md overflow-auto">
  {JSON.stringify(schema, null, 2)}
</pre>
```

To:

```tsx
<pre className="bg-muted text-foreground font-mono text-sm border border-border rounded-md p-4 overflow-auto">
  {JSON.stringify(schema, null, 2)}
</pre>
```

- [ ] **Step 3: Lint.**

```bash
npm run lint -- client/src/pages/faq-manager.tsx 2>&1 | tail -10
```

- [ ] **Step 4: Manual smoke test.**

`/faq-manager` → Schema tab → confirm the JSON renders in neutral chrome, not green-on-black.

Do not commit.

---

## Task 10: Discord/Slack removal from Community Engagement (item r)

**Spec:** §4.5 item r.

**Goal:** `community-engagement.tsx:~368-376` lists Discord and Slack as platform options. Neither has a scanner or posting integration. Remove both. Keep Reddit + Hacker News only.

**Files:**
- Modify: `client/src/pages/community-engagement.tsx`

### Steps

- [ ] **Step 1: Locate the platform select.**

```bash
grep -n "discord\|slack" client/src/pages/community-engagement.tsx
```

- [ ] **Step 2: Remove Discord + Slack entries.**

From the platform array / dropdown options, delete the Discord and Slack entries. Update any prompt branches or best-practices sections keyed on those platforms.

- [ ] **Step 3: Update header copy.**

If the page header says "Multi-platform community engagement" or similar, change to "Reddit & Hacker News engagement workflow."

- [ ] **Step 4: Type-check + lint.**

```bash
npm run check 2>&1 | tail -20
```

- [ ] **Step 5: Manual smoke test.**

`/community-engagement` → confirm Discord and Slack do not appear in the platform dropdown.

Do not commit.

---

## Task 11: Citations schedule menu removal (item s)

**Spec:** §4.5 item s.

**Goal:** Remove the user-facing schedule/cadence UI from `/citations`. Per user decision, citation scans run weekly for every brand as a non-configurable cadence — no user control.

**Files:**
- Modify: `client/src/pages/citations.tsx`
- Modify (read-only audit): `server/scheduler.ts` (confirm weekly cron fires regardless of any per-brand flag)
- Modify: `server/routes/citations.ts` or wherever the cadence-update route lives (delete the route)

### Steps

- [ ] **Step 1: Locate the schedule UI.**

```bash
grep -n -i "schedule\|cadence\|frequency\|weekly\|monthly" client/src/pages/citations.tsx | head -30
```

Identify the exact dropdown / dialog / button group that exposes scan-frequency choice.

- [ ] **Step 2: Locate the server-side flag.**

```bash
grep -rn "citationCheckFrequency\|scanFrequency\|scan_frequency" server/ shared/schema.ts
```

Note the column (likely on `brand_settings` or `brands`). Do not drop the column yet — leave it dormant.

- [ ] **Step 3: Remove the UI.**

Delete the schedule menu component / dropdown from `citations.tsx`. Replace the surrounding region with:

```tsx
<p className="text-sm text-muted-foreground">
  Citation scans run weekly for every brand.
</p>
```

- [ ] **Step 4: Remove the cadence-update server route.**

```bash
grep -rn "scanFrequency\|citationCheckFrequency" server/routes/
```

If a route like `PATCH /api/brands/:id/citation-frequency` exists, delete it.

- [ ] **Step 5: Confirm the cron fires unconditionally.**

Open `server/scheduler.ts`. Locate the citation-scan cron job. Confirm it iterates over all active brands without gating on `citationCheckFrequency`. If it does gate on the flag, either:
- Remove the gate (cron now fires for every active brand), **or**
- Set the flag to `'weekly'` for every existing brand (and document that the flag is no longer user-controllable).

Prefer removing the gate — fewer moving parts.

- [ ] **Step 6: Test the cron behavior.**

`tests/citation-cron-unconditional.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectBrandsForCitationScan } from "../server/scheduler";  // adapt to actual export
import { seedBrand } from "./helpers";

describe("citation scan scheduler", () => {
  it("includes every active brand regardless of cadence flag", async () => {
    await seedBrand({ name: "A", citationCheckFrequency: "weekly", active: true });
    await seedBrand({ name: "B", citationCheckFrequency: null, active: true });
    await seedBrand({ name: "C", citationCheckFrequency: "monthly", active: true });
    await seedBrand({ name: "D", active: false }); // inactive — excluded

    const targets = await selectBrandsForCitationScan();
    expect(targets.map(b => b.name).sort()).toEqual(["A", "B", "C"]);
  });
});
```

Adapt the selector function name and seeding helpers to the actual codebase. If the scheduler doesn't expose a selector function, factor one out before testing.

- [ ] **Step 7: Run the test.**

```bash
npx vitest run tests/citation-cron-unconditional.test.ts
```

Expected: PASS after Step 5's gate removal.

- [ ] **Step 8: Type-check + lint.**

```bash
npm run check
```

- [ ] **Step 9: Manual smoke test.**

`/citations` → confirm no schedule UI; the static "weekly" copy is present.

Do not commit.

---

## Task 12: AI Intelligence alerts removal (item t)

**Spec:** §4.5 item t.

**Goal:** Remove the Alerts surface entirely from `/ai-intelligence` — tab, dialog, route, table reads. The DB table itself stays (no destructive schema change).

**Files:**
- Modify: `client/src/pages/ai-intelligence.tsx`
- Modify: `server/routes/ai-intelligence.ts` (or wherever `/api/ai-intelligence/alerts*` lives — verify in Step 1)
- Reference (do not modify): `shared/schema.ts` — `alerts` table stays
- Reference: `server/routes/dashboard.ts` — confirm dashboard does not read `alerts`

### Steps

- [ ] **Step 1: Locate the Alerts surface.**

```bash
grep -rn -i "alert" client/src/pages/ai-intelligence.tsx | head -30
grep -rn "alerts" server/routes/ai-intelligence.ts 2>/dev/null
grep -rn "alerts" server/routes/dashboard.ts
```

Map every reference.

- [ ] **Step 2: Remove the UI.**

Delete:
- The Alerts `<TabsTrigger>` and its `<TabsContent>` block
- Any `<Dialog>` opened from inside the Alerts surface
- Any `useQuery` keyed on `/api/ai-intelligence/alerts` or similar
- Any imports left dangling after the deletions

- [ ] **Step 3: Remove the API routes.**

In the server route file, delete every handler under `/api/ai-intelligence/alerts*`. If the file is dedicated to alerts entirely, delete the file and remove its `app.use(...)` mount line from `server/routes.ts` or `server/app.ts`.

- [ ] **Step 4: Audit other consumers.**

```bash
grep -rn "alerts" client/src/ server/
```

Anything outside `shared/schema.ts` (where the table definition lives) and `server/routes.ts` (mount lines) that still reads from alerts → remove or replace with empty state.

- [ ] **Step 5: Type-check + lint.**

```bash
npm run check 2>&1 | tail -30
```

Fix any type errors from removed exports.

- [ ] **Step 6: Manual smoke test.**

`/ai-intelligence` → confirm no Alerts tab, no alert badges, no alert-related copy. Confirm `/api/ai-intelligence/alerts` (whatever the exact path was) returns 404.

Do not commit.

---

## Plan Self-Review

**1. Spec coverage check.**

Mapping spec §4.5 sub-items to plan tasks:

| Spec item | Plan task |
|---|---|
| a (Export PDF kill) | Task 1 |
| b (Share kill) | Task 1 |
| c (Schedule wire) | Task 1 |
| d (Copy fix) | Task 1 |
| e (Quora — community-engagement) | Task 2 |
| f (Quora — geo-opportunities) | Task 2 |
| g (Quora — DistributeDialog) | Task 2 |
| h (AI Visibility 404 quick-actions) | Task 3 |
| i (PHASE_BANDS + Cancel) | Task 4 |
| j (Keyword Research provenance) | Task 5 |
| k (9-platforms → 5-platforms) | Task 6 |
| l (Per-platform icons) | Task 7 |
| m (Snapshot dialog deletion) | Task 8 |
| n (Stage circles → StatusDot) | **DEFERRED — Plan 2** (needs StatusDot primitive) |
| o (geo-tools 4px borders) | **DEFERRED — Plan 2** |
| p (faq-manager 4px borders) | **DEFERRED — Plan 2** |
| q (JSON-LD viewer chrome) | Task 9 |
| r (Discord/Slack removal) | Task 10 |
| s (Citations schedule menu) | Task 11 |
| t (AI Intelligence alerts) | Task 12 |

All 17 in-scope items covered. Three items deferred with reason.

**2. Placeholder scan.** No "TBD", "TODO", "implement later", or vague "add appropriate error handling" steps. Every code block is concrete.

**3. Type consistency.** No cross-task type/method name reuse exists (each task touches isolated surfaces). One internal consistency note: Task 5 uses `provenance` as both the column name and the field in API responses — single-source.

**4. Plan-wide rule consistency.** "Do not commit" appears at the top and at the end of every task. The "verify file:line first" rule is enforced by Step 1 of every relevant task.

Plan is complete and consistent.

---

## What lands in subsequent Foundations plans

For traceability:

- **Plan 2** (Design system enforcement + primitives) — §4.1 token sweep, §4.10 loading/empty primitives, §4.5 items n/o/p (StatusDot adoption).
- **Plan 3** (Sidebar IA + Settings) — §4.2 label renames + re-enable Account Settings + remove vermillion stripe; §4.3 Stripe portal + Profile + Password.
- **Plan 4** (Bridges + Email + AI disclosure) — §4.6 welcome→fact-scrape + keyword→content; §4.8 email verification flip + welcome email; §4.9 `articles.ai_generated` column + `<AIGeneratedPill>`.
- **Plan 5** (Persistence for false-positive rec rules) — §4.11 `geo_signal_runs` + `visibility_progress` tables + dashboard reads.
- **Plan 6** (Day-0 gates + Onboarding spine) — §4.4 Pre-Data State rule on dashboard; §4.7 demote OnboardingProgressRing, ResultsTimeline, SidebarOnboarding; make RecommendationsPanel canonical. Runs last because §4.7 depends on §4.4.
