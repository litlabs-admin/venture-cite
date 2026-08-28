# B5-03 competitors storage extraction report

## Result

Moved 16 competitor methods into `server/storage/competitorsStorage.ts`.

`server/storage.ts` composes `competitorsStorage` after the remaining database methods.

The composed object overrides the removed class methods.

## Cross-domain calls

Four moved methods use `this.` calls.

`addCompetitorNameVariation` calls `this.getCompetitorById()`.

`getCompetitorLatestCitations` calls `this.getCompetitorCitationSnapshots()`.

`getCompetitorLeaderboard` calls `this.getCompetitors()`.

`getCompetitorLeaderboard` also calls `this.getBrandById()` and `this.getBrands()`.

The last two calls cross into the brands domain.

They remain `this.` calls.

The competitors module does not import a brands module.

## Verification

`npx tsx scripts/storageSurface.ts --check .audit/B5/storage-surface-before.json` passed.

The gate reported 307 interface methods and 315 implementations.

It reported 36 relocated methods, no duplicates, and no body changes.

`npm run check` passed.

Tour-target verification found 22 present targets.

`npm run lint` passed with 845 warnings and no errors.

`npm run format:check` passed.

`npm test -- --maxWorkers=1` passed.

The suite reported 224 passed files and 20 skipped files.

The suite reported 1,684 passed tests and 91 skipped tests.

## Consumer changes and defects

No application consumer file changed.

`tests/unit/rankingInsertRoundTrip.test.ts` now imports `competitorsStorage` directly.

The test had instantiated the removed class method.

No defect was found or changed during this move.
