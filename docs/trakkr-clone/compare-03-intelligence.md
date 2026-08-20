# Compare 03 — Intelligence and analysis

Feature inventory of the venturecite intelligence slice. Then a map to Trakkr.

Every statement comes from the code. File and line references follow each claim.
No `.md` file in this repo was used as a source.

Files read in full:

- `server/routes/intelligence.ts`, `server/routes/geoSignals.ts`, `server/routes/factSheet.ts`,
  `server/routes/factSheetV2.ts`, `server/routes/assistant.ts`, `server/citationChecker.ts`,
  `server/citationJudge.ts`
- `client/src/pages/`: `diagnose.tsx`, `perception.tsx`, `competitors.tsx`, `citations.tsx`,
  `brand-fact-sheet.tsx`, `geo-signals.tsx`, `geo-tools.tsx`, `site-health.tsx`,
  `crawler-check.tsx`, `keyword-research.tsx`, `glossary.tsx`, `faq-manager.tsx`
- Support files needed to quote the arithmetic: `server/lib/visibilityMetrics.ts`,
  `server/lib/perceptionScorer.ts`, `server/lib/responseAnalyzer.ts`,
  `server/lib/crawlerAccess.ts`, `server/lib/hallucinationDetector.ts`,
  `shared/siteHealthFindings.ts`, `server/routes/dashboard.ts`,
  `server/routes/analytics.ts`, `server/routes/publications.ts`,
  `server/databaseStorage.ts`

---

## 1. HTTP routes

### 1.1 `server/routes/intelligence.ts`

| Method | Path | Returns | Tables |
|---|---|---|---|
| GET | `/api/citation-quality` | `{success, data: CitationQuality[]}`. Filters `aiPlatform`, `minScore`. Without `brandId` it reads all rows, then filters by the user's brand ids. | `citation_quality` |
| GET | `/api/citation-quality/stats/:brandId` | `{success, data: stats}` | `citation_quality` |
| POST | `/api/citation-quality` | Created row. `brandId` required. | `citation_quality` |
| PATCH | `/api/citation-quality/:id` | Updated row, 404 on miss | `citation_quality` |
| DELETE | `/api/citation-quality/:id` | `{success}` | `citation_quality` |
| GET | `/api/hallucinations` | `{success, data}`. `brandId` is required — a 400 comes back without it. | `brand_hallucinations` |
| GET | `/api/hallucinations/stats/:brandId` | `{success, data: stats}` | `brand_hallucinations` |
| POST | `/api/hallucinations` | Created row | `brand_hallucinations` |
| PATCH | `/api/hallucinations/:id` | Updated row. Strict Zod. Status changes go through `assertTransition`; an illegal move returns 409. | `brand_hallucinations` |
| POST | `/api/hallucinations/:id/resolve` | Resolved row, 409 if already terminal | `brand_hallucinations` |
| DELETE | `/api/hallucinations/:id` | `{success}` | `brand_hallucinations` |
| GET | `/api/brand-facts/:brandId` | `{success, data: facts}` | `brand_fact_sheet` |
| POST | `/api/brand-facts` | Created fact. Forced `source:"user_manual"`, `userOverridden:true`. | `brand_fact_sheet` |
| PATCH | `/api/brand-facts/:id` | Updated fact | `brand_fact_sheet` |
| DELETE | `/api/brand-facts/:id` | `{success}` | `brand_fact_sheet` |
| GET | `/api/metrics-history/:brandId` | `{success, data}`. `metricType`, `days` (default 30). | `metrics_history` |
| POST | `/api/metrics-history/record/:brandId` | `{success, message}` | `metrics_history` |

The manual-fact write is deliberate:

```ts
// server/routes/intelligence.ts:332-337
const fact = await storage.createBrandFact({
  ...body,
  source: "user_manual",
  userOverridden: true,
} as any);
```

### 1.2 `server/routes/geoSignals.ts`

| Method | Path | Returns | Tables |
|---|---|---|---|
| POST | `/api/geo-signals/analyze` | `{signals[], overallScore, termCoverageRatio, questionHeadingFraction, wordCount}` | reads `schema_audits`, `articles`; writes `geo_signal_runs` |
| POST | `/api/geo-signals/chunk-analysis` | `{chunks[], stats}` | none |
| POST | `/api/geo-signals/optimize-chunks` | `{optimizedContent}`. 502 on empty LLM output. | none |
| POST | `/api/geo-signals/schema-audit` | `{url, fetched, fetchError, fetchStatus, schemas[], additionalTypes[], totalSchemasFound, cachedAt}` | `schema_audits` (7-day cache, `force:true` bypasses) |
| POST | `/api/geo-signals/pipeline-simulation` | `{stages[], query}` | none |

All five sit behind `aiLimitMiddleware`. Content is capped by `MAX_CONTENT_LENGTH`;
`targetQuery` is capped at 500 characters (`geoSignals.ts:42`).

### 1.3 `server/routes/factSheet.ts` (fact sheet v1 surface)

| Method | Path | Returns | Tables |
|---|---|---|---|
| GET | `/api/brand-fact-sheet/runs?brandId=&limit=` | `{success, runs}` (limit 1..50, default 10) | `brand_fact_scrape_runs` |
| GET | `/api/brand-fact-sheet/runs/latest-completed?brandId=` | `{success, run\|null}` | same |
| GET | `/api/brand-fact-sheet/runs/:runId` | `{success, run, pages}` | runs + `brand_fact_scrape_pages` |
| POST | `/api/brand-fact-sheet/runs/:runId/cancel` | `{success}`; 409 `already_terminal` or `status_changed` | runs (compare-and-set) |
| GET | `/api/brand-fact-sheet/runs/:runId/stream` | SSE: `plan`, `page`, `fact`, `source-update`, `progress`, `error`, `done`, `slice_pending` | runs, pages, facts, `fact_scrape_logs` |
| POST | `/api/brand-fact-sheet/facts/:factId/accept` | `{success, fact}` | `brand_fact_sheet` |
| POST | `/api/brand-fact-sheet/facts/:factId/dismiss` | `{success, fact}` | `brand_fact_sheet` |
| POST | `/api/brand-fact-sheet/facts/bulk-accept` | `{success, affected}` | `brand_fact_sheet` |
| GET | `/api/brand-fact-sheet/diff?brandId=` | `{success, conflicts}` grouped by domain | `brand_fact_sheet` |
| GET | `/api/brand-fact-sheet/cost-status?brandId=` | `{factScrapeCents, monthlyCapCents}` (default cap 500 = $5.00) | `monthly_cost_caps` |
| PATCH | `/api/brands/:brandId/fact-scrape-enabled` | `{success, factScrapeEnabled}` | `brands` |

The SSE loop has a 15 s heartbeat, a 500 ms tick, and a slice budget. It resumes from a
cursor of the form `<lastPageId>:<lastFactId>` (`factSheet.ts:672-681`).

### 1.4 `server/routes/factSheetV2.ts` (fact sheet v2 pipeline)

| Method | Path | Returns | Tables |
|---|---|---|---|
| POST | `/api/brand-fact-sheet/plan` | `{success, runId, pages[]}`; 409 with `already_running` / `cooldown` / cost-cap codes | creates run + page rows |
| POST | `/api/brand-fact-sheet/scrape-one` | `{status, factCount, canonicalRedirect, discoveredUrls, diagnostics}` | pages, facts, run counters, `fact_scrape_logs` |
| POST | `/api/brand-fact-sheet/search-llm` | `{status, factCount, errorKind, diagnostics}` | facts, logs |
| POST | `/api/brand-fact-sheet/user-enrich` | `{status, factCount, diagnostics}` | facts (source `user`), logs |
| POST | `/api/brand-fact-sheet/aggregate` | `{status, errorKind, totalFacts, disagreementsIncremented}` | facts |
| POST | `/api/brand-fact-sheet/full-rescrape` | `{success}`; server runs the whole pipeline through `waitUntil` | all of the above |
| POST | `/api/brand-fact-sheet/runs/:runId/paste` | `{status, factCount, diagnostics}` for pasted text up to 50 000 chars | facts, logs |

### 1.5 `server/routes/assistant.ts`

| Method | Path | Returns | Tables |
|---|---|---|---|
| GET | `/api/assistant/threads` | up to 50 threads | `chatbot_threads` |
| POST | `/api/assistant/threads` | new thread | `chatbot_threads` |
| GET | `/api/assistant/threads/:threadId/messages` | up to 200 messages | `chatbot_messages` |
| DELETE | `/api/assistant/threads/:threadId` | soft archive | `chatbot_threads` |
| POST | `/api/assistant/threads/:threadId/restore` | un-archive | `chatbot_threads` |
| POST | `/api/assistant/chat` | SSE stream of `{type:"delta"}`, then `{type:"done"}` | messages, `api_costs` |

The chat route builds a brand-context block before it streams:

```ts
// server/routes/assistant.ts:265-272
brandContextBlock = `[Current user's brand]
Name: ${brand.name}
Industry: ${brand.industry ?? "(not set)"}
Articles: ${articles.length > 0 ? "yes" : "0"}
Citation runs in last 30 days: ${recentRuns.length}
Latest citation rate: ${rate !== null ? rate + "%" : "no completed runs yet"}
```

History is limited to 11 messages of the same thread. Budget is enforced first; over budget
returns 429 with `code:"budget_exceeded"`.

---

## 2. How citations are found, checked and judged

### 2.1 Find

`runBrandPrompts` queries each stored prompt against each platform.
Six platforms are the default:

```ts
// server/citationChecker.ts:50-57
export const DEFAULT_CITATION_PLATFORMS = [
  "ChatGPT",
  "Perplexity",
  "DeepSeek",
  "Claude",
  "Gemini",
  "Grok",
] as const;
```

ChatGPT uses the OpenAI client. The other five go through OpenRouter. Models that do not
ground natively get a web-search plugin:

```ts
// server/citationChecker.ts:265-268
const OPENROUTER_WEB_SEARCH_PLUGIN = {
  id: "web" as const,
  max_results: 5,
};
```

The system message is neutral on purpose, and temperature is pinned to 0 where allowed:

```ts
// server/citationChecker.ts:307-308
const systemMsg =
  "Answer the question helpfully, accurately, and naturally - exactly as you would for any user.";
```

Source URLs come from two places — a top-level `citations` array and message
`annotations` (`citationChecker.ts:229-248`). The pair runs at concurrency 5
(`citationChecker.ts:606`).

### 2.2 Check — the matcher is authoritative

The string matcher decides `isCited`. The LLM judge only enriches:

```ts
// server/citationChecker.ts:873-876
const isCited = matcherBrandMatched;
const rank = isCited && analyzerCited ? (brandVerdict?.rank ?? null) : null;
const relevance = isCited && analyzerCited ? (brandVerdict?.relevance ?? null) : null;
const brandSentiment = deriveSentiment(relevance, isCited);
```

If the judge call throws, the row still records a citation:

```ts
// server/citationChecker.ts:160-166
return {
  isCited: true,
  rank: null,
  relevance: null,
  reasoning: `Judge unreachable: ${msg}`,
};
```

### 2.3 Judge — the exact logic

`server/citationJudge.ts` uses `gpt-4o-mini`, temperature 0, `json_object`, 200 max tokens.
The system prompt in full:

```ts
// server/citationJudge.ts:70-79
const systemMsg = `You are a precise citation judge. You decide whether an AI-generated response cites a specific brand/company.

A "citation" means the response explicitly refers to THIS brand - by its name, a known variation, its website/domain, or an unambiguous description. Generic English words that happen to overlap with the brand name do NOT count (e.g., "venture capital" is not a citation of a brand called "Venture PR"). Industry-generic terms (e.g., "PR agency", "CRM software") do NOT count unless the specific brand is named.

Return JSON only, exactly in this shape:
{"cited": boolean, "rank": number | null, "relevance": number, "reasoning": "short sentence"}

"rank" is the 1-indexed position of the brand's first mention inside an ordered/numbered list or ranked recommendation in the response. If the brand is mentioned but not inside such a list, return null.

"relevance" is 0-100 - how directly the response answers the user's underlying question overall (independent of whether the brand was cited). 100 = fully answers, 50 = partially answers, 0 = off-topic.`;
```

Verdict coercion:

```ts
// server/citationJudge.ts:105-113
const cited = Boolean(parsed.cited);
const rank =
  typeof parsed.rank === "number" && parsed.rank > 0 ? Math.round(parsed.rank) : null;
const relevance =
  typeof parsed.relevance === "number"
    ? Math.max(0, Math.min(100, Math.round(parsed.relevance)))
    : null;
const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "";
return { cited, rank: cited ? rank : null, relevance, reasoning };
```

### 2.4 Source classification and authority

```ts
// server/citationChecker.ts:190-203
if (
  /(^|\.)reddit\.com$|(^|\.)quora\.com$|(^|\.)ycombinator\.com$|stackexchange\.com$|stackoverflow\.com$/.test(host)
) {
  return "community";
}
if (/(^|\.)wikipedia\.org$|(^|\.)britannica\.com$|\.gov$|\.edu$/.test(host)) {
  return "reference";
}
if (/(^|\.)youtube\.com$|youtu\.be$|vimeo\.com$|tiktok\.com$/.test(host)) {
  return "video";
}
return "web";
```

Authority score is a domain-frequency count, not an external metric:

```ts
// server/citationChecker.ts:220-221
const prior = domainOccurrenceMap.get(host) || 0;
return Math.min(100, prior * 10 + 10);
```

### 2.5 Run lifecycle and post-processing

`kickoffBrandPromptsRun` creates the `citation_runs` row and runs a 30 s slice
(`citationChecker.ts:1380`). The browser then polls `/advance`; each slice takes a
per-run advisory lock (`citationChecker.ts:1420-1430`). On finalize the code writes:
per-platform breakdown, competitor snapshots, a metrics snapshot, hallucination detection,
hallucination re-verification, and run-change alerts (`citationChecker.ts:1244-1299`).

Self-citation: any tracked BOFU or FAQ URL found in a response stamps
`lastCitedAt` and bumps `citation_runs.self_citation_count`, once per run per source
(`citationChecker.ts:827-843`).

Auto-discovery: brands the analyzer names but we do not track become competitors with
`discoveredBy:"citation_auto"`. It fires only when our own brand was cited, once per
(run, platform), capped at 10 per platform, and each candidate must survive a second
matcher pass and must not match our own brand (`citationChecker.ts:984-1060`).

---

## 3. Competitor data — gathering and ranking

### 3.1 Gathering

Three sources feed the competitor set.

1. Manual add. `POST /api/competitors` forces `tier:"core"`, `discoveredBy:"manual"`,
   `relevanceScore:null` (`publications.ts` create handler).
2. Server-side discovery. `POST /api/competitors/discover/:brandId`, run once on brand
   create and on demand from the Re-discover button (`competitors.tsx:233-243`).
3. Citation auto-discovery during a run, described in 2.5 above.

Per-response, each competitor that the matcher hits gets a `competitor_geo_rankings` row.
Absence of a row means not cited (`citationChecker.ts:918-963`).

### 3.2 Ranking arithmetic

The leaderboard counts cited rows in a window, default 30 days:

```ts
// server/databaseStorage.ts:1717
const since = opts?.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
```

Own-brand rows count `geo_rankings` where `is_cited = 1`, bucketed by platform:

```ts
// server/databaseStorage.ts:1794-1796
const bucket = perBrand.get(bId)!;
bucket[r.aiPlatform] = (bucket[r.aiPlatform] || 0) + 1;
```

Competitor rows count `competitor_geo_rankings` the same way, then merge rows that are the
same company. Share of voice and the sort:

```ts
// server/databaseStorage.ts:1864-1870
const totalAll = leaderboard.reduce((s, r) => s + r.totalCitations, 0);
for (const row of leaderboard) {
  row.shareOfVoice = totalAll > 0 ? Math.round((row.totalCitations / totalAll) * 1000) / 10 : 0;
}

return leaderboard.sort((a, b) => b.totalCitations - a.totalCitations);
```

Two important rules in that function. Counts come from **every** competitor row, but only
`core` rows are presented — otherwise product names such as "iPhone" rank as rival
companies. The discovered pool on the page sorts by relevance:

```ts
// client/src/pages/competitors.tsx:291-293
const discoveredCompetitors = competitors
  .filter((c) => c.tier !== "core")
  .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
```

The route also reports how many competitors have activity:

```ts
// server/routes/publications.ts:93
const withActivity = leaderboard.filter((r) => !r.isOwn && r.totalCitations > 0).length;
```

---

## 4. Perception and sentiment

### 4.1 Two different things

Row-level **sentiment** is derived from relevance. It is not a sentiment model:

```ts
// server/lib/responseAnalyzer.ts:222-231
export function deriveSentiment(
  relevance: number | null,
  cited: boolean,
): "positive" | "neutral" | "negative" | null {
  if (!cited) return null;
  if (relevance === null) return "neutral";
  if (relevance >= 70) return "positive";
  if (relevance >= 40) return "neutral";
  return "negative";
}
```

Brand-level **perception** is a separate LLM judge over stored answers.

### 4.2 Evidence gathering

Snippets are cut out of `geo_rankings.citation_context` after the delimiter
`||| RAW_RESPONSE |||`. A snippet under 80 characters is dropped. A snippet that never names
the brand is dropped. The rest are re-centred on the first brand mention:

```ts
// server/lib/perceptionScorer.ts:80-88
export function focusOnBrand(text: string, matcher: RegExp, window = MAX_SNIPPET_CHARS): string {
  const m = matcher.exec(text);
  if (!m || m.index === undefined) return text.slice(0, window);
  const centre = m.index;
  const half = Math.floor(window / 2);
  const start = Math.max(0, centre - half);
  return text.slice(start, start + window);
}
```

Snippets round-robin across platforms, capped at 40, so one chatty engine cannot fill the
sample (`perceptionScorer.ts:132-145`).

### 4.3 The judge rules

```ts
// server/lib/perceptionScorer.ts:264-280 (system message)
HARD RULES:
- Score ONLY from the supplied excerpts. Do NOT use outside knowledge about the brand and do NOT guess.
- If an axis cannot be judged from the evidence, return null for that axis. Do NOT default to a middling number (e.g. 50) when unsure.
- "praised" and "questioned" must be short noun phrases quoted or closely paraphrased FROM the excerpts - never invented.
```

Zero evidence means no LLM call at all; the result is all nulls
(`perceptionScorer.ts:242-256`).

### 4.4 The overall formula

```ts
// server/lib/perceptionScorer.ts:212-220
const values = PERCEPTION_AXES.map((axis) => axes[axis]).filter(
  (v): v is number => typeof v === "number",
);
if (values.length === 0) return null;
const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
return Math.round(mean * 10) / 10;
```

Null axes leave both the numerator and the denominator. They are never read as zero.

### 4.5 The related visibility formula

```ts
// server/lib/visibilityMetrics.ts (computeVisibilityScore)
if (cited <= 0) return 0;
const rate = citationRateFraction(cited, total);
const rankFactor = avgRank > 0 ? Math.max(0, 1 - (avgRank - 1) / 10) : 0.5;
const rankBlend = (1 + rankFactor) / 2;
const raw =
  avgAuthority === null
    ? 100 * rate * rankBlend
    : 70 * rate * rankBlend + 30 * (Math.max(0, avgAuthority) / 100);
return Math.min(100, Math.max(0, Math.round(raw)));
```

---

## 5. What "Diagnose" is in this codebase

`client/src/pages/diagnose.tsx` is 51 lines. It is a shell with three tabs. It is **not** a
per-question explainer.

```tsx
// client/src/pages/diagnose.tsx:19-49
<SpineShell
  defaultTab="hallucinations"
  tabs={[
    { value: "hallucinations", label: "Hallucinations", ... },
    { value: "signals",        label: "Signals",  Component: GeoSignals },
    { value: "crawler",        label: "Crawler",  Component: CrawlerCheck },
  ]}
/>
```

The file comment records that a Citation Quality tab was removed because the
`citation_quality` table is dead, and that an Issues tab was retired.

Step by step, the Hallucinations half works like this:

1. A citation run finishes. `detectHallucinationsForRun(brandId, allRankings)` runs
   (`citationChecker.ts:1282`).
2. The detector loads brand facts. Fewer than 3 active facts means it stops and reports
   `skipReason:"insufficient_facts"` (`hallucinationDetector.ts:20, 73-86`).
3. Manual facts and scraped facts go to the judge in two labelled blocks, up to 40 facts.
4. Each cited response, truncated to 8 000 characters, is judged at concurrency 5.
5. The judge returns
   `{"hallucinations":[{claimedStatement, contradictingFact, severity, category}]}`, with
   severity one of `low|medium|high|critical` (`hallucinationDetector.ts:29, 227`).
6. Rows upsert into `brand_hallucinations`. The unique index on
   `(brand_id, ai_platform, md5(claimed_statement))` prevents duplicates.
7. `reverifyHallucinationsForRun` closes findings whose claim no longer appears
   (`citationChecker.ts:1285`).
8. The user reads and resolves them through `/api/hallucinations*`.

The Signals tab is the GEO scorecard. The Crawler tab is the robots.txt check. Both are
described below.

---

## 6. What a fact sheet is — and v1 versus v2

A fact sheet is a table of structured claims about the brand: `domain`, `subcategory`,
`factKey`, `factValue`, `sourceUrl`, plus provenance and confidence. It is the source of
truth that hallucination detection compares AI answers against.

**v1 (`server/routes/factSheet.ts`) is the lifecycle and review surface.** It creates
nothing itself. It lists runs, reads one run, cancels a run, streams progress over SSE,
accepts or dismisses single facts, bulk-accepts one side of a conflict, returns the
user-versus-scraped diff, reports monthly spend against a $5.00 cap, and toggles scraping
per brand.

**v2 (`server/routes/factSheetV2.ts`) is the extraction engine.** It has five sources:

- `plan` — sitemap discovery plus tier scoring, then run and page rows.
- `scrape-one` — fetch one page through an SSRF-locked fetcher, honour robots, extract.
- `search-llm` — extract from a search-grounded LLM.
- `user-enrich` — extract from the brand profile the user already filled in.
- `paste` — extract from text the user pastes when scraping found nothing.
- `aggregate` — reconcile and count disagreements.
- `full-rescrape` — the server runs the whole chain in the background.

v2 also has the guards v1 lacks. Every entry point evaluates `evaluatePlanGuards` and can
return 409 with `already_running`, `cooldown`, or a cost-cap code
(`factSheetV2.ts:431-449, 535-552`). v2 uses two providers with failover: OpenAI direct as
primary, Claude through OpenRouter as secondary (`factSheetV2.ts:171-172`).

So: v1 is read, review and control. v2 is write and extract. They share the same tables
and the same page, `client/src/pages/brand-fact-sheet.tsx`.

---

## 7. Site Health and Crawler Check — every check

### 7.1 Crawler Check (`POST /api/check-crawler-permissions`)

It fetches `robots.txt` through an SSRF-safe helper, parses the blocks, and evaluates
**18 crawler agents**: GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-Web,
Claude-User, Claude-SearchBot, PerplexityBot, Perplexity-User, Googlebot, Google-Extended,
Bingbot, meta-externalagent, FacebookBot, Bytespider, Applebot, Applebot-Extended, CCBot
(`server/lib/crawlerAccess.ts:25-200`).

Each agent gets one of three states:

```ts
// server/lib/crawlerAccess.ts:328-355
if (!robotsTxtExists && !fetchError) { status: "allowed", reason: "No robots.txt found - all crawlers allowed by default" }
if (fetchError)                      { status: "unknown", reason: `Could not check: ${fetchError}` }
const result = isCrawlerBlocked(blocks, crawler.agent);
status: result.blocked ? "blocked" : "allowed"
```

Each agent also carries a `purpose` of `search`, `realtime` or `training`. The route
prioritises recommendations by that field, and marks the search line `CRITICAL:`
(`analytics.ts:104-124`).

The score:

```ts
// server/routes/analytics.ts:181
geoScore: Math.round((allowedCount / AI_CRAWLERS.length) * 100),
```

The page groups results by vendor, shows allowed / blocked / unknown counts, a progress bar,
per-bot accordion rows with reason and a copy-ready robots.txt rule, and the raw
`robots.txt` (`crawler-check.tsx:240-508`).

### 7.2 Site Health

Two things are measured. First, five discovery files, each tri-state:

```ts
// server/lib/crawlerAccess.ts:448-456
if (status === 429) return null;
if (status >= 200 && status < 300) return text.trim().length > 0;
if (status >= 400 && status < 500) return false; // explicit "not found"
return null; // 3xx, 5xx, or anything else we can't call a measurement
```

The five are `robots.txt`, `sitemap.xml`, `llms.txt`, `mcp.json`, `security.txt`.
`null` means unknown, not absent — the page draws a dash, not a grey dot
(`site-health.tsx:114-135`).

Second, the score:

```ts
// server/routes/dashboard.ts:548, 563-588
const DISCOVERY_WEIGHTS = { robotsTxt: 10, sitemapXml: 15, llmsTxt: 10 } as const;
...
if (pending) return null;
if (!website && !crawl) return null;
for (const key of ...) {
  const value = discovery[key];
  if (value === null || value === undefined) continue; // unknown - excluded, not zeroed
  attainable += DISCOVERY_WEIGHTS[key];
  if (value) earned += DISCOVERY_WEIGHTS[key];
}
attainable += 35;
earned += crawlers.total > 0 ? Math.round((crawlers.allowed / crawlers.total) * 35) : 0;
if (crawl) {
  attainable += 30;
  const denom = crawl.pagesFetched + crawl.pagesFailed;
  if (denom > 0) earned += Math.round((crawl.pagesFetched / denom) * 30);
}
if (attainable === 0) return null;
return Math.round((earned / attainable) * 100);
```

Per-page severity (`dashboard.ts:598-625`):

- `critical` — status ≥ 500, or no status with `failed`/an `errorKind`
- `high` — status 400–499
- `medium` — 2xx HTML page with zero extracted facts
- `low` — 2xx non-HTML page
- `ok` — anything else

The findings list (`shared/siteHealthFindings.ts`) turns those measurements into work items,
and it scales each point value by the share of the site affected:

```ts
// shared/siteHealthFindings.ts
const points = Math.round((crawlers.blocked / crawlers.total) * 35);   // blocked-ai-crawlers
const points = Math.round((failing.length / totalPages) * 30);          // failed-pages
const points = Math.round((thin.length / totalPages) * 30);             // thin-content
```

Full finding list: missing robots.txt (10), missing sitemap.xml (15), missing llms.txt (10),
blocked AI crawlers (scaled to 35), failed pages (scaled to 30), thin content (scaled to 30),
missing mcp.json (0, advisory), missing security.txt (0, advisory). Findings sort by points.
With no crawl at all the function returns `[]`.

A third, separate query adds content findings — meta tags, OG tags, headings, readability,
structured answer formats, FAQ content, content density — cached 6 hours and always
0-point/advisory (`site-health.tsx:269-279, 320-324`).

---

## 8. User-visible features, page by page

### 8.1 `diagnose.tsx`
Three tabs: Hallucinations, Signals, Crawler. Each carries a description line. No other UI.

### 8.2 `perception.tsx`
Header with brand name and "Last scored" date. A Re-score button that surfaces the 1-hour
cooldown as "Scored recently - try again in N min" on a 429. Four hero tiles: Perception
Score, Rank, Vs Average, 7-Day Change. Rank and Vs Average are hard-coded dashes with the
captions "No cross-account ranking data" and "No benchmark data available"
(`perception.tsx:377-390`). Praised and Questioned chips. Five category columns — Trust,
Quality, Value, Market, Innovation — each a number over a bar; a null axis shows a dash and
no bar. A 7-slot bar strip named Perception Over Time. An AI Model Breakdown grid of platform
cards, explicitly labelled as **citation** counts, not perception
(`perception.tsx:141-149`). Two distinct empty states: never scored, and scored with zero
evidence.

### 8.3 `competitors.tsx`
GEO Leaderboard panel with rank icons, own-brand badge, total citations, and up to three
platform badges per row. Re-discover and Add Competitor buttons. Tracked Competitors panel
with Core and Discovered tabs, each showing a count. Discovered rows carry an "N% match"
relevance badge. Each row expands to a lazy per-platform citation drill-down. Row actions:
promote, demote, edit, ignore (a permanent tombstone, only for non-manual rows), delete.
Add and Edit dialogs; the edit dialog takes comma-separated name variations. A full-width
Platform Breakdown panel showing the top three brands per platform. Live refresh during a
citation run; a 3-second discovery poll for brands under 2 minutes old.

### 8.4 `citations.tsx`
Three tabs — Prompts, Latest Results, History — addressable through `?ptab=` and persisted
in `localStorage` under `vc_citations_tab`. A live progress banner with a pulsing dot, a
percentage, a "cited / checks" count, a progress bar, and a "View live results" jump. Run
Check button with rotating loading messages naming each engine. An overflow menu holding
"Re-check stored responses", which re-applies detection to old runs and costs nothing. The
page drives the run forward itself: it polls `/citation-runs/state` every second and fires
`/citation-runs/:id/advance`, gated to one in-flight call (`citations.tsx:216-311`).

### 8.5 `brand-fact-sheet.tsx`
Scrape status panel: last-scraped time colour-coded (over 90 days is a warning), a pause
toggle, and a Re-scrape button with a tooltip giving the reason it is disabled. Auto-fires
from `?autoScrape=<brandId>`. Manual paste card, shown only when the latest completed run
found zero facts. A re-scrape blocked alert for cooldown and cost-cap. A per-page panel fed
by SSE while streaming and by the run-detail endpoint afterwards. A terminal failure state.
A Conflicts panel grouped by domain, with Use mine / Use AI / Keep both per pair, per-domain
bulk actions, and page-level "Keep all mine" / "Accept all AI". A Resolved facts list grouped
by domain with edit and dismiss. Add-fact and Edit-fact dialogs.

### 8.6 `geo-signals.tsx`
Three tabs: Signal Scorecard, Chunk Engineer, Schema Lab. Results are stored per
`${brandId}|${articleId}`, so switching article resets the cards. Every long call has a
Cancel button backed by an `AbortController`.

- **Signal Scorecard.** Article picker (includes drafts, with a status pill), a target-query
  combobox that lists tracked prompts, and an Analyze button. Renders an overall percentage
  with a bar, then seven signal rows with score/max, a bar, a `?` popover explaining the
  formula, and recommendations. Signals with `maxScore === 0` render separately, explaining
  why they could not be measured. A collapsible Pipeline breakdown — Prepare, Retrieve,
  Signal, Serve — with icons, per-stage scores out of 100 and detail lines.
- **Chunk Engineer.** Analyze Chunks and Auto-Optimize Chunks. Three stat tiles: Total
  Chunks, Extractable, Avg Tokens. A scrollable chunk list with badges for Has Heading,
  Question H2, Direct Answer, plus per-chunk issues. Optimized output with Copy and Apply to
  Article; Apply opens an LCS line diff dialog that falls back to a summary above 800 lines
  per side, and sends `expectedVersion` so a concurrent edit returns 409.
- **Schema Lab.** URL field auto-filled from the article's `externalUrl`. Audit and Re-audit
  (`force:true`). A success strip showing the fetched URL and the count of JSON-LD blocks, or
  a red failure banner naming the fetch error. Per-type cards with completeness percent,
  Populated, Missing required, Missing recommended. A "Show all 14 schema types" toggle. An
  "other schema types found" list.

### 8.7 `geo-tools.tsx`
Three summary cards — Listicles, Wikipedia, BOFU — and three tabs.

- **Listicles.** Add manually, Discover Opportunities. The discover toast reports Found,
  Inserted, Duplicates, Filtered, Re-verified, Lost inclusion, Failed. A filter by outreach
  status (All, New, Contacted, Won, Dropped) and a per-row status select. Rows show source
  publication, "Included at #N / M" or "Not in list", keyword, and competitors mentioned.
- **Wikipedia.** Add manually, Scan Opportunities. Two sections: "You're already mentioned"
  and "Pages you could target". Each opportunity row has a Draft mention button that opens a
  read-only NPOV draft dialog with notes and Copy.
- **BOFU.** Content type select (comparison, alternatives, guide), a competitor combobox with
  case-insensitive dedupe and freeform entry, a keyword field for guides, and a Generate
  button. A card list with content type, status, Published and "Cited recently" badges
  (within 30 days), opening a full-content sheet.

### 8.8 `site-health.tsx`
Header with brand, website link, and "Audited N days ago". Export button that writes a CSV of
findings and pages. A "Crawler access" link. Two stat tiles: Citation Readiness (n/100) and
Pages, where Pages prefers the sitemap URL count and captions the audited count. Two meta
tiles: Discovery (three tri-state rows) and Crawlers (allowed / blocked). A Top Priority
callout for the highest-point finding. A "What To Fix Next" list with category eyebrow,
affected paths, points or "advisory", and a bar sized relative to the top finding. Issue
groups by severity listing affected URLs. Distinct empty states for no website, pending
measurement, and never crawled.

### 8.9 `crawler-check.tsx`
URL input plus quick-check buttons for each brand that has a website. Four stat tiles: GEO
Access Score, Allowed, Blocked, Unknown; a progress bar. Alerts for "no robots.txt" and for a
fetch error. A recommendations panel where a line starting `CRITICAL:` gets a Top Priority
stripe and a Copy button when it contains a robots directive. An AI Crawler Details panel
grouped by vendor in a fixed order, each group showing a blocked count and an accordion per
bot with description, reason and a copyable rule. A raw robots.txt panel with Copy.

### 8.10 `keyword-research.tsx`
Filter select (All, Discovered, Targeted, Content Created), persisted as
`vc_keywords_filter`. "Discover Keywords with AI" with rotating loading messages, run as a
background LLM job through `runLlmJob`. A standing alert that every figure is AI-estimated,
repeated as a tooltip on each metric: "AI-estimated, not measured. We don't yet integrate a
real search-volume source." Per-keyword card with intent and category badges, four metrics
(Opportunity Score, AI Citation Potential, Search Volume, Difficulty), related keyword
badges, a Generate Content button that deep-links to `/content`, a suggested content-type
badge, and Delete.

### 8.11 `glossary.tsx`
A static page. Three terms — GEO, AEO, SEO — each with definition, "Why it matters", "How
VentureCite covers it", and related links. It emits a JSON-LD `DefinedTermSet`. Several of
its links point at routes that the shell has since folded into tabs.

### 8.12 `faq-manager.tsx`
Four stat panels: Total FAQs, Avg AI Score, Optimized (n/total), Categories. Four tabs.

- **Manage FAQs.** Add-new form with a seven-value category select. FAQ list with a category
  filter, a status dot keyed to `aiSurfaceScore` (≥80 success, ≥60 warn, else fail), inline
  edit, per-row optimize, delete, an "AI Score: N%" badge, an Optimized badge, and an
  optimization-tips block.
- **AI Generate.** Topic field, count select (3, 5, 10, 15), background job. The toast reports
  the real `report.inserted` and `mergedDuplicates`, and jumps to Manage on success.
- **Schema Markup.** Generates a Schema.org `FAQPage` JSON-LD from every FAQ, with Copy and
  four usage steps.
- **Bulk Optimize.** Three count tiles (80+, 60–79, under 60) and a list of every FAQ under 80,
  sorted ascending, each with an Optimize button.

---

## 9. Map to Trakkr

Trakkr sections read: 4.5 Diagnose, 4.6 Pages, 4.7 Citations, 4.8 Competitors,
4.9 Perception, 4.13 Site Optimization, 4.21 Agent.

| venturecite feature | Trakkr feature | Verdict | Exact difference |
|---|---|---|---|
| `/diagnose` shell: Hallucinations, Signals, Crawler | 4.5 Diagnose | **WEAKER** | Trakkr diagnoses **one question**: headline, summary, "What connects the dots", blockers, fixes, sources, methodology, and each fix becomes an action row. venturecite has no per-question report, no blockers list, no fixes-to-actions pipe. Its three tabs are unrelated diagnostics. |
| Hallucination detection against the fact sheet | — | **ABSENT IN TRAKKR** | Trakkr has Claims under Perception (4.9), which counts how many models made a claim. It does not compare a claim against a customer-owned fact sheet and flag a contradiction with severity. |
| GEO Signal Scorecard (7 signals, embeddings) | 4.5 Diagnose / 4.13 gate cards | **STRONGER on content, WEAKER on framing** | venturecite scores one article on real embeddings and a shrinking denominator. Trakkr scores the site, not a chosen article, and has no article-level scorecard. |
| Chunk Engineer + Auto-Optimize + Apply diff | — | **ABSENT IN TRAKKR** | No 500-token chunk view, no rewrite-and-diff-back flow in Trakkr. |
| Schema Lab (14 types, required/recommended) | 4.13 findings | **STRONGER** | Trakkr's Findings table is WORK/SEVERITY/PAGES/POINTS. It has no per-schema-type field-completeness audit. |
| Crawler Check (18 agents, robots.txt) | 4.11 Crawlers, and 4.13 gate cards | **WEAKER in kind** | Trakkr counts real bot hits from a host log drain, and needs a connector to work. venturecite reads robots.txt only — a permission check, never an observation. venturecite works with no connector; Trakkr's does not. |
| `/citations` (Prompts, Latest Results, History) | 4.7 Citations | **WEAKER** | Trakkr has four tabs — Sources, Queries, Videos, Outreach — with Domains/Pages/Feed sub-views and nine type filters. venturecite's Citations page is a run console, not a source explorer. It has no domain profile, no `?source=` deep link, no Videos, no Outreach. |
| `classifySourceType` (community/reference/video/web) | 4.7 type filters | **WEAKER** | Four buckets against Trakkr's nine (All, Citing, Gaps, Media, Social, Reviews, Institutional, PR, Other). |
| `computeAuthorityScore` | — | **ABSENT IN TRAKKR** | Not observed in Trakkr. It is also a weak metric here: a self-referential count of how often the domain appeared in our own history. |
| Self-citation stamping on BOFU and FAQ URLs | 4.6 Pages (CITED, LAST CITED) | **SAME idea, WEAKER surface** | Both record which of your own URLs got cited and when. Trakkr has a dedicated Pages route with `Measure now` and `Ask` per row. venturecite has no Pages route; the data surfaces only as a "Cited recently" badge in GEO Tools. |
| Competitor leaderboard | 4.8 Competitors | **WEAKER** | Trakkr columns are Number, COMPETITOR, MENTIONS, VISIBILITY, TREND, H2H, WIN RATE, with filters All/Threats/Rising/Model/Groups and three tabs (Competitors, Prompts, Matrix). venturecite has citations, platform breakdown and share-of-voice. No trend, no head-to-head, no win rate, no matrix, no threat/rising filters. |
| Competitor name variations, learned during a run | 4.8 Aliases | **SAME** | Both join surface forms to one company. Both offer automatic detection. venturecite learns variants inside the run loop and persists them; Trakkr shows an alias panel. |
| Core / Discovered tiers, ignore tombstone | — | **ABSENT IN TRAKKR** | Trakkr has Groups, which is a different idea. No curated-versus-discovered split and no false-positive tombstone was observed. |
| Perception: five axes, praised/questioned | 4.9 Perception | **WEAKER** | Same five axes: Trust, Quality, Value, Market, Innovation. Trakkr expands each into four sub-attributes with a FOCUS badge, and adds three more tabs (Competitors, Claims, Tracked) plus a Goals table with Achieved / Improving / Needs attention. venturecite has one flat set of five, no sub-attributes, no goals, no tabs. |
| Perception honesty rules (null axes, evidence-only) | 4.9 | **STRONGER** | venturecite refuses to score an axis it cannot judge and refuses to call the LLM with zero evidence. Trakkr's behaviour on thin evidence was not observed. |
| Site Health page and findings | 4.13 Site Optimization | **WEAKER** | Trakkr has six gate cards, three tabs (Findings, Pages, History) and a `Fix it for me` button into the Agent. venturecite has no gate cards, no tabs (the strip was removed), no History, and no agent hand-off. Points scaling and the findings sort match in spirit. |
| Site Health CSV export | 4.13 Export | **SAME** | Both export. venturecite's CSV deliberately omits the summary rows it shows on screen. |
| AI Assistant (`/api/assistant/*`) | 4.21 Agent | **WEAKER** | Both are threaded chat over your own brand data, streamed. Trakkr adds a memory panel ("What I know about this brand"), a connections panel, `Cmd+K` entry, `Ask` and `Fix it for me` deep links from other pages, and the agent creates action rows. venturecite has threads, archive, restore, and a five-line brand context block. Nothing links into it and it creates nothing. |
| Keyword Research | 4.12 Content ideas | **WEAKER and honest about it** | Trakkr's Idea table carries IDEA, SIGNAL, POTENTIAL, AI VOL and groups ideas under campaigns. venturecite's numbers are all LLM guesses and the page says so on every tooltip. |
| GEO Tools: Listicles, Wikipedia, BOFU | 4.7 Outreach, 4.12 Content | **PARTLY STRONGER** | Wikipedia monitoring with a drafted NPOV mention is absent in Trakkr. Listicle inclusion tracking with an outreach pipeline overlaps Trakkr's Outreach tab, but Trakkr's targets publishers that cite rivals and not you, which venturecite cannot compute. |
| FAQ Manager | — | **ABSENT IN TRAKKR** | No FAQ authoring, no `FAQPage` schema generator, no bulk optimize was observed in Trakkr. |
| Glossary | 4.24 Learn (`/learn`) | **WEAKER** | Trakkr ships 51 documentation pages. venturecite ships one page with three terms. |

---

## 10. Trakkr features in this area that venturecite does not have

1. **A real Diagnose report (4.5).** One question in, one explanation out: headline with score,
   best position, models that answered and confidence; a two-or-three-sentence summary; a
   "What connects the dots" section that joins weak signals; a blockers list; a fixes list;
   numbered sources; a methodology panel.
2. **Fixes that become work (4.5 → 4.2).** Every fix writes a row into `/actions`. venturecite
   has no action queue at all in this slice.
3. **Diagnose deep links.** `/diagnose?id=<uuid>` and `/diagnose?query=<text>&autoStart=true`.
   venturecite's diagnose tabs take no parameters.
4. **A Pages route (4.6).** Your own URLs, with CITED and LAST CITED columns, a `Measure now`
   button per row, and an `Ask` button per row. venturecite has scrape pages inside Site
   Health, which is a different list.
5. **The six-check model on each page (4.6).** Trakkr tells you which of six checks a page
   holds and which five it still needs.
6. **Citations Sources tab with Domains, Pages and Feed sub-views (4.7).**
7. **Nine citation type filters (4.7):** All, Citing, Gaps, Media, Social, Reviews,
   Institutional, PR, Other.
8. **A citation source profile route, `/citations?source=<domain>` (4.7).**
9. **Citations Queries tab (4.7)** — the search queries that produce citations, each with a
   `Create` button into the content writer.
10. **Citations Videos tab (4.7).** venturecite classifies a video source type but has no
    video surface.
11. **Citations Outreach tab (4.7)** — publishers that cite your rivals but not you, grouped by
    Publisher, Prompt or Competitor, with All/New/Contacted/Won status and a drafted pitch.
12. **Competitor VISIBILITY, TREND, H2H and WIN RATE columns (4.8).**
13. **Head-to-head duel as an inline row expansion (4.8).**
14. **Competitor Prompts and Matrix tabs (4.8).**
15. **Threats and Rising filters, and competitor Groups (4.8).**
16. **Perception sub-attributes (4.9)** — four per axis, with one carrying a FOCUS badge.
17. **Perception Claims tab (4.9)** — strengths and weaknesses with a count of how many models
    made each claim.
18. **Perception Competitors tab (4.9)** — perception measured against rivals.
19. **Perception Tracked tab and the Goals table (4.9)** with Achieved / Improving / Needs
    attention.
20. **Six gate cards on Site Optimization (4.13)**, including one card openly labelled
    "estimated, not observed".
21. **Site Optimization Pages and History tabs (4.13).** venturecite has no audit history.
22. **`Fix it for me` (4.13 → 4.21)** — send a finding to the agent.
23. **Search Console as a data source (4.13).** venturecite reads no Search Console data.
24. **Agent memory panel (4.21)** — "What I know about this brand".
25. **Agent connections panel (4.21).**
26. **`Cmd+K` Ask command into the agent (4.21).**
27. **Agent writes actions (4.21).** The Trakkr agent creates work; ours only answers.
28. **`Ask` buttons across the product (4.6, 4.13)** that land in the agent with context.

---

## 11. Things worth knowing before you copy either side

- venturecite's `citation_quality` table is described in `diagnose.tsx` as dead. Its routes
  still exist in `intelligence.ts`. Do not build on it.
- venturecite's authority score measures our own history, not the web. Trakkr's equivalent
  was not observed. Neither is a defensible authority metric today.
- The Trakkr document records two link shapes that its own router rejects,
  `?tab=head-to-head&rival=` and `?mode=prompts&model=`. Do not copy those.
- venturecite's Crawler Check and Trakkr's Crawlers page share a name and measure different
  things. One reads a permission file; the other reads a server log.
