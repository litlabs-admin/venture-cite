# Phase 1 — Onboarding Ring + Expectations Timeline Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **No commits during execution.** Same convention as Phase 0 — implement, verify with diff, user reviews the cumulative working tree at the end.

**Goal:** Two small visible-on-the-dashboard wins that directly address Ben's "users get lost" and "can't tell when results will come" complaints. Builds momentum cheaply by reusing existing UI primitives.

**Architecture:** Pure client-side for the ring (PR 1.1). Client + small server change for the timeline (PR 1.2 — the weekly digest email gets a "Week N" line, which touches `weeklyDigestEmitter.ts` and `emailService.ts`). No new endpoints, no new functions, no new env vars, no new migrations.

**Tech Stack:** React + TanStack Query (dashboard), Wouter (routing), existing Radix UI primitives (Sheet, Skeleton, Progress), existing `VisibilityGauge` SVG component (60-line file already verified), Resend for the weekly email.

---

## Pre-conditions verified before writing this plan

- `client/src/components/dashboard/VisibilityGauge.tsx` exists (60 lines, props `{score, size, trackColor, fillColor}`) — reusable as-is for the new ring
- `client/src/components/SidebarOnboarding.tsx` exists (293 lines) with 4 hardcoded `STEPS` (lines 34-82) and uses `useAuth` + 3 queries (`/api/onboarding-status`, `/api/brands`, `/api/articles`)
- `client/src/components/ui/skeleton.tsx` exists (existing Radix wrapper)
- `client/src/components/ui/sheet.tsx`, `popover.tsx`, `dialog.tsx`, `progress.tsx` all exist (verified during spec writing)
- `client/src/lib/clientStorage.ts` already wipes any `venturecite-*` prefixed localStorage key on logout via `clearAllVentureCiteStorage()` — **no edit to `use-auth.ts` needed** as long as new keys use the prefix
- `server/lib/weeklyDigestEmitter.ts` exists with `tryEmitWeeklyDigestForUser`. Calls `sendWeeklyDigest(email, { user, brandBriefs })` from `server/emailService.ts`
- `server/emailService.ts` exports `WeeklyDigestPayload`, `WeeklyDigestBrandBrief`, `sendWeeklyDigest`. Renders an HTML email with a `weekOf` date heading.
- `client/src/pages/home.tsx` exists and is the dashboard route at `/` and `/dashboard`
- `client/src/components/citations/ResultsTab.tsx` exists (verified during Phase 3 spec)

---

## File structure

**Files modified:**
- `client/src/components/SidebarOnboarding.tsx` — extract `STEPS` to a new shared lib file; add "✓ Setup complete" collapsed state when all done (PR 1.1)
- `client/src/pages/home.tsx` — mount `<OnboardingProgressRing />` and `<ResultsTimeline />` above the hero metrics row (both PRs)
- `client/src/components/citations/ResultsTab.tsx` — render `<EmptyResultsHero />` when `totalChecks === 0` (PR 1.2)
- `server/lib/weeklyDigestEmitter.ts` — compute `weekN` from min(brand.createdAt) for the user, pass into payload (PR 1.2)
- `server/emailService.ts` — add `weekN: number | null` to `WeeklyDigestPayload`; render one extra line in the email body (PR 1.2)

**Files created:**
- `client/src/lib/onboardingSteps.ts` — single source of truth for the 4 step definitions + `isOnboardingComplete(data)` helper (PR 1.1)
- `client/src/components/dashboard/OnboardingProgressRing.tsx` — visible ring + step list (PR 1.1)
- `client/src/components/dashboard/ResultsTimeline.tsx` — static horizontal timeline with current-week highlight (PR 1.2)
- `client/src/components/citations/EmptyResultsHero.tsx` — replaces generic citations empty state with the 1–2 week LLM lag explainer (PR 1.2)
- `tests/unit/OnboardingProgressRing.test.tsx` — RTL test (4 cases, ~30 min) (PR 1.1)
- `tests/unit/ResultsTimeline.test.tsx` — RTL test (1 case, ~15 min) (PR 1.2)
- (If RTL not yet configured) `vitest.config.ts` adjustments + `@testing-library/react` install

**No changes to:**
- `client/src/hooks/use-auth.ts` — `clearAllVentureCiteStorage` already covers `venturecite-` prefixed keys
- `server/routes/*` — no new endpoints
- `server/scheduler.ts` — `tryEmitWeeklyDigestForUser` is the right hook; the scheduler already calls it
- `vercel.json` — no new function, no new cron, no new env var
- `package.json` — likely needs `@testing-library/react` if not present (verify in pre-flight)

---

## Pre-flight: baseline + RTL setup check

- [ ] **P1.0: Confirm baseline is green**

Run:
```
npm run check
npm test
```

Expected: typecheck clean, **237 tests passing** (baseline from end of Phase 0).

If anything fails, halt and address before continuing.

- [ ] **P1.1: Check whether React Testing Library is installed**

Run:
```
grep -E "@testing-library/react|@testing-library/jest-dom" package.json
```

If both packages are present, skip to P1.2.

If MISSING, install:
```
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event happy-dom
```

Then add to `vitest.config.ts` (read it first; it may already exist):
- Set `test.environment` to `"happy-dom"` (lighter than jsdom; existing patterns in codebase don't currently render React)
- Add `test.setupFiles: ["./tests/setup.ts"]`

Create `tests/setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

Run a smoke check:
```
npx vitest run --reporter=verbose 2>&1 | tail -10
```

Expected: existing 237 tests still pass.

- [ ] **P1.2: Verify `dashboard/` directory exists for new components**

Run:
```
ls client/src/components/dashboard/
```

Expected: directory exists with `VisibilityGauge.tsx` (already verified). New ring + timeline files will go alongside.

---

## PR 1.1 — Onboarding ring on dashboard (~1 day)

### Task 1: Extract `STEPS` to a shared lib file

**Files:**
- Create: `client/src/lib/onboardingSteps.ts`
- Modify: `client/src/components/SidebarOnboarding.tsx` (replace inline STEPS with import)

**Why first:** The new `OnboardingProgressRing` component and the existing `SidebarOnboarding` widget must both read from the same step definitions. Today STEPS is inline in the sidebar widget (lines 34-82). Extracting it now eliminates the "two sources of truth" trap before either consumer is built.

- [ ] **Step 1: Read the current STEPS definition**

Read `client/src/components/SidebarOnboarding.tsx` lines 24-82 to confirm the exact shape of `OnboardingStep` and the 4 step bodies.

- [ ] **Step 2: Create the shared lib file**

Create `client/src/lib/onboardingSteps.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import { Building2, PenLine, ScanEye, Target } from "lucide-react";

// Shape extracted from the existing SidebarOnboarding component. Both the
// sidebar widget AND the dashboard onboarding ring (Phase 1) read from this
// file — single source of truth so adding/removing a step touches one
// place, not two.
export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  link: string;
  linkText: string;
  icon: LucideIcon;
  // Receives the merged data from /api/onboarding-status + /api/brands +
  // /api/articles. Returns true when this step is complete.
  checkFn: (data: OnboardingData) => boolean;
}

// Loose typing: each query returns a different shape; we accept any and
// the checkFns coerce defensively. Tightening this requires backend type
// exports we don't have today.
export type OnboardingData = {
  brands?: unknown[];
  articles?: unknown[];
  hasArticles?: boolean;
  visibilityVisited?: boolean;
  citationRunsCount?: number;
  citations?: unknown[];
  citedRankingsCount?: number;
};

export const STEPS: OnboardingStep[] = [
  {
    id: "brand",
    title: "Create your first brand",
    description:
      "Set up a brand profile so content can be personalized with your tone, values, and unique selling points.",
    link: "/brands",
    linkText: "Create brand",
    icon: Building2,
    checkFn: (d) => (d?.brands?.length || 0) > 0,
  },
  {
    id: "content",
    title: "Generate AI-optimized content",
    description:
      "Use the AI content generator to create articles designed to be cited by AI search engines.",
    link: "/content",
    linkText: "Create content",
    icon: PenLine,
    checkFn: (d) => Boolean(d?.hasArticles) || (d?.articles?.length || 0) > 0,
  },
  {
    id: "visibility",
    title: "View the AI Visibility Guide",
    description:
      "Step-by-step recommendations to optimize your presence across ChatGPT, Claude, and other AI engines.",
    link: "/ai-visibility",
    linkText: "View guide",
    icon: ScanEye,
    // Server-only — localStorage would leak across user accounts on the
    // same browser (e.g. logout + new signup would see the step pre-done).
    checkFn: (d) => Boolean(d?.visibilityVisited),
  },
  {
    id: "citation",
    title: "Run your first citation check",
    description:
      "Kick off an AI citation run so we can start tracking how often platforms mention your brand.",
    link: "/citations",
    linkText: "Run check",
    icon: Target,
    // Done the moment the user triggers their first run — no need to wait
    // for an actual cited result.
    checkFn: (d) =>
      (d?.citationRunsCount || 0) > 0 ||
      (d?.citations?.length || 0) > 0 ||
      (d?.citedRankingsCount || 0) > 0,
  },
];

export function isOnboardingComplete(data: OnboardingData): boolean {
  return STEPS.every((step) => step.checkFn(data));
}

export function completedStepCount(data: OnboardingData): number {
  return STEPS.filter((step) => step.checkFn(data)).length;
}
```

- [ ] **Step 3: Replace the inline STEPS in `SidebarOnboarding.tsx`**

In `client/src/components/SidebarOnboarding.tsx`:

Find the imports block at the top and add:
```ts
import { STEPS, type OnboardingData, isOnboardingComplete, completedStepCount } from "@/lib/onboardingSteps";
```

Find the `interface OnboardingStep { ... }` block (lines 24-32) and DELETE it entirely (now imported).

Find the `const STEPS: OnboardingStep[] = [...];` block (lines 34-82) and DELETE it entirely.

Remove the now-unused `import { Building2, PenLine, ScanEye, Target }` icons from the top — those moved to the lib file. (Keep `Rocket`, `CheckCircle2`, `ArrowRight` etc. if they're still used elsewhere in the file — read the file to confirm.)

- [ ] **Step 4: Run typecheck**

Run:
```
npm run check
```

Expected: clean. If type errors appear (likely around the `data: any` parameter), the lib file's `OnboardingData` type contract may not match what `SidebarOnboarding.tsx` constructs. Adjust the lib file's type to be a strict superset of what the existing widget builds.

- [ ] **Step 5: Run full test suite**

Run:
```
npm test
```

Expected: 237 tests still passing. No new tests yet — that comes in Task 2.

- [ ] **Step 6: Verify diff**

Run:
```
git diff client/src/components/SidebarOnboarding.tsx
git status --short client/src/lib/onboardingSteps.ts
```

Confirm: SidebarOnboarding has the new import + deleted inline STEPS/interface, no other changes. New lib file is untracked.

### Task 2: Build `OnboardingProgressRing` component + RTL tests

**Files:**
- Create: `client/src/components/dashboard/OnboardingProgressRing.tsx`
- Create: `tests/unit/OnboardingProgressRing.test.tsx`

**Why this design:** The ring is the "loud" billboard surface — always visible while incomplete, takes a hero slot. It must handle 4 query states cleanly (loading / partial / error / data) and dismiss localStorage must be scoped by `user.id` to prevent cross-account leakage.

- [ ] **Step 1: Write the failing test FIRST**

Create `tests/unit/OnboardingProgressRing.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock the auth hook so we can swap user.id between tests.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));

// Mock Wouter Link so click navigation is testable without a router.
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { useAuth } from "@/hooks/use-auth";
import OnboardingProgressRing from "@/components/dashboard/OnboardingProgressRing";

function renderWithQueries(opts: {
  brands?: unknown[] | null; // null = loading
  articles?: unknown[] | null;
  status?: { visibilityVisited: boolean; citationRunsCount: number } | null;
}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  // Pre-seed query caches with the test data (or leave empty for loading).
  if (opts.brands !== null && opts.brands !== undefined) {
    qc.setQueryData(["/api/brands"], { success: true, data: opts.brands });
  }
  if (opts.articles !== null && opts.articles !== undefined) {
    qc.setQueryData(["/api/articles"], { success: true, data: opts.articles });
  }
  if (opts.status !== null && opts.status !== undefined) {
    qc.setQueryData(["/api/onboarding-status"], { success: true, data: opts.status });
  }

  return render(
    <QueryClientProvider client={qc}>
      <OnboardingProgressRing />
    </QueryClientProvider>,
  );
}

describe("OnboardingProgressRing", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-A" },
      isLoading: false,
      logout: vi.fn(),
    } as any);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders skeleton when any query is still loading", () => {
    renderWithQueries({ brands: null, articles: [], status: null });
    expect(screen.getByTestId("onboarding-ring-skeleton")).toBeInTheDocument();
  });

  it("renders correct completed/total when all queries loaded with partial data", () => {
    renderWithQueries({
      brands: [{ id: "b-1" }],
      articles: [],
      status: { visibilityVisited: false, citationRunsCount: 0 },
    });
    // 1 of 4 steps complete (just "Create your first brand").
    expect(screen.getByText(/1\s*\/\s*4/i)).toBeInTheDocument();
  });

  it("auto-dismisses + writes localStorage when all 4 steps complete", async () => {
    renderWithQueries({
      brands: [{ id: "b-1" }],
      articles: [{ id: "a-1" }],
      status: { visibilityVisited: true, citationRunsCount: 1 },
    });

    // The "you're set" celebratory state shows.
    expect(screen.getByText(/you're set/i)).toBeInTheDocument();

    // localStorage gets the dismissal key for THIS user.
    expect(localStorage.getItem("venturecite-onboarding-ring-dismissed:user-A")).toBe("true");
  });

  it("scopes dismissal by user.id — different user sees fresh ring", () => {
    // First user completes onboarding → dismissal written.
    localStorage.setItem("venturecite-onboarding-ring-dismissed:user-A", "true");

    // Switch to a different user.
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-B" },
      isLoading: false,
      logout: vi.fn(),
    } as any);

    renderWithQueries({
      brands: [],
      articles: [],
      status: { visibilityVisited: false, citationRunsCount: 0 },
    });

    // user-B sees the ring (not dismissed for them).
    expect(screen.getByText(/0\s*\/\s*4/i)).toBeInTheDocument();
    // Confirm we did NOT read user-A's dismissal flag.
    expect(screen.queryByText(/you're set/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run:
```
npx vitest run tests/unit/OnboardingProgressRing.test.tsx
```

Expected: 4 tests fail with "module not found" — the component doesn't exist yet.

- [ ] **Step 3: Implement the component**

Create `client/src/components/dashboard/OnboardingProgressRing.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import VisibilityGauge from "@/components/dashboard/VisibilityGauge";
import {
  STEPS,
  type OnboardingData,
  completedStepCount,
  isOnboardingComplete,
} from "@/lib/onboardingSteps";

const DISMISS_KEY_PREFIX = "venturecite-onboarding-ring-dismissed:";

export default function OnboardingProgressRing() {
  const { user } = useAuth();

  const dismissKey = user?.id ? `${DISMISS_KEY_PREFIX}${user.id}` : null;

  const { data: statusResp, isLoading: statusLoading, isError: statusError } = useQuery<{
    success: boolean;
    data: OnboardingData;
  }>({
    queryKey: ["/api/onboarding-status"],
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
  const { data: brandsResp, isLoading: brandsLoading, isError: brandsError } = useQuery<{
    success: boolean;
    data: unknown[];
  }>({ queryKey: ["/api/brands"] });
  const { data: articlesResp, isLoading: articlesLoading, isError: articlesError } = useQuery<{
    success: boolean;
    data: unknown[];
  }>({ queryKey: ["/api/articles"] });

  const anyLoading = statusLoading || brandsLoading || articlesLoading;
  const anyError = statusError || brandsError || articlesError;

  // Read dismissal state from localStorage scoped by user.id. Re-read on
  // user change so cross-account browser sharing doesn't leak state.
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (!dismissKey) return false;
    try {
      return localStorage.getItem(dismissKey) === "true";
    } catch {
      return false;
    }
  });

  // If user.id changes (login as different account), re-read dismissal.
  useEffect(() => {
    if (!dismissKey) {
      setIsDismissed(false);
      return;
    }
    try {
      setIsDismissed(localStorage.getItem(dismissKey) === "true");
    } catch {
      setIsDismissed(false);
    }
  }, [dismissKey]);

  // Loading: render skeleton matching final layout to avoid layout shift.
  if (anyLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-6 p-6">
          <Skeleton
            data-testid="onboarding-ring-skeleton"
            className="h-[160px] w-[160px] rounded-full"
          />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error in any of the three queries: don't render. Other dashboard
  // components will show their own error state — no need to bubble here.
  if (anyError) return null;

  // Don't render if user is not loaded yet (defensive).
  if (!user?.id) return null;

  const data: OnboardingData = {
    ...(statusResp?.data || {}),
    brands: brandsResp?.data ?? statusResp?.data?.brands ?? [],
    articles: articlesResp?.data ?? statusResp?.data?.articles ?? [],
    hasArticles:
      (articlesResp?.data?.length || 0) > 0 || Boolean(statusResp?.data?.hasArticles),
  };

  const completed = completedStepCount(data);
  const total = STEPS.length;
  const complete = isOnboardingComplete(data);
  const progress = (completed / total) * 100;

  // Auto-dismiss on completion (write localStorage so the ring stays
  // hidden on subsequent loads). Show the celebratory state for the
  // current render.
  useEffect(() => {
    if (complete && dismissKey && !isDismissed) {
      try {
        localStorage.setItem(dismissKey, "true");
      } catch {
        // ignore
      }
    }
  }, [complete, dismissKey, isDismissed]);

  // If already dismissed AND complete, hide entirely.
  if (isDismissed && !complete) return null;
  if (isDismissed && complete) return null;

  // Completed for the first time → render celebratory state.
  if (complete) {
    return (
      <Card>
        <CardContent className="flex items-center gap-6 p-6">
          <div className="relative inline-flex items-center justify-center h-[160px] w-[160px]">
            <VisibilityGauge score={100} size={160} fillColor="hsl(var(--chart-2, 142 71% 45%))" />
            <CheckCircle2
              className="absolute h-12 w-12 text-green-500"
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 className="text-xl font-semibold">You're set 🎉</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Onboarding complete. Run weekly citation checks to see how AI engines mention you.
            </p>
            <Link href="/citations">
              <a className="inline-block mt-3 text-sm font-medium text-primary hover:underline">
                Go to citations →
              </a>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // In-progress state: ring + step list.
  const nextIncomplete = STEPS.find((s) => !s.checkFn(data));

  return (
    <Card>
      <CardContent className="flex flex-col md:flex-row items-center gap-6 p-6">
        <div className="relative inline-flex items-center justify-center">
          <VisibilityGauge score={progress} size={160} />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-3xl font-bold leading-none">{completed}/{total}</div>
            <div className="text-xs text-muted-foreground mt-1">steps done</div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold mb-2">Get started</h2>
          <ul className="space-y-2">
            {STEPS.map((step) => {
              const done = step.checkFn(data);
              const Icon = step.icon;
              return (
                <li key={step.id} className="flex items-center gap-2 text-sm">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
                  ) : (
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className={done ? "line-through text-muted-foreground" : ""}>
                    {step.title}
                  </span>
                </li>
              );
            })}
          </ul>
          {nextIncomplete && (
            <Link href={nextIncomplete.link}>
              <a className="inline-block mt-3 text-sm font-medium text-primary hover:underline">
                Continue: {nextIncomplete.linkText} →
              </a>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```
npx vitest run tests/unit/OnboardingProgressRing.test.tsx
```

Expected: 4 tests pass.

If a test fails, common causes:
- Missing `data-testid="onboarding-ring-skeleton"` on the skeleton div (already in the implementation above)
- The "you're set" celebratory state must render the dismissal-key write effect synchronously enough that the test sees `localStorage.getItem(...) === "true"` immediately after render. The `useEffect` should fire on first mount; if the test runs the assertion BEFORE the effect, wrap the assertion in `await waitFor(...)`.

If `waitFor` is needed, add to test imports:
```ts
import { waitFor } from "@testing-library/react";
```
And change the localStorage assertion to:
```ts
await waitFor(() => {
  expect(localStorage.getItem("venturecite-onboarding-ring-dismissed:user-A")).toBe("true");
});
```

- [ ] **Step 5: Run full test suite**

Run:
```
npm test
```

Expected: **241 tests passing** (237 baseline + 4 new).

- [ ] **Step 6: Run typecheck**

Run:
```
npm run check
```

Expected: clean.

- [ ] **Step 7: Verify diff**

Run:
```
git status --short | grep -E "OnboardingProgressRing|onboardingSteps"
```

Confirm: 2 untracked files (lib + component) and 1 untracked test file.

### Task 3: Mount the ring on the dashboard

**Files:**
- Modify: `client/src/pages/home.tsx` (mount component above hero metrics row)

- [ ] **Step 1: Read the existing dashboard structure**

Read `client/src/pages/home.tsx` end-to-end. Find where the hero metrics row is rendered (likely near the top inside a `<div className="container">` or similar).

- [ ] **Step 2: Import and mount the component**

At the top of `home.tsx`, add the import:
```ts
import OnboardingProgressRing from "@/components/dashboard/OnboardingProgressRing";
```

Find the hero metrics row (or whatever renders first inside the dashboard's main content). Insert the ring directly before it:
```tsx
<OnboardingProgressRing />
{/* existing hero metrics row stays unchanged */}
```

The component handles its own conditional rendering — when dismissed/complete it returns `null`, when loading it renders skeleton, otherwise it renders the ring. No conditional logic needed at the call site.

- [ ] **Step 3: Run typecheck and tests**

Run:
```
npm run check
npm test
```

Expected: typecheck clean, 241 tests passing.

- [ ] **Step 4: Manual smoke test (`npm run dev`)**

Start dev server:
```
npm run dev
```

Open `http://localhost:5000/dashboard` while logged in. Verify:
1. Ring renders above the hero metrics row.
2. Ring shows correct `completed/total` based on your account state.
3. Resize to mobile width (DevTools 375px) — ring stacks above step list (flex-col on mobile, flex-row on desktop).
4. Click "Continue: ..." link → navigates to the appropriate page.
5. (If you're already complete) you see the "You're set 🎉" state once, then on next page load the ring is hidden.

Halt if any of these fail.

- [ ] **Step 5: Verify diff**

Run:
```
git diff client/src/pages/home.tsx
```

Confirm: only the import line + the `<OnboardingProgressRing />` mount were added. No other changes.

### Task 4: Update `SidebarOnboarding` to show "✓ Setup complete" when done

**Files:**
- Modify: `client/src/components/SidebarOnboarding.tsx`

**Why:** Per the design (Section 3 of the spec), when onboarding is complete, both the dashboard ring AND the sidebar widget should reflect that — the ring auto-dismisses; the sidebar widget shrinks to a tiny "✓ Setup complete" indicator (still openable to view the completed checklist, read-only celebration).

- [ ] **Step 1: Read the current widget render logic**

Read `client/src/components/SidebarOnboarding.tsx` lines 86-220 (the component body). Note where the trigger button + Dialog live.

- [ ] **Step 2: Use `isOnboardingComplete` to switch trigger render**

In `SidebarOnboarding.tsx`, find the line that renders the trigger button (something like a `<Button>` with a `Rocket` icon and "Onboarding" label). Wrap it with conditional logic:

```tsx
const complete = isOnboardingComplete(data);

// ... in the JSX:
{complete ? (
  <button
    onClick={() => setOpen(true)}
    className="..." // match the existing condensed sidebar item style
    aria-label="View completed onboarding"
  >
    <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
    <span className="text-xs text-muted-foreground">Setup complete</span>
  </button>
) : (
  // existing in-progress trigger button stays as-is
  // ...
)}
```

(Adapt the exact JSX structure to match what's already in `SidebarOnboarding.tsx` — read the file first to see the existing button class names and event handlers.)

The Dialog body itself doesn't need changes — when complete, all 4 steps render with their `done` checkmarks. That's the "read-only celebration" view.

- [ ] **Step 3: Run typecheck + tests**

Run:
```
npm run check
npm test
```

Expected: clean, 241 tests passing.

- [ ] **Step 4: Manual smoke test**

In dev mode (already running from Task 3), verify:
1. While onboarding incomplete → sidebar widget shows the existing in-progress button.
2. Force-completion (e.g., temporarily make all `checkFn`s return true via DevTools console) → sidebar widget switches to "Setup complete ✓".
3. Click the complete button → opens the same Dialog, all 4 steps render with green checkmarks.

- [ ] **Step 5: Verify diff**

Run:
```
git diff client/src/components/SidebarOnboarding.tsx
```

Confirm: only the conditional trigger render added. The STEPS extraction from Task 1 should be the only OTHER change visible in this file's diff.

### PR 1.1 verification gate

- [ ] **Final checks:**

```
npm run check
npm test
npx eslint client/src/components/dashboard/OnboardingProgressRing.tsx client/src/lib/onboardingSteps.ts client/src/components/SidebarOnboarding.tsx 2>&1 | tail -3
```

Expected: typecheck clean, 241 tests passing, 0 eslint errors on touched files.

---

## PR 1.2 — "What to expect" timeline (~1 day)

### Task 5: Build `ResultsTimeline` component + RTL test

**Files:**
- Create: `client/src/components/dashboard/ResultsTimeline.tsx`
- Create: `tests/unit/ResultsTimeline.test.tsx`

**Why:** The timeline answers Ben's "I can't tell when I'll see results" complaint. Static graphic with 4 milestones; the user's "current week" is computed from `min(brand.createdAt)` and highlighted.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ResultsTimeline.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import ResultsTimeline from "@/components/dashboard/ResultsTimeline";

function renderWithBrands(brands: { createdAt: string }[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  qc.setQueryData(["/api/brands"], { success: true, data: brands });
  return render(
    <QueryClientProvider client={qc}>
      <ResultsTimeline />
    </QueryClientProvider>,
  );
}

describe("ResultsTimeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T00:00:00Z"));
  });

  it("highlights the correct milestone based on oldest brand age", () => {
    // Brand created 16 days ago → should be in "Week 2-3" milestone.
    const sixteenDaysAgo = new Date("2026-04-18T00:00:00Z").toISOString();
    renderWithBrands([{ createdAt: sixteenDaysAgo }]);

    // The 4 milestones all render.
    expect(screen.getByText(/day 0/i)).toBeInTheDocument();
    expect(screen.getByText(/week 1/i)).toBeInTheDocument();
    expect(screen.getByText(/week 2.*3/i)).toBeInTheDocument();
    expect(screen.getByText(/week 4\+/i)).toBeInTheDocument();

    // The "you're at week N" line says Week 2.
    expect(screen.getByTestId("current-week")).toHaveTextContent(/week 2/i);
  });

  it("clamps brand-newer-than-day-0 to Day 0", () => {
    const justNow = new Date("2026-05-04T00:00:00Z").toISOString();
    renderWithBrands([{ createdAt: justNow }]);
    expect(screen.getByTestId("current-week")).toHaveTextContent(/day 0/i);
  });

  it("uses the OLDEST brand when multiple exist", () => {
    const recent = new Date("2026-05-01T00:00:00Z").toISOString(); // 3 days ago
    const old = new Date("2026-04-04T00:00:00Z").toISOString(); // 30 days ago
    renderWithBrands([{ createdAt: recent }, { createdAt: old }]);
    // 30 days ≈ Week 4+
    expect(screen.getByTestId("current-week")).toHaveTextContent(/week 4/i);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run:
```
npx vitest run tests/unit/ResultsTimeline.test.tsx
```

Expected: 3 tests fail with "module not found".

- [ ] **Step 3: Implement the component**

Create `client/src/components/dashboard/ResultsTimeline.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

type Milestone = {
  label: string;
  body: string;
  // The minimum number of days since signup at which this milestone is
  // considered the "current" one. Earlier milestones become "done" as the
  // user crosses thresholds.
  minDays: number;
};

const MILESTONES: Milestone[] = [
  {
    label: "Day 0",
    body: "Setup brand + AI Visibility checklist",
    minDays: 0,
  },
  {
    label: "Week 1",
    body: "Generate 5–10 articles, publish to your site",
    minDays: 7,
  },
  {
    label: "Week 2–3",
    body: "First citations appear as LLMs re-index your content",
    minDays: 14,
  },
  {
    label: "Week 4+",
    body: "Citation rate stabilizes, rankings emerge",
    minDays: 28,
  },
];

// Returns the index of the current milestone (0–3) given days since the
// user's oldest brand was created. If no brands exist, returns 0 (Day 0).
function currentMilestoneIndex(daysSinceOldestBrand: number | null): number {
  if (daysSinceOldestBrand === null) return 0;
  const clamped = Math.max(0, Math.min(daysSinceOldestBrand, 365));
  let idx = 0;
  for (let i = 0; i < MILESTONES.length; i++) {
    if (clamped >= MILESTONES[i].minDays) idx = i;
  }
  return idx;
}

export default function ResultsTimeline() {
  const { data: brandsResp } = useQuery<{ success: boolean; data: Array<{ createdAt: string }> }>({
    queryKey: ["/api/brands"],
  });

  const brands = brandsResp?.data ?? [];
  let daysSinceOldest: number | null = null;
  if (brands.length > 0) {
    const oldest = brands.reduce<number>((min, b) => {
      const t = new Date(b.createdAt).getTime();
      return t < min ? t : min;
    }, Number.POSITIVE_INFINITY);
    if (Number.isFinite(oldest)) {
      daysSinceOldest = Math.max(0, Math.floor((Date.now() - oldest) / MS_PER_DAY));
    }
  }

  const currentIdx = currentMilestoneIndex(daysSinceOldest);
  const currentLabel =
    daysSinceOldest === null || daysSinceOldest === 0
      ? "Day 0"
      : MILESTONES[currentIdx].label;

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold mb-1">What to expect</h2>
        <p data-testid="current-week" className="text-sm text-muted-foreground mb-4">
          You're at: <strong>{currentLabel}</strong>
        </p>
        <ol className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {MILESTONES.map((m, i) => {
            const done = i < currentIdx;
            const current = i === currentIdx;
            return (
              <li
                key={m.label}
                className={[
                  "rounded-lg border p-3 text-sm",
                  done ? "bg-muted/30 text-muted-foreground" : "",
                  current ? "border-primary/50 bg-primary/5" : "border-muted",
                ].join(" ")}
              >
                <div className="flex items-center gap-2 font-medium">
                  {done && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />}
                  {m.label}
                </div>
                <div className="mt-1">{m.body}</div>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-muted-foreground mt-3">
          AI engines re-index new content on their own schedule — first citations typically appear
          1–2 weeks after a publish.
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the test, expect green**

Run:
```
npx vitest run tests/unit/ResultsTimeline.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 5: Run typecheck and full suite**

Run:
```
npm run check
npm test
```

Expected: typecheck clean, **244 tests passing** (241 + 3 new).

### Task 6: Build `EmptyResultsHero` component for citations page

**Files:**
- Create: `client/src/components/citations/EmptyResultsHero.tsx`

**Why:** The citations page's empty state currently is generic. This component replaces it with the 1–2 week LLM lag explainer — same wording the timeline uses, single source of truth.

- [ ] **Step 1: Create the component**

Create `client/src/components/citations/EmptyResultsHero.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { Search } from "lucide-react";

interface EmptyResultsHeroProps {
  /** Optional CTA button rendered below the explainer. */
  action?: { label: string; onClick: () => void };
}

export default function EmptyResultsHero({ action }: EmptyResultsHeroProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center text-center p-8">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Search className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold">No citations yet</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          AI engines (ChatGPT, Claude, Perplexity, …) re-index new content on their own schedule.
          First citations typically appear <strong>1–2 weeks</strong> after you publish a piece.
          In the meantime, run more checks to get a baseline, or finish your AI Visibility
          checklist.
        </p>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-4 inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            {action.label}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
```

(Layout-only component — no RTL test per the test-coverage convention.)

- [ ] **Step 2: Wire the component into `ResultsTab.tsx`**

Read `client/src/components/citations/ResultsTab.tsx` and find where the existing empty state (or absence of one) lives. The component renders citation results; when `totalChecks === 0` (or equivalent), render `<EmptyResultsHero />` instead.

Add the import at the top:
```ts
import EmptyResultsHero from "./EmptyResultsHero";
```

Find the render branch where the result list is empty. Replace any inline empty-state markup (or no-data fallback) with:
```tsx
{totalChecks === 0 ? (
  <EmptyResultsHero
    action={{
      label: "Run a check now",
      onClick: () => /* call existing trigger function for a citation run */,
    }}
  />
) : (
  // existing results render stays as-is
)}
```

(Adapt the exact condition variable name and the run-trigger function name to whatever's in the file. If there's no easy trigger to wire to, omit the `action` prop entirely — the component renders fine without it.)

- [ ] **Step 3: Run typecheck + tests**

Run:
```
npm run check
npm test
```

Expected: typecheck clean, 244 tests passing.

- [ ] **Step 4: Manual smoke test**

In dev mode, navigate to `/citations` for a brand with no citation runs yet. Confirm `<EmptyResultsHero />` renders with the 1–2 week explainer.

### Task 7: Mount `ResultsTimeline` on the dashboard

**Files:**
- Modify: `client/src/pages/home.tsx`

- [ ] **Step 1: Add the import + mount**

In `client/src/pages/home.tsx`, add:

```ts
import ResultsTimeline from "@/components/dashboard/ResultsTimeline";
```

Mount immediately below `<OnboardingProgressRing />` (from Task 3):

```tsx
<OnboardingProgressRing />
<ResultsTimeline />
{/* existing hero metrics row */}
```

Per the spec's Section 6 decision: stacked layout. Both `<OnboardingProgressRing />` and `<ResultsTimeline />` always render at the top of the dashboard. (When the ring is dismissed/complete, it returns `null` so the timeline appears at the top organically.)

- [ ] **Step 2: Run typecheck + tests**

Run:
```
npm run check
npm test
```

Expected: clean, 244 tests passing.

- [ ] **Step 3: Manual smoke test**

In dev mode at `/dashboard`:
1. Both ring + timeline render at the top.
2. Mobile (375px): both stack vertically without horizontal overflow.
3. Timeline shows correct "You're at: Day 0 / Week 1 / etc." based on your brand age.

### Task 8: Add "Week N" line to the weekly digest email

**Files:**
- Modify: `server/lib/weeklyDigestEmitter.ts` (compute `weekN` from min brand createdAt for the user)
- Modify: `server/emailService.ts` (add `weekN` to `WeeklyDigestPayload`, render in email body)

**Why:** Weekly emails currently don't reference the timeline. Adding "Week N since you started VentureCite" reinforces expectations passively for users who only check email and don't visit the dashboard often.

- [ ] **Step 1: Extend the email payload type**

In `server/emailService.ts`, find:
```ts
export type WeeklyDigestPayload = {
  user: { id: string; email: string; firstName?: string | null };
  brandBriefs: WeeklyDigestBrandBrief[];
};
```

Replace with:
```ts
export type WeeklyDigestPayload = {
  user: { id: string; email: string; firstName?: string | null };
  brandBriefs: WeeklyDigestBrandBrief[];
  /** Whole weeks since the user's oldest brand was created. Null if no
   *  brands exist (rare for users who get this email at all). 0 means
   *  brand created in the same week as send. */
  weekN: number | null;
};
```

- [ ] **Step 2: Render `weekN` in the email body**

Find the existing email body composition (the `brandSections` map starting around line 300, with surrounding HTML). Find the `<p style="color:#666;margin:0 0 24px">Week of ${weekOf}</p>` line (or similar header line). Replace with:

```ts
const weekNLine =
  digestPayload.weekN === null
    ? ""
    : `<p style="color:#666;margin:0 0 24px">Week of ${weekOf} · Week ${digestPayload.weekN + 1} since you started VentureCite</p>`;
```

(Use `weekN + 1` so the user sees "Week 1" on their first digest — humans count from 1, our internal helper counts from 0.)

Then where the existing `<p style="...">Week of ${weekOf}</p>` was rendered, use the new `weekNLine` variable instead.

If `weekN` is null (edge case: user has no brands but still gets a digest), fall back to just "Week of {date}" without the count.

- [ ] **Step 3: Compute `weekN` in the emitter**

In `server/lib/weeklyDigestEmitter.ts`, find the call site:
```ts
const ok = await sendWeeklyDigest(user.email, {
  user: { id: user.id, email: user.email, firstName: user.firstName ?? null },
  brandBriefs: briefs,
});
```

Above this call, compute the weekN. The `userBrands` query already runs earlier in the same function (look for `db.select(...).from(schema.brands).where(eq(schema.brands.userId, user.id))`). It returns brand objects — find the oldest `createdAt` and compute weeks elapsed.

```ts
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
let weekN: number | null = null;
if (userBrands.length > 0) {
  const oldestMs = userBrands.reduce<number>((min, b) => {
    // userBrands query above currently selects only { id, name }. Extend
    // it to include createdAt:
    //   .select({ id, name, createdAt: schema.brands.createdAt })
    const t = (b as any).createdAt
      ? new Date((b as any).createdAt as string).getTime()
      : Date.now();
    return t < min ? t : min;
  }, Number.POSITIVE_INFINITY);
  if (Number.isFinite(oldestMs)) {
    weekN = Math.max(0, Math.floor((Date.now() - oldestMs) / MS_PER_WEEK));
  }
}
```

**Important:** the existing `userBrands` query selects only `{ id, name }`. You MUST extend the `.select({...})` to also include `createdAt: schema.brands.createdAt` for `weekN` calculation. Read the current select call (~lines 63-66) and add the field.

Then update the `sendWeeklyDigest` call to pass `weekN`:
```ts
const ok = await sendWeeklyDigest(user.email, {
  user: { id: user.id, email: user.email, firstName: user.firstName ?? null },
  brandBriefs: briefs,
  weekN,
});
```

- [ ] **Step 4: Run typecheck + tests**

Run:
```
npm run check
npm test
```

Expected: typecheck clean. The existing `tests/unit/contentGenerationResponses.test.ts` and `tests/unit/cronOrchestrator.test.ts` mock `sendWeeklyDigest` if at all; if the new required `weekN` field breaks any test, update the mock to pass `weekN: null`. Run tests again to confirm green.

Final test count expected: **244 tests passing**.

- [ ] **Step 5: Manual sanity check (no live email send)**

You don't need to actually trigger a digest send — visual review of the touched code is enough:
- `server/emailService.ts`: confirm the `weekNLine` composes correctly when `weekN === null` (returns empty string) and when `weekN === 3` (returns the "Week 4 since you started VentureCite" line, since +1 for human counting).
- `server/lib/weeklyDigestEmitter.ts`: confirm `userBrands.select` includes `createdAt` and `weekN` is passed to `sendWeeklyDigest`.

### PR 1.2 verification gate

- [ ] **Final checks:**

```
npm run check
npm test
npx eslint client/src/components/dashboard/ResultsTimeline.tsx client/src/components/citations/EmptyResultsHero.tsx server/lib/weeklyDigestEmitter.ts server/emailService.ts 2>&1 | tail -3
```

Expected: typecheck clean, 244 tests passing, 0 eslint errors on touched files.

---

## Final verification

### Task 9: End-to-end Phase 1 verification

- [ ] **Step 1: Full type + test + lint pass**

```
npm run check
npm test
npx eslint server/ client/src/ 2>&1 | tail -3
```

Expected:
- typecheck clean
- **244 tests passing** (237 baseline + 7 new across PR 1.1 + PR 1.2)
- 0 eslint errors (warning count may have grown by a small amount; that's fine)

- [ ] **Step 2: Manual smoke through the dashboard at desktop + mobile**

`npm run dev`. Open the dashboard.

Desktop (≥1024px):
- Onboarding ring renders at top, in-progress state with step list to the right.
- Below it: results timeline as a 4-column grid.
- Below it: existing hero metrics row.

Mobile (DevTools 375px):
- Ring + step list stack vertically.
- Timeline grid collapses to single column.
- No horizontal page scroll.

For a brand-new user account:
- Ring shows "0/4 steps" + first incomplete step CTA.
- Timeline shows "You're at: Day 0".

For an account with all 4 onboarding steps complete:
- Ring shows "You're set 🎉" celebration on first load.
- Reload page: ring is hidden (auto-dismissed via localStorage).
- Sidebar widget shows "Setup complete ✓".

- [ ] **Step 3: Smoke through `/citations` with empty results**

Navigate to `/citations` for a brand with no citation runs.
- `<EmptyResultsHero />` renders with the 1–2 week explainer.
- "Run a check now" button (if wired) triggers a citation run.

- [ ] **Step 4: Verify the diff footprint**

```
git diff --stat client/src/ server/lib/weeklyDigestEmitter.ts server/emailService.ts
git status --short | grep -E "onboardingSteps|OnboardingProgressRing|ResultsTimeline|EmptyResultsHero"
```

Expected files in the diff:
- `client/src/components/SidebarOnboarding.tsx`
- `client/src/pages/home.tsx`
- `client/src/components/citations/ResultsTab.tsx`
- `server/lib/weeklyDigestEmitter.ts`
- `server/emailService.ts`

Expected new (untracked) files:
- `client/src/lib/onboardingSteps.ts`
- `client/src/components/dashboard/OnboardingProgressRing.tsx`
- `client/src/components/dashboard/ResultsTimeline.tsx`
- `client/src/components/citations/EmptyResultsHero.tsx`
- `tests/unit/OnboardingProgressRing.test.tsx`
- `tests/unit/ResultsTimeline.test.tsx`
- (Possibly `tests/setup.ts` and modifications to `vitest.config.ts` if RTL setup was needed)

- [ ] **Step 5: Report Phase 1 complete**

Summarize what changed: ring + timeline visible on dashboard, sidebar shows "Setup complete" when done, citations empty state explains the LLM lag, weekly digest email mentions Week N.

---

## What this plan does NOT do

Per the spec's "Out of scope" section, Phase 1 deliberately does not:

- Add the page-explainer popovers on every page (that's Phase 2's `(i)` icon work).
- Add the recommendation panel on the dashboard (Phase 4).
- Touch the citations page beyond replacing the empty state (per-platform highlight + snippet strip + URL extraction is Phase 3).
- Change anything about how citation runs themselves work — only the empty-state UI is touched.
- Add A/B testing or analytics tracking on the new components — out of scope; existing event tracking (if any) covers them.

These appear in the relevant later phase plans.
