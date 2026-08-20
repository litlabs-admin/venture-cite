# Mentions Rebuild — Design Spec

**Date:** 2026-05-05
**Scope:** GEO Tools → Mentions tab. Reddit + Hacker News + Quora only.
**Status:** Design approved by user. Ready for implementation plan.

---

## 1. Why this rebuild exists

The current Mentions sub-feature is buggy in ways that make it unusable for real users:

- **Cross-tenant data leak** — `GET /api/brand-mentions/:brandId` and `/api/brand-mentions/alerts/:brandId` have no ownership check. Any authenticated user can read any other user's mentions by guessing brand IDs.
- **Duplicate route handlers** — `POST /api/brand-mentions` and `PATCH /api/brand-mentions/:id` are registered twice (in `intelligence.ts` and `publications.ts`) with divergent validation. Behavior depends on Express load order.
- **HN dedup destroys all-but-one row per scan** — URL normalization strips the `?id=` query param that uniquely identifies each HN item.
- **Synchronous LLM fan-out in HTTP request** — up to ~225 sequential OpenAI calls inside one Express handler, guaranteed to timeout on serverless runtimes.
- **No brand-name match validation** — "Apollo" returns the space program, Apollo GraphQL, Greek god, etc. The "ambiguity warning" is informational only; nothing filters the results.
- **Reddit will be IP-banned on cloud egress** — non-compliant User-Agent + datacenter IP + unauth endpoint.
- **Quora scraper is non-functional** — Quora is JS-rendered; static HTML has no answer text.
- **Manual-add accepts arbitrary URL schemes** — `javascript:`, `data:`, `file:` lands in DB.
- **AI-citation rows mixed in same table** — synthetic `ai://*` URLs from the citation-checker inflate stats and break platform-icon mapping.
- **Two unique indexes silently disagree** on what counts as a duplicate.
- **RLS enabled with no policies** — operational landmine.
- **Unbounded growth, no pagination, no retention** — table fetched in full for the no-`brandId` GET branch.
- **Zero test coverage** anywhere in `tests/`.
- **No alerts, no SoV, no competitor view** — out of scope for this rebuild (per design decisions).

The audit identified ~80 distinct issues. This rebuild addresses the production-blocking subset and reframes the feature as a precise, honest brand-mention monitor.

---

## 2. Product position

**What this feature is:** a precise brand-mention monitor across Reddit, Hacker News, and Quora, with sentiment per mention.

**What this feature is NOT (in v1):**
- Not a competitor / share-of-voice tracker.
- Not an alerting / notification system (no email, no Slack, no webhooks).
- Not a citation tracker — AI-citation rows leave this table entirely (handled by the existing Citations feature).
- Not a multi-platform listening tool (no Twitter/X, LinkedIn, news, etc.).
- Not a saved-search / boolean-query power tool.

**Real-user promise:** "We monitor Reddit, Hacker News, and Quora daily for your brand. We tell you what's new, what people are saying, and what tone they're using. If something fails, we tell you why."

---

## 3. Architecture

### 3.1 File layout

**Frontend** (extracts ~300 lines out of the 2,354-line `geo-tools.tsx`):

- `client/src/components/geo-tools/MentionsTab.tsx` — the Mentions tab UI.
- `client/src/hooks/useMentions.ts` — owns all TanStack Query hooks, mutations, and the scan-progress polling state.
- `client/src/components/geo-tools/MentionCard.tsx` — single row in the list.
- `client/src/components/geo-tools/MentionDetailSheet.tsx` — side-panel (right on desktop, bottom-sheet on mobile).
- `client/src/components/geo-tools/MentionsFilters.tsx` — filter bar (collapses into a Sheet at `<sm`).
- `client/src/components/geo-tools/AddMentionDialog.tsx` — manual-add form.
- `client/src/components/geo-tools/ScanStatusPanel.tsx` — persistent "Last scan / Next scan / Per-source health" panel.
- `client/src/lib/scanCompletionListener.ts` — global hook polling the user's active scan jobs and firing toasts on completion.

**Backend:**

- `server/routes/mentions.ts` — single canonical owner of every `/api/brand-mentions/*` and `/api/brand-mentions/scans/*` route. Duplicates in `intelligence.ts` and `publications.ts` are deleted.
- `server/lib/mentionScanner.ts` — rewritten. Reddit OAuth client + field-scoped queries + brand-presence gate + per-source backoff + canonical URL normalization. No LLM calls inside this file (sentiment moves to the worker).
- `server/lib/sentimentBatcher.ts` — new. Batches mentions 10/call to gpt-4o-mini, content-hash cached, neutral-fallback on error.
- `server/lib/redditOAuth.ts` — new. Reddit script-app OAuth client (token refresh, retry).
- `server/lib/canonicalUrl.ts` — new. Per-platform URL normalization helpers (extracted because they're shared and the audit found the previous inline regex broken for HN).
- `server/lib/brandPresenceGate.ts` — new. Server-side text match across all variations.
- `server/lib/sourceHealth.ts` — new. Tracks consecutive failures per (brand, source) and decides skip/retry.
- `server/lib/runMentionScan.ts` — new. Single function `runMentionScan(scanId)` that does the actual work: reads the `scan_jobs` row, executes the scanner, updates the row through `running → complete | failed`. Called by both the cron and the detached manual handler. No HTTP, no polling, no OpenAI Responses background mode.
- `server/scheduler.ts` — `runMentionScanJob` updated to filter by `brands.monitor_mentions = true` and to insert + run a `scan_jobs` row per brand instead of calling `scanBrandMentions` inline.

**Tests** (all new):

- `tests/unit/mentionScanner.test.ts` — query construction, brand-presence gate, canonical URL normalization (HN dedup regression), per-source rate-limit handling, sentiment fallback.
- `tests/unit/mentionsRoutes.test.ts` — ownership scoping (every endpoint asserts 404 on someone-else's brand), Zod validation, manual-add URL host whitelist + javascript:/data: rejection, status-PATCH transition validation, idempotent click-to-attach.
- `tests/unit/MentionsTab.test.tsx` — empty states, scan progress polling, filter URL persistence, optimistic status updates, undo-toast on delete, axe-core a11y assertion.
- `tests/unit/mentionScannerFixtures.test.ts` — integration smoke against fixture HTML/JSON for each source.

### 3.2 Data model

#### `brand_mentions` (existing, modified)

New columns added:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `mention_location` | text | `'post'` | `'post'` \| `'comment'` (Reddit comment-tree expansion) |
| `link_status` | text | `'unknown'` | `'ok'` \| `'dead'` \| `'unknown'` (nightly verifier) |
| `last_verified_at` | timestamp | NULL | Last time the link was checked |
| `matched_variation` | text | NULL | Which name variation matched ("Linear" / "linear app") |
| `matched_field` | text | NULL | Which field matched (`title` / `selftext` / `body` / `comment`) |
| `source` | text | `'scanner'` | `'scanner'` \| `'manual'` |
| `scanner_version` | smallint | `2` | `1` for pre-rebuild rows, `2` for new |
| `sentiment_source` | text | `'llm'` | `'llm'` \| `'fallback'` \| `'capped'` |
| `engagement_normalized` | smallint | NULL | 0-100 normalized engagement score |

Modified columns: none. Existing columns kept.

Indexes after migration:

- **Drop** `brand_mentions_dedup_idx` (had `platform`, conflicted with the unified one).
- **Drop** `brand_mentions_brand_id_source_url_uniq` (will be recreated under same name with corrected definition).
- **Create** `brand_mentions_brand_canonical_url_uniq UNIQUE ON (brand_id, lower(source_url))` — single source of truth for dedup.
- **Create** `brand_mentions_brand_status_discovered_idx ON (brand_id, status, discovered_at DESC)` — composite for the list query.
- **Create** `brand_mentions_brand_sentiment_idx ON (brand_id, sentiment, discovered_at DESC)` — for sentiment filter.
- **Create** `brand_mentions_brand_platform_idx ON (brand_id, platform, discovered_at DESC)` — for platform filter.

RLS: explicitly disabled (`ALTER TABLE brand_mentions DISABLE ROW LEVEL SECURITY`) per CLAUDE.md's "app-level scoping only".

#### `brands` (existing, modified)

| Column | Type | Default | Purpose |
|---|---|---|---|
| `monitor_mentions` | boolean | `true` for new brands; `false` backfilled | Per-brand opt-in for daily auto-scan |

#### `scan_jobs` (new table)

```sql
CREATE TABLE IF NOT EXISTS scan_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger       text NOT NULL,                          -- 'manual' | 'cron'
  status        text NOT NULL DEFAULT 'queued',         -- 'queued' | 'running' | 'complete' | 'failed'
  per_source    jsonb NOT NULL DEFAULT '{}'::jsonb,     -- { reddit: {found, inserted, duplicates, failed, reason}, hackernews: {...}, quora: {...} }
  totals        jsonb NOT NULL DEFAULT '{}'::jsonb,     -- { found, inserted, duplicates, failedSources }
  error         text,
  started_at    timestamp,
  completed_at  timestamp,
  created_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX scan_jobs_brand_status_idx ON scan_jobs (brand_id, status);
CREATE INDEX scan_jobs_user_active_idx ON scan_jobs (user_id, status) WHERE status IN ('queued', 'running');
```

Retention: rows where `status IN ('complete', 'failed')` and `completed_at < now() - interval '90 days'` are pruned by the existing nightly prune job.

#### `source_health` (new table)

```sql
CREATE TABLE IF NOT EXISTS source_health (
  brand_id        uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  source          text NOT NULL,                        -- 'reddit' | 'hackernews' | 'quora'
  consecutive_failures int NOT NULL DEFAULT 0,
  last_failure_at timestamp,
  last_failure_reason text,
  paused_until    timestamp,                            -- NULL = active
  PRIMARY KEY (brand_id, source)
);
```

Three consecutive failures → `paused_until = now() + interval '24 hours'`. Tentative retry after cooldown; success resets counter, failure extends.

#### `last_successful_scan_at` per (brand, source)

Stored in `source_health` as an additional column:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `last_successful_scan_at` | timestamp | NULL | First-scan vs steady-state mode signal |

#### `sentiment_cache` (new table)

```sql
CREATE TABLE IF NOT EXISTS sentiment_cache (
  content_hash    text PRIMARY KEY,                     -- sha256(brand_name + ':' + mention_context)
  sentiment       text NOT NULL,                        -- 'positive' | 'neutral' | 'negative'
  sentiment_score numeric(3, 2) NOT NULL,
  cached_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX sentiment_cache_cached_at_idx ON sentiment_cache (cached_at);
```

Cache entries with `cached_at < now() - interval '180 days'` are pruned in the nightly job.

### 3.3 Scan execution flow

A scan runs in one of two modes, both ending in the same write path:

- **Cron mode** — daily `runMentionScanJob` in `server/scheduler.ts` already wraps in an advisory lock (`lockKeys.mentionScan`) and calls `runForEveryBrand`. We keep this. The scanner runs synchronously inside the cron's function budget; one brand at a time; finishes or yields per the cron's deadline.
- **Manual mode** — `POST /api/brand-mentions/scans/:brandId` inserts a `scan_jobs` row (`status='queued'`), then detaches the actual work via `waitUntil` (Vercel) or `setImmediate` (local Node). The route returns `{ scanId }` to the client immediately. The detached worker updates `scan_jobs` as it progresses; the client polls `GET /api/brand-mentions/scans/:scanId` every 2s.

**Why not a new worker / FOR UPDATE SKIP LOCKED polling worker:** The pre-Vercel polling worker was removed from `server/contentGenerationWorker.ts` (see lines 426-431 of that file). The current pattern is route-or-cron driven, with OpenAI's `background: true` Responses API used when work exceeds the function ceiling. Mentions scans are bounded (<60s typical with OAuth-gated Reddit + HN + cached sentiment), so they fit in one Vercel function invocation without slice/advance.

**Idempotency:** before inserting a new `scan_jobs` row, the manual route checks for an existing `status IN ('queued','running')` row for the same `brand_id`. If one exists, return its `scanId` (click-to-attach). The cron acquires the advisory lock so concurrent cron-fires can't double-run.

```
[user clicks Scan Now] or [cron tick]
        │
        ▼
   Idempotency check: any active scan_job for this brand?
        │ yes ───► return existing scanId (click-to-attach)
        │ no
        ▼
   Insert scan_jobs row (status='queued')
        │
        ▼
   Enqueue content_generation_jobs row { type:'mention_scan', payload:{ scanId } }
        │
        ▼
   Return { scanId } to client; client begins 2s polling

[worker picks up the job]
        │
        ▼
   Update scan_jobs.status='running', started_at=now()
        │
        ▼
   For each source in [reddit, hackernews, quora]:
      check source_health.paused_until — skip if paused
      check source-level rate-limit bucket
      execute scoped query (Reddit OAuth / HN Algolia / Quora best-effort scrape)
      apply canonical URL normalization
      apply brand-presence gate (toLowerCase().includes(variation) across title/selftext/body/comment)
      [Reddit only] for each surviving post, fetch comment tree + apply gate to comments
      record per-source { found, inserted (placeholder 0), duplicates (placeholder 0), failed, reason }
        │
        ▼
   Aggregate surviving rows → sentiment batcher (gpt-4o-mini, batch 10, cache by content-hash)
   Daily-cap check: if today's sentiment-call count for this brand >= 200, mark remaining rows sentiment='pending', sentiment_source='capped'
        │
        ▼
   tryInsertBrandMention per row (ON CONFLICT DO NOTHING via the unique index)
   Update per-source.inserted / duplicates as actual counts
        │
        ▼
   Update source_health: success → reset consecutive_failures, set last_successful_scan_at; failure → increment, possibly set paused_until
        │
        ▼
   Update scan_jobs.status='complete', completed_at=now(), per_source, totals
        │
        ▼
   Worker exits. Client's next poll sees status='complete' and refetches mentions list.
```

### 3.4 Query construction (Q3 — auto-only, read-only display)

Given `brand.name = "Linear"` and `brand.nameVariations = ["linear app", "linear.app"]`:

**Reddit query:**
```
(title:"Linear" OR selftext:"Linear" OR title:"linear app" OR selftext:"linear app" OR title:"linear.app" OR selftext:"linear.app")
```
Sent to Reddit OAuth `/search` endpoint with `sort=new`, `t=year` on first scan, `t=week` on subsequent.

**HN query:**
```
"Linear" "linear app" "linear.app"
```
HN Algolia doesn't support field-scoped operators; we use phrase quoting. `tags=story,comment`. `numericFilters=created_at_i>last_scan_unix` after first scan.

**Quora query:**
```
"Linear" OR "linear app" OR "linear.app"
```
Best-effort scrape of `/search?q=...`. Documented in UI as "Quora results may be limited."

**UI affordance** (Q3 + addition #1): above the Scan Now button, a read-only line:
> Searching for: `"Linear"` OR `"linear app"` OR `"linear.app"` · [+ add variation]

The "+ add variation" link opens the brand variations editor. After the user adds a variation, a subtle prompt appears: "Run a fresh scan to pick up the new variation."

### 3.5 Canonical URL normalization

| Platform | Input | Canonical |
|---|---|---|
| Reddit | `https://reddit.com/r/saas/comments/abc123/some_title/?context=3` | `https://reddit.com/r/saas/comments/abc123` |
| Reddit (comment) | `https://reddit.com/r/saas/comments/abc123/title/cmt456/` | `https://reddit.com/r/saas/comments/abc123/cmt456` |
| HN | `https://news.ycombinator.com/item?id=12345&p=2` | `https://news.ycombinator.com/item?id=12345` (preserves `?id=`) |
| Quora | `https://www.quora.com/Some-Question-Title?share=1` | `https://www.quora.com/some-question-title` (lowercase, strip query) |

Implemented in `server/lib/canonicalUrl.ts`. Unit-tested with a regression case for the HN `?id=` bug.

### 3.6 Brand-presence gate

After fetching from each source, for every result:

```ts
function passesGate(text: string, variations: string[]): { matched: boolean; variation?: string; field?: string } {
  const haystacks = [
    { field: 'title',     text: result.title    ?? '' },
    { field: 'selftext',  text: result.selftext ?? '' },
    { field: 'body',      text: result.body     ?? '' },
    { field: 'comment',   text: result.comment  ?? '' },
  ];
  for (const v of variations) {
    const needle = v.toLowerCase();
    for (const h of haystacks) {
      if (h.text.toLowerCase().includes(needle)) {
        return { matched: true, variation: v, field: h.field };
      }
    }
  }
  return { matched: false };
}
```

Gated rows record `matched_variation` + `matched_field` for the side-panel "Why was this matched?" disclosure (Q12 add #5).

### 3.7 Sentiment

- Model: `gpt-4o-mini` (`MODELS.misc`).
- Batched: 10 mentions per call. Single JSON-array response.
- Prompt includes brand name + each mention's context (truncated to 2000 chars).
- Cache key: `sha256(brand_name + ':' + mention_context)`. Hits skip the LLM call entirely.
- Per-call timeout 30s; per-row timeout 5s within the batch (enforced via Promise.race on each row's response slot).
- On failure: row stored with `sentiment='neutral'`, `sentiment_score=0`, `sentiment_source='fallback'`.
- On daily cap (>=200 sentiment calls today for this brand): remaining rows stored with `sentiment='pending'`, `sentiment_source='capped'`. Tomorrow's scan processes pending rows before scanning new content.
- Sentiment never runs on rows that fail the brand-presence gate.

### 3.8 Reddit OAuth (Q2)

- Reddit "script" app type. Credentials in env: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD` (or refresh token). User creates app at `https://www.reddit.com/prefs/apps`.
- `server/lib/redditOAuth.ts` manages token lifecycle: on first request, exchange credentials for access token; cache in memory + DB row (`redditAccessToken`, `expiresAt`); refresh proactively at 90% of TTL.
- User-Agent compliant with Reddit's policy: `web:io.litlabs.venturecite:v1.0 (by /u/<reddit_username>)`.
- Quota: 60 req/min (vs. 10/min unauth). Rate-limit bucket capacity adjusted accordingly.
- On 401 (token rejected): one retry with forced refresh; on second 401, mark `source_health.last_failure_reason='reddit_oauth_invalid'` and surface in UI ("Reddit credentials need attention").

### 3.9 Manual-add (Q14)

`POST /api/brand-mentions` body schema:

```ts
const ManualAddSchema = z.object({
  brandId: z.string().uuid(),
  platform: z.enum(['reddit', 'hackernews', 'quora']),
  sourceUrl: z.string().url(),
});
```

Server-side validation:
1. Ownership check (`requireBrand`).
2. URL host whitelist:
   - `reddit` → `reddit.com`, `*.reddit.com`, `redd.it`.
   - `hackernews` → `news.ycombinator.com`.
   - `quora` → `*.quora.com`.
   Anything else → 400 with message "URL must be from the selected platform."
3. Per-user rate limit: 10 manual adds per minute (separate bucket from scan rate limit).
4. `safeFetchText(sourceUrl, { timeoutMs: 15_000, maxBytes: 2_000_000 })` — SSRF-safe, defangs `javascript:`/`data:`/`file:` automatically.
5. Brand-presence gate runs against fetched text. On miss, return 400: "We couldn't find your brand name on this page. Check the URL or update your brand variations."
6. Sentiment runs server-side via the same batcher (single-row "batch").
7. Insert with `source='manual'`. UI shows "Added by you" badge.
8. No `mentionContext` user input field in the form (server fetches from URL).

### 3.10 API surface (single owner: `server/routes/mentions.ts`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/brand-mentions/:brandId` | List mentions for a brand. Cursor pagination (`?cursor=&limit=50`), filters (`?status=&platform=&sentiment=&from=&to=&q=&sort=`), URL-persisted. Stats computed server-side over the *unfiltered* set so the badges don't drift from the visible list — UI labels them clearly as "Total / Positive / Neutral / Negative across all mentions." |
| POST | `/api/brand-mentions` | Manual add (Q14). |
| PATCH | `/api/brand-mentions/:id` | Update status. Validated against the 5-value enum + transition rules: `new` can go anywhere; `acknowledged` can go to `replied`/`false_positive`/`ignored`; `replied`/`false_positive`/`ignored` are terminal (no transition back to `new`). Audit-logged. |
| DELETE | `/api/brand-mentions/:id` | Hard delete. Audit-logged. Returns the deleted row so the client can show 5s undo toast. |
| POST | `/api/brand-mentions/bulk-delete` | `{ ids: string[] }` — bulk delete, bounded to 100 IDs per call. Audit-logged with count. |
| POST | `/api/brand-mentions/delete-all/:brandId` | `{ brandName: string }` — typed-confirmation gate (must equal `brand.name`). Audit-logged. |
| POST | `/api/brand-mentions/scans/:brandId` | Start a scan. Idempotent: returns existing `scanId` if a scan is already running for this brand. Per-brand 4h cooldown for `trigger='manual'`. |
| GET | `/api/brand-mentions/scans/:scanId` | Polled by client; returns `{ status, perSource, totals, startedAt, completedAt }`. Ownership-checked. |
| GET | `/api/brand-mentions/scans/active` | Returns `{ scanId, brandId, brandName }[]` of active scans across the user's brands. Used by the cross-app completion-toast listener (Q12 add #4). |
| PATCH | `/api/brands/:brandId/monitor-mentions` | `{ enabled: boolean }` — toggles the per-brand opt-in. Already exists on the brands router; called out here as part of the Mentions surface. |

**Ownership scoping:** every endpoint wrapped in `isAuthenticated` + `requireBrandOwnership` (or `requireMentionOwnership` for `:id` paths). 404 on miss (anti-enumeration). The audit's C13/C14 cross-tenant leak is fixed by definition — every route checks ownership before any DB read.

**Status transitions:** validated server-side. Invalid transition → 409 Conflict with current and attempted status in the body.

**Audit logging:** PATCH/DELETE/bulk-delete/delete-all wrap their handlers in `withAudit()` once the Wave 2 audit-log infrastructure lands. Until then, structured logs at `info` level capture before/after.

### 3.11 Frontend: state model

`useMentions(brandId)` returns:

```ts
{
  // List
  mentions: Mention[];
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  loadMore: () => void;

  // Filters (URL-persisted via wouter useSearch)
  filters: { status, platform, sentiment, dateFrom, dateTo, q, sort, newSinceLastScan };
  setFilter: (key, value) => void;
  clearFilters: () => void;

  // Stats (full-set, server-computed)
  stats: { total, byPlatform, bySentiment, byStatus };

  // Scan
  activeScan: ScanJob | null;     // null when no scan running
  startScan: () => void;
  scanCooldown: { canStart: boolean; nextAvailableAt: Date | null };

  // Mutations
  updateStatus: (id, status) => void;             // optimistic
  deleteMention: (id) => void;                    // optimistic + 5s undo toast
  bulkDelete: (ids[]) => void;                    // confirm dialog
  deleteAllForBrand: (brandName) => void;         // typed confirm
  markFalsePositive: (id) => void;                // optimistic; sugar over updateStatus
}
```

**Optimistic updates** for `updateStatus` and `deleteMention`: TanStack Query `onMutate` writes the optimistic state, `onError` rolls back, `onSettled` refetches.

**Undo toast** (5s) on delete: shadcn toast with `action: <ToastAction onClick={undo}>Undo</ToastAction>`. Undo restores the row by re-issuing a POST with the row's prior data captured in the mutation context.

### 3.12 UI flows

**A. First-time empty state (no scan ever run):**
- ScanStatusPanel shows "No scans yet. Run your first scan to find mentions."
- Big "Scan Now" button.
- "Searching for: `Linear` OR `linear app` · [+ add variation]" line above.
- Banner on first scan: "First scan — pulling up to 1 year of history; this may take longer."

**B. Scanning (scan in progress):**
- Scan Now button morphs to "Scanning..." with per-source progress: `Reddit ⏳ → HN ⏳ → Quora ⏳`.
- As each source completes: `Reddit ✓ 12 found → HN ⏳ → ...`.
- User can navigate away; if they do, a global toast fires on completion ("Scan complete for Linear: 3 new mentions [View]").
- If they return, the panel reattaches via `scans/:scanId` poll.

**C. Empty after scan (no mentions found):**
- ScanStatusPanel: "Last scan: 2m ago · ✓ Reddit 0 · ✓ HN 0 · ✓ Quora 0".
- Empty-state copy: "No mentions found yet. We'll keep checking daily. Add variations to widen the search."
- Distinct from first-time-empty.

**D. Mentions present:**
- Stats row (4 cards): Total / Positive / Neutral / Negative.
- Filter bar (status / platform / sentiment / date / search / sort) — URL-persisted.
- "New since last scan" filter chip.
- List: 50/page, "Load more" at bottom.
- Each MentionCard: icon + title + sentiment badge + status badge + matched-variation hint + date + engagement (normalized 0-100) + actions menu (⋯ → status-change, mark false positive, delete).
- Click anywhere on the card (except the actions menu) → opens MentionDetailSheet.

**E. MentionDetailSheet:**
- Header: platform icon + sourceTitle + sentiment badge.
- Open-source button (target="_blank", rel="noopener noreferrer"). Disabled if `link_status='dead'`.
- "Why matched": "Found `linear app` in `selftext`."
- mentionContext (markdown-rendered via SafeMarkdown).
- Status dropdown (transitions enforced).
- Delete + Mark false positive.
- Side-panel state is URL-driven (`?mention=<id>`) so it's shareable and survives refresh.
- On open: focus moves into the sheet. On close: focus returns to the originating row.
- Mobile: side="bottom", full height.

**F. Scan failure states:**
- Partial fail: ScanStatusPanel shows "Last scan: 4h ago · ✓ Reddit 12 · ✓ HN 5 · ⚠ Quora rate-limited". List still populates from successful sources.
- Full fail: "Last scan: 4h ago · ⚠ All sources failed. [Retry]".
- 3 consecutive full-fails: in-app banner at top of MentionsTab + dot on GEO Tools sidebar entry. Resolves on next success.

**G. Brand opt-out:**
- ScanStatusPanel shows: "Mention monitoring is paused for this brand. [Resume daily scans]".
- Manual scans still work even when monitoring is paused.

**H. Filter-bar mobile:**
- At `<sm`: filter bar collapses to a `Filters (3)` button (number = active filter count). Opens a Sheet with all filter controls.

**I. Sentiment cap reached:**
- ScanStatusPanel shows: "Sentiment processing paused — daily limit reached. Will resume tomorrow."
- Pending rows show in list with a small "Sentiment pending" indicator.

### 3.13 Scheduling (Q11)

- Daily cron at off-hours UTC (existing `runMentionScanJob` in `server/scheduler.ts`).
- Enqueues a `mention_scan` job for every brand where `monitor_mentions = true`.
- Worker processes jobs serially (existing pattern).
- Manual scan: per-brand 4h cooldown enforced server-side. Cooldown derives from `MAX(scan_jobs.completed_at) WHERE trigger='manual'`. UI shows live countdown ("Next manual scan: 2h 14m").
- Cron scans bypass the manual cooldown.

### 3.14 Rate limits

| Bucket | Capacity | Refill | Scope |
|---|---|---|---|
| `reddit-oauth` | 60 | 60/min | per-instance (Reddit's actual limit) |
| `hackernews` | 100 | 100/min | per-instance |
| `quora` | 10 | 1/6s | per-instance |
| `manual-add-per-user` | 10 | 10/min | per-user |
| `sentiment-per-brand-per-day` | 200 | 200/day | per-brand |

Per-instance Reddit/HN/Quora buckets (vs. the old per-brand buckets) match the upstream's actual limit and prevent the audit's "per-brand mask" issue.

### 3.15 Observability

- **Sentry capture** in every catch block: `mentionScanner`, `sentimentBatcher`, worker tick, route handlers. Tagged `source: "mention-scanner"` + `scanId` + `brandId`.
- **Structured logging** per CLAUDE.md: `logger.info({ scanId, brandId, userId, source, found, inserted, duplicates, durationMs }, "scan.source.complete")`.
- **`scanId` in every log line** for the duration of the scan.
- **Per-scan summary log** at completion: `{ scanId, brandId, durationMs, totals, openaiCalls, openaiCostEstimate }`.
- **Source-health changes logged** when consecutive_failures crosses thresholds.

### 3.16 Migration (single transaction, idempotent)

```sql
BEGIN;

-- Pre-delete observability
DO $$
DECLARE ai_count INT;
DECLARE junk_count INT;
BEGIN
  SELECT COUNT(*) INTO ai_count FROM brand_mentions WHERE platform LIKE 'ai:%';
  SELECT COUNT(*) INTO junk_count FROM brand_mentions
    WHERE platform IN ('reddit', 'hackernews', 'quora')
      AND (status = 'new' OR status IS NULL)
      AND source IS NULL;
  RAISE NOTICE 'Pre-delete: ai_rows=%  junk_rows=%', ai_count, junk_count;
END $$;

-- Drop conflicting indexes
DROP INDEX IF EXISTS brand_mentions_dedup_idx;
DROP INDEX IF EXISTS brand_mentions_brand_id_source_url_uniq;

-- Add new columns (IF NOT EXISTS for re-run safety)
ALTER TABLE brand_mentions
  ADD COLUMN IF NOT EXISTS mention_location text DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS link_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamp,
  ADD COLUMN IF NOT EXISTS matched_variation text,
  ADD COLUMN IF NOT EXISTS matched_field text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'scanner',
  ADD COLUMN IF NOT EXISTS scanner_version smallint DEFAULT 2,
  ADD COLUMN IF NOT EXISTS sentiment_source text DEFAULT 'llm',
  ADD COLUMN IF NOT EXISTS engagement_normalized smallint;

-- Backfill scanner_version for any pre-existing rows that survive
UPDATE brand_mentions SET scanner_version = 1 WHERE scanner_version IS NULL OR scanner_version = 2;
-- (After this, rows still at v2 are only those just added; we explicitly set legacy to v1)
UPDATE brand_mentions SET scanner_version = 1
  WHERE created_at < '2026-05-05'::date;

-- Delete AI-citation rows (Q7)
DELETE FROM brand_mentions WHERE platform LIKE 'ai:%';

-- Delete untouched scanner-junk rows (Q6 + Q17 refinement: preserve user-curated)
DELETE FROM brand_mentions
WHERE platform IN ('reddit', 'hackernews', 'quora')
  AND (status = 'new' OR status IS NULL)
  AND source IS NULL
  AND scanner_version = 1;

-- Create unified unique index
CREATE UNIQUE INDEX IF NOT EXISTS brand_mentions_brand_canonical_url_uniq
  ON brand_mentions (brand_id, lower(source_url));

-- Create composite filter indexes
CREATE INDEX IF NOT EXISTS brand_mentions_brand_status_discovered_idx
  ON brand_mentions (brand_id, status, discovered_at DESC);
CREATE INDEX IF NOT EXISTS brand_mentions_brand_sentiment_idx
  ON brand_mentions (brand_id, sentiment, discovered_at DESC);
CREATE INDEX IF NOT EXISTS brand_mentions_brand_platform_idx
  ON brand_mentions (brand_id, platform, discovered_at DESC);

-- Disable RLS (CLAUDE.md: app-level scoping only)
ALTER TABLE brand_mentions DISABLE ROW LEVEL SECURITY;

-- Brand opt-in column (Q11)
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS monitor_mentions boolean NOT NULL DEFAULT false;
-- New brands going forward will get default=true via Drizzle schema default; backfilled brands stay false until user opts in.

-- New tables
CREATE TABLE IF NOT EXISTS scan_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger       text NOT NULL,
  status        text NOT NULL DEFAULT 'queued',
  per_source    jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals        jsonb NOT NULL DEFAULT '{}'::jsonb,
  error         text,
  started_at    timestamp,
  completed_at  timestamp,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_jobs_brand_status_idx ON scan_jobs (brand_id, status);
CREATE INDEX IF NOT EXISTS scan_jobs_user_active_idx ON scan_jobs (user_id, status) WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS source_health (
  brand_id        uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  source          text NOT NULL,
  consecutive_failures int NOT NULL DEFAULT 0,
  last_failure_at timestamp,
  last_failure_reason text,
  paused_until    timestamp,
  last_successful_scan_at timestamp,
  PRIMARY KEY (brand_id, source)
);

CREATE TABLE IF NOT EXISTS sentiment_cache (
  content_hash    text PRIMARY KEY,
  sentiment       text NOT NULL,
  sentiment_score numeric(3, 2) NOT NULL,
  cached_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sentiment_cache_cached_at_idx ON sentiment_cache (cached_at);

COMMIT;
```

**Boot order:** `server/index.ts` runs migrations → awaits completion → starts cron + worker. This prevents the cron firing mid-migration.

### 3.17 Backwards-incompatible code changes

- `server/citationChecker.ts` — remove the `createBrandMention(...)` call at lines 1050-1075 entirely. AI citations no longer write to `brand_mentions`. Verify no consumer reads `ai:%`-platform rows (grep at implementation time).
- `server/routes/intelligence.ts` — delete every handler under `/api/brand-mentions/*` (the duplicates).
- `server/routes/publications.ts` — delete every handler under `/api/brand-mentions/*` (the duplicates).
- `server/routes.ts` — register the new `mentions` router instead.
- `client/src/pages/geo-tools.tsx` — Mentions tab content replaced with `<MentionsTab brandId={selectedBrandId} />`. The ~300 lines of inline JSX deleted.
- `shared/schema.ts` — `brandMentions` table updated with new columns; `brands` gets `monitor_mentions`; new tables added.
- `server/scheduler.ts` — `runMentionScanJob` rewritten to enqueue `mention_scan` jobs into `content_generation_jobs` rather than calling `scanBrandMentions` inline.
- `server/contentGenerationWorker.ts` — new `mention_scan` case in the dispatch.

### 3.18 Deliberate non-goals

To keep scope tight (Option A):

- No alerts (email / Slack / webhook / push). Locked Q4.
- No competitor / SoV view. Out of scope per Q12 dialog.
- No saved boolean queries / power-user search. Q3.
- No CSV / API export. Future wave.
- No team assignment / "who's handling this". Future wave.
- No reply drafting. Future wave.
- No GEO-relevance scoring on mentions ("how likely is this thread to be cited by AI"). Future wave.
- No author-reputation scoring. Future wave.
- No AI-citation cross-reference. Removed from this feature entirely (Q5/Q7).
- No `j`/`k` keyboard shortcuts. Q15.
- No additional sources (Twitter, LinkedIn, news, YouTube, GitHub, Stack Overflow, Product Hunt). Locked Q2.

---

## 4. Production characteristics

| Property | Value |
|---|---|
| Sources | Reddit (OAuth), Hacker News, Quora (best-effort) |
| Scan frequency | Daily cron + manual (4h per-brand cooldown) |
| Scan execution | Background worker on `content_generation_jobs` |
| Polling cadence | 2s while a scan is active |
| Pagination | Cursor-based, 50/page, "Load more" |
| Retention | Mentions kept forever; scan_jobs 90 days; sentiment_cache 180 days |
| Sentiment | gpt-4o-mini, batched 10/call, content-hash cached, 200/brand/day cap |
| Cost ceiling | ~$0.15/brand/month worst case (with brand-presence gate) |
| Rate limits | Per-instance for upstream sources; per-user for manual-add; per-brand for sentiment |
| Concurrency | Idempotent scan-start; no double-scan possible |
| Observability | Sentry on every catch; structured logs with `scanId`; per-scan metrics |
| Mobile | Equal experience at 375px |
| Accessibility | WCAG AA + axe-core in CI |
| Tests | 4 buckets (scanner unit / routes unit / component / fixture integration) |

---

## 5. Open questions for implementation

These are intentionally deferred to the implementation phase, not the spec:

1. Reddit OAuth credentials — user creates the script app, pastes credentials into env vars at deploy.
2. Final exact text of UI strings — copywriter pass during implementation.
3. axe-core severity threshold (`critical` vs `serious`) — pick at first test run.
4. Whether to short-circuit the brand-presence gate for very long content (>50k chars) — measure during integration smoke.
5. Whether to fold the existing nightly prune job into a new `mentionsHousekeeping` cron or keep them separate — implementation-time call.
