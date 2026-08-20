# Phase 2 — Per-page Explainers + Glossary + Sidebar Reorder Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement task-by-task.
>
> **No commits during execution.** Same convention as Phases 0 + 1.

**Goal:** Every authenticated page has an `(i)` icon by its title that opens a popover explaining what the page does, prerequisites, and what to expect. Plus a public `/glossary` route defining GEO/AEO/SEO. Plus the sidebar reordered into a workflow sequence (Setup → Create → Measure → Grow → Optimize). This phase introduces the most reusable infrastructure of the whole product plan — `pageExplainers.ts` becomes a referenceable knowledge base for the chatbot in Phase 5 and for empty states in Phase 6.

**Architecture:** Pure client-side. No server changes, no migrations, no env vars, no new endpoints. The `PageHeader` component gets a backward-compatible optional `explainer` prop. A new public route `/glossary` is added to `App.tsx`. The sidebar's existing `NAV_*` constant arrays in `Sidebar.tsx` are restructured into the workflow order. All copy lives in one centralized `client/src/lib/pageExplainers.ts` config.

**Tech Stack:** React 18, Wouter (router), Radix UI primitives (`Popover`, `HoverCard`, both already in `client/src/components/ui/`), Tailwind, lucide-react icons.

---

## Pre-conditions verified before writing this plan

- `client/src/components/PageHeader.tsx` exists (25 lines, props `{title, description, actions, leading}`) — confirmed safe to extend with optional `explainer`
- `client/src/components/ui/popover.tsx` and `client/src/components/ui/hover-card.tsx` both exist (Radix wrappers)
- 26 pages currently use `<PageHeader>` (confirmed via grep). 10 pages don't: 5 are pre-auth (login/register/forgot-password/reset-password/landing), 1 is 404 (not-found), and 4 are detail/edge pages that don't need explainers (agent-run, pricing, privacy, welcome) — out of scope for explainer wiring
- `client/src/components/Sidebar.tsx` defines 5 NAV_* arrays (lines 39-70) — `NAV_MAIN`, `NAV_TOOLS`, `NAV_ANALYTICS`, `NAV_GROWTH`, `NAV_OPTIMIZE`. Reordering changes which items appear in which array, no URL changes
- `client/src/App.tsx` defines route registration — public routes (no `AuthenticatedRoute` wrapper) coexist with auth-gated routes

---

## File structure

**Files modified:**
- `client/src/components/PageHeader.tsx` — add optional `explainer` prop + `(i)` icon + Popover (Task 1)
- `client/src/components/Sidebar.tsx` — reorder NAV_* arrays into Setup/Create/Measure/Grow/Optimize, update section labels (Task 4)
- `client/src/App.tsx` — register public `/glossary` route (Task 3)
- 26 page files — each gets one prop addition: `explainer={pageExplainers.X}` (Task 2 — done by parallel agents in 3 batches)

**Files created:**
- `client/src/components/GeoConceptBadge.tsx` — inline pill that opens HoverCard with glossary definition + "Learn more" link (Task 1)
- `client/src/lib/pageExplainers.ts` — single export: `Record<RouteKey, PageExplainer>` for all 26 pages (Task 2)
- `client/src/pages/glossary.tsx` — public route with GEO/AEO/SEO definitions + JSON-LD schema (Task 3)

**No tests added** for this phase — every component is layout-only per the test-coverage convention (Question 4 lock-in: targeted RTL only for components with logic). The 4 RTL-eligible components (`OnboardingProgressRing`, `RecommendationsPanel`, `EducationAssistant`, `ResultsTimeline`) are in Phases 1, 4, 5 — not here.

**No changes to:**
- Server (no endpoints, no env vars)
- `vercel.json` (no new function, no new cron)
- `package.json` (no new deps)
- `vite.config.ts` / `vitest.config.ts`

---

## Pre-flight: baseline check

- [ ] **P2.0: Confirm baseline is green**

Run:
```
npm run check
npm test
```

Expected: typecheck clean, **244 tests passing** (baseline from end of Phase 1).

If anything fails, halt and address before continuing.

---

## PR 2.1 — `PageHeader` extension + `GeoConceptBadge` (~3 hours)

### Task 1: Extend `PageHeader` with optional `explainer` prop + build `GeoConceptBadge`

**Files:**
- Modify: `client/src/components/PageHeader.tsx`
- Create: `client/src/components/GeoConceptBadge.tsx`

**Why:** The `(i)` icon + popover is the user-facing surface. Centralizing it on `PageHeader` (vs. per-page implementations) means future copy edits happen in one place. Backward-compatible: existing callers without `explainer` keep working.

- [ ] **Step 1: Read the current `PageHeader.tsx`** to confirm the structure and props.

- [ ] **Step 2: Replace `client/src/components/PageHeader.tsx` with the extended version**

```tsx
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

/** Per-page explainer rendered inside the (i) icon's popover. Stored
 *  centrally in client/src/lib/pageExplainers.ts so copy edits happen
 *  in one place (and so the chatbot in Phase 5 can read the same
 *  copy users see in the popover). */
export type PageExplainer = {
  /** Required. One sentence: "what this page does." */
  summary: string;
  /** Optional: "Run this AFTER X." */
  prerequisites?: string;
  /** Optional: "Citations appear within 1–2 weeks…" */
  expectedOutcome?: string;
  /** Optional: shows a related-concept badge in the popover footer. */
  relatedConcept?: "GEO" | "AEO" | "SEO";
};

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  leading?: ReactNode;
  /** Optional. When present, renders an (i) icon next to the title that
   *  opens a popover with the explainer copy. Backward-compatible —
   *  existing callers without this prop keep working unchanged. */
  explainer?: PageExplainer;
}

export default function PageHeader({
  title,
  description,
  actions,
  leading,
  explainer,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0 flex items-start gap-2">
        {leading && <div className="shrink-0 mt-0.5">{leading}</div>}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight truncate">
              {title}
            </h1>
            {explainer && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Page explainer"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Info className="h-4 w-4" aria-hidden="true" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 text-sm" align="start">
                  <p className="text-foreground">{explainer.summary}</p>
                  {explainer.prerequisites && (
                    <p className="mt-2 text-muted-foreground">
                      <span className="font-medium text-foreground">Before this:</span>{" "}
                      {explainer.prerequisites}
                    </p>
                  )}
                  {explainer.expectedOutcome && (
                    <p className="mt-2 text-muted-foreground">
                      <span className="font-medium text-foreground">What to expect:</span>{" "}
                      {explainer.expectedOutcome}
                    </p>
                  )}
                  {explainer.relatedConcept && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Related:</span>
                      <Badge variant="secondary" className="text-xs">
                        <a
                          href={`/glossary#${explainer.relatedConcept.toLowerCase()}`}
                          className="hover:underline"
                        >
                          {explainer.relatedConcept}
                        </a>
                      </Badge>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </div>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Create `client/src/components/GeoConceptBadge.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

/** Inline GEO/AEO/SEO concept pill. Click → navigates to /glossary anchor.
 *  Hover → shows the definition without leaving the page. Used inline in
 *  page descriptions, empty states, and (later) chatbot responses. */
const DEFINITIONS: Record<"GEO" | "AEO" | "SEO", { name: string; short: string }> = {
  GEO: {
    name: "Generative Engine Optimization",
    short:
      "Optimizing your content + brand to be cited by AI assistants (ChatGPT, Claude, Perplexity, etc.).",
  },
  AEO: {
    name: "Answer Engine Optimization",
    short:
      "Optimizing for systems that give direct answers — Reddit/Quora threads, Wikipedia, AI summaries.",
  },
  SEO: {
    name: "Search Engine Optimization",
    short: "Traditional Google/Bing ranking — the foundation that GEO and AEO build on.",
  },
};

interface GeoConceptBadgeProps {
  concept: "GEO" | "AEO" | "SEO";
  className?: string;
}

export default function GeoConceptBadge({ concept, className }: GeoConceptBadgeProps) {
  const def = DEFINITIONS[concept];
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <a
          href={`/glossary#${concept.toLowerCase()}`}
          className={["inline-block", className].filter(Boolean).join(" ")}
          aria-label={`${def.name} — open glossary`}
        >
          <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-accent">
            {concept}
          </Badge>
        </a>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 text-sm" align="start">
        <p className="font-medium text-foreground">{def.name}</p>
        <p className="mt-1 text-muted-foreground">{def.short}</p>
        <a
          href={`/glossary#${concept.toLowerCase()}`}
          className="mt-2 inline-block text-xs text-primary hover:underline"
        >
          Learn more →
        </a>
      </HoverCardContent>
    </HoverCard>
  );
}
```

- [ ] **Step 4: Run typecheck**

```
npm run check
```

Expected: clean. The `PageExplainer` export is new, the `Info` icon import is new, but no existing call site changes (the `explainer` prop is optional).

- [ ] **Step 5: Verify diff**

```
git diff client/src/components/PageHeader.tsx
git status --short client/src/components/GeoConceptBadge.tsx
```

Confirm: PageHeader has the new `Info`/`Popover`/`Badge` imports + extended JSX (only adds the (i) icon when `explainer` is set). GeoConceptBadge is a new untracked file.

- [ ] **Step 6: Run full test suite**

```
npm test
```

Expected: 244 tests still passing. PageHeader is layout-only — no tests need updating.

---

## PR 2.2 — `pageExplainers.ts` config + populate copy across 26 pages (~2 days)

### Task 2: Create the centralized config + wire into all 26 pages

**Files:**
- Create: `client/src/lib/pageExplainers.ts`
- Modify: 26 page files (one `<PageHeader>` prop addition each)

**Why centralized:**
1. Copy review for the entire app happens in one PR
2. Phase 5 chatbot imports this file to ground its answers in the same copy users see in popovers
3. Phase 6 empty states fall back to `pageExplainers[page].expectedOutcome` when no specific copy is provided

**This task is the bulk of Phase 2 effort. It's done in parallel batches** — 3 agents × 8-9 pages each — because each page edit is independent (only modifies that page's `<PageHeader>` call site).

- [ ] **Step 1: Create `client/src/lib/pageExplainers.ts`**

This file is the single source of truth for all 26 pages' explainer copy. Create with this content:

```ts
import type { PageExplainer } from "@/components/PageHeader";

/** Per-page explainer copy. The popover on each page reads from here.
 *  Edit this file (and only this file) when copy needs updating across
 *  the app. The chatbot system prompt (Phase 5) imports this same map
 *  so its answers stay in sync with the popover copy users see.
 *
 *  Adding a new page: add an entry here keyed by route slug, then add
 *  `explainer={pageExplainers.<slug>}` to that page's <PageHeader>
 *  call site. Pages without explainers render the existing PageHeader
 *  unchanged (the (i) icon only appears when the prop is set).
 */
export const pageExplainers = {
  dashboard: {
    summary: "Your GEO command center — see citation trends, rankings, and what to do next.",
    expectedOutcome: "New data appears within minutes after each citation check completes.",
  },
  brands: {
    summary:
      "Brand profiles power every other feature — name, industry, tone, USPs, and tracked variations.",
    prerequisites: "Add a brand before generating content or running citation checks.",
    expectedOutcome: "Brand details propagate everywhere instantly — no rebuild needed.",
  },
  articles: {
    summary: "AI-optimized articles you've generated. Publish to your site, then track citations.",
    prerequisites: "Articles are created from the Content page; they land here once ready.",
    expectedOutcome:
      "Once published to your site, expect first citations within 1–2 weeks as LLMs re-index.",
  },
  content: {
    summary:
      "Generate AI-optimized articles tuned for citation by ChatGPT, Claude, Perplexity, and others.",
    prerequisites: "Pick a brand. Optional but useful: keywords + target customers.",
    expectedOutcome: "Generation takes 2–5 minutes — you'll see live progress and can edit on save.",
    relatedConcept: "GEO",
  },
  citations: {
    summary:
      "Asks ChatGPT, Claude, Perplexity, and others your prompts and tracks whether they mention you.",
    prerequisites: "Run AFTER setting up a brand and generating a few articles.",
    expectedOutcome:
      "Citations typically appear 1–2 weeks after new content is published — LLM models re-index on their own schedule.",
    relatedConcept: "GEO",
  },
  aiVisibility: {
    summary: "One-time setup checklist — make your site machine-readable for AI engines.",
    prerequisites: "Do this BEFORE expecting citations.",
    expectedOutcome: "Each item completed boosts the chance an AI cites you accurately.",
    relatedConcept: "GEO",
  },
  keywordResearch: {
    summary: "Discover keywords AI engines use to surface answers in your industry.",
    expectedOutcome: "Use the suggestions in your Content prompts for higher citation rates.",
    relatedConcept: "GEO",
  },
  geoAnalytics: {
    summary:
      "Share-of-voice + AI visibility + sentiment rollup across all platforms and time windows.",
    prerequisites: "Run a few citation checks first to populate the data.",
    relatedConcept: "GEO",
  },
  aiIntelligence: {
    summary:
      "Deep dive into AI-engine behavior — mentions, hallucinations, citation quality, sources.",
    prerequisites: "Most useful after 2+ weeks of citation runs.",
    relatedConcept: "GEO",
  },
  clientReports: {
    summary: "Period-over-period reports for sharing with stakeholders or as agency deliverables.",
    expectedOutcome: "Auto-generated weekly; export as PDF or share read-only links.",
  },
  community: {
    summary:
      "Reddit + Quora outreach — direct engagement that LLMs scrape into their training data.",
    expectedOutcome:
      "AEO tactic: posts you make today can show up in AI answers within 4–8 weeks.",
    relatedConcept: "AEO",
  },
  competitors: {
    summary:
      "Track competitor brands across the same prompts — see who else AI engines cite, how, and when.",
    prerequisites: "Add competitors manually or let the system auto-discover them from citation runs.",
  },
  geoOpportunities: {
    summary: "Specific actions to take next, ranked by impact: outreach, content, schema, etc.",
    expectedOutcome: "Recommendations refresh weekly based on your latest citation data.",
    relatedConcept: "GEO",
  },
  geoRankings: {
    summary: "Where your brand ranks across each prompt × platform combination.",
    relatedConcept: "GEO",
  },
  geoSignals: {
    summary:
      "Score your content's chunkability, schema markup, and FAQ structure for AI consumption.",
    expectedOutcome: "Each signal fixed boosts the chance AI engines extract your content cleanly.",
    relatedConcept: "GEO",
  },
  geoTools: {
    summary:
      "Auxiliary tools — bulk ops, data exports, schema generators, listicle scanners, FAQ helpers.",
  },
  crawlerCheck: {
    summary:
      "Check whether AI crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.) are allowed to read your site.",
    expectedOutcome: "Run after publishing your robots.txt — flags any AI crawler currently blocked.",
    relatedConcept: "GEO",
  },
  faqManager: {
    summary:
      "Manage and optimize FAQs that AI engines extract verbatim into answers.",
    expectedOutcome: "Well-structured FAQs are one of the highest-ROI inputs for citation rate.",
    relatedConcept: "AEO",
  },
  brandFactSheet: {
    summary:
      "Canonical facts about your brand — used by AI to verify mentions and avoid hallucinations.",
    expectedOutcome:
      "Adding facts here directly reduces 'wrong' citations (e.g., wrong founding year, wrong CEO).",
    relatedConcept: "GEO",
  },
  outreach: {
    summary:
      "Manage targeted outreach campaigns — publications, journalists, podcasts, newsletters.",
    expectedOutcome: "Successful placements compound over weeks as AI engines re-index.",
  },
  publicationIntelligence: {
    summary:
      "Insights on which publications AI engines cite most often in your industry.",
    expectedOutcome: "Use this to prioritize where to pitch / get featured next.",
  },
  aiTraffic: {
    summary:
      "Track AI-referrer traffic to your site — sessions originating from ChatGPT, Perplexity, etc.",
    prerequisites: "Connect Google Analytics or similar to enable.",
  },
  analyticsIntegrations: {
    summary:
      "Connect Google Analytics, Stripe, and other data sources to attribute revenue to AI traffic.",
  },
  revenueAnalytics: {
    summary:
      "Revenue rollups by AI platform + ecommerce platform + brand. Tracks the ROI of GEO work.",
    prerequisites: "Connect Stripe (or fire purchase webhooks) so revenue events flow in.",
  },
  agentDashboard: {
    summary:
      "Background AI agent tasks — content generation, citation runs, autopilot recipes.",
    expectedOutcome: "Most tasks finish in 1–5 minutes; check the Status column for progress.",
  },
  settings: {
    summary: "Account, team, billing, integrations, and notification preferences.",
  },
} as const satisfies Record<string, PageExplainer>;
```

- [ ] **Step 2: Identify the 26 pages and the route-key mapping**

| Page file | pageExplainers key |
|---|---|
| `agent-dashboard.tsx` | `agentDashboard` |
| `ai-intelligence.tsx` | `aiIntelligence` |
| `ai-traffic.tsx` | `aiTraffic` |
| `ai-visibility.tsx` | `aiVisibility` |
| `analytics-integrations.tsx` | `analyticsIntegrations` |
| `articles.tsx` | `articles` |
| `brand-fact-sheet.tsx` | `brandFactSheet` |
| `brands.tsx` | `brands` |
| `citations.tsx` | `citations` |
| `client-reports.tsx` | `clientReports` |
| `community-engagement.tsx` | `community` |
| `competitors.tsx` | `competitors` |
| `content.tsx` | `content` |
| `crawler-check.tsx` | `crawlerCheck` |
| `faq-manager.tsx` | `faqManager` |
| `geo-analytics.tsx` | `geoAnalytics` |
| `geo-opportunities.tsx` | `geoOpportunities` |
| `geo-rankings.tsx` | `geoRankings` |
| `geo-signals.tsx` | `geoSignals` |
| `geo-tools.tsx` | `geoTools` |
| `home.tsx` | `dashboard` |
| `keyword-research.tsx` | `keywordResearch` |
| `outreach.tsx` | `outreach` |
| `publication-intelligence.tsx` | `publicationIntelligence` |
| `revenue-analytics.tsx` | `revenueAnalytics` |
| `settings.tsx` | `settings` |

- [ ] **Step 3: For each page, add the import + the prop**

Per-page edit pattern. In each page file:

(a) Find the existing PageHeader import:
```ts
import PageHeader from "@/components/PageHeader";
```

Add immediately below:
```ts
import { pageExplainers } from "@/lib/pageExplainers";
```

(b) Find the `<PageHeader>` JSX call site and add the prop:
```tsx
// before:
<PageHeader title="..." description="..." />
// after:
<PageHeader title="..." description="..." explainer={pageExplainers.<key>} />
```

The `<key>` matches the table above. If the page already has `actions` or `leading` props, leave them — only add `explainer`.

**This is the per-page mechanical pass. Best done as 3 parallel batches by agents** (8-9 pages each) since each file edit is independent.

- [ ] **Step 4: Run typecheck after the pass**

```
npm run check
```

Expected: clean. If TypeScript complains that `pageExplainers.<key>` is missing for any page, the key in the table doesn't match the config in `pageExplainers.ts` — verify both.

- [ ] **Step 5: Run full test suite**

```
npm test
```

Expected: 244 tests still passing.

- [ ] **Step 6: Manual smoke test**

`npm run dev`. Visit 3-4 representative pages (`/dashboard`, `/citations`, `/content`, `/community`). Confirm:
- The (i) icon renders next to the page title
- Click → popover opens with the right copy
- Esc / click outside → popover closes
- Tab key reaches the (i) button (focus visible ring)
- Mobile (375px): popover renders correctly, no horizontal overflow

---

## PR 2.3 — Public `/glossary` route (~3 hours)

### Task 3: Create the glossary page + register the public route

**Files:**
- Create: `client/src/pages/glossary.tsx`
- Modify: `client/src/App.tsx`

**Why public:** SEO surface (searchers Googling "what is GEO" land here, become leads). Chatbot can deep-link to `/glossary#geo` from its responses. Auth-gating educational content throws away marketing reach.

- [ ] **Step 1: Create `client/src/pages/glossary.tsx`**

```tsx
import { useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";

const TITLE = "GEO vs AEO vs SEO — VentureCite Glossary";
const META_DESCRIPTION =
  "Plain-English definitions of GEO (Generative Engine Optimization), AEO (Answer Engine Optimization), and SEO (Search Engine Optimization), and how they layer.";

const TERMS = [
  {
    id: "geo",
    code: "GEO",
    name: "Generative Engine Optimization",
    definition:
      "Optimizing your content and brand presence so AI assistants like ChatGPT, Claude, and Perplexity cite you when answering user questions.",
    whyItMatters:
      "Increasingly, people get information directly from AI assistants instead of clicking through to websites. If AI engines don't know your brand, you're invisible to a growing slice of demand. GEO is the discipline of being part of those answers.",
    howVentureCiteCovers: [
      "Citation tracking across ChatGPT, Claude, Perplexity, Gemini, DeepSeek",
      "AI-optimized content generation tuned for chunkability and authority signals",
      "GEO Signals scoring + brand fact sheet to reduce hallucinations",
    ],
    relatedPages: [
      { label: "Run citation checks", href: "/citations" },
      { label: "Generate optimized content", href: "/content" },
      { label: "AI Visibility checklist", href: "/ai-visibility" },
    ],
  },
  {
    id: "aeo",
    code: "AEO",
    name: "Answer Engine Optimization",
    definition:
      "Optimizing for systems that give direct answers — Reddit threads, Quora answers, Wikipedia summaries, FAQ snippets — that AI engines often quote verbatim.",
    whyItMatters:
      "Users want answers, not link lists. Answer Engines (and AI summaries built on them) decide what gets surfaced based on signals like discussion engagement, structured FAQs, and authoritative sources. AEO captures attention before users ever reach a search results page.",
    howVentureCiteCovers: [
      "Reddit + Quora outreach campaign tooling",
      "FAQ Manager to author + optimize FAQs that AI engines extract verbatim",
      "Listicle scanner to find third-party listicles where you should be featured",
    ],
    relatedPages: [
      { label: "Community outreach", href: "/community" },
      { label: "FAQ Manager", href: "/faq-manager" },
      { label: "GEO Opportunities", href: "/geo-opportunities" },
    ],
  },
  {
    id: "seo",
    code: "SEO",
    name: "Search Engine Optimization",
    definition:
      "Traditional Google/Bing ranking — keywords, backlinks, page speed, content quality, mobile usability — the foundation that GEO and AEO build on.",
    whyItMatters:
      "AI engines crawl the same web SEO has always served. A site that ranks well for SEO is the same site that becomes citation-eligible for AI engines. SEO isn't dying — it's the foundation that GEO/AEO sit on top of.",
    howVentureCiteCovers: [
      "Crawler Check confirms AI crawlers (GPTBot, ClaudeBot, PerplexityBot) are allowed",
      "Schema markup recommendations boost both Google rich-results and AI parsability",
      "Keyword Research surfaces queries AI engines actually answer",
    ],
    relatedPages: [
      { label: "Crawler Check", href: "/crawler-check" },
      { label: "Keyword Research", href: "/keyword-research" },
    ],
  },
] as const;

export default function GlossaryPage() {
  // Inline title + meta tag setter — matches the existing per-page
  // pattern in this codebase (no React Helmet dependency).
  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;
    const ensureMeta = (name: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      const prev = el.getAttribute("content");
      el.setAttribute("content", content);
      return () => {
        if (prev === null) {
          el?.remove();
        } else {
          el?.setAttribute("content", prev);
        }
      };
    };
    const restoreDescription = ensureMeta("description", META_DESCRIPTION);
    return () => {
      document.title = prevTitle;
      restoreDescription();
    };
  }, []);

  // JSON-LD DefinedTermSet — gives both AI engines (deliciously meta) and
  // Google's structured-data parser a clean machine-readable definition.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: "GEO vs AEO vs SEO Glossary",
    hasDefinedTerm: TERMS.map((t) => ({
      "@type": "DefinedTerm",
      "@id": `#${t.id}`,
      name: t.name,
      description: t.definition,
      termCode: t.code,
    })),
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      {/* JSON-LD schema for AI engines + Google rich-results */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight">GEO vs AEO vs SEO</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Three optimization disciplines for the AI-first web. They layer — they don't compete.
        </p>
      </header>

      {TERMS.map((term) => (
        <section
          key={term.id}
          id={term.id}
          // scroll-mt-16 ensures anchor jumps don't hide the heading under
          // any sticky header that might exist later.
          className="mb-12 scroll-mt-16"
        >
          <div className="flex items-baseline gap-3 mb-4">
            <h2 className="text-2xl font-semibold">{term.code}</h2>
            <span className="text-lg text-muted-foreground">{term.name}</span>
          </div>

          <p className="text-foreground mb-3">{term.definition}</p>

          <h3 className="text-sm font-semibold mt-6 mb-2">Why it matters</h3>
          <p className="text-sm text-muted-foreground">{term.whyItMatters}</p>

          <h3 className="text-sm font-semibold mt-6 mb-2">How VentureCite covers it</h3>
          <ul className="space-y-1.5 text-sm text-muted-foreground list-disc list-inside">
            {term.howVentureCiteCovers.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h3 className="text-sm font-semibold mt-6 mb-2">Related pages</h3>
          <ul className="space-y-1">
            {term.relatedPages.map((p) => (
              <li key={p.href}>
                <Link href={p.href}>
                  <a className="inline-flex items-center text-sm text-primary hover:underline">
                    {p.label} <ArrowRight className="h-3 w-3 ml-1" />
                  </a>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-3">How they layer</h2>
          <p className="text-sm text-muted-foreground">
            Think of SEO as the foundation that determines whether your content can be found at all,
            AEO as the discipline of being chosen as the canonical answer in answer-engine surfaces,
            and GEO as the layer that determines whether AI assistants cite you when they're
            generating responses for users. Doing all three well compounds — neither replaces the
            others.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Register the public route in `client/src/App.tsx`**

Read `client/src/App.tsx` to understand the route structure. Find where public routes (without `<AuthenticatedRoute>` wrapper) are registered — likely near `/landing`, `/login`, `/pricing`, `/privacy`.

Add the import at the top:
```ts
import GlossaryPage from "@/pages/glossary";
```

Add a new route alongside the existing public routes:
```tsx
<Route path="/glossary" component={GlossaryPage} />
```

(Adapt to whatever pattern the file already uses — `<Route>` with `component`, `<Switch>` block, etc.)

- [ ] **Step 3: Run typecheck**

```
npm run check
```

Expected: clean.

- [ ] **Step 4: Manual smoke test**

`npm run dev`. Open `http://localhost:5000/glossary` (no auth). Confirm:
- Page renders with three sections (GEO, AEO, SEO)
- Each section has a heading, definition, "Why it matters," "How VentureCite covers it," "Related pages"
- Anchor links work: `/glossary#geo`, `/glossary#aeo`, `/glossary#seo`
- Open DevTools → Elements → search for `application/ld+json` → confirm the JSON-LD block is in the DOM
- View source / DevTools → confirm `<title>` is "GEO vs AEO vs SEO — VentureCite Glossary"
- Click a "Related pages" link while logged in → navigates to that page
- Click a "Related pages" link while NOT logged in → either redirects to login (existing auth behavior) or shows public version, whichever your router does

- [ ] **Step 5: Verify diff**

```
git diff client/src/App.tsx
git status --short client/src/pages/glossary.tsx
```

Confirm: App.tsx has only the new import + new public Route line. glossary.tsx is a new untracked file.

---

## PR 2.4 — Sidebar reorder (~2 hours)

### Task 4: Reorder NAV_* arrays into Setup/Create/Measure/Grow/Optimize

**Files:**
- Modify: `client/src/components/Sidebar.tsx` (lines 39-70 + section labels)

**Why:** Communicates the recommended user-journey order at a glance. No URL changes — only the sidebar grouping shifts.

- [ ] **Step 1: Read the current `Sidebar.tsx` lines 39-70 + the render block** (where each NAV_* is rendered with a `<SectionLabel>`).

- [ ] **Step 2: Replace the NAV_* arrays**

In `client/src/components/Sidebar.tsx`, find the existing 5 arrays (`NAV_MAIN`, `NAV_TOOLS`, `NAV_ANALYTICS`, `NAV_GROWTH`, `NAV_OPTIMIZE`) and replace with the new workflow-order arrays. Keep the variable names the same so the render block doesn't need updating — just change the content.

```ts
// Setup: brand identity + checklist before doing anything else.
const NAV_MAIN = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/brands", label: "Brands", icon: Building2 },
  { href: "/ai-visibility", label: "AI Visibility", icon: ScanEye },
];

// Create: produce the content that AI engines will eventually cite.
const NAV_TOOLS = [
  { href: "/content", label: "Content", icon: PenLine },
  { href: "/articles", label: "Articles", icon: FileText },
  { href: "/keyword-research", label: "Keywords", icon: Search },
];

// Measure: see what's working — the analytics that report citation outcomes.
const NAV_ANALYTICS = [
  { href: "/citations", label: "Citations", icon: Link2 },
  { href: "/geo-analytics", label: "GEO Analytics", icon: BarChart3 },
  { href: "/ai-intelligence", label: "AI Intelligence", icon: Brain },
  { href: "/client-reports", label: "Reports", icon: ClipboardList },
];

// Grow: outreach + competitive intel that compound citation growth.
const NAV_GROWTH = [
  { href: "/community", label: "Community", icon: Users },
  { href: "/opportunities", label: "Opportunities", icon: Lightbulb },
  { href: "/competitors", label: "Competitors", icon: Swords },
];

// Optimize: dial-in technical signals that boost citation quality.
const NAV_OPTIMIZE = [
  { href: "/geo-tools", label: "GEO Tools", icon: Wrench },
  { href: "/geo-signals", label: "Signals", icon: Radio },
  { href: "/crawler-check", label: "Crawler Check", icon: Bug },
  { href: "/faq-manager", label: "FAQ Manager", icon: HelpCircle },
  { href: "/brand-fact-sheet", label: "Fact Sheet", icon: Shield },
];
```

(If the imports for icons need adjusting because some moved categories — e.g., `ScanEye` was already imported, so no change. `FileText` was already imported. Verify by reading the existing imports at the top of the file.)

- [ ] **Step 3: Update the section labels in the render block**

Find the rendering JSX where each NAV_* is rendered alongside a `<SectionLabel label="..." />` (or similar). Update labels:

| Variable | Old label | New label |
|---|---|---|
| `NAV_MAIN` | (whatever it was) | `"Setup"` |
| `NAV_TOOLS` | `"Tools"` | `"Create"` |
| `NAV_ANALYTICS` | `"Analytics"` | `"Measure"` |
| `NAV_GROWTH` | `"Growth"` | `"Grow"` |
| `NAV_OPTIMIZE` | `"Optimize"` | `"Optimize"` (unchanged) |

Read the existing render block to confirm the exact label strings being used today, then update them.

- [ ] **Step 4: Run typecheck**

```
npm run check
```

Expected: clean. The `Sidebar.tsx` only changes the contents of the arrays + label strings — no API change.

- [ ] **Step 5: Manual smoke test**

`npm run dev`. Open the sidebar. Confirm:
- Section order: Setup → Create → Measure → Grow → Optimize
- Items in each section match the new arrays
- Active-item highlighting works (click "Citations" — should highlight under "Measure")
- Mobile (DevTools 375px): sidebar collapses to hamburger correctly
- Click each item → navigates to the correct page (no broken URLs since we didn't change any `href`)

- [ ] **Step 6: Verify diff**

```
git diff client/src/components/Sidebar.tsx
```

Confirm: only the array contents + label strings changed. No imports added/removed unnecessarily, no render-block restructuring.

---

## Final verification

### Task 5: End-to-end Phase 2 verification

- [ ] **Step 1: Full type + test + lint pass**

```
npm run check
npm test
npx eslint server/ client/src/ 2>&1 | tail -3
```

Expected:
- typecheck clean
- 244 tests still passing (no new tests in Phase 2)
- 0 eslint errors. Warning count may have grown by a few; that's fine.

- [ ] **Step 2: Manual smoke test through 5 representative pages + glossary**

`npm run dev`. Walk through:

1. `/dashboard` — (i) icon next to "AI Visibility Report" title (or whatever the page renders); click → popover with summary + expectedOutcome
2. `/citations` — (i) icon → popover with prerequisites + expectedOutcome + GEO badge
3. `/community` — (i) icon → popover with AEO badge in footer
4. `/glossary` (no auth) — three term sections render, anchor links work, JSON-LD in DOM
5. Sidebar — sections labeled "Setup / Create / Measure / Grow / Optimize"; active highlight follows current page

Mobile (375px):
- Each (i) popover fits screen without overflow
- Glossary page text readable at 375px wide

- [ ] **Step 3: Verify diff footprint**

```
git diff --stat client/ 2>&1 | tail -40
git status --short | grep -E "pageExplainers|GeoConceptBadge|glossary"
```

Expected files in tracked diff (Phase 2 only):
- `client/src/components/PageHeader.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/App.tsx`
- 26 page files (each with one prop addition)

Expected new (untracked) files:
- `client/src/components/GeoConceptBadge.tsx`
- `client/src/lib/pageExplainers.ts`
- `client/src/pages/glossary.tsx`

- [ ] **Step 4: Report Phase 2 complete**

Summarize what changed: every authenticated page has an explainer popover, public glossary at `/glossary`, sidebar reordered into workflow sequence. No tests added (layout-only). 244 tests still passing. Bundle delta ~+13 KB.

---

## What this plan does NOT do

Per the spec's "Out of scope" section, Phase 2 deliberately does not:

- Add explainer entries for the 4 non-PageHeader pages (`agent-run`, `pricing`, `privacy`, `welcome`) — they're not in the daily-use authenticated surface
- Add SSR / pre-rendering for the glossary page — Vite SPA + JSON-LD is sufficient for SEO at this stage
- Add `react-helmet` or similar — codebase pattern is inline `document.title` setters, kept consistent
- Build a search/autocomplete on the glossary — 3 terms doesn't need it
- Add additional concept badges beyond GEO/AEO/SEO (e.g., LLM, RAG, schema.org) — out of scope; can add later if useful
- Modify the chatbot system prompt to import `pageExplainers` — that's Phase 5
- Modify empty states to fall back to `pageExplainers[page].expectedOutcome` — that's Phase 6

These appear in the relevant later phase plans.

---

## Vercel Hobby compatibility

- Zero server changes. Glossary is a public route in the existing SPA bundle, served by the same single function. No new endpoint, no new env var, no new cron, no new dependency. Function size unchanged. Bundle delta ~+13 KB.
- Per-request cost: ~0. Glossary is static rendering; explainer popovers are pure client-side.
- DB usage: zero impact (no schema changes, no new queries).
