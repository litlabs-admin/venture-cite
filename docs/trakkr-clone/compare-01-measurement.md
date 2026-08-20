# Compare 01 - the measurement core

Scope: `server/routes/prompts.ts`, `server/routes/dashboard.ts`, `server/routes/mentions.ts`,
`server/routes/analytics.ts`, `server/routes/llmJobs.ts`, plus the scoring and scanning libraries
they call. Client: `pages/ai-visibility.tsx`, `pages/monitor.tsx`, `pages/report.tsx`,
`pages/home.tsx`.

Every statement below comes from the code. No `.md` file was trusted.

---

## 1. HTTP routes

### 1.1 `server/routes/prompts.ts` (`setupPromptsRoutes`)

All routes call `requireUser` then `requireBrand(brandId, user.id)`. A miss gives 404.

| Method | Path | Returns | Tables |
|---|---|---|---|
| POST | `/api/brand-prompts/:brandId/generate` | the seeded tracked prompts; 409 if tracked prompts exist | reads/writes `brand_prompts`, writes `prompt_generations` |
| POST | `/api/brand-prompts/:brandId/reset` | fresh seeded prompts; needs `{confirm:true}` | archives then writes `brand_prompts` |
| GET | `/api/brand-prompts/:brandId/suggestions` | rows with `status='suggested'` | `brand_prompts` |
| POST | `/api/brand-prompts/:brandId/suggestions/refresh` | replaced suggestion set | `brand_prompts` |
| POST | `/api/brand-prompts/:brandId/suggestions/:suggestionId/accept` | `{mode:"added"\|"replaced"}` | `brand_prompts` |
| DELETE | `/api/brand-prompts/:brandId/suggestions/:suggestionId` | `{success}` | `brand_prompts` |
| POST | `/api/brand-prompts/:brandId/prompts` | the created prompt (201) | `brand_prompts` |
| POST | `/api/brand-prompts/:brandId/prompts/reorder` | the reordered list | `brand_prompts.order_index` |
| PATCH | `/api/brand-prompts/:brandId/prompts/:promptId` | the updated prompt | `brand_prompts` |
| DELETE | `/api/brand-prompts/:brandId/prompts/:promptId` | `{success}` | `brand_prompts` |
| GET | `/api/brand-prompts/:brandId/prompt-history` | per-prompt score, delta, sparkline, per-model rank | `brand_prompts`, `geo_rankings` |
| GET | `/api/brand-prompts/:brandId` | tracked prompts, or all when `?status=all` | `brand_prompts` |
| GET | `/api/visibility-progress/:brandId` | `{engineId: stepId[]}` | `visibility_progress` |
| POST | `/api/visibility-progress/:brandId` | `{success}` | `visibility_progress` |
| DELETE | `/api/visibility-progress/:brandId` | `{success}` | `visibility_progress` |
| POST | `/api/brand-prompts/:brandId/run` | `{runId, status:"running"}`; 409 `already_running` | writes `citation_runs`, then `geo_rankings` |
| GET | `/api/brand-prompts/:brandId/history` | run list, newest first, limit max 200 | `citation_runs` |
| GET | `/api/brands/:brandId/citation-runs/active` | active run rows | `citation_runs` |
| GET | `/api/brands/:brandId/citation-runs/state` | per-run progress, plus rankings after `?since=` | `citation_runs`, `geo_rankings` |
| POST | `/api/brands/:brandId/citation-runs/:runId/advance` | `{done, status}`, 30 s slice | `citation_runs`, `geo_rankings` |
| GET | `/api/brand-prompts/:brandId/run/:runId/details` | per-prompt x per-platform cells with raw response | `geo_rankings`, `brand_prompts` |
| POST | `/api/brand-prompts/:brandId/re-detect-all` | counts of changed rows; 60 s cooldown | `geo_rankings`, `listicles`, `wikipedia_mentions`, `competitors` |
| GET | `/api/brand-prompts/:brandId/generations` | prompt-generation log | `prompt_generations` |
| GET | `/api/brand-prompts/:brandId/results` | `{byPlatform, byPrompt, totalChecks, totalCited, citationRate}` | `brand_prompts`, `geo_rankings` |

The tracked prompt cap is 10.

```ts
// server/routes/prompts.ts:138
const TRACKED_PROMPTS_CAP = 10;
```

### 1.2 `server/routes/dashboard.ts` (`setupDashboardRoutes`)

Ownership uses a local helper, not `requireBrand`.

```ts
// server/routes/dashboard.ts:67
async function requireOwnedBrand(req: any) {
  const user = requireUser(req);
  const brand = await storage.getBrandById(req.params.brandId);
  if (!brand || brand.userId !== user.id) return null;
  return brand;
}
```

| Method | Path | Returns | Tables |
|---|---|---|---|
| GET | `/api/dashboard/hero/:brandId` | `visibilityScore`, `visibilityDelta`, `citedChecks`, `totalChecks`, `citationRate`, `lastScanAt` | `brand_prompts`, `geo_rankings`, `metrics_history` |
| GET | `/api/dashboard/rankings/:brandId` | per-platform card: rank, cited/total, score, strength label, snippet | `brand_prompts`, `geo_rankings` |
| GET | `/api/dashboard/cited-urls/:brandId` | up to 500 `(platform, prompt, url, citedAt)` rows | `geo_rankings` |
| GET | `/api/dashboard/gap-matrix/:brandId` | categories plus brand and competitor cells | `brand_prompts`, `geo_rankings`, `competitors`, `competitor_geo_rankings` |
| GET | `/api/dashboard/citation-trend/:brandId` | 8 Monday-anchored weekly buckets | `brand_prompts`, `geo_rankings` |
| GET | `/api/brands/:brandId/recommendations` | up to 5 ranked recommendations | `articles`, `brand_prompts`, `citation_runs`, `competitors`, `community_posts`, `faq_items`, `visibility_progress`, geo-signal summary |
| GET | `/api/brands/:brandId/alerts` | alert rows, limit 1..50 | `alert_history` |
| GET | `/api/dashboard/site-health/:brandId` | score, discovery flags, crawler counts, crawl stats, issue counts | `system_state`, `brand_fact_scrape_runs`, `brand_fact_scrape_pages`; network for robots and sitemap |
| GET | `/api/dashboard/site-health/:brandId/pages` | up to 200 pages with severity | `brand_fact_scrape_pages` |
| GET | `/api/dashboard/site-health/:brandId/content-findings` | content findings over up to 50 page URLs | `brand_fact_scrape_pages`, plus live page fetches |
| GET | `/api/dashboard/perception/:brandId` | latest run plus 7-point history | `brand_perception_runs` |
| POST | `/api/dashboard/perception/:brandId/run` | one scored run; 429 inside the cooldown | `brand_perception_runs`, `geo_rankings` |

Perception cooldown: `PERCEPTION_COOLDOWN_MS = 60 * 60 * 1000` (`dashboard.ts:181`).

### 1.3 `server/routes/mentions.ts` (`mentionsRouter`)

All routes use `isAuthenticated` plus `requireBrand` or `requireMentionOwnership`.

| Method | Path | Returns | Tables |
|---|---|---|---|
| GET | `/api/brand-mentions/alerts/:brandId` | 10 newest mentions | `brand_mentions` |
| GET | `/api/brand-mentions/scans/active` | active scan jobs for the user | `scan_jobs` |
| GET | `/api/brand-mentions/scans/last/:brandId` | last completed scan | `scan_jobs` |
| GET | `/api/brand-mentions/:brandId` | cursor page of mentions, `nextCursor`, `stats` | `brand_mentions` |
| POST | `/api/brand-mentions` | created mention (201), 409 on dedupe | `brands`, `brand_mentions` |
| PATCH | `/api/brand-mentions/:id` | `{ok:true}`, 409 on bad transition | `brand_mentions` |
| DELETE | `/api/brand-mentions/:id` | the deleted row, for undo | `brand_mentions` |
| POST | `/api/brand-mentions/bulk-delete` | `{deleted}`, max 100 ids | `brand_mentions` |
| POST | `/api/brand-mentions/delete-all/:brandId` | `{deleted}`; needs the typed brand name | `brand_mentions` |
| POST | `/api/brand-mentions/scans/:brandId` | `{scanId}` 202; 429 inside a 4 h cooldown | `scan_jobs`, then `brand_mentions` |
| GET | `/api/brand-mentions/scans/:scanId` | the scan job row | `scan_jobs` |
| PATCH | `/api/brand-mentions/brands/:brandId/monitor-mentions` | `{ok:true}` | `brands.monitor_mentions` |

Only two platforms exist.

```ts
// server/routes/mentions.ts:71
const PLATFORMS = ["reddit", "hackernews"] as const;
```

Status machine, with three terminal states:

```ts
// server/routes/mentions.ts:94
const ALLOWED_TRANSITIONS: Record<Status, readonly Status[]> = {
  new: ["acknowledged", "replied", "false_positive", "ignored"],
  acknowledged: ["replied", "false_positive", "ignored"],
  replied: [],
  false_positive: [],
  ignored: [],
};
```

### 1.4 `server/routes/analytics.ts` (`setupAnalyticsRoutes`)

| Method | Path | Returns | Tables |
|---|---|---|---|
| POST | `/api/check-crawler-permissions` | per-crawler verdicts, `geoScore`, robots.txt snippet | none; network fetch of robots.txt |
| GET | `/api/geo-analytics/:brandId` | visibility score, share of voice, sentiment, per-platform rows, leaderboard | `brands`, `articles`, `brand_prompts`, `geo_rankings`, `competitors`, `brand_mentions` |
| POST | `/api/analyze-sentiment` | `{sentiment, score, confidence, reasoning}` | none; OpenAI call |
| POST | `/api/geo-analytics/:brandId/snapshot` | the created snapshot | `brand_visibility_snapshots` |
| GET | `/api/geo-analytics/:brandId/history` | up to `?limit` snapshots, default 30 | `brand_visibility_snapshots` |
| GET | `/api/geo-opportunities/:brandId` | subreddits, content ideas, real citation shares per platform | `brands`, `brand_prompts`, `geo_rankings`, `articles` |
| GET | `/api/geo-opportunities` | static platform and subreddit tables | none |

### 1.5 `server/routes/llmJobs.ts` (`setupLlmJobsRoutes`)

| Method | Path | Returns | Tables |
|---|---|---|---|
| GET | `/api/llm-jobs/:jobId` | `{status, jobId, result \| errorKind}` | `llm_jobs` |
| GET | `/api/llm-jobs` | up to 50 recent jobs, no result blob | `llm_jobs` |

The ownership gate runs before `pollLlmJob`, because polling finalizes the job. Jobs with
`user_id = NULL` are admin only.

---

## 2. Every scoring formula, quoted

### 2.1 Canonical visibility score

```ts
// server/lib/visibilityMetrics.ts:44
export function computeVisibilityScore(
  cited: number,
  total: number,
  avgRank: number,
  avgAuthority: number | null,
): number {
  if (cited <= 0) return 0;
  const rate = citationRateFraction(cited, total);
  const rankFactor = avgRank > 0 ? Math.max(0, 1 - (avgRank - 1) / 10) : 0.5;
  const rankBlend = (1 + rankFactor) / 2;
  const raw =
    avgAuthority === null
      ? 100 * rate * rankBlend
      : 70 * rate * rankBlend + 30 * (Math.max(0, avgAuthority) / 100);
  return Math.min(100, Math.max(0, Math.round(raw)));
}
```

```ts
// server/lib/visibilityMetrics.ts:16
export function citationRateFraction(cited: number, total: number): number {
  return total > 0 ? cited / total : 0;
}
// server/lib/visibilityMetrics.ts:21
export function citationRatePct(cited: number, total: number): number {
  return total > 0 ? Math.round((cited / total) * 100) : 0;
}
```

This one function feeds the hero, the per-platform cards, and `/api/geo-analytics`.

### 2.2 Hero delta

```ts
// server/routes/dashboard.ts:673
const history = await storage.getMetricsHistory(brand.id, "visibility_score", 90);
let visibilityDelta = 0;
if (history.length >= 2) {
  const prior = Number(history[history.length - 2].metricValue);
  const currentRate = citationRatePct(citedChecks, totalChecks);
  if (!Number.isNaN(prior)) visibilityDelta = currentRate - prior;
}
```

The headline number is the composite score. The delta is a rate difference. The stored
`visibility_score` metric is in fact the run citation rate:

```ts
// server/lib/metricsSnapshot.ts:63
await storage.createMetricsSnapshot({
  brandId,
  metricType: "visibility_score",
  metricValue: runStats.citationRate.toFixed(2),
```

### 2.3 Platform strength label

```ts
// server/routes/dashboard.ts:759
const strengthLabel: "Weak" | "Moderate" | "Strong" =
  score >= 70 ? "Strong" : score >= 40 ? "Moderate" : "Weak";
```

### 2.4 Site health score

```ts
// server/routes/dashboard.ts:548
const DISCOVERY_WEIGHTS = { robotsTxt: 10, sitemapXml: 15, llmsTxt: 10 } as const;
```

```ts
// server/routes/dashboard.ts:566
  let earned = 0;
  let attainable = 0;

  for (const key of Object.keys(DISCOVERY_WEIGHTS) as (keyof typeof DISCOVERY_WEIGHTS)[]) {
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
    if (denom > 0) {
      earned += Math.round((crawl.pagesFetched / denom) * 30);
    }
  }

  if (attainable === 0) return null;
  return Math.round((earned / attainable) * 100);
```

A pending compute returns `null`, never a number.

### 2.5 Page severity

```ts
// server/routes/dashboard.ts:598
export function pageSeverity(page: {...}): "critical" | "high" | "medium" | "low" | "ok" {
  const sc = page.statusCode;
  if (
    (sc !== null && sc >= 500) ||
    (sc === null && (page.status === "failed" || page.errorKind !== null))
  ) {
    return "critical";
  }
  if (sc !== null && sc >= 400 && sc < 500) return "high";
  const isHtml = page.contentType === null || /html/i.test(page.contentType);
  if (sc !== null && sc >= 200 && sc < 300 && page.factCount === 0 && isHtml) return "medium";
```

### 2.6 Gap matrix cells and the gap threshold

```ts
// server/routes/dashboard.ts:956
const GAP_THRESHOLD = 2;
```

```ts
// server/routes/dashboard.ts:958
const b = cellCounts[c];
const state =
  b.total === 0
    ? "unknown"
    : b.cited === 0
      ? "no"
      : b.cited === b.total
        ? "yes"
        : "partial";
```

```ts
// server/routes/dashboard.ts:971
const brandBucket = brandCellCounts[c] ?? { cited: 0, total: 0 };
const diff = b.cited - brandBucket.cited;
cellDiffs[c] = diff;
if (diff >= GAP_THRESHOLD) gapCount += 1;
```

### 2.7 Weekly citation trend

```ts
// server/routes/dashboard.ts:1057
const series = Array.from(buckets.entries()).map(([weekStart, b]) => ({
  weekStart,
  cited: b.cited,
  total: b.total,
  citationRate: b.total > 0 ? Math.round((b.cited / b.total) * 100) : 0,
}));
```

Weeks are Monday-anchored in UTC (`dashboard.ts:1032`). Eight weeks are always seeded.

### 2.8 Share of voice

```ts
// server/routes/analytics.ts:374
const ownLeaderboardRow = leaderboard.find((entry) => entry.isOwn);
const brandSovCitations = ownLeaderboardRow?.totalCitations ?? brandTotalCitations;
const shareOfVoice =
  totalMarketCitations > 0
    ? Math.round((brandSovCitations / totalMarketCitations) * 1000) / 10
    : 0;
```

### 2.9 Overall AI visibility score on `/api/geo-analytics`

```ts
// server/routes/analytics.ts:388
const platformsWithData = Object.values(platformMetrics).filter(
  (p) => p.citations + p.mentions > 0,
);
const overallVisibilityScore =
  platformsWithData.length > 0 && brandTotalCitations > 0
    ? Math.round(
        platformsWithData.reduce((sum, p) => sum + p.visibilityScore, 0) /
          platformsWithData.length,
      )
    : 0;
```

`mentions` on a platform row means total checks, not brand mentions:

```ts
// server/routes/analytics.ts:286
const mentions = platformRankings.length;
```

`totalMentions` in the response is instead the row count of `brand_mentions`
(`analytics.ts:405`).

### 2.10 Sentiment score and label

```ts
// server/routes/analytics.ts:424
const sentimentScore =
  totalSentimentCount > 0
    ? Math.round(
        ((overallSentiment.positive - overallSentiment.negative) / totalSentimentCount) *
          100,
      ) / 100
    : 0;
```

```ts
// server/routes/analytics.ts:450
label:
  sentimentScore > 0.3 ? "Positive" : sentimentScore < -0.3 ? "Negative" : "Neutral",
```

Per-row sentiment comes from the relevance number:

```ts
// server/lib/responseAnalyzer.ts:222
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

### 2.11 Crawler GEO score

```ts
// server/routes/analytics.ts:194
geoScore: Math.round((allowedCount / AI_CRAWLERS.length) * 100),
```

### 2.12 Citation-share buckets on the opportunity finder

```ts
// server/routes/analytics.ts:837
const pct = (n: number) => (totalCited > 0 ? Math.round((n / totalCited) * 1000) / 10 : 0);
```

Domains bucket to `reddit`, `ownSite`, or `thirdParty` (`analytics.ts:830-836`). Per-platform
share overrides the static `citationShare` values (`analytics.ts:926-935`).

### 2.13 Authority score

```ts
// server/citationChecker.ts:209
export function computeAuthorityScore(
  citingOutletUrl: string | null,
  domainOccurrenceMap: Map<string, number>,
): number | null {
  ...
  const prior = domainOccurrenceMap.get(host) || 0;
  return Math.min(100, prior * 10 + 10);
}
```

The map counts prior cited rows for the same host. It is built once per run
(`citationChecker.ts:498-513`).

### 2.14 Per-prompt score, delta, and rank delta

```ts
// server/lib/promptScoreHistory.ts:121
const series = kept.map((b) => ({
  at: new Date(b.at).toISOString(),
  score: b.checks > 0 ? Math.round((b.cited / b.checks) * 100) : 0,
  cited: b.cited,
  checks: b.checks,
  rank: meanRank(b),
}));
const score = series.length ? series[series.length - 1].score : null;
const delta = series.length >= 2 ? score! - series[series.length - 2].score : null;
```

```ts
// server/lib/promptScoreHistory.ts:137
const rankDelta =
  rank !== null && prevRank !== null ? Math.round((rank - prevRank) * 10) / 10 : null;
```

A positive `rankDelta` means worse. Buckets key on `runId`, or on the calendar day for legacy
rows (`promptScoreHistory.ts:72`). Mean rank uses only real placements
(`promptScoreHistory.ts:83`, `:115`).

### 2.15 Perception axes

```ts
// server/lib/perceptionScorer.ts:218
export function computeOverall(axes: {...}): number | null {
  const values = PERCEPTION_AXES.map((axis) => axes[axis]).filter(
    (v): v is number => typeof v === "number",
  );
  if (values.length === 0) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.round(mean * 10) / 10;
}
```

Axes are `trust, quality, value, market, innovation`, each `0..100` with one decimal, or null.
Zero evidence returns all nulls and makes no LLM call (`perceptionScorer.ts:254`).

### 2.16 Mention tone (client)

```ts
// client/src/components/dashboard-panels/useDashboardData.ts:238
  return {
    positive,
    neutral,
    negative,
    total,
    score: total === 0 ? null : Math.round(((positive + neutral * 0.5) / total) * 100),
  };
```

### 2.17 Own rank on the leaderboard (client)

```ts
// client/src/components/dashboard-panels/useDashboardData.ts:56
const sorted = [...rows].sort((a, b) => b.shareOfVoice - a.shareOfVoice);
const ownIndex = sorted.findIndex((r) => r.isOwn);
```

`ownRank` is null when the brand has no leaderboard row.

### 2.18 Checklist progress (client)

```ts
// client/src/pages/ai-visibility.tsx:913
const getEngineProgress = (engine: AIEngine) => {
  const completed = (completedSteps[engine.id] || []).length;
  const total = engine.steps.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
```

The server denominator is a hardcoded constant:

```ts
// shared/constants.ts:83
export const VISIBILITY_CHECKLIST_TOTAL = 57;
```

### 2.19 Dead constant

`CITATION_SCORING` in `shared/constants.ts:46` (weights 40/30/30, multipliers 10/5/3) is no
longer read by any route in this slice. `computeVisibilityScore` replaced it.

---

## 3. AI models and providers

Registry: `server/lib/modelConfig.ts`.

```ts
// server/lib/modelConfig.ts:19
const OPENAI_MINI_SNAPSHOT = "gpt-4o-mini-2024-07-18";
// server/lib/modelConfig.ts:29
const ANALYSIS_MODEL = "openai/gpt-5.6-luna";
```

Citation engines. ChatGPT uses the direct OpenAI client. The other five use OpenRouter.

```ts
// server/lib/modelConfig.ts:132
export const CITATION_MODELS: Record<string, CitationModelConfig> = {
  ChatGPT: {
    client: "openai",
    model: "gpt-4o-mini-search-preview",
    ...
    supportsTemperature: false,
    webSearchTool: false,
  },
```

| Engine | Slug | Client | Web search | Temperature |
|---|---|---|---|---|
| ChatGPT | `gpt-4o-mini-search-preview` | OpenAI | native | rejected |
| Claude | `anthropic/claude-haiku-4.5` | OpenRouter | `plugins:[{id:"web",max_results:5}]` | 0 |
| Gemini | `google/gemini-3.1-flash-lite` | OpenRouter | plugin | 0 |
| Perplexity | `perplexity/sonar` | OpenRouter | native | 0 |
| DeepSeek | `deepseek/deepseek-v4-flash` | OpenRouter | plugin | 0 |
| Grok | `x-ai/grok-4.3` | OpenRouter | plugin | 0 |

Other model uses in this slice:

- Response analyzer: `MODELS.misc` = `gpt-4o-mini-2024-07-18`, OpenAI, JSON mode,
  `temperature: 0`, `max_tokens: 1400` (`responseAnalyzer.ts:25`, `:143`).
- Citation judge: literal `const JUDGE_MODEL = "gpt-4o-mini";` (`citationJudge.ts:15`), OpenAI.
- Perception scorer: `MODELS.misc`, OpenAI, `temperature: 0`, `max_tokens: 900`
  (`perceptionScorer.ts:273`).
- `/api/analyze-sentiment`: `MODELS.misc`, OpenAI, `max_tokens: 200` (`analytics.ts:508`).
- Prompt generation and suggestions: `MODELS.brandPromptGeneration` = `ANALYSIS_MODEL`, so
  OpenRouter (`promptGenerator.ts:250`, `suggestionGenerator.ts:129`).

The citation request body:

```ts
// server/citationChecker.ts:307
const systemMsg =
  "Answer the question helpfully, accurately, and naturally - exactly as you would for any user.";
```

`max_tokens: 3000` per engine call (`citationChecker.ts:346`).

---

## 4. How a run starts

There are four triggers.

**1. On demand.** `POST /api/brand-prompts/:brandId/run` calls `kickoffBrandPromptsRun`. The
route then drives the run in the background for 50 s.

```ts
// server/routes/prompts.ts:566
const driveRunId = result.runId;
const driveDeadlineMs = Date.now() + 50_000;
waitUntil(
  (async () => {
    ...
        const sliceDeadlineMs = Math.min(driveDeadlineMs, Date.now() + 12_000);
        const outcome = await advanceCitationRun(driveRunId, sliceDeadlineMs);
```

The kickoff itself runs a 30 s inline slice (`citationChecker.ts:1380`). Only one run per brand
can be active. A duplicate insert hits unique violation `23505` and returns 409 with the
existing `runId` (`citationChecker.ts:1346-1357`).

**2. Client polling.** The client polls `/citation-runs/state`, then calls
`POST /citation-runs/:runId/advance`. Each advance is a 30 s slice guarded by a per-run
advisory lock (`prompts.ts:743`, `citationChecker.ts:1420`).

**3. Weekly cron.** `runAutoCitationJob` runs hourly and gates per brand.

```ts
// server/scheduler.ts:188
const AUTO_CITATION_CRON = process.env.AUTO_CITATION_CRON || "0 * * * *";
```

```ts
// server/scheduler.ts:194
function isBrandDueForCitation(brand: { lastAutoCitationAt: Date | null }): boolean {
  if (!brand.lastAutoCitationAt) return true; // never run before
  const now = new Date();
  const daysSinceLast =
    (now.getTime() - brand.lastAutoCitationAt.getTime()) / (24 * 60 * 60 * 1000);
  return daysSinceLast >= 6; // at least ~1 week
}
```

Only brands whose owner is on a paying tier are selected (`scheduler.ts:208-214`). Cadence is
not user-configurable. The PATCH `/citation-schedule` route was removed (`prompts.ts:593-597`).
A truncated slice does not stamp `lastAutoCitationAt` (`scheduler.ts:285`).

**4. Mention scan.** `POST /api/brand-mentions/scans/:brandId` creates a `scan_jobs` row and
detaches `runMentionScan(job.id)` with `waitUntil` (`mentions.ts:427`). The manual cooldown is
4 h from the last completed manual scan (`mentions.ts:394`). The cron path is
`runMentionScanJob`, driven by the brand-activation sweep, which only scans brands with
`monitor_mentions` on (`scheduler.ts:418-449`).

Runner shape: all `(prompt x platform)` pairs go in one queue.

```ts
// server/citationChecker.ts:606
const CONCURRENCY = 5;
```

Resume skips pairs that already have a `geo_rankings` row for the run
(`citationChecker.ts:621-642`). Progress bumps fire every 5 tasks or every 1500 ms
(`citationChecker.ts:1118`). After the last slice the run writes competitor snapshots, metrics
history, hallucination detection, and run-change alerts (`citationChecker.ts:1250-1299`).

---

## 5. How the answer text is parsed

### 5.1 Cited or not - the matcher decides

`server/lib/brandMatcher.ts` is the only presence authority. It compiles a variant set from the
name, the legal-suffix-stripped name, the diacritic-folded name, user variations, and the
domain (`brandMatcher.ts:185-217`).

Name variants match whole-word and tolerate possessives:

```ts
// server/lib/brandMatcher.ts:173
const pattern = `\\b${body}(?:[''’]s)?\\b`;
```

Domain variants match on URL boundaries:

```ts
// server/lib/brandMatcher.ts:158
const pattern = `(?:^|[\\s/:<>"'.])(?:www\\.)?${escaped}(?=[/\\s?#:<>"']|$)`;
```

Short or common names need a signal word within 60 characters:

```ts
// server/lib/brandMatcher.ts:130
function isAmbiguous(variant: string): boolean {
  const norm = variant.toLowerCase().trim();
  if (norm.length <= 3) return true;
  return AMBIGUOUS_WORDS.has(norm);
}
```

`AMBIGUOUS_WORDS` holds 35 names such as `apple`, `notion`, `stripe`, `slack`
(`brandMatcher.ts:85-123`). `SIGNAL_WORD_RE` holds terms such as `platform`, `company`, `saas`,
`founded` (`brandMatcher.ts:126`). `SIGNAL_WINDOW = 60`.

In the runner the matcher wins over the LLM:

```ts
// server/citationChecker.ts:873
const isCited = matcherBrandMatched;
const rank = isCited && analyzerCited ? (brandVerdict?.rank ?? null) : null;
const relevance = isCited && analyzerCited ? (brandVerdict?.relevance ?? null) : null;
const brandSentiment = deriveSentiment(relevance, isCited);
```

Disagreements are counted per run and stored on `citation_runs.disagreementCount`
(`citationChecker.ts:599`, `:1237`).

### 5.2 Rank

Rank never comes from a regex. It comes from the analyzer LLM.

```
// server/lib/responseAnalyzer.ts:86
- "rank" is the 1-indexed position of the brand's first appearance inside an ordered or numbered
  list/ranking in the response. If the brand is not inside such a list, use null.
```

The single-brand judge uses the same rule (`citationJudge.ts:77`). Relevance is 0..100 for how
favourably the brand is presented (`responseAnalyzer.ts:87`).

`re-detect-all` never assigns a rank to a row it flips to cited:

```ts
// server/routes/prompts.ts:928
rank: becameCited ? null : r.rank,
```

### 5.3 Stored context format

Each row stores `"{statusLine}\n\n||| RAW_RESPONSE |||\n{body}"`.

```ts
// server/citationChecker.ts:889
const statusLine = isCited ? "Cited" : "Not cited";
citationContext = `${statusLine}\n\n||| RAW_RESPONSE |||\n${responseText}`;
```

Readers support the old `--- RAW RESPONSE ---` marker too (`prompts.ts:1093`,
`dashboard.ts:52`).

### 5.4 Cited URLs

Structured citations come from the top-level `citations` array and from
`choices[0].message.annotations[].url_citation.url` (`citationChecker.ts:229-248`). The stored
`citingOutletUrl` prefers the analyzer's attributed URL, then the first regex URL:

```ts
// server/citationChecker.ts:896
const analyzerUrl = brandVerdict?.citedUrls?.[0] ?? null;
const extractedUrl = extractFirstUrl(responseText);
const citingOutletUrl = analyzerUrl || extractedUrl;
```

The Cited-URLs endpoint uses `citingOutletUrl` only, never the whole `citedUrls` array
(`dashboard.ts:839`).

Source type buckets are `community`, `reference`, `video`, `web` (`citationChecker.ts:182-204`).

### 5.5 Mention detection

Reddit and Hacker News results pass `passesBrandPresenceGate` before insert. Sentiment comes
from `judgeSentimentBatch`, with a per-brand cap:

```ts
// server/lib/mentionScanner.ts:11
const DAILY_SENTIMENT_CAP = 200;
```

Manual adds must be on a matching host, must fetch over SSRF-safe fetch, and must pass the
presence gate (`mentions.ts:215-262`).

---

## 6. Client features

### 6.1 `pages/monitor.tsx`

A `SpineShell` with four tabs, default `citations`.

| Tab | Component | Job |
|---|---|---|
| Citations | `pages/citations` | every captured AI response and the sources it cited |
| Competitors | `pages/competitors` | rank against rivals, per-platform leaderboard |
| Trends | `components/intelligence/TrendsTab` | visibility over time |
| Mentions | `components/geo-tools/MentionsTab` | Reddit and Hacker News mentions plus manual adds |

There is no Overview tab. The file says it was retired.

### 6.2 `pages/home.tsx` - the dashboard

Seven rows, all fed by `useDashboardData`.

1. `KpiStrip` - six tiles: visibility with delta, mentions in 7 days, citations this week,
   own rank of tracked brands, hallucinations, listicles.
2. `VisibilityChart` plus `RankingsPanel` (2/3 and 1/3).
3. `ActionsStrip` - recommendations.
4. `PromptsRow` - prompts, site health, tone, perception.
5. `PlatformStrip` - per-platform cards.
6. `GapsRow` - the competitor gap matrix.
7. `BottomRow` - weekly trend, cited URLs, top sources, hallucinations, listicles.

Empty state when the user has no brand. Rank shows `–` when there is no leaderboard row.

### 6.3 `pages/report.tsx`

Four panels plus a Print / Save PDF button that calls `window.print()`.

1. A plain-language conclusion sentence plus the score out of 100 and a delta chip.
2. Citation-rate trend: an inline SVG sparkline plus the last 8 weekly figures.
3. By engine: a table with Engine, Cited (`citations/mentions`), Rate, Score.
4. `CitedUrlsCard` - which pages got cited.

The trend needs at least two weeks with checks (`report.tsx:130`). There is no revenue,
traffic, or attribution figure.

### 6.4 `pages/ai-visibility.tsx`

A manual checklist, not a measurement.

- A total progress panel: `completed/total` plus a percent bar.
- Seven engine cards in a grid: ChatGPT, Claude, Perplexity, Google AI Overview, Gemini, Grok,
  Manus AI, DeepSeek. The array holds 8 engines; the grid is `lg:grid-cols-7`.
- Selecting a card switches the checklist. The choice persists via `usePersistedState`.
- The checklist is an accordion. Each step has a checkbox, a priority badge, a description,
  a "How to do this" block, an expected-impact line, and an optional quick-action button.
- Quick actions link to `/crawler-check`, `/content`, `/brand-fact-sheet`, `/geo-tools`,
  `/keyword-research`, `/geo-signals`, `/faq-manager`, `/citations`, or to external URLs.
- Checkbox state is optimistic and persists per brand through
  `/api/visibility-progress/:brandId`. A failure rolls back and shows a toast.
- On mount the page posts `/api/onboarding/visibility-visited`.

All step content is a hardcoded array in the file. Nothing on this page is measured.

---

## 7. Map to Trakkr

Trakkr features are from sections 3 and 4 of `14-features-and-deeplinks.md`.

### 7.1 Feature by feature

| VentureCite feature | Trakkr feature | Verdict | Note |
|---|---|---|---|
| `home.tsx` dashboard, KPI strip, chart, rankings, actions, model strip, prompts, sources | `4.1 Dashboard` | WEAKER | Trakkr has 8 model cards; VentureCite has 6 engines. Trakkr's tiles are links to the owning page; VentureCite's tiles do not deep-link. Trakkr has two traffic tiles; VentureCite replaced them with hallucinations and listicles because no analytics integration exists. Trakkr's chart has a 7D/14D/30D switch; the client slices one 30-day series. |
| Prompt portfolio routes and the prompts table | `4.3 Prompts` | WEAKER | Both hold the questions, with score, delta, 7-day sparkline and an ON toggle. Missing: AI VOL (no search-volume source), Tags, and Audiences with Awareness / Consideration / Decision stages. Missing: `?highlight=<uuid>` and `?view=topics` deep links. Trakkr has no stated cap; VentureCite caps at 10 tracked prompts. |
| `POST .../suggestions/refresh` and accept or dismiss | `4.3 Prompts` | STRONGER | Trakkr has no documented AI suggestion queue with accept, replace, or dismiss. |
| `promptShape.ts` listicle-shape enforcement | none | ABSENT IN TRAKKR | A deterministic guard that rejects question-form and first-person prompts before persist. |
| `/api/dashboard/citation-trend` plus `report.tsx` | `4.18 Reports` | WEAKER | Both show history. Trakkr has Timeline and Monthly tabs, WHAT CHANGED, STATUS, PRESENCE and RANK columns, and a `/reports/<id>` detail with By model, By prompt and Matrix views. VentureCite has one page, no per-report route, no PRESENCE metric. |
| `/api/brand-prompts/:brandId/run/:runId/details` | `/reports/<id>` By prompt | WEAKER | Same drill-down data, but reached from run history, not from a shareable report URL. There is no By-model or Matrix pivot. |
| `/api/dashboard/perception` and `POST .../run` | `4.9 Perception` | WEAKER | Same five axes: Trust, Quality, Value, Market, Innovation. Missing: four sub-attributes per axis with a FOCUS badge, the Competitors / Claims / Tracked tabs, per-claim model counts, and the goal table with Achieved / Improving / Needs attention. VentureCite has `praised` and `questioned` lists and an `evidenceCount`, plus a 7-run sparkline. |
| Perception honesty rules | `4.9 Perception` | STRONGER | An axis that cannot be judged returns null, and `overall` averages only scored axes. Zero evidence makes no LLM call. |
| `/api/dashboard/site-health` and `/pages` and `/content-findings` | `4.13 Site Optimization` | WEAKER | Both score discovery, crawler access and crawl success, and both list findings by severity. Missing: the findings table with WORK / SEVERITY / PAGES / POINTS sorted by points, the Findings / Pages / History tabs, and a "Fix it for me" hand-off. VentureCite marks unmeasured inputs null and rescales; Trakkr ships one card labelled "estimated, not observed". |
| `/api/check-crawler-permissions` | `4.11 Crawlers` | WEAKER | VentureCite reads robots.txt only. It never counts real bot hits, because there is no log drain. Trakkr counts actual bot visits through 10 host connectors and 7 content-system connectors. |
| `/api/dashboard/cited-urls` and top-source rollup | `4.7 Citations` | WEAKER | VentureCite gives a flat cited-URL list plus a client-side domain rollup. Missing: the Sources / Queries / Videos / Outreach tabs, the Domains / Pages / Feed sub-views, the nine type filters, the `?source=<domain>` deep link, and the whole Outreach workflow with publisher status tracking and pitch drafting. |
| `/api/dashboard/gap-matrix` | `4.8 Competitors` Matrix | WEAKER | Same brand-versus-competitor grid. It is capped at 6 core competitors and it buckets by prompt category, not by prompt. Trakkr's competitor list runs to 50 rivals with MENTIONS, VISIBILITY, TREND, H2H and WIN RATE. |
| `/api/geo-analytics` share of voice and leaderboard | `4.8 Competitors` | WEAKER | Share of voice and a top-10 leaderboard exist. There is no head-to-head duel, no win rate, no Threats or Rising filter. Alias handling exists but is in the citation runner, not in a UI panel. |
| Auto-learned name variations in the runner | `4.8` alias detection | SAME | Both learn aliases automatically. VentureCite appends analyzer-surfaced surface forms to the brand and competitor variation lists mid-run (`citationChecker.ts:770-779`). |
| `/api/brands/:brandId/recommendations` | `4.2 Actions` | WEAKER | A deterministic rules engine returns up to 5 recommendations with a CTA. It is read-only. There is no pipeline (`found → planned → measuring → earned`), no `?actionId=` drawer, no Brief / Steps / Agent / Activity tabs, no export. |
| `/api/brands/:brandId/alerts` | `4.20 Activity` | WEAKER | Run-change alerts exist with a limit. There is no type or date filter and no severity on each event. |
| Mentions - scan, list, status machine, bulk delete, manual add | `4.15 Reddit` | STRONGER | Trakkr's Reddit feature is unstarted and needs Reddit credentials. VentureCite ships a working scanner over Reddit and Hacker News with sentiment judging, a five-state workflow, cursor paging, filters, dedupe, per-source health, a 4 h manual cooldown, and an opt-in weekly cron. |
| `ai-visibility.tsx` checklist | none | ABSENT IN TRAKKR | An 8-engine, 57-step manual playbook with per-brand persisted progress. Trakkr has `/learn` documentation, not a tracked checklist. |
| `/api/geo-opportunities/:brandId` | none | ABSENT IN TRAKKR | Per-brand citation-share buckets, industry subreddit lists, and generated content ideas. |
| Hallucination detection and stats | none | ABSENT IN TRAKKR | Claims from AI answers are checked against the brand fact sheet, then re-verified on the next run. |
| Self-citation stamping | `4.6 Pages` | WEAKER | VentureCite stamps `lastCitedAt` on a tracked URL when a response cites it, and bumps `citation_runs.selfCitationCount`. Trakkr has a whole `/pages` screen with PAGE / CITED / LAST CITED columns, a `Measure now` button, and an `Ask` button. |
| `/api/llm-jobs` polling | `4.20 Activity` (in part) | ABSENT IN TRAKKR | A generic async-job poller with an ownership gate. Trakkr documents no equivalent user-facing surface. |
| Live-run polling: `/citation-runs/active`, `/state`, `/advance` | none | ABSENT IN TRAKKR | A resumable, sliced, advisory-locked run engine with live progress. Trakkr's document names no equivalent. |
| `report.tsx` print view | `4.1` Share and Export | WEAKER | Print to PDF only. Trakkr offers Share links and file export on every page. |

### 7.2 Trakkr features in this area that VentureCite does not have

1. **`/diagnose`** (4.5). No per-question loss explanation. There is no headline with best
   position and confidence, no "What connects the dots" section, no blockers list, no fixes
   list, no numbered sources, no methodology panel, and no `?query=&autoStart=true` entry.
2. **`/explore`** (4.19). No self-serve pivot table. VentureCite has no way to cross Models,
   Prompts, Competitors and Dates, and no Presence or Number-one Share measure.
3. **Presence and Number-one Share.** Neither metric exists anywhere in the code. Only citation
   rate, rank and the composite visibility score exist.
4. **AI VOL.** No search-volume figure on a prompt.
5. **Audiences and stages** (4.3). No buyer-type grouping and no Awareness / Consideration /
   Decision stages.
6. **Tags** on prompts (4.3).
7. **`/research`** (4.4). No one-off deep study outside the tracked set.
8. **`/traffic/analytics`** (4.10). No Google Analytics connection and no AI-referred visitor
   count.
9. **Real crawler-hit counting** (4.11). No log drain, no host connectors.
10. **Trend window switches of 7 / 14 / 30 / 60 / 90 days** on a server endpoint. The hero and
    the rankings use a fixed 30-day window; the trend uses a fixed 8 weeks.
11. **Head-to-head duel and win rate** (4.8).
12. **Citations Outreach and Queries tabs** (4.7), including publisher status tracking.
13. **A 50-rival ranking list** (4.1). The gap matrix caps at 6 core competitors; the leaderboard
    caps at 10.
14. **Eight model cards** (4.1). VentureCite queries six engines.
15. **Deep-link grammar** (section 5). No route in this slice accepts `?view=`, `?mode=`,
    `?tab=`, `?highlight=`, `?actionId=` or `?source=`. The only query parameters are `since`,
    `status`, `limit`, `points`, `cursor` and the mention filters.
16. **Share and Export** on a page (section 8). Only `window.print()` on the report.

---

## 8. Notes a reader should carry forward

- One number, two meanings. The hero shows the composite `computeVisibilityScore`. Its delta
  compares citation rates, because `metrics_history."visibility_score"` stores the run citation
  rate (`metricsSnapshot.ts:63`). The headline and the arrow do not measure the same thing.
- `platformBreakdown[x].mentions` is a check count, not a mention count
  (`analytics.ts:286`). `report.tsx:280` renders it as the denominator of "Rate", which is
  correct, but the field name is misleading.
- Authority score is a frequency proxy, not a domain-authority figure. A first-time domain
  scores 10 (`citationChecker.ts:221`).
- `/api/geo-opportunities` returns six hardcoded "strategyTips" strings with figures such as
  "91%" and "4.4x" (`analytics.ts:937-944`). These are static copy, not measurements.
- `AI_PLATFORMS_PLANNED` names four engines that produce no data (`shared/constants.ts:24`).
- `VISIBILITY_CHECKLIST_TOTAL = 57` is maintained by hand against the array in
  `ai-visibility.tsx`. Nothing enforces it.
