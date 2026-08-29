# B5-10 signals storage extraction

## Result

- Moved 47 methods into `server/storage/signalsStorage.ts`.
- Deleted all 47 moved methods from `DatabaseStorage`.
- Added `signalsStorage` last in the `storage` composition.
- Added `keyof typeof signalsStorage` to the remaining class type.
- Changed no consumer file.

## `this.` calls

- `getHallucinationStats` keeps `this.getBrandHallucinations(brandId)` unchanged.
- That call stays inside the signals domain.
- No moved method calls a different domain through `this.`.
- The object uses `ThisType<IStorage>`, so the composed storage object owns the binding.

## Verification

```text
$ npx tsx scripts/storageSurface.ts --check .audit/B5/storage-surface-before.json
Storage surface intact. 307 interface methods, 315 implementations, 264 relocated, no duplicates, no body changed.

$ npm run check
Tour-target verification OK (22 targets, all present).

$ npm run lint
Exit 0. The repository reported 887 warnings and no errors.

$ npm test -- --maxWorkers=1
Test Files  224 passed | 20 skipped (244)
Tests  1684 passed | 91 skipped (1775)
Duration 315.55s
```

`npm run format:check` exits 1 for `server/databaseStorage.ts` only.
Prettier first differs at the existing `getArticles` signature before the extracted range.
`server/storage/signalsStorage.ts` passes its direct Prettier check.

## Defects

I noted no defect during the move.
