# Spec 2 — Plan 2.5: Per-Page Panel + Failure States + Pause Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the per-page progress panel, the eight explicit failure-state branches, the `fact_scrape_enabled` pause toggle, and the cost-status subline on the redesigned Brand Fact Sheet page. This is purely additive UI work: components live under `client/src/components/fact-sheet/`, the page (owned by Plan 2.4) gains four wire-in edits, and one new minimal read-only route (`GET /api/brand-fact-sheet/cost-status`) is added. No agent code, no SSE plumbing, no diff view, no tests beyond what each component task validates manually. Tests land in Plan 2.6.

**Architecture:**
- `ScrapePagesPanel` is fed by `useScrapeRunStream` (Plan 2.3) live `event: page` events while a run is streaming, and by `GET /api/brand-fact-sheet/runs/:runId` (Plan 2.3) for the post-completion view. Always visible during an active run; wrapped in `<details>` and collapsed by default after completion.
- `ScrapeFailureState` is a pure switch on `run.error_kind` (Plan 2.1 column on `brand_fact_scrape_runs`), with eight branches mapped 1:1 to Spec 2 §4.7. Mixed-success runs do NOT render this component — the per-page panel + diff view handle that case.
- `PauseToggle` flips `brands.fact_scrape_enabled` (Plan 2.1 column) via `PATCH /api/brands/:brandId/fact-scrape-enabled` (Plan 2.3 endpoint). On unmount-safe optimistic update with rollback on error.
- `CostStatusBadge` reads `brand_monthly_cost_caps` (Plan 2.1 table) via a new minimal `GET /api/brand-fact-sheet/cost-status` route added in this plan (the only server change). It surfaces "$X.XX of $5.00 used this month" with three color tiers (muted / chart-3 / destructive).
- All four components are integrated into the page shell owned by **Plan 2.4** (`client/src/pages/brand-fact-sheet.tsx`). Plan 2.5 contributes four wire-in edits to that file — header (toggle + cost badge), under-progress (per-page panel), and above-diff (failure-state slot).

**Tech Stack:** React 18 + TanStack Query for state; shadcn `Switch`, `Alert`, `Card` primitives ([`switch.tsx`](../../../client/src/components/ui/switch.tsx), [`alert.tsx`](../../../client/src/components/ui/alert.tsx)); `StatusDot` foundation ([`StatusDot.tsx`](../../../client/src/components/foundations/StatusDot.tsx)) for per-page status glyphs; `useToast` ([`use-toast.ts`](../../../client/src/hooks/use-toast.ts)) for save feedback; Lucide icons. Express route added to `server/routes/factSheet.ts` (file owned by Plan 2.3 — Plan 2.5 appends one handler).

**Hard rules for all subagents:**

- ❌ NEVER run ANY git mutating command: `git commit`, `git add`, `git rm`, `git mv`, `git stash`, `git stash pop`, `git stash drop`, `git stash apply`, `git reset`, `git restore`, `git checkout` (when it discards), `git push`, `git pull`, `git fetch --prune`, `git rebase`, `git merge`, `git branch -D`, `git branch -m`, `git switch` (with dirty changes), `git clean`. Read-only is fine: `git status`, `git diff`, `git log`, `git show`, `git blame`, `git branch` (list).
- ❌ Do NOT trust .md files in this repo — verify every claim against code at the cited line before relying on it.
- ❌ Do NOT add features beyond what each task says. Plan 2.5 is UI components + one cost-status route + four page-shell integration edits. No agent code (Plan 2.2), no SSE route (Plan 2.3), no diff/conflict UI (Plan 2.4), no automated tests for failure modes (Plan 2.6).
- ❌ Do NOT use raw color classes (`bg-red-*`, `text-emerald-*`, `border-violet-*`). Design tokens only: `StatusDot` tones (`success`/`warn`/`fail`/`pending`), `text-muted-foreground`, `text-chart-3`, `text-destructive`, `<Alert variant="destructive">`.
- ❌ Do NOT rewrite the page shell — Plan 2.4 owns `client/src/pages/brand-fact-sheet.tsx`. Plan 2.5's integration tasks insert components into already-defined slots; if the slot doesn't yet exist (Plan 2.4 not yet landed), add a small placeholder `<section data-tour-id="fact-sheet.failure-slot">` comment and report `BLOCKED_ON_PLAN_2_4`.
- ❌ Do NOT introduce a new dependency. All primitives already exist in the codebase.
- ❌ Do NOT mock the cost-status endpoint with hard-coded numbers — it MUST read from `brand_monthly_cost_caps` via `storage.getMonthlyCostCap(brandId, monthKey)` (Plan 2.1 method).

---

## File Structure

**Components created (4):**
- `client/src/components/fact-sheet/ScrapePagesPanel.tsx` — live per-page status table, collapsed-by-default after completion.
- `client/src/components/fact-sheet/ScrapeFailureState.tsx` — eight explicit failure branches per Spec 2 §4.7.
- `client/src/components/fact-sheet/PauseToggle.tsx` — shadcn Switch + `PATCH /api/brands/:brandId/fact-scrape-enabled`.
- `client/src/components/fact-sheet/CostStatusBadge.tsx` — muted subline with three color tiers reading from the new cost-status endpoint.

**Server route added (1, in a file owned by Plan 2.3):**
- `server/routes/factSheet.ts` — append `GET /api/brand-fact-sheet/cost-status?brandId=...` handler returning `{factScrapeCents, monthlyCapCents}`.

**Page shell modified (file owned by Plan 2.4):**
- `client/src/pages/brand-fact-sheet.tsx` — four wire-in edits:
  1. Import + mount `<PauseToggle>` in the header.
  2. Import + mount `<CostStatusBadge>` below the Re-scrape button.
  3. Import + mount `<ScrapePagesPanel>` below the active-run progress bar.
  4. Import + mount `<ScrapeFailureState>` above the diff section (terminal-failure runs only).

**No tests in this plan.** Failure-state integration tests, snapshot tests, and accessibility tests for `ScrapePagesPanel` are scheduled for Plan 2.6.

---

### Task 1: `ScrapePagesPanel` component

**Files:**
- Create: `client/src/components/fact-sheet/ScrapePagesPanel.tsx`

**Spec refs:** Spec 2 §4.7 "Per-page panel"; §5.3 `brand_fact_scrape_pages` schema; §4.5 SSE `event: page` shape.

- [ ] **Step 1: Confirm the component directory exists**

Run: `ls client/src/components/fact-sheet/ 2>&1`
Expected: directory exists (created by Plan 2.4) OR a "No such file" error — if missing, create it: `mkdir -p client/src/components/fact-sheet`.

- [ ] **Step 2: Confirm `BrandFactScrapePage` is exported from shared schema**

Run: `grep -nE "brandFactScrapePages|BrandFactScrapePage" shared/schema.ts | head -5`
Expected: at least two matches — the table export and the row type (added in Plan 2.1). If absent, halt and report `BLOCKED_ON_PLAN_2_1`.

- [ ] **Step 3: Confirm `StatusDot` import shape**

Read [`client/src/components/foundations/StatusDot.tsx`](../../../client/src/components/foundations/StatusDot.tsx). Verify it exports `StatusDot` named (it does, line 13) and `StatusDotTone` type (line 3). Tones: `success | warn | fail | neutral | pending`.

- [ ] **Step 4: Write the component**

Create `client/src/components/fact-sheet/ScrapePagesPanel.tsx` with exactly this content:

```tsx
import { useMemo } from "react";
import { StatusDot, type StatusDotTone } from "@/components/foundations/StatusDot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BrandFactScrapePage } from "@shared/schema";

interface ScrapePagesPanelProps {
  pages: BrandFactScrapePage[];
  runId: string;
  isStreaming: boolean;
  runStartedAt?: string | Date | null;
}

const STATUS_TO_TONE: Record<BrandFactScrapePage["status"], StatusDotTone> = {
  pending: "pending",
  fetching: "pending",
  extracting: "warn",
  done: "success",
  failed: "fail",
  skipped_robots: "fail",
  skipped_lang: "fail",
  skipped_spa: "fail",
};

const STATUS_LABEL: Record<BrandFactScrapePage["status"], string> = {
  pending: "Queued",
  fetching: "Fetching",
  extracting: "Extracting",
  done: "Done",
  failed: "Failed",
  skipped_robots: "Robots.txt",
  skipped_lang: "Language",
  skipped_spa: "JS-only",
};

function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(fetchedAt: string | Date | null | undefined, startedAt?: string | Date | null): string {
  if (!fetchedAt || !startedAt) return "—";
  const ms = new Date(fetchedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function PageRow({
  page,
  runStartedAt,
}: {
  page: BrandFactScrapePage;
  runStartedAt?: string | Date | null;
}) {
  const tone = STATUS_TO_TONE[page.status];
  return (
    <tr
      className="border-t border-border text-sm"
      data-testid={`scrape-page-row-${page.id}`}
    >
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <StatusDot tone={tone} aria-label={`Status: ${STATUS_LABEL[page.status]}`} />
          <span className="text-xs text-muted-foreground">{STATUS_LABEL[page.status]}</span>
        </div>
      </td>
      <td className="py-2 pr-3 max-w-xs">
        <span className="line-clamp-1 font-mono text-xs" title={page.url}>
          {truncate(page.url, 60)}
        </span>
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums text-muted-foreground">
        {formatBytes(page.bytes)}
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums">{page.factCount ?? 0}</td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">{page.lang ?? "—"}</td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">
        {page.errorKind ? truncate(page.errorKind, 20) : "—"}
      </td>
      <td className="py-2 text-xs tabular-nums text-muted-foreground">
        {formatDuration(page.fetchedAt, runStartedAt)}
      </td>
    </tr>
  );
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={`skel-${i}`} className="border-t border-border">
          <td className="py-2 pr-3">
            <div className="flex items-center gap-2">
              <StatusDot tone="pending" />
              <span className="text-xs text-muted-foreground">Queued</span>
            </div>
          </td>
          <td className="py-2 pr-3">
            <div className="h-3 w-40 rounded bg-muted animate-pulse" />
          </td>
          <td className="py-2 pr-3">
            <div className="h-3 w-12 rounded bg-muted animate-pulse" />
          </td>
          <td className="py-2 pr-3">
            <div className="h-3 w-6 rounded bg-muted animate-pulse" />
          </td>
          <td className="py-2 pr-3">
            <div className="h-3 w-6 rounded bg-muted animate-pulse" />
          </td>
          <td className="py-2 pr-3">
            <div className="h-3 w-12 rounded bg-muted animate-pulse" />
          </td>
          <td className="py-2">
            <div className="h-3 w-10 rounded bg-muted animate-pulse" />
          </td>
        </tr>
      ))}
    </>
  );
}

function PagesTable({
  pages,
  isStreaming,
  runStartedAt,
}: {
  pages: BrandFactScrapePage[];
  isStreaming: boolean;
  runStartedAt?: string | Date | null;
}) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-2 pr-3 font-medium">Status</th>
          <th className="py-2 pr-3 font-medium">URL</th>
          <th className="py-2 pr-3 font-medium">Bytes</th>
          <th className="py-2 pr-3 font-medium">Facts</th>
          <th className="py-2 pr-3 font-medium">Lang</th>
          <th className="py-2 pr-3 font-medium">Issue</th>
          <th className="py-2 font-medium">Time</th>
        </tr>
      </thead>
      <tbody>
        {pages.length === 0 && isStreaming ? <SkeletonRows count={3} /> : null}
        {pages.map((page) => (
          <PageRow key={page.id} page={page} runStartedAt={runStartedAt} />
        ))}
      </tbody>
    </table>
  );
}

export function ScrapePagesPanel({
  pages,
  runId,
  isStreaming,
  runStartedAt,
}: ScrapePagesPanelProps) {
  const summary = useMemo(() => {
    const done = pages.filter((p) => p.status === "done").length;
    const failed = pages.filter((p) =>
      ["failed", "skipped_robots", "skipped_lang", "skipped_spa"].includes(p.status),
    ).length;
    const inFlight = pages.filter((p) =>
      ["pending", "fetching", "extracting"].includes(p.status),
    ).length;
    return { done, failed, inFlight, total: pages.length };
  }, [pages]);

  // While streaming: always visible. After completion: collapsed in <details>.
  if (isStreaming) {
    return (
      <Card data-tour-id="fact-sheet.pages-panel" data-testid="scrape-pages-panel-live">
        <CardHeader>
          <CardTitle className="text-base">
            Reading pages{" "}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {summary.done} done · {summary.inFlight} in flight · {summary.failed} skipped
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <PagesTable pages={pages} isStreaming={isStreaming} runStartedAt={runStartedAt} />
        </CardContent>
      </Card>
    );
  }

  // Post-completion: collapsed semantic <details>, summary shows count.
  return (
    <Card data-tour-id="fact-sheet.pages-panel" data-testid="scrape-pages-panel-collapsed">
      <CardContent className="p-0">
        <details className="group">
          <summary
            className={cn(
              "flex cursor-pointer items-center justify-between p-4 text-sm font-medium",
              "select-none hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            data-testid="scrape-pages-panel-summary"
          >
            <span>
              View per-page details
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({summary.total} pages · {summary.done} done · {summary.failed} skipped)
              </span>
            </span>
            <span
              aria-hidden
              className="text-xs text-muted-foreground transition-transform group-open:rotate-90"
            >
              ▶
            </span>
          </summary>
          <div className="overflow-x-auto px-4 pb-4">
            <PagesTable pages={pages} isStreaming={false} runStartedAt={runStartedAt} />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Typecheck the new file**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 tsc errors. If `BrandFactScrapePage` type is missing, Plan 2.1 has not landed — halt with `BLOCKED_ON_PLAN_2_1`.

- [ ] **Step 6: Confirm no raw color classes leaked in**

Run: `grep -nE "bg-(red|green|emerald|violet|blue)-[0-9]|text-(red|green|emerald|violet)-[0-9]" client/src/components/fact-sheet/ScrapePagesPanel.tsx`
Expected: no output.

---

### Task 2: `ScrapeFailureState` component (8 branches)

**Files:**
- Create: `client/src/components/fact-sheet/ScrapeFailureState.tsx`

**Spec refs:** Spec 2 §4.7 (eight failure modes table); §4.10 `error_kind` enum is the discriminator; §10 cost-cap UX risk note.

- [ ] **Step 1: Confirm the page-edit and brand-edit routes exist**

Run: `grep -rn "/welcome\|/brands\|/dashboard" client/src/App.tsx | head -10`
Expected: at least the brand-management route (`/dashboard/brands` or `/settings/brands` etc.). Read App.tsx around the matches and capture the exact brand-edit route. Plug it into the `all_pages_4xx` and `blocked` branches below where this plan uses `/dashboard/brands` as a placeholder — fix to whatever the real route is.

- [ ] **Step 2: Write the component**

Create `client/src/components/fact-sheet/ScrapeFailureState.tsx` with exactly this content:

```tsx
import { Link } from "wouter";
import {
  AlertTriangle,
  Ban,
  Clock,
  CloudOff,
  DollarSign,
  ExternalLink,
  FileText,
  ServerCrash,
  ShieldOff,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type ScrapeFailureKind =
  | "all_pages_4xx"
  | "spa_empty"
  | "blocked"
  | "robots_disallowed"
  | "llm_unavailable"
  | "cost_cap_reached"
  | "timeout"
  | "unknown";

interface ScrapeFailureStateProps {
  errorKind: ScrapeFailureKind | string | null;
  errorMessage?: string | null;
  runId: string;
  brandId: string;
  brandWebsite?: string | null;
  /** Imperative: scroll to / focus the manual-fact textarea inside the resolved-facts section. */
  onAddManualFact?: () => void;
}

function hostOf(url: string | null | undefined): string {
  if (!url) return "your website";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function ScrapeFailureState({
  errorKind,
  errorMessage,
  runId,
  brandId,
  brandWebsite,
  onAddManualFact,
}: ScrapeFailureStateProps) {
  const host = hostOf(brandWebsite);

  switch (errorKind) {
    case "all_pages_4xx":
      return (
        <Alert
          variant="destructive"
          data-tour-id="fact-sheet.failure-state"
          data-testid={`scrape-failure-${errorKind}`}
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>We couldn't find pages to read on {host}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Every URL we tried returned a 4xx error. Did you spell the website URL right?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/dashboard/brands?edit=${brandId}`}>
                  Edit brand URL <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
              {onAddManualFact ? (
                <Button size="sm" variant="ghost" onClick={onAddManualFact}>
                  Or add facts manually
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      );

    case "spa_empty":
      return (
        <Alert
          data-tour-id="fact-sheet.failure-state"
          data-testid={`scrape-failure-${errorKind}`}
        >
          <CloudOff className="h-4 w-4" />
          <AlertTitle>{host} looks like a JavaScript-only app</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              We couldn't see real content without rendering JavaScript. We don't run a
              headless browser yet — but you can paste a description of your brand below and
              we'll use that instead.
            </p>
            <Button
              size="sm"
              onClick={onAddManualFact}
              disabled={!onAddManualFact}
              data-testid="scrape-failure-spa-add-fact"
            >
              Add a description manually
            </Button>
          </AlertDescription>
        </Alert>
      );

    case "blocked":
      return (
        <Alert
          variant="destructive"
          data-tour-id="fact-sheet.failure-state"
          data-testid={`scrape-failure-${errorKind}`}
        >
          <ShieldOff className="h-4 w-4" />
          <AlertTitle>{host} blocked our scanner</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Looks like a CDN (Cloudflare / Akamai) is filtering our crawler. To allow it,
              add this line to your <code className="rounded bg-muted px-1 py-0.5">robots.txt</code>:
            </p>
            <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
              User-agent: VentureCiteBot/1.0{"\n"}Allow: /
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/dashboard/brands?edit=${brandId}`}>
                  Edit brand <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
              {onAddManualFact ? (
                <Button size="sm" variant="ghost" onClick={onAddManualFact}>
                  Or paste facts manually
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      );

    case "robots_disallowed":
      return (
        <Alert
          data-tour-id="fact-sheet.failure-state"
          data-testid={`scrape-failure-${errorKind}`}
        >
          <Ban className="h-4 w-4" />
          <AlertTitle>Your robots.txt blocks bots</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              We respect <code className="rounded bg-muted px-1 py-0.5">Disallow</code> rules
              in your robots.txt. Add facts manually below — or remove the rule for
              <code className="ml-1 rounded bg-muted px-1 py-0.5">VentureCiteBot/1.0</code>.
            </p>
            <Button
              size="sm"
              onClick={onAddManualFact}
              disabled={!onAddManualFact}
              data-testid="scrape-failure-robots-add-fact"
            >
              Add facts manually
            </Button>
          </AlertDescription>
        </Alert>
      );

    case "llm_unavailable":
      return (
        <Alert
          data-tour-id="fact-sheet.failure-state"
          data-testid={`scrape-failure-${errorKind}`}
        >
          <ServerCrash className="h-4 w-4" />
          <AlertTitle>Our AI provider is having issues</AlertTitle>
          <AlertDescription>
            <p>
              We've been notified and your scrape will retry automatically within a few
              minutes. No action needed on your end.
            </p>
            {errorMessage ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Details: {errorMessage}
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      );

    case "cost_cap_reached":
      return (
        <Alert
          data-tour-id="fact-sheet.failure-state"
          data-testid={`scrape-failure-${errorKind}`}
        >
          <DollarSign className="h-4 w-4" />
          <AlertTitle>You've used your monthly fact-scrape budget</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              The default cap is $5.00 per month. It resets on day 1 of next month.
              Existing facts continue to work — only re-scrapes are paused.
            </p>
            <p className="text-xs text-muted-foreground">
              Need more headroom? Email support and we'll raise it.
            </p>
          </AlertDescription>
        </Alert>
      );

    case "timeout":
      return (
        <Alert
          data-tour-id="fact-sheet.failure-state"
          data-testid={`scrape-failure-${errorKind}`}
        >
          <Clock className="h-4 w-4" />
          <AlertTitle>This scrape ran past the 5-minute limit</AlertTitle>
          <AlertDescription>
            <p>
              We saved whatever partial results we got below. Try re-running tomorrow — if
              this keeps happening, your site may be very large or slow to respond.
            </p>
          </AlertDescription>
        </Alert>
      );

    default:
      return (
        <Alert
          variant="destructive"
          data-tour-id="fact-sheet.failure-state"
          data-testid="scrape-failure-unknown"
        >
          <FileText className="h-4 w-4" />
          <AlertTitle>Scrape failed</AlertTitle>
          <AlertDescription>
            <p>
              Something went wrong while reading {host}. Try re-scraping — if it keeps
              failing, contact support with run ID{" "}
              <code className="rounded bg-muted px-1 py-0.5">{runId}</code>.
            </p>
            {errorMessage ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Details: {errorMessage}
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      );
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 tsc errors.

- [ ] **Step 4: Confirm all 8 branches + fallback present**

Run: `grep -cE 'case "(all_pages_4xx|spa_empty|blocked|robots_disallowed|llm_unavailable|cost_cap_reached|timeout)"' client/src/components/fact-sheet/ScrapeFailureState.tsx`
Expected: `7` (seven explicit cases; the eighth row in Spec 2 §4.7 "Mixed (some pages worked)" is rendered by the per-page panel, NOT here — comment that in the file).

Run: `grep -c "default:" client/src/components/fact-sheet/ScrapeFailureState.tsx`
Expected: `1` (the catch-all branch for unknown error kinds).

- [ ] **Step 5: Confirm no raw color classes**

Run: `grep -nE "bg-(red|green|emerald|violet|blue)-[0-9]|text-(red|green|emerald|violet)-[0-9]" client/src/components/fact-sheet/ScrapeFailureState.tsx`
Expected: no output.

- [ ] **Step 6: Verify the brand-edit route**

If the placeholder `/dashboard/brands?edit=${brandId}` doesn't match the real route from App.tsx, fix all three occurrences (`all_pages_4xx`, `blocked`, plus any others using `Link`). Re-run typecheck.

---

### Task 3: `PauseToggle` component

**Files:**
- Create: `client/src/components/fact-sheet/PauseToggle.tsx`

**Spec refs:** Spec 2 §4.6 header card pause toggle; §4.9 concurrent-runs constraint; API table `PATCH /api/brands/:brandId/fact-scrape-enabled` (Plan 2.3).

- [ ] **Step 1: Verify the PATCH endpoint exists or is planned**

Run: `grep -rn "fact-scrape-enabled\|factScrapeEnabled" server/routes/ | head -10`
Expected: at least one match in `server/routes/factSheet.ts` (Plan 2.3) or `server/routes/brands.ts`. If no match: this is fine — Plan 2.3 is landing in parallel and the endpoint may not yet exist. The component MUST still be implemented; if the endpoint is missing at integration time, the toast just shows the error response.

- [ ] **Step 2: Verify the `useToast` hook**

Read [`client/src/hooks/use-toast.ts`](../../../client/src/hooks/use-toast.ts) and confirm it exports `useToast` (it does; the hook returns `{ toast }`). Confirm `toast({ variant: "destructive", title, description })` is the call shape used elsewhere — grep:
Run: `grep -nE 'toast\(\{[^}]*variant: "destructive"' client/src/ -r | head -3`
Expected: at least one match — copy that exact call shape.

- [ ] **Step 3: Write the component**

Create `client/src/components/fact-sheet/PauseToggle.tsx` with exactly this content:

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PauseToggleProps {
  brandId: string;
  enabled: boolean;
  /** Optional notifier so the parent page can disable the Re-scrape button. */
  onChange?: (enabled: boolean) => void;
}

export function PauseToggle({ brandId, enabled, onChange }: PauseToggleProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localEnabled, setLocalEnabled] = useState(enabled);

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await apiRequest("PATCH", `/api/brands/${brandId}/fact-scrape-enabled`, {
        factScrapeEnabled: next,
      });
      return (await res.json()) as { fact_scrape_enabled: boolean };
    },
    onMutate: (next: boolean) => {
      const previous = localEnabled;
      setLocalEnabled(next);
      onChange?.(next);
      return { previous };
    },
    onError: (err, _next, ctx) => {
      if (ctx) {
        setLocalEnabled(ctx.previous);
        onChange?.(ctx.previous);
      }
      toast({
        variant: "destructive",
        title: "Couldn't update auto-scraping",
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    },
    onSuccess: (data) => {
      toast({
        title: data.fact_scrape_enabled ? "Auto-scraping enabled" : "Auto-scraping paused",
        description: data.fact_scrape_enabled
          ? "We'll re-check this brand on its monthly schedule."
          : "No automatic or cron scrapes will run for this brand.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/brands/${brandId}`] });
    },
  });

  return (
    <div className="flex items-center gap-2" data-tour-id="fact-sheet.pause-toggle">
      <Switch
        id={`pause-toggle-${brandId}`}
        checked={localEnabled}
        disabled={mutation.isPending}
        onCheckedChange={(checked) => mutation.mutate(checked)}
        data-testid="fact-sheet-pause-toggle"
        aria-label={localEnabled ? "Auto-scraping enabled" : "Auto-scraping paused"}
      />
      <Label htmlFor={`pause-toggle-${brandId}`} className="text-xs text-muted-foreground">
        {localEnabled ? "Auto-scraping enabled" : "Auto-scraping paused"}
      </Label>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 errors.

- [ ] **Step 5: Confirm `apiRequest` call signature matches existing usage**

Run: `grep -nE 'apiRequest\("PATCH"' client/src/ -r | head -3`
Expected: at least one match. If the call signature in the existing codebase is `apiRequest(method, url, body)`, the code above is correct. If it's `apiRequest({ method, url, body })`, change accordingly — the read defines truth.

---

### Task 4: `CostStatusBadge` component

**Files:**
- Create: `client/src/components/fact-sheet/CostStatusBadge.tsx`

**Spec refs:** Spec 2 §4.9 per-brand monthly cap; §10 "Cost-cap UX" risk note; §5.4 `brand_monthly_cost_caps` table (Plan 2.1).

- [ ] **Step 1: Write the component**

Create `client/src/components/fact-sheet/CostStatusBadge.tsx` with exactly this content:

```tsx
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface CostStatusBadgeProps {
  brandId: string;
}

interface CostStatusResponse {
  factScrapeCents: number;
  monthlyCapCents: number;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CostStatusBadge({ brandId }: CostStatusBadgeProps) {
  const { data, isLoading } = useQuery<CostStatusResponse>({
    queryKey: [`/api/brand-fact-sheet/cost-status`, brandId],
    queryFn: async () => {
      const res = await fetch(
        `/api/brand-fact-sheet/cost-status?brandId=${encodeURIComponent(brandId)}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        throw new Error(`cost-status failed: ${res.status}`);
      }
      return (await res.json()) as CostStatusResponse;
    },
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return null;
  }

  const { factScrapeCents, monthlyCapCents } = data;
  const ratio = monthlyCapCents > 0 ? factScrapeCents / monthlyCapCents : 0;

  const tone =
    ratio >= 1 ? "text-destructive" : ratio >= 0.8 ? "text-chart-3" : "text-muted-foreground";

  return (
    <p
      className={cn("text-xs tabular-nums", tone)}
      data-tour-id="fact-sheet.cost-status"
      data-testid="fact-sheet-cost-status"
      aria-label={`${formatDollars(factScrapeCents)} of ${formatDollars(monthlyCapCents)} used this month`}
    >
      {formatDollars(factScrapeCents)} of {formatDollars(monthlyCapCents)} used this month
    </p>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 errors.

- [ ] **Step 3: Confirm color-tier branches**

Run: `grep -nE 'text-destructive|text-chart-3|text-muted-foreground' client/src/components/fact-sheet/CostStatusBadge.tsx`
Expected: three matches, exactly.

---

### Task 5: `GET /api/brand-fact-sheet/cost-status` endpoint

**Files:**
- Modify: `server/routes/factSheet.ts` (file owned by Plan 2.3 — append one handler only)

**Spec refs:** Spec 2 §5.4 `brand_monthly_cost_caps`; §4.9 monthly cap value; API table line for monthly cap surface.

- [ ] **Step 1: Confirm `server/routes/factSheet.ts` exists**

Run: `ls server/routes/factSheet.ts 2>&1`
Expected: file exists (created by Plan 2.3). If absent: halt with `BLOCKED_ON_PLAN_2_3` — the file is Plan 2.3's territory and Plan 2.5 cannot create it.

- [ ] **Step 2: Confirm `storage.getMonthlyCostCap` and `currentMonthKey` exist**

Run: `grep -nE "getMonthlyCostCap|monthly_cap_cents|fact_scrape_cents" server/storage.ts server/databaseStorage.ts | head -10`
Expected: signature present in `IStorage` (Plan 2.1 added it). If absent: halt with `BLOCKED_ON_PLAN_2_1`.

Run: `grep -rn "currentMonthKey\|monthKey" server/lib/ server/databaseStorage.ts | head -5`
Expected: a `currentMonthKey()` helper somewhere. If absent, define it inline in this task using `new Date().toISOString().slice(0,7)` (YYYY-MM).

- [ ] **Step 3: Append the route handler to `server/routes/factSheet.ts`**

Read the existing file first to find the router export and the auth-middleware pattern used by the other handlers (most likely `isAuthenticated` + `requireBrand`).

Add the following block ABOVE the `export default router;` line (or wherever the file's bottom-of-file pattern lives — adapt to the existing style):

```ts
/**
 * GET /api/brand-fact-sheet/cost-status?brandId=...
 *
 * Spec 2 §5.4 + §4.9: surface the brand's monthly fact-scrape spend so the UI
 * can render "$X.XX of $5.00 used this month". If no cap row exists yet (no
 * scrape has run this month), return defaults — lazy creation lives in the
 * first run-insert path, not here.
 *
 * Plan 2.5 owns this handler; the rest of factSheet.ts is Plan 2.3.
 */
router.get(
  "/cost-status",
  isAuthenticated,
  async (req, res, next) => {
    try {
      const brandId = typeof req.query.brandId === "string" ? req.query.brandId : "";
      if (!brandId) {
        return res.status(400).json({ error: "brandId is required" });
      }

      // Ownership: reuse the same brand-ownership helper used elsewhere in this file.
      // If a `requireBrand` middleware is already in scope, swap it in via app.param
      // or by wrapping; the inline check below mirrors the pattern of GET /runs.
      const brand = await storage.getBrandById(brandId);
      if (!brand || brand.userId !== (req.user as { id: string } | undefined)?.id) {
        return res.status(404).json({ error: "brand_not_found" });
      }

      const monthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"
      const cap = await storage.getMonthlyCostCap(brandId, monthKey);

      return res.json({
        factScrapeCents: cap?.factScrapeCents ?? 0,
        monthlyCapCents: cap?.monthlyCapCents ?? 500,
      });
    } catch (err) {
      next(err);
    }
  },
);
```

If `factSheet.ts` uses a different routing style (e.g., `app.get` on the express app passed in via a factory function), adapt the snippet to that style — read the file and match.

- [ ] **Step 4: Typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 errors.

- [ ] **Step 5: Confirm 404 on miss (anti-enumeration)**

The handler returns `404 brand_not_found` when the brand doesn't belong to the user — NOT `403`. Verify by reading the handler. (Per CLAUDE.md: "404 (not 403) on miss — anti-enumeration.")

- [ ] **Step 6: Confirm the default cap is 500 cents in this handler**

Run: `grep -n "500" server/routes/factSheet.ts | head -5`
Expected: at least one match showing `?? 500` as the fallback for `monthlyCapCents`.

---

### Task 6: Wire `<PauseToggle>` into the page header

**Files:**
- Modify: `client/src/pages/brand-fact-sheet.tsx` (page shell owned by Plan 2.4)

**Spec refs:** Spec 2 §4.6 header card; §7 page rewrite per §4.6.

- [ ] **Step 1: Confirm Plan 2.4 has landed**

Read `client/src/pages/brand-fact-sheet.tsx`. The file should show the new header layout with a Re-scrape button slot. If the file still resembles the pre-Spec-2 version (line 1-80 mostly imports for the old CRUD UI, no `useScrapeRunStream` import, no `<BrandSelector>` in a header card), halt with `BLOCKED_ON_PLAN_2_4`.

- [ ] **Step 2: Add the import**

Add to the import block at the top of the file:

```tsx
import { PauseToggle } from "@/components/fact-sheet/PauseToggle";
```

- [ ] **Step 3: Source `fact_scrape_enabled` from the existing brand query**

The page already loads the selected brand via `useQuery({ queryKey: [`/api/brands/${selectedBrandId}`] })` (or similar). Confirm by reading the file. The response should include `factScrapeEnabled: boolean` after Plan 2.1's Drizzle schema change.

Capture into a local: `const factScrapeEnabled = brand?.factScrapeEnabled ?? true;`

Also track in component state for the Re-scrape button disable:
```tsx
const [scrapeEnabled, setScrapeEnabled] = useState(true);
useEffect(() => { setScrapeEnabled(brand?.factScrapeEnabled ?? true); }, [brand?.factScrapeEnabled]);
```

- [ ] **Step 4: Mount the toggle in the header next to the Re-scrape button**

In the JSX, locate the header row containing the Re-scrape button. Add the toggle adjacent to it:

```tsx
<div className="flex items-center gap-3">
  <PauseToggle
    brandId={selectedBrandId}
    enabled={factScrapeEnabled}
    onChange={setScrapeEnabled}
  />
  <Button
    onClick={triggerRescrape}
    disabled={!scrapeEnabled || isRunActive || costCapReached}
    title={
      !scrapeEnabled
        ? "Auto-scraping paused — toggle on to re-scrape"
        : isRunActive
          ? "A scrape is already running"
          : costCapReached
            ? "Monthly cap reached"
            : "Re-scrape now"
    }
  >
    <RefreshCw className="mr-2 h-4 w-4" />
    Re-scrape
  </Button>
</div>
```

(Adapt the variable names — `isRunActive`, `costCapReached`, `triggerRescrape` — to whatever Plan 2.4 named them. If they don't exist as local state, derive them from the existing `useScrapeRunStream` hook + `data?.run?.status` shape.)

- [ ] **Step 5: Typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 errors.

---

### Task 7: Wire `<CostStatusBadge>` into the page header

**Files:**
- Modify: `client/src/pages/brand-fact-sheet.tsx`

**Spec refs:** Spec 2 §10 cost-cap UX risk note.

- [ ] **Step 1: Add the import**

```tsx
import { CostStatusBadge } from "@/components/fact-sheet/CostStatusBadge";
```

- [ ] **Step 2: Mount below the Re-scrape button**

In the header JSX, immediately AFTER the Re-scrape button wrapper from Task 6:

```tsx
<CostStatusBadge brandId={selectedBrandId} />
```

The badge renders `null` while loading and a small one-line muted subline once data lands. No layout work needed.

- [ ] **Step 3: Typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 errors.

---

### Task 8: Wire `<ScrapePagesPanel>` into the page

**Files:**
- Modify: `client/src/pages/brand-fact-sheet.tsx`

**Spec refs:** Spec 2 §4.7 "Per-page panel"; §4.5 SSE `event: page` payload shape.

- [ ] **Step 1: Add the import**

```tsx
import { ScrapePagesPanel } from "@/components/fact-sheet/ScrapePagesPanel";
```

- [ ] **Step 2: Derive `pages` from the stream + run-detail query**

The page already calls `useScrapeRunStream(runId)` (Plan 2.3) for live events AND `useQuery([\`/api/brand-fact-sheet/runs/\${runId}\`])` for the post-completion snapshot.

Wire something like:
```tsx
const { pages: streamPages, status: streamStatus, isStreaming } = useScrapeRunStream(activeRunId);
const { data: runDetail } = useQuery({
  queryKey: [`/api/brand-fact-sheet/runs/${activeRunId}`],
  enabled: !!activeRunId && !isStreaming,
});
const displayPages = isStreaming ? streamPages : (runDetail?.pages ?? []);
```

(Variable names depend on what `useScrapeRunStream` actually returns — read the hook from Plan 2.3 and match exactly. The contract per Spec 2 §4.5 is `event: page` carrying `{url, status, factCount, bytes, errorKind?}` per page — the hook is expected to accumulate these into an array keyed by URL.)

- [ ] **Step 3: Mount below the active-run progress bar**

In the JSX, immediately AFTER the progress-bar block (the "Reading /pricing… (4 of 8 pages)" line per Spec 2 §4.6) and BEFORE the diff section:

```tsx
{(isStreaming || displayPages.length > 0) && activeRunId ? (
  <ScrapePagesPanel
    pages={displayPages}
    runId={activeRunId}
    isStreaming={isStreaming}
    runStartedAt={runDetail?.run?.startedAt ?? streamStatus?.startedAt}
  />
) : null}
```

- [ ] **Step 4: Typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 errors.

---

### Task 9: Wire `<ScrapeFailureState>` into the page

**Files:**
- Modify: `client/src/pages/brand-fact-sheet.tsx`

**Spec refs:** Spec 2 §4.7 explicit failure states; §5.2 `brand_fact_scrape_runs.error_kind`/`error_message`.

- [ ] **Step 1: Add the import**

```tsx
import { ScrapeFailureState } from "@/components/fact-sheet/ScrapeFailureState";
```

- [ ] **Step 2: Determine "terminal failure" condition**

```tsx
const latestRun = runDetail?.run ?? streamStatus?.run; // shape depends on Plan 2.3
const isTerminalFailure =
  latestRun &&
  (latestRun.status === "failed" || latestRun.status === "timeout") &&
  !!latestRun.errorKind;
```

Mixed success — some pages done, some failed — does NOT render `<ScrapeFailureState>`. That case is handled by the per-page panel (Task 8) plus the diff/resolved sections (Plan 2.4).

- [ ] **Step 3: Mount above the diff section**

In the JSX, immediately ABOVE the diff section (the conflict-pair container from Plan 2.4):

```tsx
{isTerminalFailure && latestRun ? (
  <ScrapeFailureState
    errorKind={latestRun.errorKind}
    errorMessage={latestRun.errorMessage}
    runId={latestRun.id}
    brandId={selectedBrandId}
    brandWebsite={brand?.website ?? null}
    onAddManualFact={() => {
      // Scroll the manual-fact input into view. Plan 2.4 owns the resolved-facts
      // section that hosts the input; if a ref exists in scope, use it. Otherwise
      // defer to anchor: document.getElementById("manual-fact-input")?.focus().
      document.getElementById("manual-fact-input")?.focus();
    }}
  />
) : null}
```

- [ ] **Step 4: Typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 errors.

- [ ] **Step 5: Confirm the 8 failure tour-targets are reachable**

Run: `grep -c 'data-tour-id="fact-sheet.failure-state"' client/src/components/fact-sheet/ScrapeFailureState.tsx`
Expected: 8 (one per branch, including the default fallback).

Run: `grep -c 'data-tour-id="fact-sheet.pages-panel"' client/src/components/fact-sheet/ScrapePagesPanel.tsx`
Expected: 2 (live + collapsed variants).

---

### Task 10: Plan-wide verification

**Files:** None modified (read-only verification).

- [ ] **Step 1: Run tsc clean**

Run: `npm run check 2>&1 | tail -10`
Expected: 0 errors.

- [ ] **Step 2: Run lint**

Run: `npm run lint 2>&1 | tail -20`
Expected: 0 errors. Warnings are acceptable only if pre-existing.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run 2>&1 | tail -20`
Expected: only the documented baseline failures (sourceHealth, redditSource, ssrf, citationCronUnconditional, tour integration/e2e). No new regressions. (Plan 2.5 adds zero tests — failure-mode tests are Plan 2.6.)

- [ ] **Step 4: Grep audit for design-token compliance**

Run: `grep -rnE "bg-(red|green|emerald|violet|blue)-[0-9]|text-(red|green|emerald|violet)-[0-9]" client/src/components/fact-sheet/`
Expected: no output.

- [ ] **Step 5: Grep audit for forbidden direct fetch in components**

Components other than `CostStatusBadge` (which intentionally uses `fetch` matching the codebase pattern for SSE-adjacent reads) should not directly call `fetch`:
Run: `grep -nE "^\s*(const|let|await)\s+.*=\s*(await\s+)?fetch\(" client/src/components/fact-sheet/PauseToggle.tsx client/src/components/fact-sheet/ScrapePagesPanel.tsx client/src/components/fact-sheet/ScrapeFailureState.tsx`
Expected: no output.

- [ ] **Step 6: Verify tour targets count**

Run: `npx tsx scripts/verify-tour-targets.ts 2>&1 | tail -5`
Expected: ≥ 28 / 28 targets (the original 26 + Plan 2.4's `fact-sheet.diff` + `fact-sheet.run-progress`; Plan 2.5 adds `fact-sheet.pages-panel`, `fact-sheet.failure-state`, `fact-sheet.pause-toggle`, `fact-sheet.cost-status` — at least 4 additional, but the verifier only complains about referenced-but-missing targets, not the inverse).

If the verifier checks "every defined target is referenced," each new target needs at least one consumer in a `.tour.ts` file. Plan 2.4 ships the tour file; if the new Plan 2.5 targets aren't referenced there, add them to `client/src/tours/pages/brand-fact-sheet.tour.ts` (Plan 2.4 file — coordinate with Plan 2.4's author or open a small follow-up).

- [ ] **Step 7: Manual UX smoke test across all 8 failure-state branches**

Run: `npm run dev` and navigate to `/brand-fact-sheet`. Verify by temporarily injecting fake `errorKind` values via React DevTools (or a one-line state override in the page) that each branch:

- [ ] `all_pages_4xx` renders the destructive Alert with the "did you spell the URL right?" copy and an "Edit brand URL" link button.
- [ ] `spa_empty` renders the default Alert with "JavaScript-only app" copy and an "Add a description manually" button.
- [ ] `blocked` renders the destructive Alert with the robots.txt allowlist snippet in a `<pre>` block.
- [ ] `robots_disallowed` renders the default Alert with the "we respect that" copy + manual-fact CTA.
- [ ] `llm_unavailable` renders the default Alert with the "AI provider is having issues" copy and shows `errorMessage` if provided.
- [ ] `cost_cap_reached` renders the default Alert with the "$5.00 per month" copy and "Email support" footnote.
- [ ] `timeout` renders the default Alert with the "5-minute limit" copy.
- [ ] Unknown `errorKind` renders the destructive fallback Alert with the run ID in a `<code>` block.

Revert the injection. The pause-toggle + cost-badge should both be visible in the header on every render.

- [ ] **Step 8: Manual UX smoke test of the pause toggle**

- [ ] Toggle off → button disables; toast says "Auto-scraping paused"; label updates.
- [ ] Toggle on → button re-enables; toast says "Auto-scraping enabled".
- [ ] Force the PATCH endpoint to return 500 (e.g., temporarily edit the server to throw) → toggle reverts to previous state, destructive toast shows the error.

- [ ] **Step 9: Manual UX smoke test of the per-page panel**

- [ ] During an active scrape: panel is visible at the top, no `<details>` wrapper, summary line shows live counts.
- [ ] After completion: panel collapses into a `<details>` with summary "View per-page details (N pages · X done · Y skipped)". Clicking the summary expands the table.

- [ ] **Step 10: Final report**

Report:
- Files created (4 components).
- Files modified (`server/routes/factSheet.ts`, `client/src/pages/brand-fact-sheet.tsx`).
- Tsc result.
- Lint result.
- Test suite result (baseline only).
- Tour-target verifier result.
- All 8 failure-state branches manually verified (yes / no).
- Pause toggle manually verified (yes / no).
- Per-page panel manually verified (yes / no).
- Anything skipped, deferred, or flagged with a `// TODO(spec-2 Plan 2.6)` comment.

Status: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.

No git commit. No git stash.

---

## Self-review checklist (controller runs before declaring Plan 2.5 done)

- [ ] No `git commit` / stash / reset / checkout-discard touched at any point.
- [ ] Four new component files created under `client/src/components/fact-sheet/`: `ScrapePagesPanel.tsx`, `ScrapeFailureState.tsx`, `PauseToggle.tsx`, `CostStatusBadge.tsx`. Each compiles standalone.
- [ ] `ScrapeFailureState.tsx` contains all 8 branches: `all_pages_4xx`, `spa_empty`, `blocked`, `robots_disallowed`, `llm_unavailable`, `cost_cap_reached`, `timeout`, plus the `default:` fallback. Each has a distinct icon, copy, and CTA.
- [ ] Mixed-success (partial) runs do NOT render `<ScrapeFailureState>` — only `failed`/`timeout` runs with an `errorKind` set do.
- [ ] Pause toggle wires to `PATCH /api/brands/:brandId/fact-scrape-enabled` (Plan 2.3 endpoint). Optimistic update with rollback on error. Toasts use exact copy "Auto-scraping enabled" / "Auto-scraping paused".
- [ ] `CostStatusBadge` color tiers: muted at <80%, `text-chart-3` at 80-99%, `text-destructive` at 100%. Renders `null` while loading.
- [ ] `GET /api/brand-fact-sheet/cost-status` endpoint added to `server/routes/factSheet.ts` (Plan 2.3's file — only this one route is Plan 2.5's). Returns 404 on ownership miss (anti-enumeration). Default cap is exactly 500 cents.
- [ ] Page-shell file (`client/src/pages/brand-fact-sheet.tsx`) gets exactly 4 wire-in additions; no rewrites of Plan 2.4's structure.
- [ ] Per-page panel uses `<details>` for the collapsed state — semantic + a11y.
- [ ] No raw color classes anywhere under `client/src/components/fact-sheet/` — design tokens only.
- [ ] All 4 new tour targets present: `fact-sheet.pages-panel`, `fact-sheet.failure-state`, `fact-sheet.pause-toggle`, `fact-sheet.cost-status`.
- [ ] `npm run check` clean. `npm run lint` clean. Vitest at documented baseline only.
- [ ] No new dependencies introduced.
- [ ] The plan does not touch agent code (Plan 2.2), the SSE route itself (Plan 2.3), the diff/resolved sections (Plan 2.4), or failure-mode automated tests (Plan 2.6).
