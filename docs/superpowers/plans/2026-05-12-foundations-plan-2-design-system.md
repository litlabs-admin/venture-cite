# Foundations Plan 2 — Design System Enforcement + Primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the design-token divergence. Today the tokens in [client/src/index.css](../../../client/src/index.css) and [DESIGN.md](../../../DESIGN.md) are correct, but pages bypass them at scale (violet spinners, raw Tailwind palette, hardcoded chart hex, forbidden gradients, dark-mode panels mixing with light theme). After Plan 2, every authenticated page shares one visual identity, six canonical primitive components exist, and the three Plan 1 StatusDot leftovers (geo-signals/geo-tools/faq-manager) land.

**Architecture:** One primitive task ships first (Task 1, blocking). Every subsequent task is an independent page or page-cluster sweep, parallel-safe. Each sweep applies the canonical token map (in §Canonical Token Map below), adopts whichever primitives fit, and runs `npm run check` + visual smoke before reporting done.

**Tech stack:** React 18 + Tailwind + shadcn/Radix. Tokens defined in CSS variables under `client/src/index.css`. Shadow scale, radii, fonts, and chart ramp all live there.

**Plan-wide rules:**
- **DO NOT COMMIT.** Every task ends with changes uncommitted. User commits manually.
- **DO NOT run ANY git command that mutates state.** Read-only ops (`git status`, `git diff`, `git log`, `git stash list`) are fine. NEVER use `git stash`, `git stash pop`, `git reset`, `git checkout`, `git restore`, `git add`, `git commit`, `git push`, `git pull`, `git rebase`, `git merge`, `git clean`, or any `git branch` mutation. Use `git diff HEAD -- <file>` to see only your changes — never stash.
- **Verify file:line before editing.** The spec was written 2026-05-10 and the codebase ships fast. Every task starts with a grep to confirm targets.
- **Parallel-safe within Wave B.** Each page task touches a different file with zero overlap. The shared dependency (primitives in `client/src/components/foundations/`) ships first in Wave A.
- **No new external services.** Vercel Hobby ceiling.
- **Out of scope:** Landing page (`landing.tsx`, `landing.css`, the `text-gradient-red` utility) — explicitly excluded per user decision. All orphan pages (`outreach.tsx`, `ai-traffic.tsx`, `agent-dashboard.tsx`, `agent-run.tsx`, `geo-rankings.tsx`, `publication-intelligence.tsx`, `revenue-analytics.tsx`, `analytics-integrations.tsx`) — excluded.

**Spec reference:** [docs/superpowers/specs/2026-05-10-foundations-design.md](../specs/2026-05-10-foundations-design.md) §4.1 (Design system enforcement), §4.10 (Loading + empty-state primitives), §4.5 n/o/p (StatusDot adoption leftovers from Plan 1).

---

## File Structure

**New directory:** `client/src/components/foundations/`

| File | Responsibility |
|---|---|
| `KPITile.tsx` | Canonical KPI card. `font-mono tabular-nums` number, `text-muted-foreground` label, optional delta with arrow + tone color. |
| `Section.tsx` | Canonical section wrapper. Title + description (`line-clamp-2`) + optional meta-row slot + optional action slot. |
| `EmptyState.tsx` | Canonical empty-state card. Icon + title + body + optional CTA. |
| `StatusDot.tsx` | 8px filled dot, tone-based color. Variants: `success | warn | fail | neutral | pending`. |
| `RouteSpinner.tsx` | Full-route loading spinner. `border-primary border-t-transparent`. Replaces 5 violet spinners in App.tsx. |
| `index.ts` | Barrel export so consumers import `from "@/components/foundations"`. |

Skeleton already exists at `client/src/components/ui/skeleton.tsx` (shadcn). Do **NOT** duplicate — Task 1 verifies and reuses.

---

## Canonical Token Map

**Source of truth for the sweep.** Every page task applies this map. If a class doesn't appear here and isn't a layout utility (`flex`, `grid`, `gap-*`, `p-*`, `mb-*`, etc.), grep for it in `index.css` first — if it's not a token, replace it.

### Backgrounds (page chrome)

| Old (raw) | New (token) |
|---|---|
| `bg-stone-50`, `bg-neutral-50`, `bg-gray-50`, `bg-slate-50` | `bg-background` |
| `bg-stone-100`, `bg-neutral-100`, `bg-gray-100` | `bg-muted` |
| `bg-white` (when used as card surface) | `bg-card` |
| `bg-slate-900` (used as terminal/code chrome) | `bg-muted` (light) — see also Task 9 (already done in Plan 1) |

### Brand color (primary CTA, brand identity)

| Old | New |
|---|---|
| `bg-red-600`, `bg-red-700` for primary action buttons | `bg-primary` |
| `text-red-600` (when used as brand/link emphasis, not error) | `text-primary` |
| `border-red-500` (when brand-themed, not error) | `border-primary` |
| `bg-violet-*`, `text-violet-*`, `border-violet-*` (ALL) | If the role was brand → `*-primary`. If the role was decorative neutral → `text-muted-foreground` / `bg-muted` / `border-border`. |

### Destructive (error, danger)

| Old | New |
|---|---|
| `text-red-*` (when role is "error" / "danger") | `text-destructive` |
| `bg-red-*` (error banner backgrounds, not primary CTA) | `bg-destructive` (rare) or `bg-destructive/10` (subtler) |
| `border-red-500` (error state) | `border-destructive` |

### Status accent (chart ramp, NOT brand)

| Old | New |
|---|---|
| `text-emerald-*`, `text-green-*` (success/positive) | `text-chart-4` (verdant green in the ramp) or pair with `<StatusDot tone="success">` |
| `text-amber-*`, `text-orange-*`, `text-yellow-*` (warning) | `text-chart-3` (warm tan) or pair with `<StatusDot tone="warn">` |
| `text-blue-*` (informational/neutral category) | `text-chart-1` |
| `text-purple-*`, `text-fuchsia-*` (when not brand) | `text-chart-5` |

### Text colors

| Old | New |
|---|---|
| `text-slate-*`, `text-zinc-*`, `text-gray-*`, `text-neutral-*` (body/muted) | `text-foreground` (primary body) or `text-muted-foreground` (descriptions, metadata) |
| `text-black`, `text-white` (when used as page text) | `text-foreground` / `text-background` |

### Borders

| Old | New |
|---|---|
| `border-slate-*`, `border-zinc-*`, `border-gray-*` (default borders) | `border-border` |
| `border-l-4 border-purple-*` etc. (colored 4px stripes) | DELETE the 4px stripe. Use 1px hairline (`border-l border-border`) + `<StatusDot>` at the row start. Per design.json: "border-left greater than 1px as a colored accent stripe is a don't." |

### Charts

| Old | New |
|---|---|
| Hardcoded hex like `#3b82f6, #f97316, #eab308, #22c55e, #ef4444, #8b5cf6, #ec4899, #14b8a6, #a855f7, #f59e0b` | `hsl(var(--chart-1))` through `hsl(var(--chart-5))`. Repeat the ramp if more than 5 series. |

### Gradients (forbidden on authenticated routes)

| Old | New |
|---|---|
| `bg-gradient-to-br from-blue-500/20 to-purple-500/20` | Flat card: `bg-card border border-border` |
| `bg-gradient-to-r from-purple-600 to-blue-600` (CTAs) | `bg-primary` |
| Any `bg-gradient-*` on dashboards, analytics, optimization, content pages | Flat |
| `backdrop-filter`, glassmorphism | Flat |

### Numeric display

| Old | New |
|---|---|
| `text-3xl font-semibold` (KPI numbers) | Use `<KPITile>`. Or directly: `font-mono tabular-nums text-3xl` |
| Any stacked-numeric column without `tabular-nums` | Add `tabular-nums` (or `font-variant-numeric: tabular-nums`) |

### Description text

| Old | New |
|---|---|
| `truncate` on description-style text that's longer than one line | `line-clamp-2` (per design.json) |

### Shadows (Flat-At-Rest rule)

| Old | New |
|---|---|
| `shadow-sm` / `shadow` / `shadow-md` on cards at rest | Remove or replace with `border border-border` (hairline) |
| `shadow-lg` on hover state | KEEP. Shadows only appear on interaction. |

### Spinners

| Old | New |
|---|---|
| `<div className="...border-4 border-violet-600 border-t-transparent animate-spin">` (App.tsx ×5) | `<RouteSpinner />` from `@/components/foundations` |
| Ad-hoc `<div className="animate-pulse bg-muted">` skeleton in cards | `<Skeleton>` from `@/components/ui/skeleton` |
| `Loader2` inside button submit states | KEEP (correct usage) |

---

## Wave A: Primitives (must land first)

### Task 1: Ship the six foundations primitives

**Files:**
- Create: `client/src/components/foundations/KPITile.tsx`
- Create: `client/src/components/foundations/Section.tsx`
- Create: `client/src/components/foundations/EmptyState.tsx`
- Create: `client/src/components/foundations/StatusDot.tsx`
- Create: `client/src/components/foundations/RouteSpinner.tsx`
- Create: `client/src/components/foundations/index.ts`
- Verify (read-only): `client/src/components/ui/skeleton.tsx` exists; do NOT duplicate

**Steps:**

- [ ] **Step 1: Verify Skeleton primitive exists.**
  ```bash
  ls client/src/components/ui/skeleton.tsx
  cat client/src/components/ui/skeleton.tsx
  ```
  If missing, flag — the shadcn Skeleton should be there. Plan 2 reuses, never duplicates.

- [ ] **Step 2: Create `StatusDot.tsx`.**
  ```tsx
  import { cn } from "@/lib/utils";

  export type StatusDotTone = "success" | "warn" | "fail" | "neutral" | "pending";

  const toneClass: Record<StatusDotTone, string> = {
    success: "bg-chart-4",
    warn: "bg-chart-3",
    fail: "bg-destructive",
    neutral: "bg-muted-foreground",
    pending: "bg-muted-foreground/40 animate-pulse",
  };

  export function StatusDot({
    tone = "neutral",
    className,
    "aria-label": ariaLabel,
  }: {
    tone?: StatusDotTone;
    className?: string;
    "aria-label"?: string;
  }) {
    return (
      <span
        role="status"
        aria-label={ariaLabel ?? `Status: ${tone}`}
        className={cn("inline-block h-2 w-2 rounded-full shrink-0", toneClass[tone], className)}
      />
    );
  }
  ```

- [ ] **Step 3: Create `RouteSpinner.tsx`.**
  ```tsx
  import { cn } from "@/lib/utils";

  export function RouteSpinner({ className, label = "Loading" }: { className?: string; label?: string }) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-[40vh]" role="status" aria-label={label}>
        <div
          className={cn(
            "h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin",
            className,
          )}
        />
        <span className="sr-only">{label}</span>
      </div>
    );
  }
  ```

- [ ] **Step 4: Create `EmptyState.tsx`.**
  ```tsx
  import type { LucideIcon } from "lucide-react";
  import { cn } from "@/lib/utils";

  export function EmptyState({
    icon: Icon,
    title,
    body,
    cta,
    className,
  }: {
    icon?: LucideIcon;
    title: string;
    body?: React.ReactNode;
    cta?: React.ReactNode;
    className?: string;
  }) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center text-center py-12 px-6 rounded-md border border-border bg-card",
          className,
        )}
      >
        {Icon && <Icon className="h-8 w-8 text-muted-foreground mb-3" aria-hidden />}
        <h3 className="text-base font-medium text-foreground mb-1">{title}</h3>
        {body && <div className="text-sm text-muted-foreground max-w-md mb-4 line-clamp-3">{body}</div>}
        {cta}
      </div>
    );
  }
  ```

- [ ] **Step 5: Create `Section.tsx`.**
  ```tsx
  import { cn } from "@/lib/utils";

  export function Section({
    title,
    description,
    metaRow,
    action,
    children,
    className,
    contentClassName,
  }: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    metaRow?: React.ReactNode;
    action?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
    contentClassName?: string;
  }) {
    const hasHeader = title || description || metaRow || action;
    return (
      <section className={cn("space-y-4", className)}>
        {hasHeader && (
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
              {description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{description}</p>
              )}
              {metaRow && <div className="mt-2 flex items-center gap-2 flex-wrap">{metaRow}</div>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </header>
        )}
        {children && <div className={contentClassName}>{children}</div>}
      </section>
    );
  }
  ```

- [ ] **Step 6: Create `KPITile.tsx`.**
  ```tsx
  import { ArrowDown, ArrowUp } from "lucide-react";
  import { cn } from "@/lib/utils";

  export function KPITile({
    label,
    value,
    delta,
    deltaTone,
    sublabel,
    className,
  }: {
    label: string;
    value: string | number;
    delta?: string;
    deltaTone?: "up" | "down" | "neutral";
    sublabel?: string;
    className?: string;
  }) {
    const formattedValue = typeof value === "number" ? value.toLocaleString() : value;
    const deltaIcon = deltaTone === "up" ? ArrowUp : deltaTone === "down" ? ArrowDown : null;
    const deltaColor =
      deltaTone === "up"
        ? "text-chart-4"
        : deltaTone === "down"
          ? "text-destructive"
          : "text-muted-foreground";

    return (
      <div className={cn("rounded-md border border-border bg-card p-4", className)}>
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
        <div className="mt-2 font-mono tabular-nums text-3xl text-foreground">{formattedValue}</div>
        {(delta || sublabel) && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            {delta && (
              <span className={cn("inline-flex items-center gap-1 font-medium", deltaColor)}>
                {deltaIcon && <deltaIcon.type className="h-3 w-3" />}
                {delta}
              </span>
            )}
            {sublabel && <span className="text-muted-foreground">{sublabel}</span>}
          </div>
        )}
      </div>
    );
  }
  ```

  **Bug check:** the inline `deltaIcon.type` reference above is wrong because `deltaIcon` is already a component. Use:
  ```tsx
  {deltaIcon && (() => {
    const Icon = deltaIcon;
    return <Icon className="h-3 w-3" />;
  })()}
  ```
  Or simpler, refactor to:
  ```tsx
  {deltaTone === "up" && <ArrowUp className="h-3 w-3" />}
  {deltaTone === "down" && <ArrowDown className="h-3 w-3" />}
  ```
  Pick whichever reads cleanly.

- [ ] **Step 7: Create barrel export `index.ts`.**
  ```ts
  export { KPITile } from "./KPITile";
  export { Section } from "./Section";
  export { EmptyState } from "./EmptyState";
  export { StatusDot, type StatusDotTone } from "./StatusDot";
  export { RouteSpinner } from "./RouteSpinner";
  ```

- [ ] **Step 8: Replace App.tsx violet spinners.**
  ```bash
  grep -n "border-violet" client/src/App.tsx
  ```
  Expected: 5 matches at ~lines 52, 63, 80, 107, 138. Replace each with:
  ```tsx
  import { RouteSpinner } from "@/components/foundations";

  // wherever the spinner JSX was:
  <RouteSpinner />
  ```

- [ ] **Step 9: Verify type-check.**
  ```bash
  npm run check 2>&1 | tail -15
  ```

- [ ] **Step 10: Lint the new files.**
  ```bash
  npm run lint -- client/src/components/foundations/ client/src/App.tsx 2>&1 | tail -20
  ```

- [ ] **Step 11: Manual smoke test.** `npm run dev`. Navigate to any route. Confirm:
  - Route load shows a vermillion spinner, not violet.
  - StatusDot, EmptyState, Section, KPITile not yet consumed anywhere (will be in later tasks) but the primitives compile and import.

**Done. DO NOT COMMIT.**

---

## Wave B: Page sweeps (parallel-safe)

Each task in Wave B is independent. All can run concurrently because each touches different page files.

For every Wave B task, the canonical procedure is:

1. `git diff HEAD -- <file>` to confirm file is in a clean state (read-only).
2. Grep the file for raw color/spacing/shadow violations per the canonical token map.
3. Apply replacements. Adopt primitives where they fit (replace bespoke KPI cards with `<KPITile>`, bespoke empty-state cards with `<EmptyState>`, etc.).
4. Run `npm run check`. Fix any type errors.
5. Run `npm run lint -- <file>`.
6. Manual smoke test the page in `npm run dev`.

### Task 2: Auth flow pages (5 files)

**Files:**
- Modify: `client/src/pages/register.tsx`
- Modify: `client/src/pages/login.tsx`
- Modify: `client/src/pages/forgot-password.tsx`
- Modify: `client/src/pages/reset-password.tsx`
- Modify: `client/src/pages/welcome.tsx`

**Per spec recon (verify line numbers in code):**

- `register.tsx` ~87: `bg-stone-50` → `bg-background`
- `register.tsx` ~200, ~223: `bg-red-600` / `text-red-600` (primary CTA + brand link) → `bg-primary` / `text-primary`
- `login.tsx` ~62: `bg-stone-50` → `bg-background`
- `login.tsx` ~122, ~130, ~150: `bg-red-600` / `text-red-600` → `bg-primary` / `text-primary`
- `forgot-password.tsx`, `reset-password.tsx`: same auth-flow palette; sweep `bg-stone-*`, `bg-red-*`, `text-red-*` per map
- `welcome.tsx` ~312: `bg-neutral-50` → `bg-background`
- `welcome.tsx` ~384: `bg-emerald-400/500` pulse dot → `<StatusDot tone="pending">` or `bg-chart-4 animate-pulse`

**Steps:**

- [ ] **Step 1: Recon.**
  ```bash
  grep -n "bg-stone\|bg-neutral\|bg-red-600\|bg-red-700\|text-red-600\|text-red-700\|bg-gray-50\|bg-emerald\|text-violet\|bg-violet\|border-violet" client/src/pages/register.tsx client/src/pages/login.tsx client/src/pages/forgot-password.tsx client/src/pages/reset-password.tsx client/src/pages/welcome.tsx
  ```

- [ ] **Step 2: Apply token map.** For every match, replace per the canonical map. When in doubt about role (brand vs error vs decorative), default to **brand → primary**, **error/error-state → destructive**, **decorative → muted**.

- [ ] **Step 3: Replace `welcome.tsx:~384` pulse dot.**
  Find the `bg-emerald-400` or `bg-emerald-500` animated dot. Replace:
  ```tsx
  import { StatusDot } from "@/components/foundations";

  <StatusDot tone="pending" className="animate-pulse" />
  ```

- [ ] **Step 4: Verify zero raw-palette matches remain.**
  ```bash
  grep -n "bg-stone\|bg-neutral\|bg-red-600\|bg-red-700\|text-red-600\|text-red-700\|bg-violet\|text-violet\|border-violet\|bg-emerald\|text-emerald" client/src/pages/register.tsx client/src/pages/login.tsx client/src/pages/forgot-password.tsx client/src/pages/reset-password.tsx client/src/pages/welcome.tsx
  ```
  Expected: 0 matches. Any remainder needs to be reviewed and decided.

- [ ] **Step 5: Type-check + lint + smoke.**

**DO NOT COMMIT.**

---

### Task 3: Dashboard sweep (home.tsx)

**Files:**
- Modify: `client/src/pages/home.tsx` (large file — careful)
- Reference (do not modify here): dashboard sub-components in `client/src/components/dashboard/*` are touched by Plan 6; do not modify in Plan 2.

**Per spec recon:**

- `home.tsx` ~247-258: hardcoded chart hex `#3b82f6, #f97316, #eab308, #22c55e, #ef4444, #8b5cf6, #ec4899, #14b8a6, #a855f7, #f59e0b` → `hsl(var(--chart-1))` through `--chart-5` (repeat the ramp if there are more than 5 series).
- `home.tsx` ~133, 585, 647, 700: ambient `shadow-sm` on cards → demote to `border border-border` (no shadow at rest).
- `home.tsx` ~141, 549, 679, 930: `truncate` on description-style text → `line-clamp-2`.
- `home.tsx:~1105, 1158`: status/brand color mixing — review and align with tone vs brand role.
- KPI numeric tiles throughout: ensure `font-mono tabular-nums` on stacked numbers. Adopt `<KPITile>` for tiles that match the primitive's shape; leave bespoke tiles alone if the primitive doesn't fit (don't force-fit).
- Section headers using bespoke `<Section>` patterns: adopt the `<Section>` primitive **only where it cleanly fits**. Don't refactor section structure if it'd reshuffle a lot of children.

**Out of scope for this task** (Plan 6 handles these):
- The "Recognition: Unknown", "Underexposed", "Gaps AI identifies", PromptCoverageMap, Failed autopilot banner — these involve the Pre-Data State rule (Plan 6).
- Removing OnboardingProgressRing / ResultsTimeline mounts — Plan 6.
- Hiding hardcoded "Neutral" sentiment / "AI Confidence Score" tile — Plan 6.

**Plan 2 scope on home.tsx is PURELY VISUAL TOKEN CLEANUP.** Don't change behavior, don't change structure, don't gate anything.

**Steps:**

- [ ] **Step 1: Recon.**
  ```bash
  grep -n "#3b82f6\|#f97316\|#eab308\|#22c55e\|#ef4444\|#8b5cf6\|#ec4899\|#14b8a6\|#a855f7\|#f59e0b" client/src/pages/home.tsx
  grep -n "shadow-sm\|shadow-md\|shadow-lg" client/src/pages/home.tsx
  grep -n "truncate" client/src/pages/home.tsx
  grep -n "bg-stone\|bg-neutral\|text-red-6\|bg-red-6\|bg-violet\|text-violet\|border-violet\|bg-gradient" client/src/pages/home.tsx
  ```

- [ ] **Step 2: Replace chart hex with token references.**
  Build a chart-color array at module scope:
  ```ts
  const CHART_COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
  ];
  ```
  Replace inline hex references with `CHART_COLORS[i % CHART_COLORS.length]`.

- [ ] **Step 3: Sweep raw palette + ambient shadows + truncate.** Apply the canonical token map.

- [ ] **Step 4: Optionally adopt `<KPITile>` for KPI cards that match the primitive shape.** If the existing KPI implementation has bespoke chrome you can't cleanly express, leave it — but still apply `font-mono tabular-nums` directly.

- [ ] **Step 5: Verify zero raw-palette/hex matches remain.**

- [ ] **Step 6: Type-check + lint + manual smoke.**

**DO NOT COMMIT.**

---

### Task 4: Brand Fact Sheet violet purge

**Files:**
- Modify: `client/src/pages/brand-fact-sheet.tsx`

**Per spec recon (the entire page is page-wide violet):**

- `brand-fact-sheet.tsx` ~314, 317, 334, 491, 553, 595, 632, 635: `text-violet-*`, `border-violet-200`, `bg-violet-50` → token equivalents.
- Decision per occurrence:
  - If violet was acting as brand emphasis → `text-primary` / `border-primary` / `bg-primary/10`
  - If violet was decorative chrome → `text-muted-foreground` / `border-border` / `bg-muted`

**Steps:**

- [ ] **Step 1: Recon.**
  ```bash
  grep -n "violet" client/src/pages/brand-fact-sheet.tsx
  ```

- [ ] **Step 2: Replace each violet occurrence.** Default to **brand → primary, decorative → muted**.

- [ ] **Step 3: Verify zero violet matches remain.**
  ```bash
  grep -n "violet" client/src/pages/brand-fact-sheet.tsx
  ```
  Expected: 0.

- [ ] **Step 4: Type-check + lint + smoke.**

**DO NOT COMMIT.**

---

### Task 5: Analytics cluster (Citations + AI Visibility + AI Intelligence)

**Files:**
- Modify: `client/src/pages/citations.tsx`
- Modify: `client/src/pages/ai-visibility.tsx`
- Modify: `client/src/pages/ai-intelligence.tsx`

**Per spec recon:**

- `citations.tsx` ~407: `bg-red-600` (primary CTA) → `bg-primary`
- `citations.tsx` ~551: `border-red-500` → either `border-primary` (brand) or `border-destructive` (error). Check role.
- `ai-visibility.tsx`: scan for raw palette, gradients, shadows.
- `ai-intelligence.tsx`: scan for raw palette, gradients, shadows. Note: Alerts surface is GONE (Plan 1 Task 12), so only Visibility / Sentiment / Position / Sources / Models / Settings tabs remain.

**Steps:**

- [ ] **Step 1: Recon per file** (run for each):
  ```bash
  grep -n "bg-stone\|bg-neutral\|bg-red-6\|bg-red-7\|text-red-6\|text-red-7\|bg-violet\|text-violet\|border-violet\|bg-emerald\|text-emerald\|text-amber\|text-orange\|bg-gradient\|shadow-sm\|shadow-md\|truncate" client/src/pages/citations.tsx
  ```
  Replace path: `ai-visibility.tsx`, `ai-intelligence.tsx`.

- [ ] **Step 2: Apply canonical token map across all three files.**

- [ ] **Step 3: KPI tiles in `ai-intelligence.tsx` and analytics view in `citations.tsx`** — adopt `<KPITile>` where the primitive shape fits cleanly.

- [ ] **Step 4: Empty states** — replace bespoke patterns with `<EmptyState>` where shape fits.

- [ ] **Step 5: Verify zero raw-palette matches remain.**

- [ ] **Step 6: Type-check + lint + smoke each route.**

**DO NOT COMMIT.**

---

### Task 6: Geo Analytics + Competitors (gradient removal + chart hex)

**Files:**
- Modify: `client/src/pages/geo-analytics.tsx`
- Modify: `client/src/pages/competitors.tsx`

**Per spec recon — `geo-analytics.tsx` is one of the worst offenders:**

- ~206: `bg-gradient-to-br from-blue-500/20 to-purple-500/20` → `bg-card border border-border`
- ~233: `bg-gradient-to-br from-green-500/20 to-teal-500/20` → `bg-card border border-border`
- ~258: `bg-gradient-to-br from-amber-500/20 to-orange-500/20` → `bg-card border border-border`
- ~482: `bg-gradient-to-br from-blue-50 to-purple-50` → `bg-card border border-border`
- Any inline chart hex → `hsl(var(--chart-N))`
- KPI numeric cards — `font-mono tabular-nums`

**`competitors.tsx`:**

- Already lightly touched by Plan 1 (per-platform icons in Task 7, snapshot dialog deleted in Task 8). Plan 2 sweeps remaining tokens.
- Look for raw palette, gradients, shadows. Likely uses `text-emerald-*`/`text-red-*` for sentiment deltas — pair with `<StatusDot>` or convert to chart tokens.

**Steps:**

- [ ] **Step 1: Recon both files.**

- [ ] **Step 2: Remove every `bg-gradient-*` on these two pages.** Replace with flat `bg-card border border-border` for cards, `bg-primary` for gradient CTAs (rare).

- [ ] **Step 3: Sweep tokens.** Apply canonical token map.

- [ ] **Step 4: Adopt `<KPITile>` where appropriate.** Competitors has a leaderboard — likely keeps a custom rendering.

- [ ] **Step 5: Verify zero gradient/hex/raw-palette matches remain.**
  ```bash
  grep -n "bg-gradient\|#[0-9a-fA-F]\{6\}\|bg-violet\|text-violet" client/src/pages/geo-analytics.tsx client/src/pages/competitors.tsx
  ```

- [ ] **Step 6: Type-check + lint + smoke.**

**DO NOT COMMIT.**

---

### Task 7: Content/Community cluster

**Files:**
- Modify: `client/src/pages/community-engagement.tsx`
- Modify: `client/src/pages/geo-opportunities.tsx`
- Modify: `client/src/pages/articles.tsx`
- Modify: `client/src/pages/content.tsx`
- Modify: `client/src/pages/keyword-research.tsx`

**Notes:**
- All five touched by Plan 1 already. Plan 2 sweeps remaining tokens.
- `keyword-research.tsx` — Plan 1 added the AI-estimated banner + tooltips. Make sure new banner is `bg-muted` not `bg-yellow-*` or similar.

**Steps:**

- [ ] **Step 1: Recon per file.**

- [ ] **Step 2: Apply canonical token map.**

- [ ] **Step 3: Adopt `<EmptyState>` and `<KPITile>` where shape fits.**

- [ ] **Step 4: Truncate → line-clamp-2 audit.**

- [ ] **Step 5: Verify.**

- [ ] **Step 6: Type-check + lint + smoke each route.**

**DO NOT COMMIT.**

---

### Task 8: Optimization cluster + Plan 1 §4.5 n/o/p

**Files:**
- Modify: `client/src/pages/geo-signals.tsx`
- Modify: `client/src/pages/geo-tools.tsx`
- Modify: `client/src/pages/faq-manager.tsx`
- Modify: `client/src/pages/crawler-check.tsx`

**This task lands Plan 1's three deferred items:**

- **§4.5 n:** `geo-signals.tsx:~1357-1361` — `bg-green-600 / bg-yellow-600 / bg-red-500` animated stage circles → `<StatusDot tone="success|warn|fail">`.
- **§4.5 o:** `geo-tools.tsx:~781` — 4px purple left-border on Listicle row → 1px hairline (`border-l border-border`) + `<StatusDot>` at row start.
- **§4.5 p:** `faq-manager.tsx:~432-440` — 4px colored left-borders on FAQ items → 1px hairline + `<StatusDot>` at row start.

Plus general token sweep on all four files.

**Steps:**

- [ ] **Step 1: Recon.**
  ```bash
  grep -n "bg-green-6\|bg-yellow-6\|bg-red-5\|border-l-4" client/src/pages/geo-signals.tsx client/src/pages/geo-tools.tsx client/src/pages/faq-manager.tsx
  ```

- [ ] **Step 2: Replace stage circles in geo-signals.tsx.**
  ```tsx
  import { StatusDot } from "@/components/foundations";

  // For each stage circle, decide tone:
  <StatusDot tone="success" />   // was bg-green-600
  <StatusDot tone="warn" />      // was bg-yellow-600
  <StatusDot tone="fail" />      // was bg-red-500
  ```

- [ ] **Step 3: Replace 4px left-borders in geo-tools.tsx and faq-manager.tsx.**
  Pattern:
  ```tsx
  // Before:
  <div className="border-l-4 border-purple-500 pl-4">...</div>

  // After:
  <div className="border-l border-border pl-4 flex items-start gap-2">
    <StatusDot tone="neutral" className="mt-1.5" />
    <div>...</div>
  </div>
  ```
  Choose StatusDot tone based on what the original border color was conveying (info → neutral, warn → warn, success → success).

- [ ] **Step 4: General token sweep across all four files.** Apply canonical token map.

- [ ] **Step 5: Verify zero `border-l-4` and zero raw status-color usage remain.**
  ```bash
  grep -n "border-l-4\|bg-green-6\|bg-yellow-6\|bg-red-5" client/src/pages/geo-signals.tsx client/src/pages/geo-tools.tsx client/src/pages/faq-manager.tsx
  ```

- [ ] **Step 6: Type-check + lint + smoke each route.**

**DO NOT COMMIT.**

---

### Task 9: Remaining authenticated pages

**Files:**
- Modify: `client/src/pages/client-reports.tsx` (already touched by Plan 1 Task 1 — sweep remaining tokens)
- Modify: `client/src/pages/brands.tsx`
- Modify: `client/src/pages/settings.tsx`
- Modify: `client/src/pages/glossary.tsx`
- Modify: `client/src/pages/privacy.tsx`

**Steps:**

- [ ] **Step 1: Recon per file.** Same grep pattern as other tasks.

- [ ] **Step 2: Apply canonical token map.**

- [ ] **Step 3: Adopt primitives where they cleanly fit.** `<EmptyState>` for empty brand list / empty reports / empty results. `<KPITile>` where stacked numbers appear.

- [ ] **Step 4: For `settings.tsx`** — the `border-destructive/40` on delete-account section (~`settings.tsx:246` per spec) → hairline `border-border` + destructive-tone button only.

- [ ] **Step 5: Verify + type-check + lint + smoke each route.**

**DO NOT COMMIT.**

---

### Task 10: Bespoke empty-state cleanup pass

**Files:**
- Various — scan `client/src/pages/` and `client/src/components/dashboard/` for bespoke empty-state cards that should adopt `<EmptyState>`.

**Goal:** consolidate the ~12 unique empty-state implementations into the canonical primitive.

**Steps:**

- [ ] **Step 1: Discover bespoke empty states.**
  ```bash
  grep -rn "No.*found\|No.*yet\|empty\|nothing yet\|Get started" client/src/pages/ | head -50
  ```
  This will surface candidate empty-state regions. Read each to confirm it's actually a "no data yet" card vs an inline message.

- [ ] **Step 2: Per candidate, decide:**
  - Does the existing card use the same skeleton (icon + title + body + optional CTA)? → adopt `<EmptyState>`.
  - Is it a one-liner like "No results match this filter"? → leave as-is (inline message, not a card).
  - Is the existing card highly customized with extra widgets? → leave (don't force-fit).

- [ ] **Step 3: Replace each adoptable card with `<EmptyState>`.**

- [ ] **Step 4: Verify nothing broken.** Type-check, lint, smoke.

**DO NOT COMMIT.**

---

## Self-Review

**1. Spec coverage:**

| Spec section | Plan 2 task |
|---|---|
| §4.1 token sweep | Tasks 2-9 (all page sweeps) |
| §4.1 four primitives | Task 1 |
| §4.1 spinner replacement (App.tsx) | Task 1 step 8 |
| §4.1 raw Tailwind sweep | Tasks 2-9 |
| §4.1 gradient retirement | Task 6 (worst offenders) + sweep elsewhere |
| §4.1 tabular-nums | Tasks 2-9 (where KPI numerics appear) |
| §4.1 truncate → line-clamp-2 | Tasks 3, 7 (primary offenders) + general sweep |
| §4.1 shadow audit | Task 3 (primary offender, home.tsx) |
| §4.10 RouteSpinner | Task 1 |
| §4.10 Skeleton primitive | Task 1 step 1 (verify exists; reuse) |
| §4.10 EmptyState | Task 1 + Task 10 |
| §4.5 n (geo-signals stage circles) | Task 8 |
| §4.5 o (geo-tools 4px border) | Task 8 |
| §4.5 p (faq-manager 4px border) | Task 8 |

All §4.1, §4.10, and the three deferred §4.5 items covered.

**2. Placeholder scan.** No "TBD" or "fill in details." Every step has concrete code or a concrete shell command. The KPITile primitive has a deliberate bug-fix instruction in Step 6 (the inline `deltaIcon.type` call needs the simpler refactor).

**3. Type consistency.** `StatusDotTone` defined once in `StatusDot.tsx`, exported from `index.ts`. `<KPITile>` props are stable across all tasks that adopt it. No method renames between tasks.

**4. Plan-wide rule consistency.** "DO NOT COMMIT" appears in every task. "DO NOT run git mutating commands" appears in the plan-wide rules at the top. Every task starts with a recon step (file:line verification before editing).

**5. Wave structure soundness.**
- Wave A (Task 1) must finish before Wave B starts — primitives are blocking.
- Wave B tasks 2-9 are parallel-safe (different files).
- Task 10 (bespoke empty-state cleanup) sequences after Task 1 + ideally after the page-sweep tasks land, because it spans pages those tasks own.

Plan is complete and consistent.

---

## What lands in subsequent Foundations plans

For traceability:

- **Plan 3** (Sidebar IA + Settings) — §4.2 sidebar renames + Account Settings re-enable + remove vermillion stripe; §4.3 Stripe billing portal + Profile editor + Password change.
- **Plan 4** (Bridges + Email + AI disclosure) — §4.6 welcome→fact-scrape + keyword→content; §4.8 email verification; §4.9 `articles.ai_generated` column + `<AIGeneratedPill>`.
- **Plan 5** (False-positive rec rule persistence) — §4.11 `geo_signal_runs` + `visibility_progress` tables; dashboard reads from them.
- **Plan 6** (Day-0 gates + Onboarding spine) — §4.4 Pre-Data State rule across dashboard; §4.7 RecommendationsPanel canonical spine + demote other surfaces.
