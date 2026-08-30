# V4 decomposition integrity audit

Audit date: 2026-08-31

Compared current `remediation-program-2026-08-28` with `origin/main`.

This audit used TypeScript AST enumeration, source diffs, import-graph tracing, and read-only grep checks. It did not start Docker, a database, or the test suite.

## Schema exports: lost, renamed, duplicated

None. All 260 exports from origin/main are reachable from the current barrel.

The AST enumeration found 260 exports before and 260 exports after. It found zero removed names and zero added names. Therefore, it found no rename. No old export name required a consumer grep.

The enumeration included tables, relations, zod schemas, inferred types, enums, constants, functions, and other named declarations. The current barrel re-exports all 13 files under `shared/schema/`.

The duplicate re-export scan found zero names exported by more than one barrel module.

### Table definitions

The comparison found 71 table objects on both sides. Sixty-six table definitions match after removing comments and formatting. Their columns, column types, defaults, `notNull` flags, primary keys, and indexes match.

Five tables differ from `origin/main`. The differences have migration evidence and do not show a silent decomposition loss.

| Table                     | Current difference                                                                                         | Migration evidence                                                                       | Result                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `apiCosts`                | `userId` now references `users.id` with `cascade`. `estCostCents` changed from integer to `numeric(12,6)`. | `migrations/0019_api_costs.sql:14`; `migrations/0122_api_costs_cost_precision.sql:52-53` | Matches the migrations. Other columns, defaults, nullability, key, and indexes match. |
| `auditLogs`               | `userId` now references `users.id` with `set null`.                                                        | `migrations/0017_audit_logs.sql:21`                                                      | Matches the migration. Other properties match.                                        |
| `citationRuns`            | Added nullable `lastAdvanceStartedAt`.                                                                     | `migrations/0123_citation_run_last_advance.sql:38`                                       | Matches the migration. Existing properties match.                                     |
| `emailFailures`           | `userId` now references `users.id` with `set null`.                                                        | `migrations/0020_email_status_and_failures.sql:21`                                       | Matches the migration. Other properties match.                                        |
| `notificationPreferences` | `userId` now references `users.id` with `cascade`.                                                         | `migrations/0025_notification_preferences.sql:19`                                        | Matches the migration. Other properties match.                                        |

The current schema import graph has no cycle. `platform.ts:14` imports `users` from `identity.ts`. `identity.ts` imports no local schema module. `brands.ts` imports `identity.ts`, and no path returns to `platform.ts`.

## Storage methods: missing, orphaned, colliding

The runtime method count before the split was 309. The current composed runtime object produces 313 distinct methods.

The `IStorage` interface had 307 methods in `origin/main`. The current interface has 305 methods. The current interface is not a complete baseline because it removed five old alert-setting methods and added three newer methods.

| Check                                    | Before | Current | Result                                                              |
| ---------------------------------------- | -----: | ------: | ------------------------------------------------------------------- |
| Runtime storage methods                  |    309 |     313 | Five baseline methods are missing. Nine newer methods are present.  |
| `IStorage` methods                       |    307 |     305 | Five baseline methods are missing. Three newer methods are present. |
| Methods declared without implementation  |      0 |       0 | No current interface method lacks an implementation.                |
| Duplicate domain method names            |      0 |       0 | No collision exists across the 11 spread domain objects.            |
| Domain methods not spread into `storage` |      0 |       0 | Every direct domain object is spread.                               |

The five methods missing from both the current interface and final runtime object are:

`createAlertSetting`, `getAlertSettings`, `getAlertSettingById`, `updateAlertSetting`, and `deleteAlertSetting`.

The nine current runtime additions relative to `origin/main` are `countAutomaticCitationRunsSince`, `createRun`, `getActiveRuns`, `getActiveRunsByUser`, `getReDetectAllLastRunAt`, `getRun`, `getRunsByBrand`, `setReDetectAllLastRunAt`, and `updateRun`.

The final spread order is `databaseStorageObject`, `chatbotStorage`, `identityStorage`, `competitorsStorage`, `jobsStorage`, `brandsStorage`, `factAgentStorage`, `platformStorage`, `citationsStorage`, `promptsStorage`, `signalsStorage`, and `contentStorage` at `server/storage.ts:1065-1077`.

`DatabaseStorage` has no method declarations. `databaseStorageObject()` therefore adds no methods at runtime. The 11 direct domain objects provide all 313 current methods.

`workflowStorage.ts` is not part of the final `storage` composition. It defines no method of its own. It spreads `jobsStorage` and remains a separate adapter used by `workflowEngine`.

The current composition has no method collision. A duplicate-key scan across all 11 spread objects found zero duplicates. Therefore, no later spread silently replaces an earlier implementation.

The storage surface gate is not count-only. `scripts/storageSurface.ts:173-223` compares exact interface names, implementation names, duplicate definitions, and normalized method bodies. The schema gate is also name-based. `scripts/schemaExportSurface.ts:111-125` reports removed and added names, so a remove-plus-add pair does not pass as an unchanged count. CI runs these gates at `.github/workflows/ci.yml:63` and `.github/workflows/ci.yml:73`.

The current gates pass their checked baselines:

`Export surface unchanged. 260 exports.`

`Storage surface intact. 305 interface methods, 313 implementations, 0 relocated, no duplicates, no body changed.`

The storage baseline is not `origin/main`. `.audit/B5/storage-surface-before.json` already contains the current 305-interface and 313-implementation state. Commit `fd73edd` removed the five alert-setting methods before updating that baseline. The gate therefore cannot detect this earlier loss. It would detect a later drop if the baseline stayed unchanged.

## Cross-domain this-calls verified

The AST scan found 25 total `this.` calls. Sixteen stay within their defining domain. The nine cross-domain calls below all target methods on the final composed object.

| Caller                                                                | Callee                                            | Present? |
| --------------------------------------------------------------------- | ------------------------------------------------- | -------- |
| `server/storage/competitorsStorage.ts:373` `getCompetitorLeaderboard` | `brandsStorage.getBrandById`                      | Yes      |
| `server/storage/competitorsStorage.ts:374` `getCompetitorLeaderboard` | `brandsStorage.getBrands`                         | Yes      |
| `server/storage/brandsStorage.ts:185` `getLatestBrandVisibility`      | `citationsStorage.getBrandVisibilitySnapshots`    | Yes      |
| `server/storage/platformStorage.ts:164` `recordCurrentMetrics`        | `promptsStorage.getBrandPromptsByBrandId`         | Yes      |
| `server/storage/platformStorage.ts:166` `recordCurrentMetrics`        | `citationsStorage.getGeoRankingsByBrandPromptIds` | Yes      |
| `server/storage/platformStorage.ts:185` `recordCurrentMetrics`        | `citationsStorage.getCitationQualities`           | Yes      |
| `server/storage/platformStorage.ts:199` `recordCurrentMetrics`        | `signalsStorage.getBrandHallucinations`           | Yes      |
| `server/storage/citationsStorage.ts:607` `getCitationQualities`       | `promptsStorage.getBrandPromptsByBrandId`         | Yes      |
| `server/storage/citationsStorage.ts:704` `getCitationQualityStats`    | `promptsStorage.getBrandPromptsByBrandId`         | Yes      |

No `this.` call targets one of the five missing alert-setting methods.

## Findings

| ID    | severity | file:line                                         |
| ----- | -------- | ------------------------------------------------- |
| V4-01 | high     | `server/storage.ts:749`; `server/storage.ts:1065` |

What is missing or wrong:

`createAlertSetting`, `getAlertSettings`, `getAlertSettingById`, `updateAlertSetting`, and `deleteAlertSetting` existed in the `origin/main` interface and `DatabaseStorage` implementation. The current `IStorage`, `platformStorage`, and final `storage` object omit all five. A whole-repository search found no current caller.

Runtime symptom:

Any legacy route or consumer that calls `storage.getAlertSettings(brandId)` receives `TypeError: storage.getAlertSettings is not a function`.

Confidence: high.

| ID    | severity | file:line                                                          |
| ----- | -------- | ------------------------------------------------------------------ |
| V4-02 | medium   | `scripts/storageSurface.ts:173-223`; `.github/workflows/ci.yml:73` |

What is missing or wrong:

The storage gate checks exact names against a rewritten branch-local baseline. It does not compare the current surface with `origin/main`. The branch-local baseline already omits the five methods, so CI reports a pass while the five-method loss remains.

Runtime symptom:

CI can report `Storage surface intact` while a consumer of one removed method later receives `TypeError: storage.<method> is not a function`.

Confidence: high.

No other finding was confirmed. The schema barrel has no lost, renamed, or duplicated export. The 66 unchanged table definitions retain their full shape. The five table differences have matching migrations. All cross-domain `this.` calls resolve.

## Verdict: GAPS FOUND

Counts: 0 blocker, 1 high, 1 medium, 0 low. The schema decomposition and cross-domain binding checks pass. The storage decomposition has five missing methods, and its current CI baseline cannot detect that earlier loss.
