# Citation detection (Wave 8)

This page documents how `isCited` is decided and how the dashboard / analytics
pages stay in sync while a citation run is in flight. Supersedes the earlier
mixed analyzer/matcher behavior that wrote `isCited` based on the LLM's verdict.

## Detection — matcher is the final word

Every surface that writes `isCited` (or its inclusion/mention equivalent) goes
through the universal matcher in [server/lib/brandMatcher.ts](../server/lib/brandMatcher.ts).
The LLM still runs for enrichment (rank, relevance, sentiment, auto-discovered
competitors) but **cannot flip a matcher's verdict**.

### Per-response order in `runBrandPrompts`

Inside [server/citationChecker.ts](../server/citationChecker.ts) `runBrandPrompts`,
each response is processed in this order:

1. **`analyzeResponse()`** — LLM returns `{cited, rank, relevance, context, citedUrls, name, variants}` per tracked entity, plus `untracked[]` candidates for auto-discovery.
2. **Variation-learning** — every surface form the LLM surfaced for a tracked entity is appended to `brands.nameVariations` / `competitors.nameVariations` (idempotent, dedup by lowercase).
3. **Re-load brand + competitors** so the matcher sees the variations the LLM just learned for THIS response — no chicken-and-egg where a first-time form like "Notion Labs Inc." would miss.
4. **`detectBrandAndCompetitors()`** — single matcher pass over the response covering brand + every tracked competitor with their freshly-loaded variations.
5. **Writes use the matcher's verdict:**
   - `geo_rankings.isCited` = matcher result for the brand.
   - `competitor_geo_rankings` row is written only when the matcher hit that competitor.
   - `brand_mentions` row is written only when the matcher hit the brand.
   - Analyzer's `rank` / `relevance` / `context` / `citedUrls` are used **only when matcher and analyzer agree on cited**. When the matcher says cited but the analyzer didn't, those fields go to `null` — we don't fabricate enrichment.
6. **Disagreements are logged** at info level as `citation.matcher.disagreement`. Useful for tuning the variation list — should be rare after a few runs.

### Auto-discovery

`analysis.untracked[]` (brands the analyzer surfaced that aren't in our tracked set) is gated through a matcher confirmation step before being inserted as a new competitor. Each candidate's reported name + variants is matched against the response text; if the matcher can't find it, the candidate is dropped (analyzer hallucination guard).

### Other surfaces

- **`server/lib/listicleScanner.ts`** — `isIncluded` is matcher-only. The LLM still parses `listPosition` and the page's `items[]`, but if the matcher says the brand isn't on the page, position is forced to null. The LLM's `competitorsMentioned[]` is filtered through a matcher pass per known competitor; phantom competitors are dropped.
- **`server/lib/wikipediaScanner.ts`** — `mentionType` (existing/opportunity) is decided by the matcher. The LLM only judges topical relevance (filtered before classification).
- **`server/citationChecker.checkForCitation` (legacy single-prompt path)** — matcher pre-filters; if matcher hits, the LLM judge runs to enrich rank/relevance but **cannot flip `isCited` back to false**. If the judge says "not cited", we still write `isCited=true` (matcher wins) and discard the judge's enrichment.
- **`server/lib/hallucinationDetector.ts`** — reads `isCited` from `geo_rankings` and only fact-checks rows where it's 1. Inherits matcher-authoritative semantics automatically.

## Live updates — keeping pages in sync during a run

A citation run can take many seconds to several minutes (per-prompt × per-platform × concurrency=5). `geo_rankings` rows are written progressively, but until Wave 8, every page that displayed citation-derived data was a static `useQuery` with no refetch — users had to manually reload after the run finished.

### `citation_runs` lifecycle columns (migration 0034)

```
status        text   'pending'|'running'|'succeeded'|'failed'|'partial'|'cancelled'
progress_pct  int    0-100
error_message text   nullable
```

Plus a partial index `citation_runs(brand_id, status) WHERE status IN ('pending','running')` so the "is any run live for this brand" query is O(1).

### Progress writes

[server/citationChecker.ts](../server/citationChecker.ts):
- On run create → `status='running', progress_pct=0`.
- Every 5 completed tasks → `bumpCitationRunProgress(runId, pct, totalChecks, totalCited)`.
- On finalize → `status='succeeded'` (or `failed` if zero rankings written), `progress_pct=100`.

### Two endpoints power the live story

- **`GET /api/brands/:brandId/citation-runs/active`** — cheap status gate. Returns active runs for the brand. Polled every 8s by every dependent page via `useActiveCitationRuns`.
- **`GET /api/brands/:brandId/citation-events`** — SSE stream for the active Citations page. Tails `citation_runs.progress_pct` and recent `geo_rankings` rows; emits `progress`, `ranking`, `complete`, `end` events. Authenticated via `?token=<JWT>` query parameter (EventSource can't send Authorization headers); the path is in `SELF_AUTHED_PREFIXES` in [server/auth.ts](../server/auth.ts).

### Frontend hooks

- [client/src/hooks/useActiveCitationRuns.ts](../client/src/hooks/useActiveCitationRuns.ts) — polls the status gate every 8s. Returns `{ hasActive, runs }`.
- [client/src/hooks/useCitationLiveRefresh.ts](../client/src/hooks/useCitationLiveRefresh.ts) — wraps the gate plus a list of query keys. While `hasActive` is true, sets `refetchInterval: 6_000` on each key via `setQueryDefaults`. When it flips back to false, fires one `invalidateQueries` per key and clears the interval. Result: dashboard / analytics queries auto-refresh every 6s during a run, and immediately on completion.

### Pages that adopted the hook

- [client/src/pages/home.tsx](../client/src/pages/home.tsx) — hero, rankings, gap-matrix, entity-strength, citation-trend, leaderboard, reddit-mentions.
- [client/src/pages/geo-analytics.tsx](../client/src/pages/geo-analytics.tsx) — `/api/geo-analytics`.
- [client/src/pages/competitors.tsx](../client/src/pages/competitors.tsx) — competitors list + leaderboard.
- [client/src/pages/geo-tools.tsx](../client/src/pages/geo-tools.tsx) — brand-mentions + competitors.
- [client/src/pages/citations.tsx](../client/src/pages/citations.tsx) — also subscribes to SSE for fine-grained per-row updates and a live progress banner.

### Latency budget

Worst case from a row-write to a dashboard refresh:
- Worker writes a `geo_rankings` row.
- Status gate ticks within 8s and stays `hasActive=true`.
- Dependent query refetches within 6s.

Total: ≤14s end-to-end. The Citations page itself is faster — SSE pushes deltas at 1s ticks.

## Verification

End-to-end manual:

1. Open Citations + Dashboard + GEO Analytics in three tabs for the same brand.
2. On Citations, click "Run Check".
3. Citations should show:
   - Run button disabled with "Run in progress…".
   - Live progress banner showing percentage incrementing.
   - SSE events trickling in (browser DevTools → Network → EventStream tab on the `/citation-events` request).
4. Dashboard + GEO Analytics tabs should auto-update within ~14s of each task completing.
5. When the run finishes, status flips to `succeeded`, banner disappears, every page invalidates and shows the final aggregate numbers within one polling tick.
6. Watch server logs for `citation.matcher.disagreement` — these should be rare. If you see >5% of total checks logged as disagreements, the affected brand likely needs more variations in its `nameVariations` list.

## Wave 9 — async run lifecycle, hardened live updates, sub-tab polish

Wave 8 shipped matcher-authority + a polling/SSE live-update story. Wave 9 fixes the dominant bug users hit (dependent pages still required manual refresh) and tightens the rest of the surface area.

### What changed and why

**Live-refresh (the actual reported bug)**
- [`useCitationLiveRefresh`](../client/src/hooks/useCitationLiveRefresh.ts) used to call `queryClient.setQueryDefaults(k, { refetchInterval: 6000 })` after a run started. TanStack Query merges defaults at observer-creation time, **not** on already-mounted observers — so the 6 s refetch never started. The hook now returns `{ hasActive, refetchInterval }` and each consuming page threads the value directly into its `useQuery({ refetchInterval })`. TanStack dedupes the gate query so all pages share one 8 s status poll regardless of how many hooks subscribe.
- [`useActiveCitationRuns`](../client/src/hooks/useActiveCitationRuns.ts) now backs off after consecutive empty polls (8 s → 30 s after 5 misses → 60 s after 10) and pauses entirely when `document.visibilityState === "hidden"`. Idle citations users no longer hammer the endpoint.

**Async `POST /api/brand-prompts/:brandId/run` (migration 0035 + `kickoffBrandPromptsRun`)**
- The endpoint used to `await runBrandPrompts(...)` for the entire run (30-120 s of held-open HTTP). Cloudflare/Render/ALB idle timeouts ate it as a 502 even when the run completed server-side, so users saw "Check failed" toasts on successful runs.
- New flow: `kickoffBrandPromptsRun` synchronously creates the `citation_runs` row, schedules the run on `setImmediate`, and returns `{ runId, status: 'running' }` in ~100 ms. Errors thrown inside the detached run are caught and written to `citation_runs.error_message` + `status='failed'` so the UI can surface them on HistoryTab.
- Migration 0035 adds a partial unique index `citation_runs(brand_id) WHERE status IN ('pending','running')`. Two tabs racing both clicking Run → second one hits 23505 → API returns 409 `{ error: 'already_running', runId: existing.id }` and the client joins the existing stream rather than starting a duplicate.

**Orphan reconciliation on boot ([`server/lib/citationReconciliation.ts`](../server/lib/citationReconciliation.ts))**
- A server crash mid-run otherwise leaves the row pinned at `status='running'` forever — every dependent page polls indefinitely AND the partial unique index blocks all new runs for that brand.
- Boot sequence in [`server/index.ts`](../server/index.ts) now runs `reconcileOrphanCitationRuns()` between `applyMigrations` and `initScheduler`. Marks any `pending|running` row older than 15 min as `failed` with `error_message='orphaned by restart'`.

**Time-based progress bumps ([`server/citationChecker.ts`](../server/citationChecker.ts))**
- `bumpProgressIfDue` previously fired every 5 completed tasks. Tiny runs (3-5 tasks) never bumped before finalize — banner showed 0% the whole way. Now bumps on whichever comes first: every 5 tasks OR every 1500 ms since the last bump. Small runs feel live; large runs keep their write rate sane.

**Run-scoped variation cache + disagreement counter (migration 0036)**
- Per-response `getBrandById` + `getCompetitors` reads (~50 reads per typical run) replaced with a single in-memory `Map<entityId, string[]>` populated at run start and mutated synchronously when `addBrandNameVariation` / `addCompetitorNameVariation` succeed. Same correctness — analyzer→variant-append→matcher ordering preserved — without the redundant DB round-trips.
- `citation_runs.disagreement_count` (migration 0036) records (matcher, analyzer) disagreements per run. Surfaced on HistoryTab as a tooltip ("Matcher and analyzer disagreed on N of M checks") when the rate ≥5%, which is the threshold that usually indicates the brand needs more `nameVariations`.

**SSE hardening ([`server/routes/prompts.ts`](../server/routes/prompts.ts))**
- 20 s heartbeat (comment frame `: ping\n\n`) so idle proxies don't kill the connection during quiet ticks.
- Per-user 3-stream cap. A misbehaving client opening 50 tabs would otherwise hold 50 polling connections.
- 5-min cap now sends `event: end, data: { reason: "timeout", reconnect: true }` and the client (citations.tsx) refreshes the Supabase JWT via `getAccessToken()` and re-opens — bounded to 5 reconnects to prevent runaway loops. Long runs (>5 min, >1 h JWT) now keep their live banner without the user touching anything.
- First-tick `lastSinceMs` backfills from `run.startedAt` (was: hardcoded 60 s). On (re)connect to an in-flight run, every existing ranking is replayed as a `ranking` event so Latest Results populates immediately instead of waiting for new rows.
- `console.warn` → `logger.warn` per CLAUDE.md.

**Schedule v2 (migration 0037)**
- Adds `auto_citation_hour` (0-23 UTC), `auto_citation_active` (pause without losing day/hour), `last_auto_citation_status` (succeeded | failed for the most recent scheduled run).
- ScheduleTab now shows hour-of-day picker, active toggle, "Next run: …" preview in local TZ, quota banner ("Each run uses ~50 AI calls"), and last-run status badge.
- Scheduler in [`server/scheduler.ts`](../server/scheduler.ts) honors `auto_citation_active` and `auto_citation_hour` (only fires once `currentHour ≥ targetHour` on the chosen day), and writes `last_auto_citation_status` on each iteration.

**Sub-tab polish summary**

| Tab | Wave 9 changes |
|---|---|
| Citations shell | Re-check stored moved into overflow menu; banner deep-link "View live results →" when on a non-Results tab; banner hides "0 cited / 0 checks so far" until SSE delivers real numbers; loading messages tied to `hasActive` (not `mutation.isPending`) so they cycle through the whole run; Run-mutation toast simplified to "Run started"; 409 dedup response surfaces as "Run already in progress" toast and triggers an immediate active-runs gate refresh. |
| PromptsTab | Edit has 1-500 char validation + counter + optimistic update with rollback; archive AlertDialog calls out the trend-line gap explicitly; Refresh suggestions confirms "uses 1 AI call" before firing; Reset all gated behind explicit checkbox; Accept-suggestion radio defaults to **no selection** (was: prompt #1 — one-click nuke); accept dialog adds side-by-side preview pane that updates as the user picks a row. |
| ResultsTab | Best Platform requires ≥5 checks before competing — falls back to "Need more data" when no platform qualifies; Top Prompt has a stable tie-break (promptId asc); 0% citation rate shows a dedicated empty state with concrete next steps; per-platform table now has clickable sortable column headers; per-prompt accordion has default/least-cited/most-cited sort; CSV export button on header (client-side, no backend); "Last run X ago" timestamp on header. |
| HistoryTab | Status badges per row (succeeded/partial/failed/cancelled/running) with `error_message` tooltip; chart filter dropdown (Scheduled/Manual/Re-detect/All), default = Scheduled; chart excludes non-succeeded rows; date filter (7/30/90/all); drill-down result cache so reopening a run is instant; disagreement badge when ratio ≥5%. |
| ScheduleTab | See "Schedule v2" above. |
| PlatformResultCard | Hardcoded `PLATFORM_COLORS` extended with stable HSL hash for unknown platforms; "Check failed:" snippets render as red error pill above the response toggle (previously hidden behind expand); Copy + Open-in-chat buttons in the expanded view (deep-link for ChatGPT/Gemini/Perplexity, clipboard fallback for Claude/DeepSeek). |

### Verification (Wave 9)

E2E:
1. `npm run check`, `npm run lint`, `npm test` — all green (171/171).
2. `npm run dev`. Open Citations + Dashboard + GEO Analytics + Competitors + GEO Tools in five tabs.
3. Click "Run Check". Confirm:
   - `POST /run` returns ~100 ms.
   - Toast says "Run started".
   - Live banner appears within ~1 s; SSE shows progress >0% within ~3 s for any-size run.
   - Dashboard / GEO Analytics / Competitors / GEO Tools auto-update within ~10 s of each task completing — **no manual refresh required**.
4. Click "Re-check stored" (overflow menu). Confirm a `re-detect`-badged row appears in HistoryTab and the live banner runs.
5. From a second tab, try Run again — receive 409 + "Run already in progress" toast.
6. Kill `npm run dev` mid-run, restart. Within 15 min the orphan row is marked failed; banner closes; Run button re-enables.
7. ScheduleTab: change to weekly Mon 14:00 UTC, watch "Next run: …" preview update in your local TZ. Toggle Active off — preview disappears. Toggle on — returns.
8. ResultsTab: open a brand with 1 check on each platform — Best Platform reads "Need more data".
9. PromptsTab: open Accept dialog on a suggestion — Confirm is disabled until you pick a prompt; preview updates as you pick.
10. HistoryTab: filter to "Scheduled only", confirm manual runs vanish from the chart.

Failure-mode log lines to watch:
- `citation.run.kickoff.duplicate_blocked` — second tab raced the dedup index (expected, benign).
- `citation.run.detached_failed` — async run threw; `error_message` written to the row.
- `citation.runs.orphaned_reconciled` — boot reconciliation found stale rows (one per restart-after-crash).
- `citation.matcher.disagreement` — per-response info log; `disagreement_count` rolled up onto the run row.

