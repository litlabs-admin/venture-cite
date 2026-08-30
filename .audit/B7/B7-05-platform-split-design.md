# B7-05: platform module split — design, and the three B5 leftovers

Everything below was checked against code on this branch: `shared/schema/platform.ts`
(382 lines), `server/storage/platformStorage.ts` (478 lines, 31 methods), the
migrations that created each table, and every call site under `server/`. Where a
migration and `shared/schema/platform.ts` disagree, both are stated and the
migration (the real database) is treated as authoritative.

## 1. The 15 tables: methods, co-use, FKs

"Co-query" below means: touched in the same function body (real coupling), not
merely reachable from the same route file. Where a route file combines tables
without a shared function or transaction, that is called out separately as
weaker, route-level evidence.

| Table                     | platformStorage methods                                                                                                                          | Other code that touches it                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Co-queried with (same function body)                                                                                                                                                                                                                                                                                        | FK out                                                                                                                                                                                                    | FK in                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `analytics`               | `getAnalytics`, `updateAnalytics` — **zero callers anywhere** (not routes, not jobs, not tests)                                                  | `server/storage/citationsStorage.ts` `createCitation` and `incrementArticleCitations` write `analytics.totalCitations` directly, bypassing `platformStorage` entirely                                                                                                                                                                                                                                                                                                                      | `getAnalytics` also reads `schema.articles` (content) in the same body to recompute totals from scratch, ignoring the column `citationsStorage` just wrote                                                                                                                                                                  | none                                                                                                                                                                                                      | none                                     |
| `metricsHistory`          | `createMetricsSnapshot`, `getMetricsHistory`, `recordCurrentMetrics`                                                                             | `server/lib/runChangeAlerts.ts` (invoked from `server/citationChecker.ts`, citations domain), `server/lib/workflows/weeklyCatchup.ts` (jobs domain), `server/routes/dashboard.ts`, `server/routes/intelligence.ts` (citations route)                                                                                                                                                                                                                                                       | `recordCurrentMetrics` calls `this.getBrandPromptsByBrandId` (prompts), `this.getGeoRankingsByBrandPromptIds` + `this.getCitationQualities` (citations), `this.getBrandHallucinations` (signals), then `this.createMetricsSnapshot` (platform) — 4 domains in one method                                                    | `brandId` → `brands.id` (cascade)                                                                                                                                                                         | none                                     |
| `alertSettings`           | `createAlertSetting`, `getAlertSettings`, `getAlertSettingById`, `updateAlertSetting`, `deleteAlertSetting` — **zero callers anywhere**          | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | none                                                                                                                                                                                                                                                                                                                        | `brandId` → `brands.id` (cascade)                                                                                                                                                                         | `alertHistory.alertSettingId` (nullable) |
| `alertHistory`            | `createAlertHistory`, `getAlertHistory`                                                                                                          | Written by `server/lib/runChangeAlerts.ts` (citations flow); read by `server/lib/weeklyDigestEmitter.ts` (jobs) and `server/routes/dashboard.ts`                                                                                                                                                                                                                                                                                                                                           | `runChangeAlerts.recordRunChangeAlerts` never sets `alertSettingId` — every row is created with it `null`. The alert-settings ↔ alert-history relationship this FK implies is never exercised                                                                                                                               | `alertSettingId` → `alertSettings.id` (cascade, nullable, always null in practice); `brandId` → `brands.id` (cascade, nullable)                                                                           | none                                     |
| `communityPosts`          | `createCommunityPost`, `getCommunityPosts` (2 zero-caller variants: `getCommunityPostById` unused), `updateCommunityPost`, `deleteCommunityPost` | `server/routes/community.ts` only — touches no other table                                                                                                                                                                                                                                                                                                                                                                                                                                 | none (self-contained CRUD)                                                                                                                                                                                                                                                                                                  | `brandId` → `brands.id` (cascade)                                                                                                                                                                         | none                                     |
| `emailFailures`           | none — accessed only via raw `db`                                                                                                                | `server/emailService.ts` `recordEmailFailure` (insert-only DLQ; never read back anywhere)                                                                                                                                                                                                                                                                                                                                                                                                  | writes happen inside the same retry helper that sends the email itself (cross-cutting: called from weekly-report jobs, alert emails, waitlist, etc.)                                                                                                                                                                        | `userId` → `users.id` **ON DELETE SET NULL** — real DB constraint (migration `0020_email_status_and_failures.sql`); **not declared** in `shared/schema/platform.ts` (plain `varchar`, no `.references()`) | none                                     |
| `apiCosts`                | none — accessed only via raw `db`                                                                                                                | Written by `server/outbox/contentCostOutboxAdapter.ts` (enqueued from `contentStorage.ts`, content domain; drained by the jobs-domain outbox worker); retention-deleted by raw SQL in `server/routes/cron.ts`                                                                                                                                                                                                                                                                              | write-only + one raw retention delete; never selected/aggregated for reporting anywhere                                                                                                                                                                                                                                     | `userId` → `users.id` **ON DELETE CASCADE** — real DB constraint (migration `0019_api_costs.sql`); **not declared** in schema (`varchar` only)                                                            | none                                     |
| `auditLogs`               | none — accessed only via raw `db`                                                                                                                | `server/lib/audit.ts` (`logAudit`/`withAudit`/`logSystemAudit`), called from `scheduler.ts`, `routes.ts`, `routes/userAccount.ts`, `webhookHandlers.ts`, `routes/brands.ts`; also read directly in `routes/userAccount.ts`'s GDPR data-export endpoint                                                                                                                                                                                                                                     | The export endpoint reads `auditLogs` in a `Promise.all` alongside `articles`, `competitors`, `brandHallucinations`, `brandMentions`, `brandPrompts` — route-level aggregation, not a shared query                                                                                                                          | `userId` → `users.id` **ON DELETE SET NULL** — real DB constraint (migration `0017_audit_logs.sql`); **not declared** in schema at all                                                                    | none                                     |
| `notificationPreferences` | none — accessed only via raw `db`                                                                                                                | `server/lib/notificationPrefs.ts`, used only by `server/routes/userAccount.ts`'s preferences-center endpoints                                                                                                                                                                                                                                                                                                                                                                              | `setPreference` dual-writes `users.weeklyReportEnabled` in the same function; the scheduler/digest/unsubscribe path (`scheduler.ts`, `weeklyDigestEmitter.ts`, `routes/unsubscribe.ts`) reads `users.weeklyReportEnabled` directly and never touches this table — the table's only current effect is mirrored into identity | `userId` → `users.id` **ON DELETE CASCADE** — real DB constraint (migration `0025_notification_preferences.sql`); **not declared** in schema                                                              | none                                     |
| `schemaAudits`            | none — accessed only via raw `db`                                                                                                                | `server/routes/geoSignals.ts` only; retention-deleted by raw SQL in `cron.ts`                                                                                                                                                                                                                                                                                                                                                                                                              | Same route function also calls `storage.getArticleById` (content) and `storage.recordGeoSignalRun` (citations) — a content+citations pipeline, cached by URL hash, not owned by either                                                                                                                                      | none                                                                                                                                                                                                      | none                                     |
| `competitorFavicons`      | none                                                                                                                                             | **none anywhere** — no route, job, lib, or test reads or writes this table. Only the schema declaration and the migration that created it (`0031_autopilot_and_logos.sql`) mention it                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                           | none                                                                                                                                                                                                      | none                                     |
| `sourceHealth`            | `getSourceHealth`, `upsertSourceHealth`                                                                                                          | `server/lib/mentionScanner.ts`, `server/lib/sourceHealth.ts` — **100% signals-domain callers, no exceptions**                                                                                                                                                                                                                                                                                                                                                                              | `mentionScanner.ts` calls `getSourceHealth` and `countSentimentCallsForBrandSince` in the same scan pass                                                                                                                                                                                                                    | `brandId` → `brands.id` (cascade)                                                                                                                                                                         | none                                     |
| `sentimentCache`          | `getCachedSentiment`, `upsertCachedSentiment`, `pruneOldSentimentCache` (zero callers outside one unit test)                                     | `server/lib/sentimentBatcher.ts` (called from `mentionScanner.ts` and `routes/mentions.ts`) — **100% signals-domain callers, no exceptions**                                                                                                                                                                                                                                                                                                                                               | none beyond signals                                                                                                                                                                                                                                                                                                         | none                                                                                                                                                                                                      | none                                     |
| `tourEvents`              | `recordTourEvents`, `deleteOldTourEvents`                                                                                                        | `server/routes/tours.ts` (write), `server/lib/tourCleanup.ts` (retention job)                                                                                                                                                                                                                                                                                                                                                                                                              | `routes/tours.ts` also calls `getTourState`/`patchTourState` (which touch **only** `users.onboardingState`, identity — never `tourEvents`) and `getBrandByIdForUser` (brands) in the same route file — route-level co-use only, no shared function body with `tourEvents` itself                                            | `userId` → `users.id` (cascade); `brandId` → `brands.id` (set null)                                                                                                                                       | none                                     |
| `systemState`             | `getSystemState`, `setSystemState`                                                                                                               | Through `platformStorage`: `server/lib/jobDebounce.ts` (jobs), `server/lib/brandActivation.ts` (brands), `server/lib/siteHealthHistory.ts` + `routes/dashboard.ts` (siteHealth), `server/lib/factAgent/v2/factScrapeBackstop.ts` (factAgent). **Bypassing `platformStorage` via raw `db`**: `server/storage/promptsStorage.ts` (`getReDetectAllLastRunAt`/`setReDetectAllLastRunAt`, prompts domain) and `server/routes/board.ts` (an internal kanban/ticket admin tool, no domain at all) | none — every consumer keys off a distinct, unrelated string key (`job:*`, `activation:*`, `site_health:*`, dead-man's-switch, `re-detect-all:*`, board ticket keys)                                                                                                                                                         | none                                                                                                                                                                                                      | none                                     |

Two methods allocated to `platform` in B5 touch **no platform table at all**:
`getTourState` and `patchTourState` read/write `schema.users.onboardingState`
exclusively (identity). They are named after `tourEvents` but never query it.
This is a method-placement defect independent of the schema partition — see
§4.

## 2. Proposed partition

**Move 2 tables + 1 method to the existing `signals` domain. Delete 3 dead
tables and 6 dead methods (or, if the team prefers not to delete in this pass,
leave them explicitly flagged rather than "placed"). Keep the remaining 10
tables as `platform`.** No new module is created.

### 2a. Move to `signals`: `sourceHealth`, `sentimentCache`, `countSentimentCallsForBrandSince`

Evidence: every single caller of `getSourceHealth`, `upsertSourceHealth`,
`getCachedSentiment`, `upsertCachedSentiment`, and
`countSentimentCallsForBrandSince` lives in the signals domain's own mention-
scanning pipeline (`mentionScanner.ts`, `sourceHealth.ts`, `sentimentBatcher.ts`,
`routes/mentions.ts`). `countSentimentCallsForBrandSince` doesn't even query a
platform table — its body queries `schema.brandMentions`, which is declared in
`shared/schema/signals.ts` and implemented in `signalsStorage.ts` (804 lines, 47
methods, confirmed by reading the file). `signals` already imports `brands`
(per B4), so moving `sourceHealth` (which needs `brands`) introduces no new
import edge and no cycle risk.

**Cost of this move, checked against all 31 `platformStorage` methods:** zero.
None of the 6 methods being moved is ever called together with a table that
stays in `platform`, inside the same function body. `recordCurrentMetrics` is
the one method in `platformStorage` with heavy cross-domain reads (prompts,
citations, signals via `getBrandHallucinations`), but it never touches
`sourceHealth` or `sentimentCache`, so this move doesn't add or remove any of
its existing cross-`this` calls.

### 2b. Delete, don't place: `analytics`, `competitorFavicons`, `alertSettings`

These are not misplaced — they are dead, and partitioning dead code just moves
the debris.

- `analytics`: `getAnalytics`/`updateAnalytics` have no caller anywhere in
  `server/`, in tests, or in routes. The row is still written on every
  citation, though: `citationsStorage.ts`'s `createCitation` and
  `incrementArticleCitations` increment `analytics.totalCitations` directly
  (two extra queries per citation) for a column `getAnalytics` doesn't even
  read back — it recomputes `totalCitations` from `articles.citationCount`
  instead. Two live domains maintain a table that a third, dead domain reads
  from with a formula that ignores what was written.
- `competitorFavicons`: confirmed zero consumers of any kind — no read, no
  write, no route, no job, no test, in either `server/` or `client/`. Only the
  schema file and its origin migration mention it.
- `alertSettings`: all 5 CRUD methods (`createAlertSetting` through
  `deleteAlertSetting`) have zero callers. The FK that would connect it to
  live code — `alertHistory.alertSettingId` — is never populated:
  `runChangeAlerts.ts`, the only writer of `alertHistory`, never sets that
  column. This is a fully unshipped "configure your own alert thresholds and
  channels" feature; the alerts that actually fire are a hardcoded rule
  (`VISIBILITY_DROP_PTS = 10`, always `sentVia: "in_app"`) with no connection
  to this table.

If the team chooses not to delete these in this pass, they must stay explicitly
flagged as dead in whatever module holds them — they should not silently ride
along as if they were live infrastructure like `systemState` or `auditLogs`.

### 2c. Remains `platform`: `metricsHistory`, `alertHistory`, `communityPosts`, `emailFailures`, `apiCosts`, `auditLogs`, `notificationPreferences`, `schemaAudits`, `tourEvents`, `systemState`

This is the honest catch-all the task asked for, and it holds together for a
real reason this time: every table in it either (a) has genuine multi-domain
consumers with no single natural owner, or (b) is cross-cutting infrastructure
that every domain calls into without belonging to any of them.

- **`systemState` is the strongest case for a catch-all in the whole audit.**
  It has _six_ independent, unrelated consumers: jobs (`jobDebounce.ts`),
  brands (`brandActivation.ts`), siteHealth (`siteHealthHistory.ts`,
  `dashboard.ts`), factAgent (`factScrapeBackstop.ts`'s dead-man's-switch),
  prompts (`promptsStorage.ts`'s re-detect-all ledger, via **raw `db`**,
  bypassing `platformStorage`), and an internal kanban board
  (`routes/board.ts`, also via raw `db`) that isn't part of any of the 13
  domains at all. No single domain can claim it without arbitrarily
  privileging one of six unrelated callers.
- **`metricsHistory` and `alertHistory`** are genuinely cross-domain: written
  from the citations flow (`recordCurrentMetrics`, `runChangeAlerts.ts`), read
  by jobs (`weeklyCatchup.ts`, `weeklyDigestEmitter.ts`) and general
  dashboard/intelligence routes. They're a shared "what changed" ledger that
  citations produces and jobs/dashboard consume — a platform-level concern by
  construction, not a leftover.
- **`auditLogs`** is compliance logging called from routes across brands,
  users, webhooks, and the scheduler — cross-cutting by design.
- **`emailFailures`** is the DLQ for the shared email-sending path, which
  itself serves weekly reports, alerts, and account emails from multiple
  domains.
- **`apiCosts`** is written via an outbox from the content domain and drained
  by the jobs-domain outbox worker — a billing/cost-accounting concern that
  spans both and belongs to neither.
- **`notificationPreferences`** is weaker evidence than the others: today it
  has exactly one consumer surface (`routes/userAccount.ts`'s preferences
  center) and its only live notification type (`weekly_report`) dual-writes
  into `users.weeklyReportEnabled`, which is what the scheduler actually
  reads. Its current behavioral weight sits almost entirely in identity. It
  is kept in the catch-all rather than moved because the design intent
  (stated in its own file header) is to grow past one type, at which point
  the identity coupling stops being the dominant story — moving it now on the
  strength of a single-type snapshot would be guessing ahead of the evidence,
  which is exactly what this audit is supposed to avoid.
- **`schemaAudits`** is a URL-keyed cache read and written from one route
  (`geoSignals.ts`) that in the same function also touches `content` (
  `getArticleById`) and `citations` (`recordGeoSignalRun`). It's genuinely a
  shared cache for a pipeline that spans two other domains, so it has no
  single home there either.
- **`communityPosts`** is the one table left in the catch-all where the
  evidence is simply silent rather than pointing multiple directions. It is
  fully self-contained — `routes/community.ts` is its only caller and never
  joins it against anything else in a function body. Nothing in the codebase
  argues for `content` (it's never queried alongside `articles`) or for
  `signals` (never queried alongside `brandMentions`) or for any other
  domain. A one-table `community` module would repeat the exact mistake B4
  already rejected — trading one bad boundary for three — so it stays here,
  named explicitly as the table this design could not place on evidence,
  not as a table that was groupable and got left out by omission.

## 3. Net result

|                                | Tables                                                 | platformStorage methods                                                                                                                                  | Notes                                                                        |
| ------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Move to `signals`              | 2 (`sourceHealth`, `sentimentCache`)                   | 6 (`getSourceHealth`, `upsertSourceHealth`, `getCachedSentiment`, `upsertCachedSentiment`, `pruneOldSentimentCache`, `countSentimentCallsForBrandSince`) | Zero cross-boundary cost measured                                            |
| Delete or explicitly flag dead | 3 (`analytics`, `competitorFavicons`, `alertSettings`) | 7 (`getAnalytics`, `updateAnalytics`, `createAlertSetting`, `getAlertSettings`, `getAlertSettingById`, `updateAlertSetting`, `deleteAlertSetting`)       | Zero callers each; deleting removes dead writes in `citationsStorage.ts` too |
| Stays `platform`               | 10                                                     | 18 (all methods on the remaining 10 tables, plus `getTourState`/`patchTourState`, which touch no platform table — see §4)                                | Genuine cross-domain catch-all, evidence-backed per table above              |

`platform` goes from 15 tables / 373 schema lines / 31 storage methods to 10
tables and 18 methods that survive contact with real usage evidence — smaller,
and every remaining table has a stated reason it resists a single-domain home.

## 4. A defect this design surfaces but does not fix

`getTourState` and `patchTourState` (2 of the 31 `platformStorage` methods)
read and write `schema.users.onboardingState` only. They never touch
`tourEvents`, the platform table they're named after and colocated with. Per
B5's own allocation notes, they were placed in `platform` by inspection
alongside `recordTourEvents`/`deleteOldTourEvents` because all four are called
from the same route file (`routes/tours.ts`), not because of what table they
touch. On table-level evidence, they belong in `identity`'s storage module. This
is a storage-layer placement issue, not a schema one — `users` is already in
`identity`'s schema module — so it's a candidate for a narrow follow-up move,
not part of this schema partition.

---

## 5. The three B5 leftovers

### 5.1 `databaseStorageObject()` — confirmed empty and unused; here is what removing it touches

`server/databaseStorage.ts`'s `class DatabaseStorage` (157 lines) has **zero
methods** — every line inside the class body is a comment; B5's eleven
extractions moved every method out. `databaseStorageObject()` in
`server/storage.ts` (lines 1050–1075) copies `Object.getOwnPropertyNames` off
`new DatabaseStorage()`'s prototype and returns it; with an empty class this
returns an object with zero own enumerable properties, and it's spread first
(and therefore fully overridable) in the `storage` composition. It contributes
nothing at runtime today. Confirmed by:

- No file anywhere imports the `DatabaseStorage` type or a value from it except
  `server/storage.ts` itself.
- The file's own re-export, `export { applyTourStateOp } from "./lib/tourStateOps";`,
  has zero importers — `platformStorage.ts` already imports `applyTourStateOp`
  directly from `./lib/tourStateOps`, not through this re-export.
- `scripts/storageSurface.ts` (the B5 gate) already `fs.existsSync`-guards its
  file list before parsing `server/databaseStorage.ts`, so deleting the file
  requires **no change** to that script.

Removing it touches:

1. `server/databaseStorage.ts` — delete the file.
2. `server/storage.ts` — remove `import { DatabaseStorage } from "./databaseStorage"`,
   the `databaseStorageObject()` function, and `...databaseStorageObject()` from
   the `storage` composition. The dozens of now-fully-unused type imports at the
   top of `databaseStorage.ts` go with the file; nothing in `storage.ts` needs
   those types independently (each domain module imports its own types from
   `@shared/schema`).
3. Six test files that currently do
   `vi.mock("../../server/databaseStorage", () => ({ DatabaseStorage: class {} }))`:
   `tests/unit/citationRunStaleness.test.ts`, `citationRunGuards.test.ts`,
   `citationCheckerBatchInsert.test.ts`, `citationChecker.matcherAuthority.test.ts`,
   `citationChecker.kickoff.test.ts`, `competitorDetectionsCap.test.ts`. Each of
   these already separately mocks `../../server/storage` wholesale (with a hand-
   built `storageMock`) and `../../server/db`, so the `databaseStorage` mock is
   already dead insurance — nothing on the tested code path reaches the real
   module. After deletion, `vi.mock` targeting a path that no longer resolves
   will fail at mock-hoist time, so these six lines must be deleted in the same
   change, not left behind.
4. `scripts/genStorageBriefs.mjs` contains the string `new DatabaseStorage()`
   only inside a text template it once used to generate B5's dispatch briefs
   (line 97, a string literal describing the pattern to the agent, not
   executable code). It does not need to change; it's a one-time codegen
   artifact from a program phase that's finished.

### 5.2 "Four test files import `DatabaseStorage` directly" — **stale**

This is no longer true. `grep`ing the full `tests/` tree for
`import.*DatabaseStorage` and for `new DatabaseStorage(` returns **zero**
matches. `.audit/B5/B5-fix-tests-report.md` records that this exact problem —
tests instantiating `new DatabaseStorage()` locally instead of using the
composed `storage` — existed for **ten** files (not four), and was already
fixed as part of B5 itself: `articlesAIGenerated.test.ts`,
`brandFactScrapePagesStorage.test.ts`, `brandFactScrapeRunsStorage.test.ts`,
`brandFactSheetConflictsQuery.test.ts`, `brandMonthlyCostCapsStorage.test.ts`,
`contentJobCompletionTransaction.test.ts`, `geoSignalRuns.test.ts`,
`mentionsStorage.test.ts`, `scrapeLockPinnedClient.test.ts`, and
`tests/integration/competitorGeoRankingUpsert.test.ts` — all now import
`storage` and were verified together (`npm test` went from 222 passed / 2
failed files to 224 passed / 0 failed).

The only remaining references to `DatabaseStorage` in `tests/` are the six
`vi.mock(...)` stub-outs covered in §5.1, which are not imports of the real
class — they replace it with `class {}` and exist only so the module resolves
during mocking. Nothing needs fixing here beyond the cleanup already described
in §5.1, item 3.

### 5.3 The narrow-import check

**Goal.** Fail CI when a _new_ file starts using the composed `storage.<x>()`
facade for calls that all resolve to a single domain, since that file could
have imported the narrow domain object (`import { signalsStorage } from
"../storage/signalsStorage"`) instead. This is the mechanism B5's own
`PARTITION.md` says is missing (§ "What actually fixes the god interface", item 2) — without it, "habit keeps everyone on the facade."

**What it inspects.**

1. **Method → domain map.** Reuse `scripts/storageSurface.ts`'s
   `implementations()` walk (it already knows, per method name, which file
   implements it, e.g. `server/storage/signalsStorage.ts`) rather than trusting
   `.audit/B5/allocation.json`, which is a point-in-time snapshot that will go
   stale the moment someone adds a method to a domain module without updating
   it. Map each source file to a domain name by its filename
   (`<domain>Storage.ts` → `<domain>`).
2. **Consumer scan.** Walk every `.ts`/`.tsx` file under `server/` (excluding
   `server/storage.ts` and everything under `server/storage/`, which are the
   implementation, not consumers) with the TypeScript AST (same approach as
   both existing surface scripts — call-expression matching, not regex, so it
   isn't fooled by an unrelated `.storage` property on some other object).
   For each file, confirm it imports the `storage` singleton from `../storage`
   (walk the import path, don't assume by name), then collect every
   `storage.<identifier>(` call expression's identifier.
3. **Per-file domain set.** For each consumer file, map its called method
   names through the method→domain map and take the set of distinct domains
   touched.
4. **Flagged files.** A file is a narrow-import candidate when its domain set
   has size exactly 1 **and** the file does not already import that domain's
   storage object directly for anything. Multi-domain files are never flagged
   — that is legitimate facade use B5 explicitly decided not to force-migrate.

**Ratchet, not a hard ban.** Following the same shape as
`schema:surface:check` (export-list diff) and `storageSurface.ts`
(implementation diff), this is a snapshot-and-compare script, not a static
rule:

```
npx tsx scripts/storageNarrowImportSurface.ts > .audit/B7/storage-narrow-import-baseline.json
npx tsx scripts/storageNarrowImportSurface.ts --check .audit/B7/storage-narrow-import-baseline.json
```

`--check` computes the current flagged-file set and compares it to the
baseline:

- A file **newly appearing** in the flagged set → failure. This is the actual
  gate: new code chose the wide facade for work a narrow import would have
  served.
- A file **leaving** the flagged set (migrated to a narrow import, or grew to
  touch a second domain) → reported as an improvement, not a failure. The
  script can optionally rewrite the baseline down in this case, mirroring how
  `storageSurface.ts` reports "N relocated" without failing on it.
- The existing ~60-consumer backlog is the initial baseline, exactly as B5's
  own plan says: migrate opportunistically, prove it can only shrink.

Wire it as a new npm script, `storage:narrow-import:check`, and a new CI step
in `.github/workflows/ci.yml`'s `check` job, next to "Schema export surface."
Note in passing: `storage:surface:check` (the B5 gate itself,
`scripts/storageSurface.ts`) is **not currently wired into `package.json` or
CI at all** — it was only ever invoked manually per B5-domain-report. Wiring
the new narrow-import check is a good moment to also add the storage-surface
check as a CI step, since both close the same category of "the gate exists but
nothing runs it" gap.

**Break-testing, in the five directions this check can fail silently.**

1. _Must catch a real regression._ Add a scratch file that imports `storage`
   and calls only `storage.getSourceHealth(...)`. Confirm `--check` reports it
   as newly flagged and exits 1.
2. _Must not cry wolf on legitimate facade use._ Add a scratch file calling
   `storage.getBrandById` and `storage.getMetricsHistory` (two domains).
   Confirm it is not flagged.
3. _Baseline must be stable._ Run `--check` against a baseline captured from
   the same, unmodified tree. Confirm zero problems — proves the two AST walks
   (baseline capture, current check) agree with no code change in between.
4. _Ratchet must accept improvement._ Take one file from the real baseline,
   rewrite its calls to import the narrow domain object directly, run `--check`
   against the **old** baseline. Confirm it passes (the file leaving the
   flagged set is not a regression) — this is what proves the direction of the
   ratchet is "shrink always allowed, grow never is," not a frozen snapshot.
5. _Must not silently misclassify on drift._ Rename a method in one domain
   module's object literal without updating `IStorage`. Confirm the script
   errors explicitly (e.g., "no known domain for method X") instead of
   dropping the call from every file's domain set, which would let a stale
   method→domain map hide new violations behind a false pass.

Each of these should be run once against a throwaway copy before the check is
trusted, exactly as the B5 gate log entries describe ("break-tested in all
three directions... a dropped interface method, an edited body, and a
duplicated method were each caught by name") — this check has five failure
modes instead of three because it adds a ratchet direction and a map-integrity
requirement on top of the surface-diff pattern it's copying.

---

## 6. Sequenced plan

Each step must prove its own claim before the next step is allowed to build on
it — per this program's own repeated finding that a partition can pass every
existing gate while being incomplete.

1. **Delete `databaseStorageObject()` and `server/databaseStorage.ts`** (§5.1).
   Prove: `npx tsx scripts/storageSurface.ts --check .audit/B5/storage-surface-before.json`
   still reports 307 interface methods / no duplicates / no body changes (the
   script already tolerates the file's absence, so this is a real test of
   "nothing depended on it," not a script change hiding the gap). Then
   `npm run check`, full `npm test`. This step touches nothing under
   `shared/schema/` or `server/storage/*Storage.ts`, so it cannot be blamed for
   any later failure — do it first and get it out of the way clean.
2. **Delete the six stale `vi.mock("../../server/databaseStorage", ...)` lines**
   in the same change as step 1 (they will break otherwise). Prove: the six
   named test files still pass with the mock line removed — if any fails, that
   file was not actually insured by its `storage`/`db` mocks alone, which would
   itself be a finding worth stopping on.
3. **Flag (or delete) the three dead tables** — `analytics`,
   `competitorFavicons`, `alertSettings` — and their 7 dead methods. If
   deleting: remove the `citationsStorage.ts` writes to `analytics` first and
   confirm citation creation still passes its tests before touching the schema
   file, since that write is the one place a "dead" table turns out to still be
   live. Prove: `npm run schema:surface:check` after the schema edit (expected
   to report the removed exports — update the B4 baseline deliberately, don't
   let it pass by accident) and full `npm test`.
4. **Move `sourceHealth`, `sentimentCache`, and `countSentimentCallsForBrandSince`
   to `signals`** — the zero-cost move (§2a). Prove: `storageSurface.ts --check`
   against a freshly captured pre-move baseline (not the stale B5 one, since
   step 3 already changed the surface) reports the 3 methods relocated, zero
   duplicates, zero body changes; `schema:surface:check` against a freshly
   captured baseline for the same reason; full `npm test`, with particular
   attention to `tests/unit/mentionsStorage.test.ts` (currently the only test
   touching `pruneOldSentimentCache`).
5. **Fix the `getTourState`/`patchTourState` placement** (§4) — move them into
   identity's storage module, matching what they actually query. This is
   independent of steps 1–4 and can be done in any order relative to them, but
   should not be skipped silently: it's the one B5 allocation this audit found
   that disagrees with the table it touches.
6. **Build and wire the narrow-import check** (§5.3), including finally wiring
   `storage:surface:check` into CI alongside it. Prove: all five break-tests in
   §5.3 pass on a throwaway copy before the check is added to
   `.github/workflows/ci.yml`; capture the real baseline from the tree as it
   stands after steps 1–5 (not before — the moved/deleted methods must not
   appear in the baseline as phantom entries).

Steps 1–2 are pure deletion with no schema risk and should land first. Step 3
is the only step that removes a live write path (`citationsStorage.ts`'s
`analytics` increment) and should be verified in isolation before step 4 adds
a schema move on top of it. Step 4 is the only actual schema/storage
repartition this design proposes, and it is the cheapest possible version of
one: two tables, one method, zero cross-boundary cost. Steps 5 and 6 are
independent cleanups that can run in parallel with each other or with 1–4.
