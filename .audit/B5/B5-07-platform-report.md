# B5-07 platform extraction report

## scope

I moved 31 methods to `server/storage/platformStorage.ts`.

I removed the same 31 methods from `DatabaseStorage`.

`storage` spreads `platformStorage` last.

The remainder type excludes the platform method keys.

## calls through `this`

`getUserUsage` calls `this.resetMonthlyUsage()`.

Both methods are in the platform domain.

`recordCurrentMetrics` calls four methods through `this`.

It calls `getBrandPromptsByBrandId()`, `getGeoRankingsByBrandPromptIds()`, `getCitationQualities()`, and `getBrandHallucinations()`.

Those calls can resolve in other domains.

The module imports no storage domain.

The composed `storage` object resolves the calls at runtime.

## gate

`npx tsx scripts/storageSurface.ts --check .audit/B5/storage-surface-before.json` reports:

```
Storage surface intact. 307 interface methods, 315 implementations, 138 relocated, no duplicates, no body changed.
```

`node scripts/verifyStorageSplit.mjs platform --skip-tests` passes all seven checks.

It confirms all 31 allocated methods exist in the platform module.

It confirms no platform method remains in `DatabaseStorage`.

## verification

`npm run check` passes.

Tour-target verification reports 22 targets.

`npm run lint` exits with code 0.

It reports 860 existing warnings.

`npm run format:check` passes.

`npm test -- --maxWorkers=1` passes.

The suite reports 224 passed files and 20 skipped files.

The suite reports 1,684 passed tests and 91 skipped tests.

## consumer changes

No consumer file changed.

The change modifies the storage class, the storage composition, and the new platform module.

## defects

I found no functional defect during this move.

`recordCurrentMetrics` keeps three existing `as any` assertions.

I left them unchanged because the move requires verbatim method bodies.
