# Plan 6: Day-0 Alarm Rule (§4.4) + Onboarding Stack Consolidation (§4.7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the dashboard from rendering five red-toned "your brand is broken" panels on a brand-new account before any citation run completes (§4.4), and collapse the six concurrent onboarding-guidance surfaces down to one canonical spine (§4.7).

**Architecture:** A single derived `hasMeasured` boolean — computed at the top of `home.tsx` from existing query data — gates every destructive-tone render in the dashboard. Then `<OnboardingProgressRing>` is unmounted, `<ResultsTimeline>` is demoted to a single-line caption, and `<SidebarOnboarding>`'s auto-opening first-login dialog is removed. `<RecommendationsPanel>` (Plan 5 made it correct) becomes the canonical spine. A new `POST /api/onboarding/autopilot-retry` route gives the failed-autopilot banner a Retry CTA. Tour engine `dashboard.progressRing` target is retargeted to the spine (or removed).

**Tech Stack:** No new deps. React 18 + TanStack Query for client. Existing Express route patterns + `runOnboardingAutopilot` for server.

**Hard rules for all subagents:**
- ❌ Do NOT run ANY git mutating commands: `git commit`, `git add`, `git rm`, `git mv`, `git stash`, `git stash pop`, `git stash drop`, `git stash apply`, `git reset`, `git restore`, `git checkout` (when it discards), `git push`, `git pull`, `git fetch --prune`, `git rebase`, `git merge`, `git branch -D`, `git branch -m`, `git switch` (with dirty changes), `git clean`. Read-only is fine: `git status`, `git diff`, `git log`, `git show`, `git blame`, `git branch` (list).
- ❌ Do NOT trust .md files in this repo — verify every claim against code before acting.
- ❌ Do NOT delete component files (`OnboardingProgressRing.tsx`, `ResultsTimeline.tsx` stay on disk; only their dashboard-level mount is changed). Per spec.
- ❌ Do NOT add new features beyond what each task says.

---

### Task 1: Day-0 Pre-Data State foundation (§4.4)

**Files:**
- Modify: `client/src/pages/home.tsx`
- Modify: `client/src/components/dashboard/PlatformRankingCard.tsx`
- Modify: `client/src/components/dashboard/RecommendationsPanel.tsx`
- Test: `tests/unit/dashboardPreDataState.test.ts` (server-state independent — pure UI logic)

**Context (verified at 2026-05-12):**
- `home.tsx:262-288` already exposes `autopilot.status` from `/api/onboarding/autopilot-status/:brandId`. Active states are `pending`, `generating_prompts`, `running_citations`. Terminal states are `completed`, `failed`, `idle`.
- `home.tsx:335` exposes `heroData` from `GET /api/dashboard/hero/:brandId`. The hero response (`server/routes/dashboard.ts:171-185`) includes `lastScanAt: Date | null` and `totalChecks: number`.
- Destructive-tone surfaces verified:
  - `home.tsx:1071` Neutral sentiment tile (hardcoded value).
  - `home.tsx:1072-1082` AI Confidence Score tile (duplicates Visibility Score).
  - `home.tsx:1083-1091` Recognition tile (`Unknown` + destructive tone when `citationRate < 20`).
  - `home.tsx:1103-1116` "Gaps AI identifies" list (always fires from `gapsAiIdentifies` heuristics).
  - `home.tsx:1147-1162` "Underexposed" callout in verbatim section.
  - `home.tsx:1249-1276` `PromptCoverageMap` red rows for absent categories.
  - `home.tsx:1317-1326` `RedditVisibility` "No Reddit presence found" destructive card.
  - `PlatformRankingCard.tsx:23-30, 38-45, 48` destructive border/badge/text when `citedCount === 0`.
  - `RecommendationsPanel.tsx:29` `P0: "border-red-500/30 bg-red-500/5"`.

**The rule (from spec §4.4):**

> A surface may render destructive tone only if all three are true: (1) at least one citation run has completed for the selected brand, (2) the underlying metric has a non-null value, (3) the metric crosses the failure threshold defined for that surface. Otherwise: neutral chrome + "Not yet measured" / "Will measure this week" copy.

- [ ] **Step 1: Derive `hasMeasured` at the top of `home.tsx`**

After the existing `heroData`, `autopilot`, and `selectedBrandId` assignments (around line 335-356), add:

```tsx
// Day-0 alarm rule (§4.4): a surface may render destructive tone
// only when we have evidence the brand has actually been measured.
// "Measured" = a completed citation run exists AND the autopilot is
// not still mid-run. Drives gating throughout this page.
const hasMeasured =
  (heroData?.totalChecks ?? 0) > 0 &&
  heroData?.lastScanAt != null &&
  autopilot?.status !== "running_citations" &&
  autopilot?.status !== "generating_prompts" &&
  autopilot?.status !== "pending";
```

Place this above the JSX block. No new query — both inputs are already in scope.

- [ ] **Step 2: Hide AI Confidence Score + hardcoded Neutral Sentiment tiles (`home.tsx:1070-1092`)**

Replace the existing 3-tile `<div className="grid md:grid-cols-3 gap-4 mb-6">` block (lines 1070-1092) with a single tile (Recognition only) when `hasMeasured`, or a single neutral "Not yet measured" placeholder when not:

```tsx
<div className="grid md:grid-cols-3 gap-4 mb-6">
  {hasMeasured ? (
    <>
      {/* Recognition only when measured. AI Confidence Score and
          hardcoded Neutral Sentiment are deferred to Spec 3. */}
      <SentimentCard
        label="Recognition"
        value={
          (heroData?.citedChecks ?? 0) > 0 && (heroData?.citationRate ?? 0) >= 20
            ? "Known"
            : "Unknown"
        }
        tone={(heroData?.citationRate ?? 0) >= 20 ? "emerald" : "destructive"}
      />
    </>
  ) : (
    <div className="md:col-span-3 rounded-md border border-border bg-muted/30 px-4 py-6 text-center">
      <p className="text-sm text-muted-foreground">
        {autopilot?.status === "running_citations" ||
        autopilot?.status === "generating_prompts" ||
        autopilot?.status === "pending"
          ? "Measuring your brand's visibility now — this typically takes 1–2 minutes."
          : "We'll surface recognition, sentiment, and confidence after your first citation scan completes."}
      </p>
    </div>
  )}
</div>
```

Note: the `<SentimentCard>` sub-component at `home.tsx:1202-1223` stays as-is; only the call sites change.

- [ ] **Step 3: Gate "Gaps AI identifies" (`home.tsx:1103-1116`)**

Wrap the existing `{gapsAiIdentifies.length > 0 && (...)}` block in a `hasMeasured &&` guard:

```tsx
{hasMeasured && gapsAiIdentifies.length > 0 && (
  <div>
    <div className="text-xs uppercase tracking-wide text-destructive mb-2">
      Gaps AI identifies
    </div>
    <ul className="space-y-1">{/* …unchanged… */}</ul>
  </div>
)}
```

Add a neutral pre-data note immediately after the wrapped block:

```tsx
{!hasMeasured && (
  <p className="text-sm text-muted-foreground mt-2">
    Gaps will appear after your first citation scan.
  </p>
)}
```

- [ ] **Step 4: Gate the "Underexposed" callout (`home.tsx:1147-1162`)**

Inside the `<Section title="What AI Says About You" ...>` block, the destructive callout currently renders when `verbatimBlocks.length === 0` is false AND `!showVerbatim`. Change the destructive variant to only render when `hasMeasured`. When `!hasMeasured`, render a neutral card instead:

```tsx
{verbatimBlocks.length === 0 ? (
  <p className="text-sm text-muted-foreground">
    No verbatim responses yet — run a citation check to populate.
  </p>
) : !showVerbatim ? (
  hasMeasured ? (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
      {/* …existing destructive variant unchanged… */}
    </div>
  ) : (
    <div className="rounded-md border border-border bg-muted/30 p-4 flex items-start gap-3">
      <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
      <p className="text-sm text-muted-foreground">
        Verbatim AI responses will populate after your first scan completes.
      </p>
    </div>
  )
) : (
  /* …existing expanded list unchanged… */
)}
```

Import `Info` from `lucide-react` if not already imported (grep first).

- [ ] **Step 5: Gate `PromptCoverageMap` destructive rows (`home.tsx:1249-1276`)**

The component takes `categories: string[]` and `rows: GapMatrixRow[]` and computes appearance per category. Add a `hasMeasured` prop and switch absent rows from destructive to neutral when false:

```tsx
function PromptCoverageMap({
  categories,
  rows,
  hasMeasured,
}: {
  categories: string[];
  rows: GapMatrixRow[];
  hasMeasured: boolean;
}) {
  const brandRow = rows.find((r) => r.entityType === "brand");
  if (!brandRow || categories.length === 0) {
    return <p className="text-sm text-muted-foreground">No prompt coverage data yet.</p>;
  }
  // …existing appearing + pct math unchanged…
  return (
    <div className="space-y-3">
      {/* …header line unchanged… */}
      <ul className="space-y-1.5">
        {categories.map((cat) => {
          const state = brandRow.cells[cat] ?? "unknown";
          const appears = state === "yes" || state === "partial";
          const absentRowClasses = hasMeasured
            ? "border-destructive/20 bg-destructive/5"
            : "border-border bg-muted/30";
          const absentLabelClasses = hasMeasured
            ? "text-destructive"
            : "text-muted-foreground";
          const absentGlyphBg = hasMeasured
            ? "bg-destructive/20 text-destructive"
            : "bg-muted text-muted-foreground";
          const absentLabel = hasMeasured ? "Absent" : "Pending";
          return (
            <li
              key={cat}
              className={
                "flex items-center justify-between px-3 py-2 rounded-md border " +
                (appears ? "border-emerald-500/20 bg-emerald-500/5" : absentRowClasses)
              }
            >
              <span className="flex items-center gap-2 text-sm">
                {appears ? (
                  <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center text-[10px]">✓</span>
                ) : (
                  <span className={"w-4 h-4 rounded-full grid place-items-center text-[10px] " + absentGlyphBg}>!</span>
                )}
                {cat}
              </span>
              <span className={"text-xs " + (appears ? "text-emerald-400" : absentLabelClasses)}>
                {appears ? "You appear" : absentLabel}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

At the call site for `<PromptCoverageMap>` (search `home.tsx` for the usage), pass `hasMeasured={hasMeasured}`.

- [ ] **Step 6: Gate `RedditVisibility` destructive card (`home.tsx:1281-1329`)**

Add `hasMeasured` prop. Replace the destructive `"No Reddit presence found"` block when `!hasMeasured`:

```tsx
function RedditVisibility({
  mentions,
  loading,
  hasMeasured,
}: {
  mentions: BrandMention[];
  loading: boolean;
  hasMeasured: boolean;
}) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  // …existing communities/mentionCount math unchanged…
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        {/* …two metric cards unchanged… */}
      </div>
      {mentionCount === 0 && (
        hasMeasured ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
            <MessageSquare className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="font-semibold">No Reddit presence found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your brand has zero visibility on Reddit — a major source AI platforms use for recommendations.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/30 p-6 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="font-semibold text-foreground">Reddit scan runs weekly</p>
            <p className="text-sm text-muted-foreground mt-1">
              We'll surface Reddit visibility here once the first scan has run for this brand.
            </p>
          </div>
        )
      )}
    </div>
  );
}
```

Also inside the metric-card grid, the destructive Brand Mentions number at lines 1302-1304 should switch to neutral when `!hasMeasured`:

```tsx
<p className={`text-2xl font-bold ${mentionCount > 0 ? "text-foreground" : hasMeasured ? "text-destructive" : "text-muted-foreground"}`}>
  {mentionCount}
</p>
```

Update the call site (`home.tsx:1189`): `<RedditVisibility mentions={redditRows} loading={redditMentions.isLoading} hasMeasured={hasMeasured} />`.

- [ ] **Step 7: Neutral PlatformRankingCard when not measured (`PlatformRankingCard.tsx`)**

Add `hasMeasured` prop. When `false` AND `found === false`, render neutral chrome:

```tsx
export default function PlatformRankingCard({
  platform,
  hasMeasured,
}: {
  platform: PlatformRanking;
  hasMeasured: boolean;
}) {
  const found = platform.citedCount > 0;
  const showDestructive = hasMeasured && !found;
  const rankTone = found ? "text-emerald-400" : showDestructive ? "text-destructive" : "text-muted-foreground";
  const cardBorder = found
    ? "border-emerald-500/20 bg-emerald-500/5"
    : showDestructive
      ? "border-destructive/20 bg-destructive/5"
      : "border-border bg-muted/30";
  const pillClasses = platform.isCitedSnippet
    ? "text-emerald-400 bg-emerald-500/10"
    : showDestructive
      ? "text-destructive bg-destructive/10"
      : "text-muted-foreground bg-muted";
  const pillText = platform.isCitedSnippet ? "Cited" : hasMeasured ? "Not cited" : "Pending";
  const rankText =
    platform.rank !== null
      ? `#${platform.rank}`
      : found
        ? "Cited"
        : hasMeasured
          ? "Not found"
          : "Pending";

  return (
    <Card className={"border " + cardBorder} data-testid={`platform-card-${platform.aiPlatform}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-1.5 gap-2">
          <span className="font-medium text-sm text-foreground">{platform.aiPlatform}</span>
          <span className={"text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold " + pillClasses}>
            {pillText}
          </span>
        </div>
        <div className={`text-xl font-bold leading-tight ${rankTone}`}>{rankText}</div>
        <div className="text-[11px] text-muted-foreground mb-2.5">
          {platform.citedCount}/{platform.totalCount} cited
        </div>
        {platform.latestSnippet ? (
          <p className="text-xs text-muted-foreground italic line-clamp-4 leading-snug">
            &ldquo;{platform.latestSnippet}&rdquo;
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
```

Update the call site in `home.tsx:835`: `<PlatformRankingCard key={p.aiPlatform} platform={p} hasMeasured={hasMeasured} />`.

- [ ] **Step 8: Demote `RecommendationsPanel` P0 destructive tint (`RecommendationsPanel.tsx:28-32`)**

Change:

```tsx
const PRIORITY_STYLES: Record<RecommendationPriority, string> = {
  P0: "border-red-500/30 bg-red-500/5",
  P1: "border-amber-500/30 bg-amber-500/5",
  P2: "border-border bg-card",
};
```

to:

```tsx
const PRIORITY_STYLES: Record<RecommendationPriority, string> = {
  // P0 is a blocker, not a failure — use neutral chrome with a status
  // glyph instead of destructive paint. The action button below carries
  // the brand accent.
  P0: "border-border bg-card",
  P1: "border-border bg-muted/30",
  P2: "border-border bg-card",
};
```

Insert a `<StatusDot tone="warn">` glyph (from `client/src/components/foundations/`) before the priority label for P0 rows. Inside the `<li>`, before the `<div className="flex-1 min-w-0">`, add:

```tsx
{rec.priority === "P0" && (
  <StatusDot tone="warn" className="mt-1.5 shrink-0" aria-hidden />
)}
```

Verify `StatusDot` accepts a `className` prop and tones include "warn"; if not, use `tone="pending"`. Import: `import { StatusDot } from "@/components/foundations";`.

Update the CTA button color: change `className="inline-block mt-2 text-xs font-medium text-primary hover:underline"` to use a real `<Button size="sm">` from `@/components/ui/button` when the rec is P0 (so the brand accent is on the action, not the card). Keep the link styling for P1/P2.

- [ ] **Step 9: Write the test**

Create `tests/unit/dashboardPreDataState.test.ts` — pure logic tests for the `hasMeasured` derivation. Three cases:

```ts
import { describe, it, expect } from "vitest";

// Replicate the derivation locally so we test the rule, not the component tree.
function hasMeasured(args: {
  totalChecks: number | undefined;
  lastScanAt: string | null | undefined;
  autopilotStatus: string | null | undefined;
}): boolean {
  return (
    (args.totalChecks ?? 0) > 0 &&
    args.lastScanAt != null &&
    args.autopilotStatus !== "running_citations" &&
    args.autopilotStatus !== "generating_prompts" &&
    args.autopilotStatus !== "pending"
  );
}

describe("Day-0 alarm rule hasMeasured derivation", () => {
  it("returns false when there are no completed checks", () => {
    expect(hasMeasured({ totalChecks: 0, lastScanAt: "2026-05-12", autopilotStatus: "completed" })).toBe(false);
  });
  it("returns false when autopilot is still running", () => {
    expect(hasMeasured({ totalChecks: 5, lastScanAt: "2026-05-12", autopilotStatus: "running_citations" })).toBe(false);
  });
  it("returns true after a completed scan with terminal autopilot", () => {
    expect(hasMeasured({ totalChecks: 10, lastScanAt: "2026-05-12", autopilotStatus: "completed" })).toBe(true);
  });
  it("returns true when autopilot is idle (e.g., never ran autopilot)", () => {
    expect(hasMeasured({ totalChecks: 1, lastScanAt: "2026-05-12", autopilotStatus: "idle" })).toBe(true);
  });
  it("returns false when lastScanAt is null", () => {
    expect(hasMeasured({ totalChecks: 5, lastScanAt: null, autopilotStatus: "completed" })).toBe(false);
  });
});
```

Run: `npx vitest run tests/unit/dashboardPreDataState.test.ts` — must pass.

- [ ] **Step 10: Verify**

Run:
```
npm run check 2>&1 | tail -15
npx vitest run 2>&1 | tail -10
```

Expected: 0 tsc errors, 26 tour targets verified (note: `dashboard.progressRing` still present until Task 3 removes the ring — that's fine for now), pre-existing test failures only.

---

### Task 2: Autopilot Retry — server route + Retry button on banner (§4.4)

**Files:**
- Modify: `server/routes/onboarding.ts` — add `POST /api/onboarding/autopilot-retry`
- Modify: `client/src/pages/home.tsx` — wire Retry button in failed-banner branch
- Test: `tests/unit/autopilotRetry.test.ts`

**Context:**
- `runOnboardingAutopilot(brandId, userId, { deadlineMs })` exists in `server/lib/onboardingAutopilot.ts:20`.
- The banner currently renders failed state at `home.tsx:500-514` with no CTA.
- `server/routes/onboarding.ts` already imports `runOnboardingAutopilot` (line 34).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/autopilotRetry.test.ts`. Mock storage + the autopilot launcher. Cases:

1. `POST /api/onboarding/autopilot-retry` with `{ brandId }`: succeeds when user owns the brand AND `autopilot_status === 'failed'` — calls `runOnboardingAutopilot(brand.id, user.id, { deadlineMs: ... })`, returns 200 `{ success: true }`.
2. 404 when brand belongs to a different user (anti-enumeration).
3. 409 (or 400) when `autopilot_status !== 'failed'` — don't allow re-firing a running autopilot.

Run: FAIL.

- [ ] **Step 2: Implement the route**

Find the existing `setupOnboardingRoutes(app)` in `server/routes/onboarding.ts`. Match the pattern of the sibling routes (e.g., `/api/onboarding/confirm` around line 440 or the `autopilot-status` route — grep for `autopilot-status` to find it):

```ts
app.post(
  "/api/onboarding/autopilot-retry",
  asyncHandler(async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId } = req.body ?? {};
      if (typeof brandId !== "string" || brandId.length === 0) {
        return res.status(400).json({ success: false, error: "brandId required" });
      }
      const brand = await requireBrand(brandId, user.id);
      if (brand.autopilotStatus !== "failed") {
        return res
          .status(409)
          .json({ success: false, error: "Autopilot is not in a failed state" });
      }
      // Use Vercel waitUntil so the retry survives serverless suspension
      // after we respond. Matches the pattern used by the welcome→fact-scrape
      // bridge from Plan 4.
      const deadlineMs = Date.now() + 50_000;
      waitUntil(
        runOnboardingAutopilot(brand.id, user.id, { deadlineMs }).catch(
          captureAndFlush({ tags: { source: "onboarding.ts:autopilot-retry" } }),
        ),
      );
      res.json({ success: true });
    } catch (err) {
      if (err instanceof OwnershipError) {
        return res.status(err.status).json({ success: false, error: err.message });
      }
      sendError(res, err, "Failed to retry autopilot");
    }
  }),
);
```

Verify all of the imports exist at the top of the file: `requireUser`, `requireBrand`, `OwnershipError`, `waitUntil`, `captureAndFlush`, `runOnboardingAutopilot`. Grep first; add missing imports following the existing patterns in the file.

Verify the brand field name. Grep `shared/schema.ts` for `autopilotStatus` (likely `autopilot_status` in DB → `autopilotStatus` in Drizzle). Adjust the comparison accordingly.

Verify `captureAndFlush`'s signature — Plan 4 used it as `captureAndFlush(err, { tags: ... })`. If the curried form `captureAndFlush({ tags: ... })` doesn't exist, inline a `.catch((err) => { captureAndFlush(err, { tags: ... }); })` instead.

- [ ] **Step 3: Wire the Retry button on the failed banner (`home.tsx:500-514`)**

Inside the failed branch of the banner JSX, add a button before the dismiss X:

```tsx
{isAutopilotFailed && (
  <Button
    size="sm"
    variant="outline"
    onClick={() => retryAutopilotMutation.mutate()}
    disabled={retryAutopilotMutation.isPending}
    className="shrink-0"
  >
    {retryAutopilotMutation.isPending ? (
      <>
        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Retrying…
      </>
    ) : (
      "Retry"
    )}
  </Button>
)}
```

Define the mutation near the top of the component, after the existing `useQuery` for autopilot-status:

```tsx
const queryClient = useQueryClient();
const retryAutopilotMutation = useMutation({
  mutationFn: async () => {
    if (!selectedBrandId) throw new Error("No brand selected");
    const res = await apiRequest("POST", "/api/onboarding/autopilot-retry", {
      brandId: selectedBrandId,
    });
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["autopilot-status", selectedBrandId] });
    toast({ title: "Retry started", description: "Re-running visibility setup…" });
  },
  onError: (err: Error) => {
    toast({
      title: "Couldn't restart autopilot",
      description: err.message,
      variant: "destructive",
    });
  },
});
```

Imports: ensure `useMutation`, `useQueryClient` are imported from `@tanstack/react-query`. Grep first.

- [ ] **Step 4: Verify**

```
npx vitest run tests/unit/autopilotRetry.test.ts
npm run check 2>&1 | tail -15
npx vitest run 2>&1 | tail -10
```

Expected: 3 new tests pass, 0 tsc errors, full suite at documented baseline.

---

### Task 3: Onboarding stack consolidation (§4.7)

**Files:**
- Modify: `client/src/pages/home.tsx` — remove `<OnboardingProgressRing>` mount, demote `<ResultsTimeline>` to a single line
- Modify: `client/src/components/SidebarOnboarding.tsx` — remove auto-opening dialog on first login
- Modify: `client/src/tours/pages/dashboard.tour.ts` — retarget or remove the `dashboard.progressRing` tour step
- Modify: `client/src/components/dashboard/ResultsTimeline.tsx` — add a `compact` mode (or a sibling component) that renders a single line

**Context:**
- `home.tsx:553-555` wraps the ring in `<div data-tour-id="dashboard.progressRing">`. Removing the ring breaks the tour target. Either retarget the step to the recommendations spine OR remove the step.
- `home.tsx:557` mounts `<RecommendationsPanel />` (the canonical spine). It already renders correctly after Plan 5.
- `home.tsx:556` mounts `<ResultsTimeline />` — full tile strip. Spec wants this reduced to one line.
- `SidebarOnboarding.tsx:61-67` auto-opens the dialog on first login per user (keyed by `localStorage[SEEN_KEY_PREFIX+userId]`). Spec says remove auto-open; keep the sidebar widget as a status indicator + on-click opens.

- [ ] **Step 1: Remove `<OnboardingProgressRing>` mount in `home.tsx`**

Delete lines `home.tsx:553-555`:

```diff
- <div data-tour-id="dashboard.progressRing">
-   <OnboardingProgressRing />
- </div>
```

Remove the import at `home.tsx:52`:

```diff
- import OnboardingProgressRing from "@/components/dashboard/OnboardingProgressRing";
```

**Do NOT delete the component file** — spec keeps it on disk for now (potential future use; deletion is a separate cleanup).

- [ ] **Step 2: Demote `<ResultsTimeline>` to a single line**

In `client/src/components/dashboard/ResultsTimeline.tsx`, add a `compact?: boolean` prop. When `true`, render a single-line caption instead of the 4-tile grid:

```tsx
export default function ResultsTimeline({ compact = false }: { compact?: boolean }) {
  const { data: brandsResp } = useQuery<{ success: boolean; data: BrandLite[] }>({
    queryKey: ["/api/brands"],
  });
  const brands = brandsResp?.data;
  const ageDays = oldestBrandAgeDays(brands);
  const currentIdx = currentMilestoneIndex(ageDays);
  const current = MILESTONES[currentIdx];

  if (compact) {
    const dayLabel =
      ageDays == null
        ? "Day 0"
        : ageDays < 7
          ? `Day ${ageDays}`
          : ageDays < 28
            ? `Week ${Math.floor(ageDays / 7) + 1}`
            : "Week 4+";
    return (
      <p className="text-xs text-muted-foreground px-1">
        {dayLabel} — {current.description} First AI citations typically appear 1–2 weeks after publish.
      </p>
    );
  }

  // …existing full-card return unchanged…
}
```

In `home.tsx:556`, change to:

```tsx
<ResultsTimeline compact />
```

The full-card return path remains in the component for any future caller. (The component file's full tests, if any, should still pass — verify with `grep ResultsTimeline tests/`.)

- [ ] **Step 3: Remove `SidebarOnboarding` auto-open dialog (`SidebarOnboarding.tsx:61-67`)**

Delete the `useEffect` that auto-opens on first login:

```diff
-  // First-login auto-open: fires once per user per browser, keyed by user.id.
-  // Skips if already complete — no point greeting them with a finished list.
-  useEffect(() => {
-    if (!autoOpenReady || !user?.id || !statusResp || isComplete) return;
-    const seenKey = `${SEEN_KEY_PREFIX}${user.id}`;
-    if (localStorage.getItem(seenKey)) return;
-    localStorage.setItem(seenKey, new Date().toISOString());
-    setOpen(true);
-  }, [autoOpenReady, user?.id, statusResp, isComplete]);
```

Also remove now-unused state + constant:
- `autoOpenReady` state + its initialization useEffect (lines 22, 24-26).
- `SEEN_KEY_PREFIX` constant (line 17) — unless something else uses it. Grep first; if the constant is referenced elsewhere (e.g., logout-clear list in `use-auth.ts`), keep it but mark the comment indicating the key is now legacy/migration data only.

Grep `client/src/hooks/use-auth.ts` for `venturecite-onboarding-seen` — if present in the logout-clear sweep, leave it (no harm clearing a no-longer-written key).

The sidebar widget itself stays — the on-click open still works (the button at line 83-108 calls `setOpen(true)`). Users access onboarding via clicking the widget, not via a forced dialog.

- [ ] **Step 4: Retarget the dashboard tour step**

In `client/src/tours/pages/dashboard.tour.ts`, the `progress-ring` step targets `dashboard.progressRing` which no longer exists. Two options per spec — pick **option A (retarget to spine)** unless the spine doesn't have a stable target:

Grep for `data-tour-id` on or near `<RecommendationsPanel />` in `home.tsx:557`. If no tour target exists on the spine, add one:

```tsx
<div data-tour-id="dashboard.recommendations">
  <RecommendationsPanel />
</div>
```

Then update the tour step:

```ts
{
  id: "progress-ring",
  target: "dashboard.recommendations",
  attachTo: "bottom",
  title: "What to do next",
  content: "These are your highest-leverage next actions. Required items can't be dismissed.",
},
```

Or **option B**: delete the `progress-ring` step entirely from `dashboard.tour.ts`. Pick whichever the consolidated spine deserves — option A is preferred per spec.

Run the tour-target verifier (it's invoked by `npm run check`). Expected: 26 total tour targets (Plan 6 swaps `dashboard.progressRing` for `dashboard.recommendations` — net unchanged).

- [ ] **Step 5: Verify**

```
npm run check 2>&1 | tail -15
npx vitest run 2>&1 | tail -10
```

Expected: 0 tsc errors, 26/26 tour targets, full suite at documented baseline.

Manual UX check (only if a dev server is convenient):
- Log in as a fresh test account on a new browser profile → confirm NO dialog auto-opens.
- Click the sidebar onboarding widget → dialog opens as usual.
- Visit `/dashboard` → ring is gone; ResultsTimeline shows a single caption line; RecommendationsPanel is the lead surface.
- Take the dashboard tour → step 2 ("Onboarding progress") highlights the recommendations spine, not a missing ring.

---

### Task 4: End-to-end verification (read-only)

- [ ] **Step 1: Success Criteria check (§4.4 + §4.7)**

Verify in code:

- [ ] `hasMeasured` derivation lives at the top of `home.tsx` and is consumed by Recognition, Gaps, Underexposed, PromptCoverageMap, Reddit, and PlatformRankingCard.
- [ ] `home.tsx:1071` no longer renders a hardcoded "Neutral" sentiment tile (the entire 3-tile block became 1 tile + placeholder).
- [ ] `home.tsx:1072-1082` "AI Confidence Score" tile is gone from the rendered output.
- [ ] `home.tsx:1083-1091` Recognition tile renders ONLY when `hasMeasured`.
- [ ] `home.tsx:1103-1116` "Gaps AI identifies" gated on `hasMeasured`.
- [ ] `home.tsx:1147-1162` "Underexposed" destructive callout gated on `hasMeasured`.
- [ ] `PromptCoverageMap` accepts `hasMeasured` and renders neutral chrome with "Pending" label when false.
- [ ] `RedditVisibility` accepts `hasMeasured` and renders neutral "Reddit scan runs weekly" card when false.
- [ ] `PlatformRankingCard` accepts `hasMeasured` and renders neutral chrome + "Pending" label when false.
- [ ] `RecommendationsPanel.tsx:28-32` `P0` no longer uses `border-red-500/30 bg-red-500/5`; neutral chrome with a `StatusDot` glyph.
- [ ] Failed-autopilot banner shows a Retry button that POSTs to `/api/onboarding/autopilot-retry`.
- [ ] `POST /api/onboarding/autopilot-retry` exists in `server/routes/onboarding.ts`.
- [ ] `<OnboardingProgressRing>` is no longer imported or mounted in `home.tsx`.
- [ ] `<ResultsTimeline compact />` renders a single line.
- [ ] `<SidebarOnboarding>` no longer auto-opens a dialog on first login (the `useEffect` was deleted).
- [ ] Tour engine `dashboard.progressRing` step is retargeted to `dashboard.recommendations` (or removed). 26/26 tour targets verified.

- [ ] **Step 2: Final report**

Report:
- Files modified (with brief description per file)
- Tests added + final test suite result
- Tsc result
- Tour-target verifier result
- Anything skipped / deferred and why
