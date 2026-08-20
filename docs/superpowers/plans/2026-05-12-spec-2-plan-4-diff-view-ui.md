# Spec 2 — Plan 2.4: Diff View UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete rewrite of `client/src/pages/brand-fact-sheet.tsx` per Spec 2 §4.6. Three sections — header (brand selector + re-scrape button + last-scraped subline + active-run progress driven by SSE), diff section (8-domain-grouped side-by-side conflict pairs with Use mine / Use AI's / Keep both + per-domain bulk actions + delta indicators on re-scrape), resolved facts (flat list by domain with source badge + stale signal on scraped rows only). Land four new components — `ConflictPair`, `FactRow`, `DomainGroupHeader`, `DeltaIndicator` — under `client/src/components/fact-sheet/`. Wire the SSE hook `useScrapeRunStream` from Plan 2.3 to drive live updates and re-scrape button state. Delete the 3s `refetchInterval` polling block at `client/src/pages/brand-fact-sheet.tsx:110-128`. Add two tour markers (`fact-sheet.diff` + `fact-sheet.run-progress`) and a per-user pageVisit tour. NO server changes — Plan 2.4 consumes the diff/runs/bulk-accept endpoints + SSE hook from Plans 2.1, 2.2, 2.3.

**Architecture:**

- Plan 2.4 is UI-only. Every server endpoint and SSE event consumed here is defined by Plans 2.1 (`shared/schema.ts` for `domain`, `subcategory`, `valueType`, `valuePayload`, `confidence`, `sourceExcerpt`, `acceptedAt`, `dismissedAt`, `runId`), 2.2 (agent pipeline writing rows), 2.3 (SSE route + `useScrapeRunStream` hook + `POST /api/brand-fact-sheet/runs` + `GET /api/brand-fact-sheet/diff` + accept/dismiss/bulk-accept routes).
- New page composes: TanStack Query for `/api/brand-fact-sheet/diff?brandId=…`, TanStack Query for `/api/brand-facts?brandId=…` (existing resolved-facts feed from `server/routes/intelligence.ts:451-525`), TanStack Query for `/api/brand-fact-sheet/runs?brandId=…` (latest run for "last scraped" subline + active-run detection), and the `useScrapeRunStream` hook (live progress + invalidations).
- Components use shadcn primitives + foundations (`KPITile`/`Section`/`EmptyState`/`StatusDot` from `client/src/components/foundations/`) + design tokens only. NO raw palette colors (`bg-red-600`, `border-violet-*`, `text-emerald-400`). Use `text-primary` (vermillion), `text-destructive`, `text-foreground`, `text-muted-foreground`, `text-chart-3` (amber/warning), `text-chart-4` (success).
- `valueType` discriminated union handled at the `ConflictPair` and `FactRow` render level: `string` → plain, `number` → monospace + `valuePayload.n`, `array` → bullet list of `valuePayload.items`. For `array` conflicts, per-item +/- controls build a merged array; the three top-level buttons remain for whole-array resolution.
- "Last verified Xd ago" subline shows on `source='scraped'` rows ONLY. Per Spec 2 §4.6: "User-typed and manual-entry rows do NOT show staleness." Stale tiers per Spec 2 §4.6: muted at >90 days, orange (`text-chart-3`) at >180 days.
- Diff resolution semantics per Spec 2 §4.6: Use mine → `accepted_at=NOW()` on user row + `dismissed_at=NOW()` on scraped row. Use AI's → inverse. Keep both → `accepted_at=NOW()` on both, no `dismissed_at` either. Server enforces; UI hits `POST /api/brand-fact-sheet/facts/:id/accept` and `…/dismiss`.

**Tech Stack:** React 18, Wouter, TanStack Query, Radix UI + Tailwind, design tokens, shadcn primitives (`Card`, `Button`, `Alert`, `Dialog`, `Skeleton`, `Tooltip`), lucide-react. No new deps.

**Hard rules for all subagents:**

- ❌ NEVER run ANY git mutating command: `git commit`, `git add`, `git rm`, `git mv`, `git stash`, `git stash pop`, `git stash drop`, `git stash apply`, `git reset`, `git restore`, `git checkout` (when it discards), `git push`, `git pull`, `git fetch --prune`, `git rebase`, `git merge`, `git branch -D`, `git branch -m`, `git switch` (with dirty changes), `git clean`. Read-only is fine: `git status`, `git diff`, `git log`, `git show`, `git blame`, `git branch` (list).
- ❌ Do NOT trust .md files in this repo — verify every claim against code at the cited file:line.
- ❌ Do NOT add features beyond what each task says. This plan is the diff view UI ONLY. Explicit OUT-OF-SCOPE:
  - **`ScrapePagesPanel` (per-page live panel during scrape)** — Plan 2.5.
  - **`ScrapeFailureState` per-error_kind UI** — Plan 2.5.
  - **`fact_scrape_enabled` toggle wiring (`PATCH /api/brands/:id/fact-scrape-enabled`)** — Plan 2.5. Plan 2.4 leaves a TODO-stub button only.
  - **Edit-dialog full rewrite (valueType selector + valuePayload editor)** — Plan 2.5 or later. Plan 2.4 keeps the existing edit dialog at `brand-fact-sheet.tsx:658-716`.
  - **Cross-cutting integration tests for the diff flow** — Plan 2.6.
- ❌ Do NOT use `dangerouslySetInnerHTML`. Use shadcn primitives + design tokens for everything (Spec 2 §4.8 + `SafeMarkdown` rule in CLAUDE.md).
- ❌ Do NOT use raw Tailwind palette colors. Forbidden: `bg-red-(600|700|800)`, `border-violet-*`, `text-emerald-*`, `text-red-*`, `bg-emerald-*`. Use design tokens only (Foundations Plan 2 verified the rest of the app is clean — Plan 2.4 must not regress it).
- ❌ Do NOT log fact values verbatim (Spec 2 §4.8.4). No `console.log(fact.factValue)` anywhere.
- ❌ Do NOT modify any server code, route, migration, or `shared/schema.ts`. Plan 2.4 is client-only. The page DOES consume new fields (`domain`, `subcategory`, `valueType`, `valuePayload`, `confidence`, `sourceExcerpt`, `acceptedAt`, `dismissedAt`, `runId`) — those land in Plan 2.1's schema migration. If `npm run check` reports those fields don't exist yet, Plan 2.1 isn't merged — halt and report.

---

## File Structure

**Components created** (all under `client/src/components/fact-sheet/`):

- `ConflictPair.tsx` — side-by-side resolution UI, `valueType`-switched render branches (string/number/array), three top-level action buttons + per-item array controls.
- `FactRow.tsx` — single resolved-fact row: domain icon + subcategory chip + formatted value + source badge + scraped-row-only "Last verified Xd ago" subline + Edit/Dismiss buttons.
- `DomainGroupHeader.tsx` — domain label + icon + conflict-count badge + bulk action buttons ("Accept all AI" / "Keep all mine"). Bulk buttons only render when `conflictCount > 0`.
- `DeltaIndicator.tsx` — inline badge: 🆕 New / 📝 Changed / ❌ Removed. Uses design tokens.
- `domainIcons.ts` — small helper exporting `DOMAIN_ICONS: Record<Domain, LucideIcon>` and `DOMAIN_LABELS: Record<Domain, string>`. Shared by `FactRow`, `DomainGroupHeader`, and the page.

**Page rewritten:**

- `client/src/pages/brand-fact-sheet.tsx` — full rewrite of the existing 720-line file. Header, diff section, resolved facts, SSE wiring. The legacy 3s `refetchInterval` block at lines 110-128 (verified at read time) is removed.

**Tour assets created:**

- `client/src/tours/pages/brand-fact-sheet.tour.ts` — 2 steps, `scope: 'perUser'`, `trigger: { kind: 'pageVisit' }`, targets `fact-sheet.diff` + `fact-sheet.run-progress`.

**Shared util (extracted):**

- `client/src/lib/formatRelativeTime.ts` — extract the helper at `client/src/pages/home.tsx:103-118` to a shared util so `FactRow` can reuse it without importing from a page module. Move (don't copy) the function and update `home.tsx` to import from the new path.

**Files modified (touched but not rewritten):**

- `client/src/pages/home.tsx` — update import for `formatRelativeTime` only (no logic change).
- Optionally `client/src/tours/index.ts` (or wherever tours are registered) — register the new tour. Verify registration shape from any existing tour at `client/src/tours/pages/dashboard.tour.ts:1-32`.

---

## Pre-flight check

- [ ] **Step 0: Verify Plan 2.1 + 2.3 prerequisites exist**

  Plan 2.4 consumes endpoints + hook + schema fields from earlier plans. Verify by greps (no source edits in this step):

  - `grep -n "useScrapeRunStream" client/src/hooks/` — must exist (Plan 2.3 hook).
  - `grep -n "brand-fact-sheet/runs" server/routes/factSheet.ts 2>/dev/null || grep -rn "brand-fact-sheet/runs" server/routes/` — must exist (Plan 2.3 route file).
  - `grep -n "brand-fact-sheet/diff" server/routes/` — must exist (Plan 2.3 diff route).
  - `grep -n "subcategory\|valueType\|valuePayload\|acceptedAt\|dismissedAt" shared/schema.ts` — must show the new `brandFactSheet` columns from Plan 2.1.

  If any of these is missing: halt and report. Plan 2.4 cannot ship until 2.1/2.3 land.

- [ ] **Step 0b: Verify the current `brand-fact-sheet.tsx` shape matches the rewrite assumptions**

  Run `wc -l client/src/pages/brand-fact-sheet.tsx`. Expect ~720 lines. Read lines 1-50, 110-128, 287-376, 378-487, 544-654, 658-716. Confirm:
  - The polling `refetchInterval` is at lines 110-128 (or close — re-locate if it drifted).
  - The "Select Brand" + "Re-scrape" header is at lines 287-376.
  - The grouped resolved-fact list is at lines 544-654.
  - The edit dialog is at lines 658-716.

  Note any drift and update line references in subsequent tasks accordingly.

---

### Task 1: `domainIcons.ts` helper

**Files:**
- Create: `client/src/components/fact-sheet/domainIcons.ts`

- [ ] **Step 1: Verify dir exists**

  Run: `ls client/src/components/fact-sheet/ 2>/dev/null || mkdir -p client/src/components/fact-sheet`

- [ ] **Step 2: Write the helper**

  Mapping per Spec 2 §4.3 (the 8 universal domains) and the icon list called out in the Plan 2.4 task spec:

  ```ts
  // client/src/components/fact-sheet/domainIcons.ts
  import {
    User,
    Package,
    Target,
    Users,
    MapPin,
    BadgeCheck,
    TrendingUp,
    Phone,
    FileText,
    type LucideIcon,
  } from "lucide-react";

  export const DOMAINS = [
    "identity",
    "offerings",
    "positioning",
    "team",
    "operations",
    "credentials",
    "growth",
    "contact",
  ] as const;

  export type Domain = (typeof DOMAINS)[number];

  export const DOMAIN_ICONS: Record<Domain, LucideIcon> = {
    identity: User,
    offerings: Package,
    positioning: Target,
    team: Users,
    operations: MapPin,
    credentials: BadgeCheck,
    growth: TrendingUp,
    contact: Phone,
  };

  export const DOMAIN_LABELS: Record<Domain, string> = {
    identity: "Identity",
    offerings: "Offerings",
    positioning: "Positioning",
    team: "Team",
    operations: "Operations",
    credentials: "Credentials",
    growth: "Growth",
    contact: "Contact",
  };

  export function iconForDomain(domain: string): LucideIcon {
    return (DOMAIN_ICONS as Record<string, LucideIcon>)[domain] ?? FileText;
  }
  ```

- [ ] **Step 3: Typecheck**

  Run: `npm run check 2>&1 | tail -5`
  Expected: clean.

---

### Task 2: Extract `formatRelativeTime` to a shared util

**Files:**
- Create: `client/src/lib/formatRelativeTime.ts`
- Modify: `client/src/pages/home.tsx` (drop the local function; import the shared one)

- [ ] **Step 1: Write the util**

  Copy the function from `client/src/pages/home.tsx:103-118` verbatim into a new file:

  ```ts
  // client/src/lib/formatRelativeTime.ts
  export function formatRelativeTime(date: string | Date | null | undefined): string {
    if (!date) return "Not scanned yet";
    const d = typeof date === "string" ? new Date(date) : date;
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return "just now";
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  }

  /** Days-since helper for stale-fact UI tiers. */
  export function daysSince(date: string | Date | null | undefined): number | null {
    if (!date) return null;
    const d = typeof date === "string" ? new Date(date) : date;
    const t = d.getTime();
    if (Number.isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 86_400_000);
  }
  ```

- [ ] **Step 2: Update `home.tsx`**

  Delete the local `formatRelativeTime` block at `client/src/pages/home.tsx:103-118` and add at the top with the existing imports:

  ```ts
  import { formatRelativeTime } from "@/lib/formatRelativeTime";
  ```

- [ ] **Step 3: Typecheck**

  Run: `npm run check 2>&1 | tail -5`
  Expected: clean. If anything else in `home.tsx` referenced the local function, this passes; if other pages re-define their own version (likely yes — `brand-fact-sheet.tsx:230-240` has its own `formatRelative`), leave them — Task 5 deletes that file's copy when the page is rewritten.

---

### Task 3: `DeltaIndicator.tsx` component

**Files:**
- Create: `client/src/components/fact-sheet/DeltaIndicator.tsx`

- [ ] **Step 1: Write the component**

  ```tsx
  // client/src/components/fact-sheet/DeltaIndicator.tsx
  import { cn } from "@/lib/utils";

  type DeltaType = "new" | "changed" | "removed";

  const LABELS: Record<DeltaType, { emoji: string; text: string; classes: string }> = {
    new: {
      emoji: "🆕",
      text: "New since last run",
      classes: "text-chart-4 bg-chart-4/10 border-chart-4/30",
    },
    changed: {
      emoji: "📝",
      text: "Changed since last run",
      classes: "text-chart-3 bg-chart-3/10 border-chart-3/30",
    },
    removed: {
      emoji: "❌",
      text: "Removed in this run",
      classes: "text-destructive bg-destructive/10 border-destructive/30",
    },
  };

  export function DeltaIndicator({
    type,
    className,
  }: {
    type: DeltaType;
    className?: string;
  }) {
    const meta = LABELS[type];
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
          meta.classes,
          className,
        )}
        title={meta.text}
        aria-label={meta.text}
        data-testid={`delta-indicator-${type}`}
      >
        <span aria-hidden>{meta.emoji}</span>
        <span className="sr-only md:not-sr-only md:inline">{meta.text}</span>
      </span>
    );
  }
  ```

- [ ] **Step 2: Verify no raw palette colors**

  Run: `grep -E "border-(red|emerald|violet|amber)-|bg-(red|emerald|violet|amber)-|text-(red|emerald|violet|amber)-" client/src/components/fact-sheet/DeltaIndicator.tsx`
  Expected: no output.

- [ ] **Step 3: Typecheck**

  Run: `npm run check 2>&1 | tail -5`
  Expected: clean.

---

### Task 4: `ConflictPair.tsx` component

**Files:**
- Create: `client/src/components/fact-sheet/ConflictPair.tsx`

Spec 2 §4.6 + §4.4 govern this component. Props are typed against the diff API response shape from Plan 2.3 (`/api/brand-fact-sheet/diff`).

- [ ] **Step 1: Define the conflict shape (mirrors Plan 2.3 diff response)**

  At the top of the file:

  ```tsx
  // client/src/components/fact-sheet/ConflictPair.tsx
  import { useState } from "react";
  import { ExternalLink, Plus, Minus } from "lucide-react";
  import { Card } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import { cn } from "@/lib/utils";

  export type FactSide = {
    id: string;
    factValue: string;
    valueType: "string" | "number" | "array";
    valuePayload: { n?: number; items?: string[]; alternatives?: unknown[] } | null;
    confidence: number | null;
    sourceUrl: string | null;
    sourceExcerpt: string | null;
    source: "user" | "scraped" | "manual";
  };

  export type ConflictPairData = {
    domain: string;
    subcategory: string;
    factKey: string;
    userFact: FactSide;       // source='user'
    scrapedFact: FactSide;    // source='scraped'
  };

  export type ConflictPairProps = {
    pair: ConflictPairData;
    onUseMine: (pair: ConflictPairData) => void;
    onUseAI: (pair: ConflictPairData) => void;
    onKeepBoth: (pair: ConflictPairData) => void;
    onMergeArray?: (pair: ConflictPairData, mergedItems: string[]) => void;
    disabled?: boolean;
  };
  ```

- [ ] **Step 2: Render the wrapper + header**

  ```tsx
  export function ConflictPair({
    pair,
    onUseMine,
    onUseAI,
    onKeepBoth,
    onMergeArray,
    disabled,
  }: ConflictPairProps) {
    const { domain, subcategory, factKey, userFact, scrapedFact } = pair;

    return (
      <div
        className="rounded-md border border-border bg-card"
        data-testid={`conflict-pair-${pair.userFact.id}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="uppercase tracking-wide">
              {domain}
            </Badge>
            <span>&gt;</span>
            <span className="font-medium text-foreground">{subcategory}</span>
            <span>&gt;</span>
            <span>{factKey}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2">
          {renderSide(userFact, "user", domain, subcategory, factKey)}
          {renderSide(scrapedFact, "scraped", domain, subcategory, factKey)}
        </div>

        {pair.userFact.valueType === "array" && onMergeArray ? (
          <ArrayMergePanel pair={pair} onMergeArray={onMergeArray} disabled={disabled} />
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-3 py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUseMine(pair)}
            disabled={disabled}
            data-testid={`btn-use-mine-${pair.userFact.id}`}
          >
            Use mine
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUseAI(pair)}
            disabled={disabled}
            data-testid={`btn-use-ai-${pair.scrapedFact.id}`}
          >
            Use AI&apos;s
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => onKeepBoth(pair)}
            disabled={disabled}
            data-testid={`btn-keep-both-${pair.userFact.id}`}
          >
            Keep both
          </Button>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Render a single side (handles string + number + array display)**

  Below `ConflictPair`, in the same file:

  ```tsx
  function renderSide(
    fact: FactSide,
    side: "user" | "scraped",
    _domain: string,
    _sub: string,
    _key: string,
  ) {
    const isUser = side === "user";
    const heading = isUser ? "You said" : "AI found";
    const sourceLabel = isUser ? "👤 You" : "🤖 AI";

    return (
      <Card
        className={cn(
          "p-3 text-sm",
          isUser ? "border-primary/40" : "border-chart-4/40",
        )}
        data-testid={`pair-side-${side}-${fact.id}`}
      >
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">{heading}</span>
          <span className="text-muted-foreground">{sourceLabel}</span>
        </div>

        {fact.valueType === "string" && (
          <p className="text-foreground">{fact.factValue}</p>
        )}

        {fact.valueType === "number" && (
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-foreground">
              {fact.valuePayload?.n ?? fact.factValue}
            </span>
            <span className="text-xs text-muted-foreground">{fact.factValue}</span>
          </div>
        )}

        {fact.valueType === "array" && (
          <ul className="ml-4 list-disc text-foreground">
            {(fact.valuePayload?.items ?? []).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}

        {!isUser && fact.sourceUrl ? (
          <a
            href={fact.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            {fact.sourceUrl}
          </a>
        ) : null}

        {!isUser && fact.sourceExcerpt ? (
          <p className="mt-2 line-clamp-3 text-xs italic text-muted-foreground">
            “{fact.sourceExcerpt}”
          </p>
        ) : null}

        {!isUser && fact.confidence !== null ? (
          <div className="mt-2 text-xs text-muted-foreground">
            Confidence{" "}
            <span className="font-mono text-foreground">{fact.confidence.toFixed(2)}</span>
          </div>
        ) : null}
      </Card>
    );
  }
  ```

- [ ] **Step 4: Render the per-item array merge panel**

  ```tsx
  function ArrayMergePanel({
    pair,
    onMergeArray,
    disabled,
  }: {
    pair: ConflictPairData;
    onMergeArray: (pair: ConflictPairData, mergedItems: string[]) => void;
    disabled?: boolean;
  }) {
    const userItems = pair.userFact.valuePayload?.items ?? [];
    const aiItems = pair.scrapedFact.valuePayload?.items ?? [];

    // Seed merged with the user's items (the "keep mine" default).
    const [merged, setMerged] = useState<string[]>(() => [...userItems]);

    const addFromAi = (item: string) => {
      if (merged.includes(item)) return;
      setMerged([...merged, item]);
    };
    const removeFromMerged = (item: string) => {
      setMerged(merged.filter((m) => m !== item));
    };

    return (
      <div className="border-t border-border bg-muted/40 px-3 py-2">
        <div className="mb-1 text-xs font-medium text-foreground">
          Merge items (preview)
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">From AI — add to merged</div>
            <ul className="space-y-1">
              {aiItems.map((item, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-foreground">{item}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => addFromAi(item)}
                    disabled={disabled}
                    aria-label={`Add ${item} from AI`}
                    data-testid={`array-add-${i}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Merged result</div>
            <ul className="space-y-1">
              {merged.map((item, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-foreground">{item}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeFromMerged(item)}
                    disabled={disabled}
                    aria-label={`Remove ${item}`}
                    data-testid={`array-remove-${i}`}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => onMergeArray(pair, merged)}
              disabled={disabled}
              data-testid="array-save-merge"
            >
              Save merged array
            </Button>
          </div>
        </div>
      </div>
    );
  }
  ```

  > **Test note (Plan 2.6):** The merge logic in `addFromAi` / `removeFromMerged` is the highest-value unit test target. Spec 2 §4.4 calls out array per-item resolution as a core UX requirement. Plan 2.6 (NOT this plan) ships `tests/unit/factSheetDiffResolution.test.ts` covering: (a) starting state seeds with user items, (b) adding from AI dedupes, (c) removing from merged works, (d) `onMergeArray` receives the final array verbatim.

- [ ] **Step 5: Forbidden-color sweep**

  Run: `grep -E "border-(red|emerald|violet|amber)-[0-9]|bg-(red|emerald|violet|amber)-[0-9]|text-(red|emerald|violet|amber)-[0-9]" client/src/components/fact-sheet/ConflictPair.tsx`
  Expected: no output.

- [ ] **Step 6: No `dangerouslySetInnerHTML`**

  Run: `grep -n "dangerouslySetInnerHTML" client/src/components/fact-sheet/ConflictPair.tsx`
  Expected: no output.

- [ ] **Step 7: Typecheck**

  Run: `npm run check 2>&1 | tail -10`
  Expected: clean.

---

### Task 5: `FactRow.tsx` component

**Files:**
- Create: `client/src/components/fact-sheet/FactRow.tsx`

Spec 2 §4.6 (resolved facts section): domain icon + subcategory chip + formatted value + source badge + stale signal (scraped only) + Edit/Dismiss.

- [ ] **Step 1: Write the component**

  ```tsx
  // client/src/components/fact-sheet/FactRow.tsx
  import { Edit2, Trash2 } from "lucide-react";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import { cn } from "@/lib/utils";
  import { iconForDomain, type Domain } from "./domainIcons";
  import { formatRelativeTime, daysSince } from "@/lib/formatRelativeTime";

  export type ResolvedFact = {
    id: string;
    brandId: string;
    domain: Domain | string;
    subcategory: string;
    factKey: string;
    factValue: string;
    valueType: "string" | "number" | "array";
    valuePayload: { n?: number; items?: string[] } | null;
    source: "user" | "scraped" | "manual";
    sourceUrl: string | null;
    lastVerified: string | null;
  };

  const SOURCE_BADGE: Record<ResolvedFact["source"], { emoji: string; label: string }> = {
    scraped: { emoji: "🤖", label: "AI" },
    user: { emoji: "👤", label: "You" },
    manual: { emoji: "✋", label: "Manual" },
  };

  export function FactRow({
    fact,
    onEdit,
    onDismiss,
  }: {
    fact: ResolvedFact;
    onEdit: (fact: ResolvedFact) => void;
    onDismiss: (fact: ResolvedFact) => void;
  }) {
    const Icon = iconForDomain(fact.domain);
    const badge = SOURCE_BADGE[fact.source];

    // Per Spec 2 §4.6: staleness shows on scraped rows ONLY.
    const showStale = fact.source === "scraped";
    const days = showStale ? daysSince(fact.lastVerified) : null;
    const staleClass =
      days === null
        ? ""
        : days > 180
          ? "text-chart-3"
          : days > 90
            ? "text-muted-foreground"
            : "text-muted-foreground";

    return (
      <div
        className="flex items-start justify-between gap-3 rounded-md border border-border bg-card p-3"
        data-testid={`fact-row-${fact.id}`}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                {fact.subcategory}
              </Badge>
              <span className="text-sm font-medium text-foreground">{fact.factKey}</span>
              <span
                className="text-[10px] text-muted-foreground"
                title={`Source: ${badge.label}`}
                data-testid={`source-badge-${fact.id}`}
              >
                {badge.emoji} {badge.label}
              </span>
            </div>

            {fact.valueType === "string" && (
              <p className="text-sm text-foreground">{fact.factValue}</p>
            )}
            {fact.valueType === "number" && (
              <p className="font-mono text-sm text-foreground">
                {fact.valuePayload?.n ?? fact.factValue}
              </p>
            )}
            {fact.valueType === "array" && (
              <ul className="ml-4 list-disc text-sm text-foreground">
                {(fact.valuePayload?.items ?? []).map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}

            {showStale && fact.lastVerified ? (
              <p
                className={cn("mt-1 text-xs", staleClass)}
                data-testid={`last-verified-${fact.id}`}
              >
                Last verified {formatRelativeTime(fact.lastVerified)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(fact)}
            aria-label="Edit fact"
            data-testid={`btn-edit-${fact.id}`}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDismiss(fact)}
            aria-label="Dismiss fact"
            data-testid={`btn-dismiss-${fact.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Forbidden-color + dangerouslySetInnerHTML sweeps**

  Run:
  ```
  grep -E "border-(red|emerald|violet|amber)-[0-9]|bg-(red|emerald|violet|amber)-[0-9]|text-(red|emerald|violet|amber)-[0-9]|dangerouslySetInnerHTML" client/src/components/fact-sheet/FactRow.tsx
  ```
  Expected: no output.

- [ ] **Step 3: Typecheck**

  Run: `npm run check 2>&1 | tail -5`
  Expected: clean.

---

### Task 6: `DomainGroupHeader.tsx` component

**Files:**
- Create: `client/src/components/fact-sheet/DomainGroupHeader.tsx`

- [ ] **Step 1: Write the component**

  ```tsx
  // client/src/components/fact-sheet/DomainGroupHeader.tsx
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import { iconForDomain, DOMAIN_LABELS, type Domain } from "./domainIcons";

  export function DomainGroupHeader({
    domain,
    conflictCount,
    onAcceptAllAI,
    onKeepAllMine,
    disabled,
  }: {
    domain: Domain;
    conflictCount: number;
    onAcceptAllAI?: () => void;
    onKeepAllMine?: () => void;
    disabled?: boolean;
  }) {
    const Icon = iconForDomain(domain);
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2"
        data-testid={`domain-header-${domain}`}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" aria-hidden />
          <span className="font-medium text-foreground">{DOMAIN_LABELS[domain]}</span>
          {conflictCount > 0 ? (
            <Badge variant="destructive" data-testid={`conflict-count-${domain}`}>
              {conflictCount} conflict{conflictCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        {conflictCount > 0 && onAcceptAllAI && onKeepAllMine ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onKeepAllMine}
              disabled={disabled}
              data-testid={`btn-keep-all-mine-${domain}`}
            >
              Keep all mine
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={onAcceptAllAI}
              disabled={disabled}
              data-testid={`btn-accept-all-ai-${domain}`}
            >
              Accept all AI
            </Button>
          </div>
        ) : null}
      </div>
    );
  }
  ```

- [ ] **Step 2: Typecheck + sweep**

  ```
  npm run check 2>&1 | tail -5
  grep -E "border-(red|emerald|violet|amber)-|bg-(red|emerald|violet|amber)-|text-(red|emerald|violet|amber)-|dangerouslySetInnerHTML" client/src/components/fact-sheet/DomainGroupHeader.tsx
  ```
  Expected: clean tsc; no grep matches.

---

### Task 7: `/brand-fact-sheet` page rewrite — scaffolding + delete polling block

**Files:**
- Modify: `client/src/pages/brand-fact-sheet.tsx` (full rewrite)

This task lays down the new file skeleton: imports, queries, mutations, then renders an empty layout. Tasks 8/9/10 fill in the three sections. Subagents should NOT split this into multiple commits; one task = one file rewrite.

- [ ] **Step 1: Replace the entire file with the new skeleton**

  Overwrite `client/src/pages/brand-fact-sheet.tsx` with:

  ```tsx
  import { useMemo, useState } from "react";
  import { useQuery, useMutation } from "@tanstack/react-query";
  import { Link } from "wouter";
  import { Helmet } from "react-helmet-async";
  import {
    RefreshCw,
    Loader2,
    Pause,
    AlertTriangle,
  } from "lucide-react";

  import { queryClient, apiRequest } from "@/lib/queryClient";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Skeleton } from "@/components/ui/skeleton";
  import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
  import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
  import { useToast } from "@/hooks/use-toast";

  import PageHeader from "@/components/PageHeader";
  import BrandSelector from "@/components/BrandSelector";
  import { useBrandSelection } from "@/hooks/use-brand-selection";
  import { pageExplainers } from "@/lib/pageExplainers";
  import { EmptyState } from "@/components/foundations/EmptyState";
  import { ErrorState } from "@/components/ui/error-state";

  // Plan 2.3 hook — consume only.
  import { useScrapeRunStream } from "@/hooks/useScrapeRunStream";

  // Plan 2.4 components.
  import {
    ConflictPair,
    type ConflictPairData,
  } from "@/components/fact-sheet/ConflictPair";
  import { FactRow, type ResolvedFact } from "@/components/fact-sheet/FactRow";
  import { DomainGroupHeader } from "@/components/fact-sheet/DomainGroupHeader";
  import { DOMAINS, type Domain } from "@/components/fact-sheet/domainIcons";
  import { formatRelativeTime, daysSince } from "@/lib/formatRelativeTime";

  // Response shape from Plan 2.3 GET /api/brand-fact-sheet/diff
  type DiffResponse = {
    conflicts: Partial<Record<Domain, ConflictPairData[]>>;
    resolved: ResolvedFact[];
  };

  // Response shape from Plan 2.3 GET /api/brand-fact-sheet/runs?brandId=…
  type ScrapeRun = {
    id: string;
    brandId: string;
    status:
      | "pending"
      | "planning"
      | "fetching"
      | "extracting"
      | "completed"
      | "failed"
      | "timeout"
      | "slice_pending"
      | "cancelled";
    startedAt: string;
    completedAt: string | null;
    pagesFetched: number;
    pagesPlanned: number;
    factsExtracted: number;
    triggeredBy: string;
    errorKind: string | null;
  };

  const ACTIVE_STATUSES: ReadonlyArray<ScrapeRun["status"]> = [
    "pending",
    "planning",
    "fetching",
    "extracting",
    "slice_pending",
  ];

  export default function BrandFactSheet() {
    const { toast } = useToast();
    const { selectedBrandId, brands, selectedBrand } = useBrandSelection();
    const [editingFact, setEditingFact] = useState<ResolvedFact | null>(null);

    /* ---------- queries ---------- */
    const runsQuery = useQuery<{ runs: ScrapeRun[] }>({
      queryKey: ["/api/brand-fact-sheet/runs", selectedBrandId],
      enabled: !!selectedBrandId,
    });

    const diffQuery = useQuery<DiffResponse>({
      queryKey: ["/api/brand-fact-sheet/diff", selectedBrandId],
      enabled: !!selectedBrandId,
    });

    const resolvedQuery = useQuery<{ data: ResolvedFact[] }>({
      queryKey: ["/api/brand-facts", selectedBrandId],
      enabled: !!selectedBrandId,
    });

    const runs = runsQuery.data?.runs ?? [];
    const activeRun = runs.find((r) => ACTIVE_STATUSES.includes(r.status)) ?? null;
    const latestCompleted = runs.find((r) => r.status === "completed") ?? null;

    /* ---------- SSE: live progress for active run ---------- */
    // Wired up in Task 11. For now the hook is called when activeRun.id changes;
    // it no-ops when its arg is null.
    const stream = useScrapeRunStream(activeRun?.id ?? null);

    /* ---------- mutations ---------- */
    const startRunMutation = useMutation({
      mutationFn: async () => {
        if (!selectedBrandId) throw new Error("No brand selected");
        const res = await apiRequest("POST", "/api/brand-fact-sheet/runs", {
          brandId: selectedBrandId,
        });
        return res.json() as Promise<{ runId: string }>;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ["/api/brand-fact-sheet/runs", selectedBrandId],
        });
        toast({ title: "Scrape started", description: "Reading pages from your website…" });
      },
      onError: (err: unknown) => {
        const e = err as { status?: number; message?: string };
        let description = "Could not start a new scrape.";
        if (e?.status === 402) description = "Monthly fact-scrape budget reached.";
        else if (e?.status === 409) description = "A scrape is already running for this brand.";
        toast({ title: "Couldn't start scrape", description, variant: "destructive" });
      },
    });

    const acceptFactMutation = useMutation({
      mutationFn: async (factId: string) =>
        apiRequest("POST", `/api/brand-fact-sheet/facts/${factId}/accept`),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/brand-fact-sheet/diff", selectedBrandId] });
        queryClient.invalidateQueries({ queryKey: ["/api/brand-facts", selectedBrandId] });
      },
    });

    const dismissFactMutation = useMutation({
      mutationFn: async (factId: string) =>
        apiRequest("POST", `/api/brand-fact-sheet/facts/${factId}/dismiss`),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/brand-fact-sheet/diff", selectedBrandId] });
        queryClient.invalidateQueries({ queryKey: ["/api/brand-facts", selectedBrandId] });
      },
    });

    const bulkAcceptMutation = useMutation({
      mutationFn: async (body: { side: "user" | "scraped"; domain?: Domain }) =>
        apiRequest("POST", "/api/brand-fact-sheet/facts/bulk-accept", {
          brandId: selectedBrandId,
          ...body,
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/brand-fact-sheet/diff", selectedBrandId] });
        queryClient.invalidateQueries({ queryKey: ["/api/brand-facts", selectedBrandId] });
      },
    });

    /* ---------- diff handlers ---------- */
    const handleUseMine = (pair: ConflictPairData) =>
      acceptFactMutation.mutate(pair.userFact.id);
    const handleUseAI = (pair: ConflictPairData) =>
      acceptFactMutation.mutate(pair.scrapedFact.id);
    const handleKeepBoth = (pair: ConflictPairData) => {
      acceptFactMutation.mutate(pair.userFact.id);
      acceptFactMutation.mutate(pair.scrapedFact.id);
    };

    /* ---------- "last scraped" subline ---------- */
    const lastScrapedAt = latestCompleted?.completedAt ?? null;
    const lastScrapedDays = daysSince(lastScrapedAt);
    const lastScrapedColor =
      lastScrapedDays === null
        ? "text-muted-foreground"
        : lastScrapedDays > 90
          ? "text-chart-3"
          : lastScrapedDays > 7
            ? "text-muted-foreground"
            : "text-foreground";

    /* ---------- re-scrape disabled state ---------- */
    // Plan 2.5 wires fact_scrape_enabled. For 2.4 we leave a TODO and treat it as enabled.
    // TODO(spec-2 Plan 2.5): read selectedBrand.factScrapeEnabled and respect it.
    const factScrapeEnabled = true;
    const monthlyCapReached = false; // 402 surfaces via mutation onError; UI state is Plan 2.5.
    const rescrapeDisabled =
      !selectedBrandId ||
      !!activeRun ||
      !factScrapeEnabled ||
      monthlyCapReached ||
      startRunMutation.isPending;

    const rescrapeDisabledReason = !factScrapeEnabled
      ? "Fact scrape is paused for this brand."
      : activeRun
        ? "A scrape is already running."
        : monthlyCapReached
          ? "Monthly scrape budget reached."
          : null;

    /* ---------- render ---------- */
    return (
      <div className="space-y-8">
        <Helmet>
          <title>Brand Fact Sheet - VentureCite</title>
        </Helmet>

        <PageHeader
          title="Brand Fact Sheet"
          description="Verified facts about your brand — user-entered, AI-scraped, with side-by-side conflict resolution."
          explainer={pageExplainers.brandFactSheet}
        />

        {/* Brand selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select Brand</CardTitle>
            <CardDescription>Choose which brand to manage facts for</CardDescription>
          </CardHeader>
          <CardContent>
            <BrandSelector className="w-full max-w-md" />
            {brands.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                No brands found.{" "}
                <Link href="/brands" className="text-primary hover:underline">
                  Create a brand first
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>

        {selectedBrand && (
          <>
            {/* HEADER SECTION — Task 8 */}
            {/* DIFF SECTION — Task 9 */}
            {/* RESOLVED FACTS — Task 10 */}
          </>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify the polling block is gone**

  Run: `grep -n "refetchInterval\|shouldPollForScrape\|brandAgeMs" client/src/pages/brand-fact-sheet.tsx`
  Expected: no output.

- [ ] **Step 3: Typecheck**

  Run: `npm run check 2>&1 | tail -20`
  Expected: tsc errors only about the unused `useScrapeRunStream` import / unused vars in the header/diff/resolved sections (those fill in Tasks 8-10). If tsc errors point at missing `useScrapeRunStream` (Plan 2.3 not landed) or missing `subcategory`/`valuePayload` on `brandFactSheet` (Plan 2.1 not landed) — halt and report.

---

### Task 8: Header section — brand info, last-scraped, re-scrape, active progress

**Files:**
- Modify: `client/src/pages/brand-fact-sheet.tsx` (insert under `{/* HEADER SECTION — Task 8 */}`)

- [ ] **Step 1: Insert the header JSX**

  Replace the `{/* HEADER SECTION — Task 8 */}` placeholder with:

  ```tsx
  <Card data-tour-id="fact-sheet.header">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-lg">
        <RefreshCw className="h-5 w-5 text-primary" />
        Scrape status
      </CardTitle>
      <CardDescription>
        We re-scrape monthly. Re-scrape on demand — duplicates are skipped.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <div className="text-xs text-muted-foreground">Last scraped</div>
          <div className={lastScrapedColor} data-testid="text-last-scraped">
            {lastScrapedAt ? formatRelativeTime(lastScrapedAt) : "Never"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* TODO(spec-2 Plan 2.5): wire fact_scrape_enabled toggle here */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled
                data-testid="btn-pause-stub"
                aria-label="Pause auto-scrape (coming soon)"
              >
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
            </TooltipTrigger>
            <TooltipContent>Coming in Plan 2.5</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={() => startRunMutation.mutate()}
                  disabled={rescrapeDisabled}
                  data-testid="btn-rescrape"
                >
                  {startRunMutation.isPending || activeRun ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scraping…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Re-scrape
                    </>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            {rescrapeDisabledReason ? (
              <TooltipContent>{rescrapeDisabledReason}</TooltipContent>
            ) : null}
          </Tooltip>
        </div>
      </div>

      {activeRun ? (
        <div
          className="space-y-1 rounded-md border border-border bg-muted/40 p-3"
          data-tour-id="fact-sheet.run-progress"
          data-testid="active-run-progress"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {stream.currentPage
                ? `Reading ${stream.currentPage}…`
                : `Status: ${activeRun.status}`}
            </span>
            <span>
              {stream.pagesDone ?? activeRun.pagesFetched} of{" "}
              {stream.pagesTotal ?? Math.max(activeRun.pagesPlanned, 1)} pages
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded bg-border">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${Math.min(
                  100,
                  ((stream.pagesDone ?? activeRun.pagesFetched) /
                    Math.max(stream.pagesTotal ?? activeRun.pagesPlanned, 1)) *
                    100,
                )}%`,
              }}
            />
          </div>
        </div>
      ) : null}
    </CardContent>
  </Card>
  ```

  > **Plan 2.3 contract reminder:** `useScrapeRunStream(runId)` is assumed to return at minimum `{ currentPage: string | null, pagesDone: number | null, pagesTotal: number | null, status: ScrapeRun['status'] | null, lastEvent: 'plan'|'page'|'fact'|'progress'|'done'|null }`. If Plan 2.3 shipped a different shape, adapt the field names here — do NOT change Plan 2.3.

- [ ] **Step 2: Typecheck**

  Run: `npm run check 2>&1 | tail -10`
  Expected: clean for the header (diff + resolved sections still flagged).

---

### Task 9: Diff section

**Files:**
- Modify: `client/src/pages/brand-fact-sheet.tsx` (insert under `{/* DIFF SECTION — Task 9 */}`)

- [ ] **Step 1: Insert the diff JSX**

  ```tsx
  <Card data-tour-id="fact-sheet.diff">
    <CardHeader>
      <CardTitle className="text-lg">Conflicts to resolve</CardTitle>
      <CardDescription>
        Pairs where what you entered and what we found differ. Pick one, keep both, or merge.
      </CardDescription>
    </CardHeader>
    <CardContent>
      {diffQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : diffQuery.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn&apos;t load conflicts</AlertTitle>
          <AlertDescription>
            <Button
              variant="link"
              className="px-0"
              onClick={() => diffQuery.refetch()}
              data-testid="btn-retry-diff"
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : !diffQuery.data || diffHasNoConflicts(diffQuery.data) ? (
        <EmptyState
          title="No conflicts"
          body="Everything you've entered matches (or has been resolved against) what AI found."
        />
      ) : (
        <div className="space-y-6">
          {DOMAINS.map((domain) => {
            const pairs = diffQuery.data!.conflicts[domain] ?? [];
            if (pairs.length === 0) return null;
            return (
              <div key={domain} className="overflow-hidden rounded-md border border-border">
                <DomainGroupHeader
                  domain={domain}
                  conflictCount={pairs.length}
                  onAcceptAllAI={() =>
                    bulkAcceptMutation.mutate({ side: "scraped", domain })
                  }
                  onKeepAllMine={() =>
                    bulkAcceptMutation.mutate({ side: "user", domain })
                  }
                  disabled={bulkAcceptMutation.isPending}
                />
                <div className="space-y-3 p-3">
                  {pairs.map((pair) => (
                    <ConflictPair
                      key={pair.userFact.id}
                      pair={pair}
                      onUseMine={handleUseMine}
                      onUseAI={handleUseAI}
                      onKeepBoth={handleKeepBoth}
                      disabled={acceptFactMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Page-level bulk actions */}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkAcceptMutation.mutate({ side: "user" })}
              disabled={bulkAcceptMutation.isPending}
              data-testid="btn-keep-all-mine-global"
            >
              Keep all mine
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => bulkAcceptMutation.mutate({ side: "scraped" })}
              disabled={bulkAcceptMutation.isPending}
              data-testid="btn-accept-all-ai-global"
            >
              Accept all AI
            </Button>
          </div>
        </div>
      )}
    </CardContent>
  </Card>
  ```

- [ ] **Step 2: Add the `diffHasNoConflicts` helper inside the file**

  At module scope, below the type aliases:

  ```ts
  function diffHasNoConflicts(d: DiffResponse): boolean {
    return Object.values(d.conflicts).every((pairs) => !pairs || pairs.length === 0);
  }
  ```

- [ ] **Step 3: Typecheck**

  Run: `npm run check 2>&1 | tail -10`
  Expected: clean apart from the resolved section.

---

### Task 10: Resolved facts section

**Files:**
- Modify: `client/src/pages/brand-fact-sheet.tsx` (insert under `{/* RESOLVED FACTS — Task 10 */}`)

- [ ] **Step 1: Group resolved facts by domain**

  Add at module scope:

  ```ts
  function groupByDomain(facts: ResolvedFact[]): Record<Domain, ResolvedFact[]> {
    const out = {} as Record<Domain, ResolvedFact[]>;
    for (const d of DOMAINS) out[d] = [];
    for (const f of facts) {
      const key = (DOMAINS as readonly string[]).includes(f.domain)
        ? (f.domain as Domain)
        : ("identity" as Domain);
      out[key].push(f);
    }
    return out;
  }
  ```

- [ ] **Step 2: Insert the resolved JSX**

  ```tsx
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">Resolved facts</CardTitle>
      <CardDescription>Verified facts about {selectedBrand.name}.</CardDescription>
    </CardHeader>
    <CardContent>
      {resolvedQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : resolvedQuery.isError ? (
        <ErrorState
          title="Couldn't load facts"
          onRetry={() => resolvedQuery.refetch()}
          isRetrying={resolvedQuery.isRefetching}
        />
      ) : !resolvedQuery.data?.data.length ? (
        <EmptyState
          title="No facts yet"
          body="Run a scrape or add facts manually to start building this brand's fact sheet."
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(groupByDomain(resolvedQuery.data.data.filter((f) => !!f))).map(
            ([domain, facts]) => {
              if (facts.length === 0) return null;
              return (
                <div key={domain} className="overflow-hidden rounded-md border border-border">
                  <DomainGroupHeader
                    domain={domain as Domain}
                    conflictCount={0}
                  />
                  <div className="space-y-2 p-3">
                    {facts.map((fact) => (
                      <FactRow
                        key={fact.id}
                        fact={fact}
                        onEdit={(f) => setEditingFact(f)}
                        onDismiss={(f) => dismissFactMutation.mutate(f.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            },
          )}
        </div>
      )}
    </CardContent>
  </Card>
  ```

- [ ] **Step 3: Keep the existing edit dialog (out of scope here)**

  Plan 2.4 does NOT rewrite the edit dialog. Append the existing Dialog block from the old file (lines 658-716 in the read at Step 0b) below the resolved section. Replace its references to `editingFact.factCategory` with `editingFact.subcategory` (Plan 2.1 column rename) and update its mutation to call `PATCH /api/brand-facts/:id` (existing endpoint at `server/routes/intelligence.ts:451-525`). The valueType/valuePayload editor is Plan 2.5.

  > **Note:** If the old edit dialog references `BrandFact.factCategory`, replace with `subcategory`. Drizzle type for `BrandFactSheet` from Plan 2.1 calls it `subcategory`. Adjust imports accordingly.

- [ ] **Step 4: Typecheck**

  Run: `npm run check 2>&1 | tail -10`
  Expected: clean.

---

### Task 11: SSE → live-update wiring

**Files:**
- Modify: `client/src/pages/brand-fact-sheet.tsx` (add a `useEffect`)

The `useScrapeRunStream` hook from Plan 2.3 emits events. Plan 2.4 needs to react: invalidate queries on `fact`/`done`, update progress state on `page`/`progress`. Plan 2.3's hook exposes either an event stream or a list of latest events — adapt the field names below if Plan 2.3 shipped a different shape.

- [ ] **Step 1: Verify the hook's public API**

  Read `client/src/hooks/useScrapeRunStream.ts` (whatever Plan 2.3 wrote). Document the exact returned shape in a comment at the top of `brand-fact-sheet.tsx`. The wiring below assumes:

  ```ts
  const stream = useScrapeRunStream(runId);
  // stream.currentPage: string | null
  // stream.pagesDone: number | null
  // stream.pagesTotal: number | null
  // stream.lastEvent: 'plan' | 'page' | 'fact' | 'progress' | 'done' | 'error' | null
  // stream.lastEventAt: number | null   (Date.now() of last event)
  ```

  If Plan 2.3's API differs, refactor this task's hook usage accordingly.

- [ ] **Step 2: Add the invalidation effect**

  Inside the page component, after the mutations:

  ```tsx
  // Live updates from SSE: invalidate the relevant queries whenever a fact lands
  // or the run completes. Plan 2.3 owns the event firehose; we only react.
  useEffect(() => {
    if (!stream.lastEvent) return;
    if (stream.lastEvent === "fact") {
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-facts", selectedBrandId],
      });
    }
    if (stream.lastEvent === "done" || stream.lastEvent === "error") {
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-fact-sheet/runs", selectedBrandId],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-fact-sheet/diff", selectedBrandId],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-facts", selectedBrandId],
      });
    }
  }, [stream.lastEvent, stream.lastEventAt, selectedBrandId]);
  ```

  Add `useEffect` to the import line at the top.

- [ ] **Step 3: Confirm no polling sneaked back in**

  Run: `grep -n "refetchInterval" client/src/pages/brand-fact-sheet.tsx`
  Expected: no output. SSE-driven invalidations replace polling.

- [ ] **Step 4: Typecheck**

  Run: `npm run check 2>&1 | tail -10`
  Expected: clean.

---

### Task 12: Frontend re-scrape rewiring + verify deleted endpoint has no callers

**Files:**
- (Read-only audit; modifications already happened in Task 7's mutation block.)

The legacy mutation at the old `brand-fact-sheet.tsx:174-198` called `POST /api/brand-facts/scrape/:brandId`. Per Spec 2 §4.10, that endpoint is **deleted** by Plan 2.3 (line 277 of the spec: "is deleted — replaced by the new `POST /api/brand-fact-sheet/runs`"). Plan 2.4's new mutation (Task 7) targets `POST /api/brand-fact-sheet/runs` and returns `{runId}` immediately.

- [ ] **Step 1: Audit there are no remaining callers of the deleted endpoint**

  Run: `grep -rn "brand-facts/scrape" client/ server/ shared/ tests/`
  Expected: no output, OR matches only inside `server/routes/publications.ts` removal context (Plan 2.3 deletes the block; if it isn't deleted yet, halt and report — Plan 2.3 prerequisite).

- [ ] **Step 2: Audit there's exactly one caller of the new endpoint in the page**

  Run: `grep -n "/api/brand-fact-sheet/runs" client/src/pages/brand-fact-sheet.tsx`
  Expected: 2 lines — the `POST` mutation + the GET runs query key.

- [ ] **Step 3: Audit the SSE stream consumer**

  Run: `grep -n "useScrapeRunStream" client/src/pages/brand-fact-sheet.tsx`
  Expected: 1 import + 1 call site.

---

### Task 13: Tour engine — markers + tour file

**Files:**
- Modify: `client/src/pages/brand-fact-sheet.tsx` (already inserted in Tasks 8 + 9)
- Create: `client/src/tours/pages/brand-fact-sheet.tour.ts`
- Modify: wherever tours register (verify by `grep -rn "dashboardTour" client/src/tours/`)

- [ ] **Step 1: Confirm `data-tour-id` markers are present in the page**

  Run:
  ```
  grep -n 'data-tour-id="fact-sheet' client/src/pages/brand-fact-sheet.tsx
  ```
  Expected: at least two hits — `fact-sheet.diff` (Task 9 wrapper) and `fact-sheet.run-progress` (Task 8 progress block).

- [ ] **Step 2: Write the tour file**

  Mirror the shape from `client/src/tours/pages/dashboard.tour.ts:1-32`. (Re-read it first to confirm the type signature hasn't drifted.)

  ```ts
  // client/src/tours/pages/brand-fact-sheet.tour.ts
  import type { TourConfig } from "../types";

  export const brandFactSheetTour: TourConfig = {
    id: "brand-fact-sheet",
    version: 1,
    scope: "perUser",
    trigger: { kind: "pageVisit" },
    steps: [
      {
        id: "diff-intro",
        target: "fact-sheet.diff",
        attachTo: "top",
        title: "Resolve conflicts",
        content:
          "When what you typed and what we found differ, we surface a side-by-side pair. Pick one, keep both, or merge.",
      },
      {
        id: "run-progress",
        target: "fact-sheet.run-progress",
        attachTo: "bottom",
        title: "Live scrape progress",
        content:
          "When a re-scrape is running, this strip shows the current page and overall progress.",
      },
    ],
  };
  ```

- [ ] **Step 3: Register the tour**

  Find the tour registry. Run: `grep -rn "dashboardTour" client/src/tours/`. Add `brandFactSheetTour` alongside it. Common pattern:

  ```ts
  import { brandFactSheetTour } from "./pages/brand-fact-sheet.tour";

  export const TOURS = {
    // ...existing,
    "brand-fact-sheet": brandFactSheetTour,
  };
  ```

  Adapt to the actual export shape.

- [ ] **Step 4: Run the tour-target verifier**

  Run: `npx tsx scripts/verify-tour-targets.ts` (or whatever the package.json script is named — `grep verify-tour-targets package.json` first).

  Expected: target count goes from 26 to 28 (the two new `fact-sheet.*` markers). If the verifier reports a missing target, re-check Tasks 8 and 9.

- [ ] **Step 5: Typecheck**

  Run: `npm run check 2>&1 | tail -10`
  Expected: clean.

---

### Task 14: Delta indicator usage (defer wiring to Plan 2.5)

**Files:**
- (No modifications — see notes.)

Spec 2 §4.6 calls for delta indicators (🆕 / 📝 / ❌) when a re-scrape changes facts vs. the prior run. The `DeltaIndicator` component is shipped in Task 3 so the building block exists; **but** computing the delta requires a server-side comparison between the current run and the prior `run_id` for the same `(domain, subcategory, factKey)` tuple. That comparison and its API shape belong to either Plan 2.3 (a `?deltas=true` param on `/diff`) or Plan 2.5 (during per-page UI work).

- [ ] **Step 1: Confirm the component exists and is importable**

  Run: `grep -n "DeltaIndicator" client/src/components/fact-sheet/DeltaIndicator.tsx`
  Expected: export found.

- [ ] **Step 2: Document the deferred wiring**

  Add a TODO comment near the top of `brand-fact-sheet.tsx`:

  ```ts
  // TODO(spec-2 Plan 2.5): consume per-fact delta type (new|changed|removed) from the
  // diff API and render <DeltaIndicator> next to FactRow / ConflictPair entries. The
  // component is ready (DeltaIndicator.tsx); the API piece is pending.
  ```

  No further code change in Plan 2.4.

---

### Task 15: Loading + empty + error states audit

Loading + empty + error states must exist on every query path. Verify after Tasks 7-10 land.

- [ ] **Step 1: Audit `<Skeleton>` usage**

  Run: `grep -n "<Skeleton" client/src/pages/brand-fact-sheet.tsx`
  Expected: at least three uses (diff loader + resolved loader; runs query needs a loader too — add one if you skipped it: small spinner near the "Last scraped" subline when `runsQuery.isLoading`).

- [ ] **Step 2: Audit `<EmptyState>` usage**

  Run: `grep -n "<EmptyState" client/src/pages/brand-fact-sheet.tsx`
  Expected: at least two — no-conflicts and no-resolved-facts.

- [ ] **Step 3: Audit error paths**

  Run: `grep -n "<Alert\b\|<ErrorState" client/src/pages/brand-fact-sheet.tsx`
  Expected: at least two — diff query error (Alert variant=destructive) + resolved query error (ErrorState).

- [ ] **Step 4: Confirm Foundations `EmptyState` import path**

  Run: `grep -n "EmptyState" client/src/components/foundations/index.ts`
  Expected: `EmptyState` re-exported. If not, import from `@/components/foundations/EmptyState` directly (verified at `client/src/components/foundations/EmptyState.tsx:5`).

---

### Task 16: Plan-wide verification sweep

- [ ] **Step 1: Typecheck**

  Run: `npm run check 2>&1 | tail -15`
  Expected: 0 tsc errors.

- [ ] **Step 2: Lint**

  Run: `npm run lint 2>&1 | tail -15`
  Expected: 0 errors.

- [ ] **Step 3: Prettier**

  Run: `npm run format:check 2>&1 | tail -5`
  Expected: clean. If not, `npm run format` and re-run check.

- [ ] **Step 4: Test suite (no new tests in Plan 2.4 — Plan 2.6 ships them)**

  Run: `npm test 2>&1 | tail -25`
  Expected: green at the documented baseline. No new regressions. The pre-existing flaky tests (sourceHealth, redditSource, ssrf, citationCronUnconditional, tour integration/e2e per Spec 2 §9 last bullet) may still flake — accept only at the documented baseline.

- [ ] **Step 5: Forbidden-color audit across new files**

  Run:
  ```
  grep -rE "border-(red|emerald|violet|amber)-[0-9]|bg-(red|emerald|violet|amber)-[0-9]|text-(red|emerald|violet|amber)-[0-9]" client/src/components/fact-sheet/ client/src/pages/brand-fact-sheet.tsx
  ```
  Expected: no output.

- [ ] **Step 6: `bg-red-(600|700)` as primary-action audit**

  Run: `grep -rE "bg-red-(600|700|800)" client/src/components/fact-sheet/ client/src/pages/brand-fact-sheet.tsx`
  Expected: no output. (Destructive actions use `variant="destructive"`, which maps to design tokens.)

- [ ] **Step 7: `dangerouslySetInnerHTML` audit**

  Run: `grep -rn "dangerouslySetInnerHTML" client/src/components/fact-sheet/ client/src/pages/brand-fact-sheet.tsx`
  Expected: no output.

- [ ] **Step 8: `setImmediate` audit (carry-over Spec 2 hygiene rule)**

  Run: `grep -rn "setImmediate" client/src/components/fact-sheet/ client/src/pages/brand-fact-sheet.tsx`
  Expected: no output.

- [ ] **Step 9: Deleted-endpoint caller audit**

  Run: `grep -rn "/api/brand-facts/scrape/" client/ tests/`
  Expected: no output. (Spec 2 §4.10 + Plan 2.3 deletes this endpoint.)

- [ ] **Step 10: Tour-target count**

  Run: `npx tsx scripts/verify-tour-targets.ts 2>&1 | tail -3`
  Expected: `Tour-target verification OK (28 targets, all present).` — was 26 pre-Plan-2.4, now 28 with `fact-sheet.diff` + `fact-sheet.run-progress`.

- [ ] **Step 11: Manual smoke**

  Run `npm run dev`. Navigate to `/brand-fact-sheet`. Confirm:
  - Page loads without console errors.
  - "Re-scrape" button visible and enabled (assuming Plans 2.1-2.3 are wired). Clicking it inserts a run; toast appears; progress strip shows; SSE drives the subline; on `done`, the resolved-facts query refetches.
  - Diff section renders skeleton → conflicts (if any) → empty state when none. Use mine / Use AI's / Keep both each shrink the diff and surface the result in the resolved list.
  - Bulk "Accept all AI" per domain works.
  - Resolved facts list renders by domain; scraped rows show `Last verified Xd ago`; user/manual rows do NOT show that subline.
  - Tour fires on first visit (perUser pageVisit). Verify by clearing the user's tour-completion record in dev DB or with a fresh user.

---

## Self-review checklist

Before claiming Plan 2.4 done, verify:

- [ ] All four new components exist under `client/src/components/fact-sheet/` (`ConflictPair.tsx`, `FactRow.tsx`, `DomainGroupHeader.tsx`, `DeltaIndicator.tsx`) plus `domainIcons.ts`.
- [ ] `client/src/pages/brand-fact-sheet.tsx` is a complete rewrite — no `factCategory` references, no `refetchInterval`, no `POST /api/brand-facts/scrape/` caller, no local `formatRelative` helper.
- [ ] `client/src/lib/formatRelativeTime.ts` exists; `home.tsx` imports from it (drift-resistant).
- [ ] The page renders three sections (header / diff / resolved) and an edit dialog (untouched per scope).
- [ ] Diff section: 8-domain grouping, side-by-side `ConflictPair` with Use mine / Use AI's / Keep both per Spec 2 §4.6 semantics; array `valueType` shows item-by-item merge.
- [ ] Resolved section: source badge per row; "Last verified Xd ago" subline ONLY on `source='scraped'` rows; muted >90 days, `text-chart-3` (orange) >180 days.
- [ ] SSE wiring: `useScrapeRunStream` invalidates `/api/brand-facts` on `fact`, invalidates runs + diff + facts on `done`/`error`.
- [ ] Re-scrape button calls `POST /api/brand-fact-sheet/runs` (NOT the deleted `…/brand-facts/scrape/:brandId`). Disabled when active run OR `factScrapeEnabled=false` (stubbed) OR cap reached (deferred to Plan 2.5 surface).
- [ ] Tour markers `fact-sheet.diff` + `fact-sheet.run-progress` present; `scripts/verify-tour-targets.ts` reports 28/28.
- [ ] Loading: `<Skeleton>` on every query. Empty: `<EmptyState>` on zero-conflict + zero-fact. Error: `<Alert variant="destructive">` or `<ErrorState>` on error.
- [ ] No raw palette colors (`bg-red-*`, `border-violet-*`, `text-emerald-*`). No `dangerouslySetInnerHTML`. No `setImmediate`. No `console.log` of fact values.
- [ ] OUT-OF-SCOPE items are NOT done in this plan: `fact_scrape_enabled` toggle wiring (Plan 2.5), `ScrapePagesPanel` (Plan 2.5), `ScrapeFailureState` per `error_kind` (Plan 2.5), edit dialog full rewrite (Plan 2.5+), integration tests (Plan 2.6).
- [ ] `npm run check`, `npm run lint`, `npm run format:check`, `npm test` all pass at documented baseline.

If any box is unchecked, fix before claiming Plan 2.4 done.
