# B5 storage composition test report

## Scope

This change updates the test subject only.

No test assertion changed.

No server file changed.

## Updated tests

| File                                                   | Change                                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `tests/unit/articlesAIGenerated.test.ts`               | Imported `storage`. Removed the local `DatabaseStorage` instance. Updated the existing parameter type reference. |
| `tests/unit/brandFactScrapePagesStorage.test.ts`       | Imported `storage`. Removed the local `DatabaseStorage` instance.                                                |
| `tests/unit/brandFactScrapeRunsStorage.test.ts`        | Imported `storage`. Removed the local `DatabaseStorage` instance and the `Object.assign` patch.                  |
| `tests/unit/brandFactSheetConflictsQuery.test.ts`      | Imported `storage`. Removed the local `DatabaseStorage` instance.                                                |
| `tests/unit/brandMonthlyCostCapsStorage.test.ts`       | Imported `storage`. Removed the local `DatabaseStorage` instance.                                                |
| `tests/unit/contentJobCompletionTransaction.test.ts`   | Loaded `storage`. Replaced each temporary `DatabaseStorage` instance.                                            |
| `tests/unit/geoSignalRuns.test.ts`                     | Imported `storage`. Removed the local `DatabaseStorage` instance.                                                |
| `tests/unit/mentionsStorage.test.ts`                   | Imported `storage`. Removed the local `DatabaseStorage` instance and the `Object.assign` patch.                  |
| `tests/unit/scrapeLockPinnedClient.test.ts`            | Imported `storage`. Removed the local `DatabaseStorage` instance.                                                |
| `tests/integration/competitorGeoRankingUpsert.test.ts` | Loaded `storage` inside the existing real-database gate.                                                         |

## Test results

Before the change, 222 test files passed.

Before the change, 2 test files failed.

Before the change, 20 test files skipped.

Before the change, 1,681 tests passed.

Before the change, 3 tests failed.

Before the change, 91 tests skipped.

The three failures lacked composed storage methods.

After the change, 224 test files passed.

After the change, 20 test files skipped.

After the change, 1,684 tests passed.

After the change, 91 tests skipped.

`npm.cmd test -- --maxWorkers=1` passed after the change.

## Other failures

No test failed for a reason unrelated to the storage import.
